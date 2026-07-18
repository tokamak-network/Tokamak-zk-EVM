import { createReadStream } from "node:fs";
import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { chromium } from "playwright";

const OUTPUT_DIR = "tmp/browser-crs-sharded-msm-bench";
const MAIN_BUNDLE_PATH = path.join(OUTPUT_DIR, "crs-sharded-msm-entry.js");
const WORKER_BUNDLE_PATH = path.join(OUTPUT_DIR, "crs-sharded-msm-worker.js");
const DEFAULT_CRS_PATH = "fixtures/small/runtime/prover-crs-prepared-data/crs.bin";
const SECTION_ENTRY_BYTES = 96;
const SECTION_LABEL_BYTES = 40;
const G1_AFFINE_BYTES = 96;
const XY_POWERS_LABEL = "sigma1.xy-powers";

interface RunnerOptions {
  readonly crsPath: string;
  readonly rows: number;
  readonly cols: number;
  readonly stride: number;
  readonly workers: number;
  readonly iterations: number;
  readonly warmup: number;
  readonly seed: string;
  readonly modes: string;
  readonly chunkPoints: number;
  readonly layout: string;
  readonly timeoutMs: number;
  readonly jsonPath?: string;
}

interface CrsSectionInfo {
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly elementCount: number;
  readonly elementByteLength: number;
}

interface BrowserCrsShardedMsmResult {
  readonly status: "pending" | "ok" | "error";
  readonly error?: string;
  readonly report?: BenchmarkReport;
}

interface BenchmarkReport {
  readonly benchmark: "browser-crs-sharded-msm";
  readonly crsPath: string;
  readonly xyPowersSection: CrsSectionInfo;
  readonly loadedXyPowersBytes: number;
  readonly crossOriginIsolated: boolean;
  readonly seed: string;
  readonly rows: number;
  readonly cols: number;
  readonly stride: number;
  readonly workers: number;
  readonly iterations: number;
  readonly warmup: number;
  readonly chunkPoints: number;
  readonly layout: "stride" | "packed";
  readonly modes: readonly ModeReport[];
  readonly memory: BrowserMemoryReport;
}

interface ModeReport {
  readonly mode: "shared" | "transfer";
  readonly workerCount: number;
  readonly shardRows: readonly number[];
  readonly chunkPoints: number;
  readonly chunkCount: number;
  readonly layout: "stride" | "packed";
  readonly pointCount: number;
  readonly activePointCount: number;
  readonly jsSharedSourceCrsBytes: number;
  readonly transferredCrsBytes: number;
  readonly scalarBytes: number;
  readonly wasmZeroCopy: boolean;
  readonly preloadMs: number;
  readonly msmMs: number;
}

interface BrowserMemoryReport {
  readonly before?: BrowserMemorySnapshot;
  readonly afterCrsLoad?: BrowserMemorySnapshot;
  readonly afterModes?: BrowserMemorySnapshot;
}

interface BrowserMemorySnapshot {
  readonly usedJSHeapSize?: number;
  readonly totalJSHeapSize?: number;
  readonly jsHeapSizeLimit?: number;
  readonly deviceMemory?: number;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const crsPath = path.resolve(options.crsPath);
  const xyPowersSection = await findXyPowersSection(crsPath);
  validateRequestedShape(options, xyPowersSection);

  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await buildBrowserBundles();

  const server = createServer((request, response) => {
    void handleRequest(request, response, crsPath, xyPowersSection);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Browser CRS-sharded MSM benchmark failed to bind a local HTTP port.");
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
      crsPath: options.crsPath,
      rows: options.rows.toString(),
      cols: options.cols.toString(),
      stride: options.stride.toString(),
      workers: options.workers.toString(),
      iterations: options.iterations.toString(),
      warmup: options.warmup.toString(),
      seed: options.seed,
      modes: options.modes,
      "chunk-points": options.chunkPoints.toString(),
      layout: options.layout,
    });

    await page.goto(`http://127.0.0.1:${address.port}/browser/crs-sharded-msm.html?${query.toString()}`, {
      waitUntil: "networkidle",
    });
    const result = await page.waitForFunction(() => {
      return window.__tokamakBrowserCrsShardedMsmResult?.status !== "pending"
        ? window.__tokamakBrowserCrsShardedMsmResult
        : undefined;
    }, undefined, { timeout: options.timeoutMs });
    const value = (await result.jsonValue()) as BrowserCrsShardedMsmResult;

