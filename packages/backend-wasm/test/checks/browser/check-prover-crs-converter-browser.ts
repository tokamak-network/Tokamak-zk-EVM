import { execFile } from "node:child_process";
import { createServer, type ServerResponse } from "node:http";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { chromium } from "playwright";
import { build } from "vite";

const execFileAsync = promisify(execFile);
const PACKAGE_NAME = "@tokamak-zk-evm/snark-browser-compat";
const TEST_PAGE = `<!doctype html>
<html lang="en">
  <body>
    <script type="module">
      import { convertProverCrs } from "@tokamak-zk-evm/snark-browser-compat/converter";

      const input = new Uint8Array([1, 2, 3, 4]);
      try {
        await convertProverCrs(input);
        window.__converterResult = { status: "unexpected-success" };
      } catch (error) {
        const cause = error && typeof error === "object" && "cause" in error
          ? error.cause
          : undefined;
        window.__converterResult = {
          status: "ok",
          detached: input.byteLength === 0 && input.buffer.byteLength === 0,
          code: error && typeof error === "object" && "code" in error
            ? error.code
            : undefined,
          message: error instanceof Error ? error.message : String(error),
          causeMessage: cause instanceof Error ? cause.message : String(cause ?? ""),
        };
      }
    </script>
  </body>
</html>`;

interface ConverterResult {
  readonly status: "ok" | "unexpected-success";
  readonly detached?: boolean;
  readonly code?: string;
  readonly message?: string;
  readonly causeMessage?: string;
}

interface NpmPackResult {
  readonly filename: string;
}

async function main(): Promise<void> {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "backend-wasm-converter-vite-"),
  );
  const temporaryRoot = await realpath(temporaryDirectory);

  try {
    const applicationRoot = path.join(temporaryRoot, "application");
    const packageArchiveRoot = path.join(temporaryRoot, "package");
    await mkdir(applicationRoot, { recursive: true });
    await mkdir(packageArchiveRoot, { recursive: true });

    const packageArchivePath = await packCurrentPackage(packageArchiveRoot);
    await writeFile(
      path.join(applicationRoot, "package.json"),
      JSON.stringify({ name: "backend-wasm-converter-vite-check", private: true, type: "module" }),
    );
    await writeFile(path.join(applicationRoot, "index.html"), TEST_PAGE);
    await execFileAsync(
      "npm",
      [
        "install",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--no-package-lock",
        packageArchivePath,
      ],
      { cwd: applicationRoot },
    );

    const installedPackageRoot = path.join(
      applicationRoot,
      "node_modules",
      ...PACKAGE_NAME.split("/"),
    );
    await assertFfjavascriptIsExternal(installedPackageRoot);

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
    await checkBuiltApplication(outputRoot);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  console.log(
    "Checked packed converter with external ffjavascript in a production Vite browser build",
  );
}

async function packCurrentPackage(packageArchiveRoot: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "npm",
    ["pack", "--ignore-scripts", "--json", "--pack-destination", packageArchiveRoot],
    { cwd: process.cwd(), maxBuffer: 4 * 1024 * 1024 },
  );
  const result = JSON.parse(stdout) as readonly NpmPackResult[];
  if (result.length !== 1) {
    throw new Error(`Expected one packed package, received ${result.length}.`);
  }
  return path.join(packageArchiveRoot, result[0].filename);
}

async function assertFfjavascriptIsExternal(installedPackageRoot: string): Promise<void> {
  const workerPath = path.join(
    installedPackageRoot,
    "dist",
    "converter",
    "worker",
    "prover-crs-converter-worker.js",
  );
  const workerSource = await readFile(workerPath, "utf8");
  if (!/from\s+["']ffjavascript["']/.test(workerSource)) {
    throw new Error("Packed converter Worker does not retain ffjavascript as an external import.");
  }

  const sourceMap = JSON.parse(await readFile(`${workerPath}.map`, "utf8")) as {
    readonly sources?: readonly string[];
  };
  for (const source of sourceMap.sources ?? []) {
    const normalizedSource = source.split("\\").join("/");
    for (const packageName of ["ffjavascript", "wasmbuilder", "wasmcurves"]) {
      if (normalizedSource.includes(`/node_modules/${packageName}/`)) {
        throw new Error(`Packed converter Worker source map contains bundled ${packageName}.`);
      }
    }
  }
}

async function checkBuiltApplication(outputRoot: string): Promise<void> {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const relativePath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
      await serveBuiltFile(response, outputRoot, relativePath);
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.stack ?? error.message : String(error));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Converter Vite check failed to bind a local HTTP port.");
  }

  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.stack ?? error.message));
    await page.goto(`http://127.0.0.1:${address.port}/`);
    const result = await page.waitForFunction(
      () => (window as unknown as { __converterResult?: ConverterResult }).__converterResult,
    );
    const value = await result.jsonValue() as ConverterResult;

    if (browserErrors.length > 0) {
      throw new Error(`Converter Vite application raised browser errors:\n${browserErrors.join("\n")}`);
    }
    if (value.status !== "ok") {
      throw new Error("Invalid rkyv input unexpectedly converted successfully.");
    }
    if (value.detached !== true) {
      throw new Error("convertProverCrs did not transfer and detach its input buffer.");
    }
    if (value.code !== "INVALID_INPUT") {
      throw new Error(`Unexpected converter error code: ${value.code ?? "missing error code"}.`);
    }
    if (value.message !== "convertProverCrs could not process its input.") {
      throw new Error(`Unexpected converter failure: ${value.message ?? "missing error message"}.`);
    }
    if (!value.causeMessage?.includes("invalid archive shape")) {
      throw new Error(
        `Unexpected decoder cause: ${value.causeMessage ?? "missing cause message"}.`,
      );
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
  const relativeResolvedPath = path.relative(outputRoot, filePath);
  if (relativeResolvedPath.startsWith("..") || path.isAbsolute(relativeResolvedPath)) {
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
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  return "application/octet-stream";
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`Browser Prover CRS converter check failed: ${message}`);
  process.exitCode = 1;
});
