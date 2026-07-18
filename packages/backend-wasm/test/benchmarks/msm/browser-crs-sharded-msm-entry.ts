import { createCurveRuntime, type CurveRuntime } from "../../../src/index.js";

const G1_AFFINE_BYTES = 96;
const SCALAR_RAW_BYTES = 32;

interface BrowserCrsShardedMsmResult {
  readonly status: "pending" | "ok" | "error";
  readonly error?: string;
  readonly report?: BenchmarkReport;
}

interface BenchmarkOptions {
  readonly crsPath: string;
  readonly rows: number;
  readonly cols: number;
  readonly stride: number;
  readonly maxWorkers: number;
  readonly iterations: number;
  readonly warmup: number;
  readonly seed: bigint;
  readonly modes: readonly BenchmarkMode[];
}

type BenchmarkMode = "shared" | "transfer";

interface CrsSectionInfo {
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly elementCount: number;
  readonly elementByteLength: number;
}

interface WorkerShard {
  readonly workerIndex: number;
  readonly rowStart: number;
  readonly rowEnd: number;
}

interface WorkerHandle {
  init(command: WorkerInitCommand, transfer?: Transferable[]): Promise<void>;
  run(): Promise<WorkerResult>;
  terminate(): void;
}

interface WorkerInitCommand {
  readonly id: number;
  readonly command: "init";
  readonly mode: BenchmarkMode;
  readonly workerIndex: number;
  readonly rowStart: number;
  readonly rowEnd: number;
  readonly colEnd: number;
  readonly stride: number;
  readonly seed: string;
  readonly sharedBaseBuffer?: SharedArrayBuffer;
  readonly sharedBaseByteOffset?: number;
  readonly transferredBaseShard?: Uint8Array;
}

interface WorkerResult {
  readonly workerIndex: number;
  readonly result: Uint8Array;
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
  readonly modes: readonly ModeReport[];
  readonly memory: BrowserMemoryReport;
}

interface ModeReport {
  readonly mode: BenchmarkMode;
  readonly workerCount: number;
  readonly shardRows: readonly number[];
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

declare global {
  interface Window {
    __tokamakBrowserCrsShardedMsmResult?: BrowserCrsShardedMsmResult;
  }
}

window.__tokamakBrowserCrsShardedMsmResult = { status: "pending" };

main().catch((error: unknown) => {
  window.__tokamakBrowserCrsShardedMsmResult = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  };
});

async function main(): Promise<void> {
  const options = parseOptions(new URLSearchParams(window.location.search));
  if (options.modes.includes("shared") && !crossOriginIsolated) {
    throw new Error("SharedArrayBuffer mode requires cross-origin isolation.");
  }

  const runtime = await createCurveRuntime({ singleThread: true });
  try {
    const memoryBefore = readMemorySnapshot();
    const xyPowersSection = await fetchJson<CrsSectionInfo>("/crs/xy-powers-meta.json");
    validateOptionsAgainstSection(options, xyPowersSection);
    const xyPowers = await fetchXyPowersBuffer(xyPowersSection.byteLength, options.modes.includes("shared"));
    const memoryAfterCrsLoad = readMemorySnapshot();

    const reports: ModeReport[] = [];
    const expectedByMode: Uint8Array[] = [];
    for (const mode of options.modes) {
      const result = await runMode(runtime, options, mode, xyPowers);
      reports.push(result.report);
      expectedByMode.push(result.reducedResult);
    }

    assertModeResultsEqual(runtime, expectedByMode);

    window.__tokamakBrowserCrsShardedMsmResult = {
      status: "ok",
      report: {
        benchmark: "browser-crs-sharded-msm",
        crsPath: options.crsPath,
        xyPowersSection,
        loadedXyPowersBytes: xyPowers.byteLength,
        crossOriginIsolated,
        seed: formatSeed(options.seed),
        rows: options.rows,
        cols: options.cols,
        stride: options.stride,
        workers: options.maxWorkers,
        iterations: options.iterations,
        warmup: options.warmup,
        modes: reports,
        memory: {
          before: memoryBefore,
          afterCrsLoad: memoryAfterCrsLoad,
          afterModes: readMemorySnapshot(),
        },
      },
    };
  } finally {
    await runtime.terminate();
  }
}