    if (value.status !== "ok" || value.report === undefined) {
      throw new Error(`Browser CRS-sharded MSM benchmark failed: ${value.error ?? JSON.stringify(value)}.`);
    }

    if (errors.length > 0) {
      throw new Error(`Browser CRS-sharded MSM benchmark emitted console/page errors:\n${errors.join("\n")}`);
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
    crsPath: values.get("crs") ?? DEFAULT_CRS_PATH,
    rows: parsePositiveInteger(values.get("rows") ?? "64", "rows"),
    cols: parsePositiveInteger(values.get("cols") ?? "511", "cols"),
    stride: parsePositiveInteger(values.get("stride") ?? "512", "stride"),
    workers: parsePositiveInteger(values.get("workers") ?? "6", "workers"),
    iterations: parsePositiveInteger(values.get("iterations") ?? "1", "iterations"),
    warmup: parseNonNegativeInteger(values.get("warmup") ?? "0", "warmup"),
    seed: values.get("seed") ?? "0x544f4b414d414b",
    modes: values.get("modes") ?? "shared,transfer",
    chunkPoints: parsePositiveInteger(values.get("chunk-points") ?? "16384", "chunk-points"),
    layout: parseLayout(values.get("layout") ?? "auto"),
    timeoutMs: parsePositiveInteger(values.get("timeout-ms") ?? "240000", "timeout-ms"),
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

function parseLayout(value: string): string {
  if (value === "auto" || value === "stride" || value === "packed") {
    return value;
  }

  throw new Error(`Unsupported layout '${value}'.`);
}

function validateRequestedShape(options: RunnerOptions, section: CrsSectionInfo): void {
  if (options.cols > options.stride) {
    throw new Error("cols must be less than or equal to stride.");
  }

  const requiredPoints = options.rows * options.stride;
  if (!Number.isSafeInteger(requiredPoints) || requiredPoints > section.elementCount) {
    throw new Error(
      `Requested CRS shard shape rows=${options.rows} stride=${options.stride} requires ${requiredPoints} points, ` +
        `but ${XY_POWERS_LABEL} contains ${section.elementCount} points.`,
    );
  }
}

async function findXyPowersSection(crsPath: string): Promise<CrsSectionInfo> {
  const handle = await open(crsPath, "r");
  try {
    const header = Buffer.alloc(64);
    await handle.read(header, 0, header.byteLength, 0);
    const sectionTableOffset = header.readUInt32LE(40);
    const sectionCount = header.readUInt16LE(52);
    const sectionTable = Buffer.alloc(sectionCount * SECTION_ENTRY_BYTES);
    await handle.read(sectionTable, 0, sectionTable.byteLength, sectionTableOffset);

    for (let index = 0; index < sectionCount; index += 1) {
      const entryOffset = index * SECTION_ENTRY_BYTES;
      const label = readFixedAscii(sectionTable, entryOffset + 56, SECTION_LABEL_BYTES);
      if (label !== XY_POWERS_LABEL) {
        continue;
      }

      const elementByteLength = sectionTable.readUInt16LE(entryOffset + 20);
      if (elementByteLength !== G1_AFFINE_BYTES) {
        throw new Error(`${XY_POWERS_LABEL} element width must be ${G1_AFFINE_BYTES} bytes.`);
      }

      return {
        byteOffset: sectionTable.readUInt32LE(entryOffset + 8),
        byteLength: sectionTable.readUInt32LE(entryOffset + 12),
        elementCount: sectionTable.readUInt32LE(entryOffset + 16),
        elementByteLength,
      };
    }
  } finally {
    await handle.close();
  }

  throw new Error(`Missing '${XY_POWERS_LABEL}' section in ${crsPath}.`);
}

function readFixedAscii(bytes: Uint8Array, offset: number, length: number): string {
  let end = offset;
  const limit = offset + length;
  while (end < limit && bytes[end] !== 0) {
    end += 1;
  }

  return new TextDecoder().decode(bytes.subarray(offset, end));
}

async function buildBrowserBundles(): Promise<void> {
  await build({
    entryPoints: ["test/benchmarks/msm/browser-crs-sharded-msm-entry.ts"],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    outfile: MAIN_BUNDLE_PATH,
    sourcemap: false,
  });
  await build({
    entryPoints: ["test/benchmarks/msm/browser-crs-sharded-msm-worker.ts"],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    outfile: WORKER_BUNDLE_PATH,
    sourcemap: false,
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  crsPath: string,
  xyPowersSection: CrsSectionInfo,
): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === "/browser/crs-sharded-msm.html") {
      response.writeHead(200, commonHeaders("text/html; charset=utf-8"));
      response.end(renderHtml());
      return;
    }

    if (pathname === "/browser/crs-sharded-msm-entry.js") {
      await serveFile(response, MAIN_BUNDLE_PATH, "text/javascript; charset=utf-8");
      return;
    }

    if (pathname === "/browser/crs-sharded-msm-worker.js") {
      await serveFile(response, WORKER_BUNDLE_PATH, "text/javascript; charset=utf-8");
      return;
    }

    if (pathname === "/crs/xy-powers-meta.json") {
      response.writeHead(200, commonHeaders("application/json; charset=utf-8"));
      response.end(`${JSON.stringify(xyPowersSection)}\n`);
      return;
    }

    if (pathname === "/crs/xy-powers.bin") {
      response.writeHead(200, {
        ...commonHeaders("application/octet-stream"),
        "content-length": xyPowersSection.byteLength.toString(),
      });
      createReadStream(crsPath, {
        start: xyPowersSection.byteOffset,
        end: xyPowersSection.byteOffset + xyPowersSection.byteLength - 1,
      }).pipe(response);
      return;
    }

    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.stack ?? error.message : String(error));
  }
}

