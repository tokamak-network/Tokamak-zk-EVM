import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import {
  mkdtemp,
  mkdir,
  open,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { chromium } from "playwright";
import { build } from "vite";

import {
  BINARY_DIGEST_BYTES,
  BINARY_HEADER_BYTES,
} from "../../../src/artifacts/binary/binary-format.js";

const execFileAsync = promisify(execFile);
const PACKAGE_NAME = "@tokamak-zk-evm/snark-browser-compat";
const CRS_SOURCE_PATH = path.resolve(
  "tmp/fixtures/small/source/setup/combined_sigma.rkyv",
);
const RUNTIME_FIXTURE_ROOT = path.resolve("fixtures/small/runtime");
const OUTPUT_TEST_PAGE = `<!doctype html>
<html lang="en">
  <body>
    <script type="module">
      import {
        convertCrs,
        inspectBinary,
      } from "@tokamak-zk-evm/snark-browser-compat/converter";

      try {
        const sourceResponse = await fetch("/combined_sigma.rkyv");
        if (!sourceResponse.ok) {
          throw new Error(\`CRS source request failed with \${sourceResponse.status}.\`);
        }
        const source = new Uint8Array(await sourceResponse.arrayBuffer());
        const artifacts = await convertCrs(source);
        const [prover, preprocess, verifier] = await Promise.all([
          inspectBinary(artifacts.proverCrs),
          inspectBinary(artifacts.preprocessCrs),
          inspectBinary(artifacts.verifierCrs),
        ]);

        const invalidInput = new Uint8Array([1, 2, 3, 4]);
        let invalidResult;
        try {
          await convertCrs(invalidInput);
          invalidResult = { status: "unexpected-success" };
        } catch (error) {
          const cause = error && typeof error === "object" && "cause" in error
            ? error.cause
            : undefined;
          invalidResult = {
            status: "ok",
            detached: invalidInput.byteLength === 0 && invalidInput.buffer.byteLength === 0,
            code: error && typeof error === "object" && "code" in error
              ? error.code
              : undefined,
            message: error instanceof Error ? error.message : String(error),
            causeMessage: cause instanceof Error ? cause.message : String(cause ?? ""),
          };
        }

        window.__converterResult = {
          status: "ok",
          sourceDetached: source.byteLength === 0 && source.buffer.byteLength === 0,
          artifacts: {
            prover: { byteLength: artifacts.proverCrs.byteLength, inspection: prover },
            preprocess: { byteLength: artifacts.preprocessCrs.byteLength, inspection: preprocess },
            verifier: { byteLength: artifacts.verifierCrs.byteLength, inspection: verifier },
          },
          invalidResult,
        };
      } catch (error) {
        window.__converterResult = {
          status: "fatal",
          message: error instanceof Error ? error.stack ?? error.message : String(error),
        };
      }
    </script>
  </body>
</html>`;
const ERROR_TEST_PAGE = `<!doctype html>
<html lang="en">
  <body>
    <script type="module">
      import { convertCrs } from "@tokamak-zk-evm/snark-browser-compat/converter";

      const invalidInput = new Uint8Array([1, 2, 3, 4]);
      let invalidResult;
      try {
        await convertCrs(invalidInput);
        invalidResult = { status: "unexpected-success" };
      } catch (error) {
        const cause = error && typeof error === "object" && "cause" in error
          ? error.cause
          : undefined;
        invalidResult = {
          status: "ok",
          detached: invalidInput.byteLength === 0 && invalidInput.buffer.byteLength === 0,
          code: error && typeof error === "object" && "code" in error
            ? error.code
            : undefined,
          message: error instanceof Error ? error.message : String(error),
          causeMessage: cause instanceof Error ? cause.message : String(cause ?? ""),
        };
      }
      window.__converterResult = { status: "ok", invalidResult };
    </script>
  </body>
</html>`;

interface ConverterResult {
  readonly status: "ok" | "fatal";
  readonly sourceDetached?: boolean;
  readonly artifacts?: Readonly<Record<"prover" | "preprocess" | "verifier", {
    readonly byteLength: number;
    readonly inspection: {
      readonly kind: number;
      readonly formatVersion: number;
      readonly sourcePackageVersion: string;
      readonly byteLength: number;
      readonly selfDigestHex: string;
    };
  }>>;
  readonly invalidResult?: {
    readonly status: "ok" | "unexpected-success";
    readonly detached?: boolean;
    readonly code?: string;
    readonly message?: string;
    readonly causeMessage?: string;
  };
  readonly message?: string;
}

interface NpmPackResult {
  readonly filename: string;
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const expectedArtifactIdentities = mode === "outputs"
    ? await loadExpectedArtifactIdentities()
    : undefined;
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
    await writeFile(
      path.join(applicationRoot, "index.html"),
      mode === "outputs" ? OUTPUT_TEST_PAGE : ERROR_TEST_PAGE,
    );
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
    await checkBuiltApplication(outputRoot, expectedArtifactIdentities);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  console.log(
    mode === "outputs"
      ? "Checked all packed CRS converter outputs in a production Vite browser build"
      : "Checked packed converter error and Worker boundaries in a production Vite browser build",
  );
}

function parseMode(argv: readonly string[]): "error" | "outputs" {
  if (argv.length !== 1 || (argv[0] !== "--error" && argv[0] !== "--outputs")) {
    throw new Error("CRS converter browser check requires exactly one of --error or --outputs.");
  }
  return argv[0] === "--outputs" ? "outputs" : "error";
}

async function loadExpectedArtifactIdentities(): Promise<
Readonly<Record<"prover" | "preprocess" | "verifier", {
  readonly byteLength: number;
  readonly selfDigestHex: string;
}>>
> {
  try {
    const [source, prover, preprocess, verifier] = await Promise.all([
      stat(CRS_SOURCE_PATH),
      readArtifactIdentity(path.join(RUNTIME_FIXTURE_ROOT, "prover-crs.bin")),
      readArtifactIdentity(path.join(RUNTIME_FIXTURE_ROOT, "preprocess-crs.bin")),
      readArtifactIdentity(path.join(RUNTIME_FIXTURE_ROOT, "verifier-crs.bin")),
    ]);
    if (!source.isFile()) {
      throw new Error("one or more paths are not files");
    }
    return {
      prover,
      preprocess,
      verifier,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      "CRS browser conversion fixtures are unavailable. Run "
      + "`npm run fixtures:copy && npm run fixtures:prepare` after preparing "
      + `the owner artifacts: ${message}`,
    );
  }
}

async function readArtifactIdentity(
  filePath: string,
): Promise<{ readonly byteLength: number; readonly selfDigestHex: string }> {
  const handle = await open(filePath, "r");
  try {
    const fileStat = await handle.stat();
    if (!fileStat.isFile()) {
      throw new Error(`${filePath} is not a file.`);
    }

    const header = new Uint8Array(BINARY_HEADER_BYTES);
    const headerRead = await handle.read(header, 0, header.byteLength, 0);
    if (headerRead.bytesRead !== header.byteLength) {
      throw new Error(`${filePath} has a truncated binary header.`);
    }
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const declaredByteLength = view.getUint32(12, true);
    const digestTableOffset = view.getUint32(32, true);
    if (declaredByteLength !== fileStat.size) {
      throw new Error(`${filePath} header length does not match its file size.`);
    }

    const digest = new Uint8Array(BINARY_DIGEST_BYTES);
    const digestRead = await handle.read(
      digest,
      0,
      digest.byteLength,
      digestTableOffset + 8,
    );
    if (digestRead.bytesRead !== digest.byteLength) {
      throw new Error(`${filePath} has a truncated self-digest.`);
    }

    return {
      byteLength: fileStat.size,
      selfDigestHex: [...digest]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(""),
    };
  } finally {
    await handle.close();
  }
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
    "crs-converter-worker.js",
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

async function checkBuiltApplication(
  outputRoot: string,
  expectedArtifactIdentities:
    | Readonly<Record<"prover" | "preprocess" | "verifier", {
      readonly byteLength: number;
      readonly selfDigestHex: string;
    }>>
    | undefined,
): Promise<void> {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/combined_sigma.rkyv" && expectedArtifactIdentities !== undefined) {
        response.writeHead(200, {
          "content-length": String((await stat(CRS_SOURCE_PATH)).size),
          "content-type": "application/octet-stream",
        });
        createReadStream(CRS_SOURCE_PATH).pipe(response);
        return;
      }
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
    page.setDefaultTimeout(10 * 60_000);
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
      throw new Error(`CRS conversion failed: ${value.message ?? "missing error message"}.`);
    }
    if (expectedArtifactIdentities !== undefined) {
      if (value.sourceDetached !== true) {
        throw new Error("convertCrs did not transfer and detach the valid source buffer.");
      }

      const expectedKinds = { prover: 6, preprocess: 7, verifier: 3 } as const;
      for (const name of ["prover", "preprocess", "verifier"] as const) {
        const artifact = value.artifacts?.[name];
        if (artifact === undefined) {
          throw new Error(`convertCrs did not return ${name}Crs.`);
        }
        if (
          artifact.byteLength !== expectedArtifactIdentities[name].byteLength
          || artifact.inspection.byteLength !== expectedArtifactIdentities[name].byteLength
        ) {
          throw new Error(
            `${name}Crs length ${artifact.byteLength} does not match `
            + `${expectedArtifactIdentities[name].byteLength}.`,
          );
        }
        if (artifact.inspection.selfDigestHex !== expectedArtifactIdentities[name].selfDigestHex) {
          throw new Error(`${name}Crs self-digest does not match the prepared fixture.`);
        }
        if (artifact.inspection.kind !== expectedKinds[name]) {
          throw new Error(`${name}Crs has unexpected kind ${artifact.inspection.kind}.`);
        }
        if (
          artifact.inspection.formatVersion !== 1
          || artifact.inspection.sourcePackageVersion !== "2.1.3"
        ) {
          throw new Error(`${name}Crs has unexpected version metadata.`);
        }
      }
    }

    const invalid = value.invalidResult;
    if (invalid?.status !== "ok") {
      throw new Error("Invalid rkyv input unexpectedly converted successfully.");
    }
    if (invalid.detached !== true) {
      throw new Error("convertCrs did not transfer and detach its invalid input buffer.");
    }
    if (invalid.code !== "INVALID_INPUT") {
      throw new Error(`Unexpected converter error code: ${invalid.code ?? "missing error code"}.`);
    }
    if (invalid.message !== "convertCrs could not process its input.") {
      throw new Error(`Unexpected converter failure: ${invalid.message ?? "missing error message"}.`);
    }
    if (!invalid.causeMessage?.includes("invalid archive shape")) {
      throw new Error(
        `Unexpected decoder cause: ${invalid.causeMessage ?? "missing cause message"}.`,
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
  console.error(`Browser CRS converter check failed: ${message}`);
  process.exitCode = 1;
});