function parseOptions(params: URLSearchParams): BenchmarkOptions {
  return {
    crsPath: params.get("crsPath") ?? "fixtures/small/runtime/prover-crs-prepared-data/crs.bin",
    rows: parsePositiveInteger(params.get("rows") ?? "64", "rows"),
    cols: parsePositiveInteger(params.get("cols") ?? "511", "cols"),
    stride: parsePositiveInteger(params.get("stride") ?? "512", "stride"),
    maxWorkers: parsePositiveInteger(params.get("workers") ?? "6", "workers"),
    iterations: parsePositiveInteger(params.get("iterations") ?? "1", "iterations"),
    warmup: parseNonNegativeInteger(params.get("warmup") ?? "0", "warmup"),
    seed: parseSeed(params.get("seed") ?? "0x544f4b414d414b"),
    modes: parseModes(params.get("modes") ?? "shared,transfer"),
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

function parseSeed(value: string): bigint {
  if (!/^(0x[0-9a-fA-F]+|[0-9]+)$/.test(value)) {
    throw new Error("Seed must be a decimal integer or 0x-prefixed hexadecimal integer.");
  }

  return BigInt(value);
}

function parseModes(value: string): BenchmarkMode[] {
  const modes = value.split(",").map((entry) => entry.trim());
  if (modes.length === 0) {
    throw new Error("At least one benchmark mode is required.");
  }

  const output: BenchmarkMode[] = [];
  for (const mode of modes) {
    if (mode !== "shared" && mode !== "transfer") {
      throw new Error(`Unsupported benchmark mode '${mode}'.`);
    }
    if (!output.includes(mode)) {
      output.push(mode);
    }
  }

  return output;
}

function validateOptionsAgainstSection(options: BenchmarkOptions, section: CrsSectionInfo): void {
  if (section.elementByteLength !== G1_AFFINE_BYTES) {
    throw new Error(`sigma1.xy-powers must use ${G1_AFFINE_BYTES}-byte affine G1 points.`);
  }
  if (options.cols > options.stride) {
    throw new Error("cols must be less than or equal to stride.");
  }
  if (options.rows * options.stride > section.elementCount) {
    throw new Error("Requested CRS rows exceed the sigma1.xy-powers section.");
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}.`);
  }
  return (await response.json()) as T;
}

async function fetchXyPowersBuffer(byteLength: number, shared: boolean): Promise<ArrayBuffer | SharedArrayBuffer> {
  const response = await fetch("/crs/xy-powers.bin");
  if (!response.ok) {
    throw new Error(`Failed to fetch /crs/xy-powers.bin: ${response.status}.`);
  }

  const source = await response.arrayBuffer();
  if (source.byteLength !== byteLength) {
    throw new Error(`Fetched sigma1.xy-powers byte length mismatch: expected ${byteLength}, got ${source.byteLength}.`);
  }

  if (!shared) {
    return source;
  }

  const sharedBuffer = new SharedArrayBuffer(source.byteLength);
  new Uint8Array(sharedBuffer).set(new Uint8Array(source));
  return sharedBuffer;
}

async function runMode(
  runtime: CurveRuntime,
  options: BenchmarkOptions,
  mode: BenchmarkMode,
  xyPowers: ArrayBuffer | SharedArrayBuffer,
): Promise<{ readonly report: ModeReport; readonly reducedResult: Uint8Array }> {
  const shards = partitionRows(options.rows, Math.min(options.maxWorkers, options.rows));
  const preloadStart = performance.now();
  const workers = shards.map((shard) => createWorkerHandle());
  try {
    await Promise.all(
      workers.map((worker, index) => {
        const shard = shards[index];
        const command = buildInitCommand(options, mode, shard, xyPowers, index);
        const transfer =
          mode === "transfer" && command.transferredBaseShard !== undefined
            ? [command.transferredBaseShard.buffer]
            : undefined;
        return worker.init(command, transfer);
      }),
    );
    const preloadMs = performance.now() - preloadStart;

    const firstResults = await runWorkers(workers);
    const reducedResult = reduceResults(runtime, firstResults);

    const msmMs = await measure(options, async () => {
      reduceResults(runtime, await runWorkers(workers));
    });

    const pointCount = options.rows * options.stride;
    const activePointCount = options.rows * options.cols;
    const scalarBytes = pointCount * SCALAR_RAW_BYTES;
    const transferredCrsBytes = mode === "transfer" ? pointCount * G1_AFFINE_BYTES : 0;

    return {
      reducedResult,
      report: {
        mode,
        workerCount: shards.length,
        shardRows: shards.map((shard) => shard.rowEnd - shard.rowStart),
        pointCount,
        activePointCount,
        jsSharedSourceCrsBytes: mode === "shared" ? xyPowers.byteLength : 0,
        transferredCrsBytes,
        scalarBytes,
        wasmZeroCopy: false,
        preloadMs,
        msmMs,
      },
    };
  } finally {
    for (const worker of workers) {
      worker.terminate();
    }
  }
}

function partitionRows(rowCount: number, workerCount: number): WorkerShard[] {
  const shards: WorkerShard[] = [];
  let rowStart = 0;
  for (let workerIndex = 0; workerIndex < workerCount; workerIndex += 1) {
    const remainingRows = rowCount - rowStart;
    const remainingWorkers = workerCount - workerIndex;
    const rows = Math.ceil(remainingRows / remainingWorkers);
    shards.push({
      workerIndex,
      rowStart,
      rowEnd: rowStart + rows,
    });
    rowStart += rows;
  }
  return shards;
}

function buildInitCommand(
  options: BenchmarkOptions,
  mode: BenchmarkMode,
  shard: WorkerShard,
  xyPowers: ArrayBuffer | SharedArrayBuffer,
  id: number,
): WorkerInitCommand {
  const baseByteOffset = shard.rowStart * options.stride * G1_AFFINE_BYTES;
  const baseByteLength = (shard.rowEnd - shard.rowStart) * options.stride * G1_AFFINE_BYTES;
  const baseCommand = {
    id,
    command: "init" as const,
    mode,
    workerIndex: shard.workerIndex,
    rowStart: shard.rowStart,
    rowEnd: shard.rowEnd,
    colEnd: options.cols,
    stride: options.stride,
    seed: formatSeed(options.seed),
  };

  if (mode === "shared") {
    if (!(xyPowers instanceof SharedArrayBuffer)) {
      throw new Error("Shared CRS shard mode requires a SharedArrayBuffer source.");
    }

    return {
      ...baseCommand,
      sharedBaseBuffer: xyPowers,
      sharedBaseByteOffset: baseByteOffset,
    };
  }

  return {
    ...baseCommand,
    transferredBaseShard: new Uint8Array(new Uint8Array(xyPowers, baseByteOffset, baseByteLength)),
  };
}

function createWorkerHandle(): WorkerHandle {
  const worker = new Worker("/browser/crs-sharded-msm-worker.js", { type: "module" });
  let nextId = 0;

  return {
    init(command, transfer) {
      const id = nextId;
      nextId += 1;
      return callWorker(worker, { ...command, id }, transfer).then(() => undefined);
    },
    run() {
      const id = nextId;
      nextId += 1;
      return callWorker(worker, { id, command: "run" });
    },
    terminate() {
      worker.terminate();
    },
  };
}

async function runWorkers(workers: readonly WorkerHandle[]): Promise<readonly WorkerResult[]> {
  const results = await Promise.all(workers.map((worker) => worker.run()));
  return results.sort((left, right) => left.workerIndex - right.workerIndex);
}

function reduceResults(runtime: CurveRuntime, results: readonly WorkerResult[]): Uint8Array {
  return results.reduce((accumulator, result) => runtime.G1.add(accumulator, result.result), runtime.G1.zero);
}

function assertModeResultsEqual(runtime: CurveRuntime, results: readonly Uint8Array[]): void {
  if (results.length <= 1) {
    return;
  }

  for (let index = 1; index < results.length; index += 1) {
    if (!runtime.G1.eq(results[0], results[index])) {
      throw new Error(`Benchmark mode result mismatch at index ${index}.`);
    }
  }
}

function callWorker(
  worker: Worker,
  message: Record<string, unknown>,
  transfer?: Transferable[],
): Promise<WorkerResult> {
  const id = requireSafeInteger(message.id, "worker message id");
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<unknown>): void => {
      const data = event.data;
      if (!isWorkerResponse(data) || data.id !== id) {
        return;
      }

      cleanup();
      if (data.status === "error") {
        reject(new Error(data.error));
        return;
      }

      if (data.result === undefined) {
        reject(new Error("Worker response is missing a result."));
        return;
      }

      resolve(data.result);
    };
    const onError = (event: ErrorEvent): void => {
      cleanup();
      reject(new Error(event.message));
    };
    const cleanup = (): void => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
    };

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage(message, transfer ?? []);
  });
}

function isWorkerResponse(value: unknown): value is {
  readonly id: number;
  readonly status: "ok" | "error";
  readonly error?: string;
  readonly result?: WorkerResult;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "number" &&
    ((value as { status?: unknown }).status === "ok" || (value as { status?: unknown }).status === "error")
  );
}

async function measure(options: BenchmarkOptions, callback: () => Promise<void>): Promise<number> {
  for (let index = 0; index < options.warmup; index += 1) {
    await callback();
  }

  const start = performance.now();
  for (let index = 0; index < options.iterations; index += 1) {
    await callback();
  }

  return (performance.now() - start) / options.iterations;
}

function readMemorySnapshot(): BrowserMemorySnapshot | undefined {
  const memory = (performance as unknown as { memory?: BrowserMemorySnapshot }).memory;
  const deviceMemory = (navigator as unknown as { deviceMemory?: number }).deviceMemory;

  if (memory === undefined && deviceMemory === undefined) {
    return undefined;
  }

  return {
    usedJSHeapSize: memory?.usedJSHeapSize,
    totalJSHeapSize: memory?.totalJSHeapSize,
    jsHeapSizeLimit: memory?.jsHeapSizeLimit,
    deviceMemory,
  };
}

function requireSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer.`);
  }
  return value as number;
}

function formatSeed(seed: bigint): string {
  return `0x${seed.toString(16)}`;
}