function commonHeaders(contentType: string): Record<string, string> {
  return {
    "content-type": contentType,
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-embedder-policy": "require-corp",
    "cross-origin-resource-policy": "same-origin",
  };
}

function renderHtml(): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    "<title>backend-wasm browser CRS-sharded MSM benchmark</title>",
    "</head>",
    "<body>",
    '<main id="status">pending</main>',
    '<script type="module" src="/browser/crs-sharded-msm-entry.js"></script>',
    "</body>",
    "</html>",
  ].join("\n");
}

async function serveFile(response: ServerResponse, filePath: string, contentType: string): Promise<void> {
  const bytes = await readFile(filePath);
  response.writeHead(200, commonHeaders(contentType));
  response.end(bytes);
}

function printReport(report: BenchmarkReport): void {
  console.log(
    `Browser CRS-sharded MSM benchmark crs=${report.crsPath} rows=${report.rows} cols=${report.cols} ` +
      `stride=${report.stride} workers=${report.workers} iterations=${report.iterations} warmup=${report.warmup} ` +
      `chunkPoints=${report.chunkPoints} layout=${report.layout} crossOriginIsolated=${
        report.crossOriginIsolated
      } loadedXyPowersMiB=${bytesToMiB(
        report.loadedXyPowersBytes,
      ).toFixed(3)}`,
  );
  console.log(
    "mode | workers | shard rows | layout | chunk points | chunks | points | active points | JS shared source CRS MiB | transferred CRS MiB | scalar MiB | WASM zero-copy | preload ms | msm ms",
  );
  console.log(":--- | ---: | :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- | ---: | ---:");
  for (const mode of report.modes) {
    console.log(
      [
        mode.mode,
        mode.workerCount.toString(),
        mode.shardRows.join(","),
        mode.layout,
        mode.chunkPoints.toString(),
        mode.chunkCount.toString(),
        mode.pointCount.toString(),
        mode.activePointCount.toString(),
        bytesToMiB(mode.jsSharedSourceCrsBytes).toFixed(3),
        bytesToMiB(mode.transferredCrsBytes).toFixed(3),
        bytesToMiB(mode.scalarBytes).toFixed(3),
        mode.wasmZeroCopy ? "yes" : "no",
        mode.preloadMs.toFixed(3),
        mode.msmMs.toFixed(3),
      ].join(" | "),
    );
  }

  printMemory("before", report.memory.before);
  printMemory("after CRS load", report.memory.afterCrsLoad);
  printMemory("after modes", report.memory.afterModes);
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
