import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { chromium } from "playwright";

const OUTPUT_DIR = "tmp/browser-msm-worker-pool-bench";
const MAIN_BUNDLE_PATH = path.join(OUTPUT_DIR, "msm-worker-pool-entry.js");
const WORKER_BUNDLE_PATH = path.join(OUTPUT_DIR, "msm-worker.js");

interface RunnerOptions {
  readonly seed: string;
  readonly lengths: string;
  readonly iterations: number;
  readonly warmup: number;
  readonly workers: number;
  readonly timeoutMs: number;
  readonly jsonPath?: string;
}

interface BrowserMsmWorkerPoolResult {
  readonly status: "pending" | "ok" | "error";
  readonly error?: string;
  readonly report?: BenchmarkReport;
}

interface BenchmarkReport {
  readonly benchmark: "browser-msm-worker-pool";
  readonly seed: string;
  readonly lengths: readonly number[];
  readonly iterations: number;
  readonly warmup: number;
  readonly workerCount: number;
  readonly hardwareConcurrency?: number;
  readonly rows: readonly BenchmarkRow[];
  readonly memory: BenchmarkMemoryReport;
}

interface BenchmarkRow {
  readonly jobCount: number;
  readonly totalPoints: number;
  readonly maxJobPoints: number;
  readonly assignmentPoints: readonly number[];
  readonly transferredInputBytes: number;
  readonly workerPreloadMs: number;
  readonly sequentialMs: number;
  readonly workerPoolMs: number;
  readonly workerPoolSpeedup: number;
}

interface BenchmarkMemoryReport {
  readonly before?: BrowserMemorySnapshot;
  readonly afterPreload?: BrowserMemorySnapshot;
  readonly afterBenchmark?: BrowserMemorySnapshot;
}

interface BrowserMemorySnapshot {
  readonly usedJSHeapSize?: number;
  readonly totalJSHeapSize?: number;
  readonly jsHeapSizeLimit?: number;
  readonly deviceMemory?: number;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await buildBrowserBundles();

  const server = createServer(handleRequest);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Browser MSM worker-pool benchmark failed to bind a local HTTP port.");
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

    const query = new URLSearchParams({
      seed: options.seed,
      lengths: options.lengths,
      iterations: options.iterations.toString(),
      warmup: options.warmup.toString(),
      workers: options.workers.toString(),
    });

    await page.goto(`http://127.0.0.1:${address.port}/browser/msm-worker-pool.html?${query.toString()}`, {
      waitUntil: "networkidle",
    });
    const result = await page.waitForFunction(() => {
      return window.__tokamakBrowserMsmWorkerPoolResult?.status !== "pending"
        ? window.__tokamakBrowserMsmWorkerPoolResult
        : undefined;
    }, undefined, { timeout: options.timeoutMs });
    const value = (await result.jsonValue()) as BrowserMsmWorkerPoolResult;

    if (value.status !== "ok" || value.report === undefined) {
      throw new Error(`Browser MSM worker-pool benchmark failed: ${value.error ?? JSON.stringify(value)}.`);
    }

    if (errors.length > 0) {
      throw new Error(`Browser MSM worker-pool benchmark emitted console/page errors:\n${errors.join("\n")}`);
    }

    printReport(value.report);
    if (options.jsonPath !== undefined) {
      await writeJsonReport(options.jsonPath, value.report);
    }
  } finally {
    await browser?.close();
    server.close();
  }
}

function parseOptions(args: readonly string[]): RunnerOptions {
  const values = new Map<string, string>();
  for (const arg of args) {
    const match = /^--([a-zA-Z-]+)=(.+)$/.exec(arg);
    if (match === null) {
      throw new Error(`Unknown argument '${arg}'.`);
    }

    values.set(match[1], match[2]);
  }

  return {
    seed: values.get("seed") ?? "0x544f4b414d414b",
    lengths: values.get("lengths") ?? "16384,16384,16384,32768,16384,16384",
    iterations: parsePositiveInteger(values.get("iterations") ?? "2", "iterations"),
    warmup: parseNonNegativeInteger(values.get("warmup") ?? "1", "warmup"),
    workers: parsePositiveInteger(values.get("workers") ?? "6", "workers"),
    timeoutMs: parsePositiveInteger(values.get("timeout-ms") ?? "180000", "timeout-ms"),
    jsonPath: values.get("json"),
  };
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = parseNonNegativeInteger(value, label);
  if (parsed <= 0) {
    throw new Error(`${label} must be positive.`);
  }
  return parsed;
}

