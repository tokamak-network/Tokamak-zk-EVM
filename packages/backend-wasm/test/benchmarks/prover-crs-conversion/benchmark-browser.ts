import { createReadStream } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer, type ServerResponse } from "node:http";
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

import { build } from "esbuild";
import { chromium } from "playwright";

const OUTPUT_DIRECTORY = "tmp/benchmarks/prover-crs-conversion";
const CANDIDATE_WORKER_PATH = path.join(OUTPUT_DIRECTORY, "candidate-worker.js");
const DEFAULT_SOURCE_PATH = "tmp/fixtures/small/source/setup/combined_sigma.rkyv";
const DEFAULT_EXPECTED_PATH = "fixtures/small/runtime/prover-crs.bin";
const DEFAULT_TIMEOUT_MS = 1_800_000;
const CASES = ["baseline", "batch-montgomery"] as const;

interface BrowserCaseResult {
  readonly benchmarkCase: string;
  readonly elapsedMs: number;
  readonly sourceBytes: number;
  readonly artifactBytes: number;
  readonly inputDetached: boolean;
  readonly peakMemoryDeltaBytes: number;
  readonly memorySource: string;
  readonly peakProcessTreeRssBytes: number;
}

async function main(): Promise<void> {
  const sourcePath = path.resolve(process.argv[2] ?? DEFAULT_SOURCE_PATH);
  const expectedPath = path.resolve(process.argv[3] ?? DEFAULT_EXPECTED_PATH);
  const expectedBytes = (await readFile(expectedPath)).byteLength;
  await prepareCandidateWorker();

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/") {
        serveBytes(response, createBenchmarkPage(url.searchParams.get("case")), "text/html; charset=utf-8");
        return;
      }
      if (url.pathname === "/source.rkyv") {
        response.writeHead(200, crossOriginHeaders("application/octet-stream"));
        createReadStream(sourcePath).pipe(response);
        return;
      }
      if (url.pathname === "/candidate-worker.js") {
        serveBytes(response, await readFile(CANDIDATE_WORKER_PATH), "text/javascript; charset=utf-8");
        return;
      }
      if (url.pathname === "/backend_wasm_rkyv_decoder_bg.wasm") {
        serveBytes(
          response,
          await readFile(path.join(OUTPUT_DIRECTORY, "backend_wasm_rkyv_decoder_bg.wasm")),
          "application/wasm",
        );
        return;
      }
      if (url.pathname.startsWith("/dist/")) {
        serveBytes(response, await readFile(path.resolve(url.pathname.slice(1))), contentType(url.pathname));
        return;
      }
      response.writeHead(404);
      response.end();
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.stack ?? error.message : String(error));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Prover CRS browser benchmark failed to bind a local port.");
  }

  try {
    const results: BrowserCaseResult[] = [];
    for (const benchmarkCase of CASES) {
      const result = await runBrowserCase(
        `http://127.0.0.1:${address.port}/?case=${benchmarkCase}`,
      );
      if (
        result.benchmarkCase !== benchmarkCase
        || result.artifactBytes !== expectedBytes
        || !result.inputDetached
      ) {
        throw new Error(`Invalid ${benchmarkCase} browser result: ${JSON.stringify(result)}.`);
      }
      results.push(result);
    }
    console.log(JSON.stringify({
      runtime: "chromium",
      sourcePath,
      expectedPath,
      results,
    }, null, 2));
  } finally {
    server.close();
  }
}

async function prepareCandidateWorker(): Promise<void> {
  await rm(OUTPUT_DIRECTORY, { recursive: true, force: true });
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  const decoderGluePath = path.resolve(
    "tools/rkyv-decoder-wasm/pkg/backend_wasm_rkyv_decoder.js",
  );
  await build({
    entryPoints: [
      "test/benchmarks/prover-crs-conversion/browser-candidate-worker.ts",
    ],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    outfile: CANDIDATE_WORKER_PATH,
    sourcemap: false,
    plugins: [
      {
        name: "rkyv-decoder",
        setup(context) {
          context.onResolve(
            { filter: /rkyv-decoder-wasm\/pkg\/backend_wasm_rkyv_decoder\.js$/ },
            () => ({ path: decoderGluePath }),
          );
        },
      },
    ],
  });
  await copyFile(
    "tools/rkyv-decoder-wasm/pkg/backend_wasm_rkyv_decoder_bg.wasm",
    path.join(OUTPUT_DIRECTORY, "backend_wasm_rkyv_decoder_bg.wasm"),
  );
}

async function runBrowserCase(url: string): Promise<BrowserCaseResult> {
  const browser = await chromium.launch({
    headless: true,
    args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"],
  });
  try {
    const page = await browser.newPage();
    const pageErrors: string[] = [];
    let peakProcessTreeRssBytes = await readProcessTreeRss(process.pid);
    const processTreeSampleTimer = setInterval(async () => {
      peakProcessTreeRssBytes = Math.max(
        peakProcessTreeRssBytes,
        await readProcessTreeRss(process.pid),
      );
    }, 50);
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    try {
      await page.goto(url);
      const handle = await page.waitForFunction(
        () => {
          const result = (window as unknown as {
            __proverCrsConversionBenchmark?: { readonly status: string };
          }).__proverCrsConversionBenchmark;
          return result?.status !== "pending" ? result : undefined;
        },
        undefined,
        { timeout: DEFAULT_TIMEOUT_MS },
      );
      const result = await handle.jsonValue() as
        | ({ readonly status: "ok" } & Omit<BrowserCaseResult, "peakProcessTreeRssBytes">)
        | { readonly status: "error"; readonly error: string };
      if (result.status !== "ok") {
        throw new Error(`Browser conversion failed: ${result.error}`);
      }
      if (pageErrors.length > 0) {
        throw new Error(`Browser conversion emitted errors:\n${pageErrors.join("\n")}`);
      }
      peakProcessTreeRssBytes = Math.max(
        peakProcessTreeRssBytes,
        await readProcessTreeRss(process.pid),
      );
      return { ...result, peakProcessTreeRssBytes };
    } finally {
      clearInterval(processTreeSampleTimer);
    }
  } finally {
    await browser.close();
  }
}

