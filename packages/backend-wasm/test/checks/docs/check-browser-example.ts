import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { chromium, type Page } from "playwright";
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

  console.log("Checked README TypeScript and complete packed browser workflow in Chromium");
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

async function typecheckExample(applicationRoot: string): Promise<void> {
  const tsc = path.resolve("node_modules", ".bin", "tsc");
  try {
    await execFileAsync(tsc, ["--project", "tsconfig.json", "--noEmit"], {
      cwd: applicationRoot,
    });
  } catch (error) {
    const output = commandErrorOutput(error);
    throw new Error(`Packed browser example typecheck failed:\n${output}`);
  }
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
    await assertWorkflowControls(page);
    await page.locator("#install-preprocess").click();
    await waitUntilEnabled(page, "#run-preprocess", 120_000);
    await page.locator("#run-preprocess").click();
    await waitUntilComplete(page, "#preprocess-status", 120_000);

    await page.locator("#install-prover").click();
    await waitUntilEnabled(page, "#run-prover", 120_000);
    await page.locator("#run-prover").click();
    await waitUntilComplete(page, "#prover-status", 300_000);

    await page.locator("#install-verifier").click();
    await waitUntilEnabled(page, "#run-verifier", 120_000);
    await page.locator("#run-verifier").click();
    const handle = await page.waitForFunction(
      () => {
        const result = (window as unknown as {
          __tokamakExampleResult?: ExampleResult;
        }).__tokamakExampleResult;
        return result?.status !== "pending" && result?.valid !== undefined
          ? result
          : undefined;
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

async function waitUntilEnabled(
  page: Page,
  selector: string,
  timeout: number,
): Promise<void> {
  await page.waitForFunction(
    (target) => {
      const button = document.querySelector<HTMLButtonElement>(target);
      const workflow = document.querySelector<HTMLOutputElement>("#workflow-status");
      return workflow?.dataset.state === "error" || button?.disabled === false;
    },
    selector,
    { timeout },
  );
  await assertWorkflowSucceeded(page);
}

async function waitUntilComplete(
  page: Page,
  selector: string,
  timeout: number,
): Promise<void> {
  await page.waitForFunction(
    (target) => {
      const status = document.querySelector<HTMLElement>(target);
      const workflow = document.querySelector<HTMLOutputElement>("#workflow-status");
      return workflow?.dataset.state === "error"
        || status?.textContent?.startsWith("Complete") === true;
    },
    selector,
    { timeout },
  );
  await assertWorkflowSucceeded(page);
}

async function assertWorkflowSucceeded(page: Page): Promise<void> {
  const state = await page.locator("#workflow-status").getAttribute("data-state");
  if (state === "error") {
    const result = await page.locator("#result").textContent();
    throw new Error(`Packed browser workflow failed: ${result ?? "unknown error"}.`);
  }
}

async function assertWorkflowControls(page: Page): Promise<void> {
  for (const name of ["Preprocess", "Generate proof", "Verify"]) {
    const control = page.getByRole("button", { name, exact: true });
    if (await control.count() !== 1) {
      throw new Error(`Packed browser example is missing the '${name}' operation.`);
    }
  }
}

async function serveBuiltFile(
  response: ServerResponse,
  outputRoot: string,
  relativePath: string,
): Promise<void> {
  if (relativePath.startsWith("artifacts/")) {
    const artifactName = relativePath.slice("artifacts/".length);
    if (artifactName.length === 0 || path.basename(artifactName) !== artifactName) {
      response.writeHead(404);
      response.end();
      return;
    }
    await serveFile(response, path.join(FIXTURE_ROOT, artifactName));
    return;
  }

  const filePath = path.resolve(outputRoot, relativePath);
  const relative = path.relative(outputRoot, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    response.writeHead(404);
    response.end();
    return;
  }

  await serveFile(response, filePath);
}

async function serveFile(response: ServerResponse, filePath: string): Promise<void> {
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

function commandErrorOutput(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return String(error);
  }
  const commandError = error as {
    readonly message?: unknown;
    readonly stdout?: unknown;
    readonly stderr?: unknown;
  };
  return [commandError.stdout, commandError.stderr, commandError.message]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n")
    .trim();
}

const entrypoint = fileURLToPath(import.meta.url);

if (process.argv[1] === entrypoint) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