function parseNonNegativeInteger(value: string, label: string): number {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`${label} must be a non-negative integer.`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${label} must be a safe integer.`);
  }

  return parsed;
}

async function buildBrowserBundles(): Promise<void> {
  await build({
    entryPoints: ["test/benchmarks/msm/browser-msm-worker-entry.ts"],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    outfile: MAIN_BUNDLE_PATH,
    sourcemap: false,
  });
  await build({
    entryPoints: ["test/benchmarks/msm/browser-msm-worker.ts"],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    outfile: WORKER_BUNDLE_PATH,
    sourcemap: false,
  });
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === "/browser/msm-worker-pool.html") {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cross-origin-opener-policy": "same-origin",
        "cross-origin-embedder-policy": "require-corp",
      });
      response.end(renderHtml());
      return;
    }

    if (pathname === "/browser/msm-worker-pool-entry.js") {
      await serveFile(response, MAIN_BUNDLE_PATH, "text/javascript; charset=utf-8");
      return;
    }

    if (pathname === "/browser/msm-worker.js") {
      await serveFile(response, WORKER_BUNDLE_PATH, "text/javascript; charset=utf-8");
      return;
    }

    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.stack ?? error.message : String(error));
  }
}

function renderHtml(): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    "<title>backend-wasm browser MSM worker-pool benchmark</title>",
    "</head>",
    "<body>",
    '<main id="status">pending</main>',
    '<script type="module" src="/browser/msm-worker-pool-entry.js"></script>',
    "</body>",
    "</html>",
  ].join("\n");
}

async function serveFile(response: ServerResponse, filePath: string, contentType: string): Promise<void> {
  const bytes = await readFile(filePath);
  response.writeHead(200, {
    "content-type": contentType,
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-embedder-policy": "require-corp",
  });
  response.end(bytes);
}

function printReport(report: BenchmarkReport): void {
  console.log(
    `Browser MSM worker-pool benchmark seed=${report.seed} lengths=${report.lengths.join(",")} ` +
      `iterations=${report.iterations} warmup=${report.warmup} workers=${report.workerCount} ` +
      `hardwareConcurrency=${report.hardwareConcurrency ?? "unknown"}`,
  );
  console.log(
    "jobs | total points | max job points | assignment points | transferred MiB | preload ms | sequential ms | worker pool ms | speedup",
  );
  console.log("---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---:");
  for (const row of report.rows) {
    console.log(
      [
        row.jobCount.toString(),
        row.totalPoints.toString(),
        row.maxJobPoints.toString(),
        row.assignmentPoints.join(","),
        bytesToMiB(row.transferredInputBytes).toFixed(3),
        row.workerPreloadMs.toFixed(3),
        row.sequentialMs.toFixed(3),
        row.workerPoolMs.toFixed(3),
        `${row.workerPoolSpeedup.toFixed(2)}x`,
      ].join(" | "),
    );
  }

  printMemory("before", report.memory.before);
  printMemory("after preload", report.memory.afterPreload);
  printMemory("after benchmark", report.memory.afterBenchmark);
}

function printMemory(label: string, memory: BrowserMemorySnapshot | undefined): void {
  if (memory === undefined) {
    console.log(`memory ${label}: unavailable`);
    return;
  }

  const parts = [
    memory.usedJSHeapSize === undefined ? undefined : `used=${bytesToMiB(memory.usedJSHeapSize).toFixed(1)} MiB`,
    memory.totalJSHeapSize === undefined ? undefined : `total=${bytesToMiB(memory.totalJSHeapSize).toFixed(1)} MiB`,
    memory.jsHeapSizeLimit === undefined ? undefined : `limit=${bytesToMiB(memory.jsHeapSizeLimit).toFixed(1)} MiB`,
    memory.deviceMemory === undefined ? undefined : `deviceMemory=${memory.deviceMemory} GiB`,
  ].filter((part): part is string => part !== undefined);

  console.log(`memory ${label}: ${parts.length === 0 ? "unavailable" : parts.join(" ")}`);
}

function bytesToMiB(bytes: number): number {
  return bytes / (1024 * 1024);
}

async function writeJsonReport(jsonPath: string, report: BenchmarkReport): Promise<void> {
  const resolved = path.resolve(jsonPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(report, null, 2)}\n`);
}

const entrypoint = fileURLToPath(import.meta.url);

if (process.argv[1] === entrypoint) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