async function readProcessTreeRss(rootPid: number): Promise<number> {
  const ps = spawn("ps", ["-axo", "pid=,ppid=,rss="], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  let output = "";
  ps.stdout.setEncoding("utf8");
  ps.stdout.on("data", (chunk: string) => {
    output += chunk;
  });
  await once(ps, "exit");

  const rows = output.trim().split("\n").flatMap((line) => {
    const [pidText, parentPidText, rssText] = line.trim().split(/\s+/);
    const pid = Number(pidText);
    const parentPid = Number(parentPidText);
    const rssKiB = Number(rssText);
    return Number.isFinite(pid) && Number.isFinite(parentPid) && Number.isFinite(rssKiB)
      ? [{ pid, parentPid, rssKiB }]
      : [];
  });
  const descendants = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (!descendants.has(row.pid) && descendants.has(row.parentPid)) {
        descendants.add(row.pid);
        changed = true;
      }
    }
  }

  return rows
    .filter((row) => descendants.has(row.pid))
    .reduce((sum, row) => sum + row.rssKiB * 1024, 0);
}

function createBenchmarkPage(rawCase: string | null): string {
  if (!CASES.some((benchmarkCase) => benchmarkCase === rawCase)) {
    throw new Error(`Unsupported browser benchmark case: ${rawCase ?? "missing"}.`);
  }

  return `<!doctype html>
<html lang="en">
  <body>
    <script type="module">
      const benchmarkCase = ${JSON.stringify(rawCase)};
      window.__proverCrsConversionBenchmark = { status: "pending" };

      try {
        const source = new Uint8Array(await (await fetch("/source.rkyv")).arrayBuffer());
        const sourceBytes = source.byteLength;
        const baselineMemory = await sampleMemory();
        let peakMemory = baselineMemory.bytes;
        const sampleTimer = setInterval(async () => {
          const sample = await sampleMemory();
          peakMemory = Math.max(peakMemory, sample.bytes);
        }, 100);
        const startedAt = performance.now();
        const artifact = benchmarkCase === "baseline"
          ? await runBaseline(source)
          : await runCandidate(source);
        const elapsedMs = performance.now() - startedAt;
        clearInterval(sampleTimer);
        const finalMemory = await sampleMemory();
        peakMemory = Math.max(peakMemory, finalMemory.bytes);

        window.__proverCrsConversionBenchmark = {
          status: "ok",
          benchmarkCase,
          elapsedMs,
          sourceBytes,
          artifactBytes: artifact.byteLength,
          inputDetached: source.byteLength === 0 && source.buffer.byteLength === 0,
          peakMemoryDeltaBytes: Math.max(0, peakMemory - baselineMemory.bytes),
          memorySource: finalMemory.source,
        };
      } catch (error) {
        window.__proverCrsConversionBenchmark = {
          status: "error",
          error: error instanceof Error ? error.stack ?? error.message : String(error),
        };
      }

      async function runBaseline(source) {
        const { convertProverCrs } = await import(
          "/dist/converter/conversion/prover-crs-converter.js"
        );
        return convertProverCrs(source);
      }

      async function runCandidate(source) {
        const worker = new Worker("/candidate-worker.js", {
          name: "prover-crs-batch-montgomery-benchmark",
          type: "module",
        });
        try {
          return await new Promise((resolve, reject) => {
            worker.onmessage = (event) => {
              if (!event.data.ok) {
                reject(new Error(event.data.error));
                return;
              }
              resolve(new Uint8Array(
                event.data.artifactBuffer,
                event.data.byteOffset,
                event.data.byteLength,
              ));
            };
            worker.onerror = (event) => reject(new Error(event.message));
            worker.postMessage({
              inputBuffer: source.buffer,
              byteOffset: source.byteOffset,
              byteLength: source.byteLength,
            }, [source.buffer]);
          });
        } finally {
          worker.terminate();
        }
      }

      async function sampleMemory() {
        if (performance.measureUserAgentSpecificMemory !== undefined) {
          try {
            const measurement = await performance.measureUserAgentSpecificMemory();
            return { bytes: measurement.bytes, source: "measureUserAgentSpecificMemory" };
          } catch {
          }
        }
        if (performance.memory !== undefined) {
          return {
            bytes: performance.memory.usedJSHeapSize,
            source: "performance.memory.usedJSHeapSize",
          };
        }
        throw new Error("Chromium does not expose a supported memory measurement API.");
      }
    </script>
  </body>
</html>`;
}

function serveBytes(
  response: ServerResponse,
  bytes: string | Uint8Array,
  contentTypeValue: string,
): void {
  response.writeHead(200, crossOriginHeaders(contentTypeValue));
  response.end(bytes);
}

function crossOriginHeaders(contentTypeValue: string): Record<string, string> {
  return {
    "content-type": contentTypeValue,
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-embedder-policy": "require-corp",
  };
}

function contentType(filePath: string): string {
  if (filePath.endsWith(".wasm")) {
    return "application/wasm";
  }
  if (filePath.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }
  return "application/octet-stream";
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
