import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { chromium } from "playwright";
import { build } from "vite";

const execFileAsync = promisify(execFile);
const PACKAGE_NAME = "@tokamak-zk-evm/snark-browser-compat";
const EXAMPLE_ROOT = "examples/browser";
const FIXTURE_ROOT = "fixtures/small/runtime";

interface NpmPackResult {
  readonly filename: string;
}

interface ExampleResult {
  readonly status: "pending" | "ok" | "error";
  readonly valid?: boolean;
  readonly error?: string;
}

async function main(): Promise<void> {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "backend-wasm-doc-example-"));
  const temporaryRoot = await realpath(temporaryDirectory);

  try {
    const applicationRoot = path.join(temporaryRoot, "application");
    const archiveRoot = path.join(temporaryRoot, "package");
    await cp(EXAMPLE_ROOT, applicationRoot, { recursive: true });
    await mkdir(archiveRoot, { recursive: true });

    const archivePath = await packCurrentPackage(archiveRoot);
    await installPackedPackage(applicationRoot, archivePath);
    await writeReadmeSnippets(applicationRoot);
    await copyVerifierFixtures(applicationRoot);
    await typecheckExample(applicationRoot);

    const outputRoot = path.join(applicationRoot, "dist");
    await build({
      root: applicationRoot,
      logLevel: "silent",
      build: {
        emptyOutDir: true,
        outDir: outputRoot,
        target: "es2022",
      },
    });
    await checkBuiltExample(outputRoot);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  console.log("Checked README TypeScript and packed browser example in Chromium");
}

async function packCurrentPackage(archiveRoot: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "npm",
    ["pack", "--ignore-scripts", "--json", "--pack-destination", archiveRoot],
    { cwd: process.cwd(), maxBuffer: 4 * 1024 * 1024 },
  );
  const result = JSON.parse(stdout) as readonly NpmPackResult[];
  if (result.length !== 1) {
    throw new Error(`Expected one packed package, received ${result.length}.`);
  }
  return path.join(archiveRoot, result[0].filename);
}

async function installPackedPackage(
  applicationRoot: string,
  archivePath: string,
): Promise<void> {
  const packagePath = path.join(applicationRoot, "package.json");
  const manifest = JSON.parse(await readFile(packagePath, "utf8")) as {
    dependencies: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  manifest.dependencies[PACKAGE_NAME] = `file:${archivePath}`;
  delete manifest.devDependencies;
  await writeFile(packagePath, `${JSON.stringify(manifest, null, 2)}\n`);
  await execFileAsync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock"],
    { cwd: applicationRoot },
  );
}

async function writeReadmeSnippets(applicationRoot: string): Promise<void> {
  const readme = await readFile("README.md", "utf8");
  const snippets = [...readme.matchAll(/```ts\n([\s\S]*?)```/g)].map((match) => match[1]);
  if (snippets.length === 0) {
    throw new Error("README does not contain TypeScript examples.");
  }

  const snippetRoot = path.join(applicationRoot, "readme-snippets");
  await mkdir(snippetRoot, { recursive: true });
  await cp(
    path.join(applicationRoot, "src", "load-binary.ts"),
    path.join(snippetRoot, "load-binary.ts"),
  );
  await Promise.all(
    snippets.map((source, index) =>
      writeFile(path.join(snippetRoot, `snippet-${index + 1}.ts`), source),
    ),
  );
}

async function copyVerifierFixtures(applicationRoot: string): Promise<void> {
  const outputRoot = path.join(applicationRoot, "public", "artifacts");
  await mkdir(outputRoot, { recursive: true });
  await Promise.all(
    ["proof.bin", "instance.bin", "verifier-preprocess.bin"].map((name) =>
      cp(path.join(FIXTURE_ROOT, name), path.join(outputRoot, name)),
    ),
  );
}

async function typecheckExample(applicationRoot: string): Promise<void> {
  const tsc = path.resolve("node_modules", ".bin", "tsc");
  await execFileAsync(tsc, ["--project", "tsconfig.json", "--noEmit"], {
    cwd: applicationRoot,
  });
}

async function checkBuiltExample(outputRoot: string): Promise<void> {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const relativePath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    await serveBuiltFile(response, outputRoot, relativePath);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Browser example check failed to bind a local port.");
  }

  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });

    await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "networkidle" });
    const handle = await page.waitForFunction(
      () => {
        const result = (window as unknown as {
          __tokamakExampleResult?: ExampleResult;
        }).__tokamakExampleResult;
        return result?.status !== "pending" ? result : undefined;
      },
      undefined,
      { timeout: 120_000 },
    );
    const result = await handle.jsonValue() as ExampleResult;
    if (result.status !== "ok" || result.valid !== true) {
      throw new Error(`Packed browser example failed: ${result.error ?? JSON.stringify(result)}.`);
    }
    if (errors.length > 0) {
      throw new Error(`Packed browser example emitted errors:\n${errors.join("\n")}`);
    }
  } finally {
    await browser?.close();
    server.close();
  }
}

async function serveBuiltFile(
  response: ServerResponse,
  outputRoot: string,
  relativePath: string,
): Promise<void> {
  const filePath = path.resolve(outputRoot, relativePath);
  const relative = path.relative(outputRoot, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    response.writeHead(404);
    response.end();
    return;
  }

  try {
    const bytes = await readFile(filePath);
    response.writeHead(200, { "content-type": contentTypeFor(filePath) });
    response.end(bytes);
  } catch {
    response.writeHead(404);
    response.end();
  }
}

function contentTypeFor(filePath: string): string {
  if (filePath.endsWith(".wasm")) {
    return "application/wasm";
  }
  if (filePath.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }
  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  return "application/octet-stream";
}

const entrypoint = fileURLToPath(import.meta.url);

if (process.argv[1] === entrypoint) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
