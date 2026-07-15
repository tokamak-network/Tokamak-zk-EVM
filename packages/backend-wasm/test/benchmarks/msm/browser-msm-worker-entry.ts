import { createCurveRuntime, type CurveRuntime, type FieldElement } from "../../../src/index.js";

const G1_AFFINE_BYTES = 96;
const SCALAR_RAW_BYTES = 32;

interface BrowserMsmWorkerPoolResult {
  readonly status: "pending" | "ok" | "error";
  readonly error?: string;
  readonly report?: BenchmarkReport;
}

interface BenchmarkOptions {
  readonly seed: bigint;
  readonly lengths: readonly number[];
  readonly iterations: number;
  readonly warmup: number;
  readonly maxWorkers: number;
}

interface MsmJob {
  readonly index: number;
  readonly length: number;
  readonly rawBases: Uint8Array;
  readonly rawScalars: Uint8Array;
}

interface WorkerAssignment {
  readonly workerIndex: number;
  readonly jobs: readonly MsmJob[];
  readonly totalPoints: number;
}

interface WorkerHandle {
  readonly worker: Worker;
  readonly workerIndex: number;
  init(assignment: WorkerAssignment): Promise<void>;
  run(): Promise<readonly WorkerResult[]>;
  terminate(): void;
}

interface WorkerResult {
  readonly index: number;
  readonly result: Uint8Array;
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

declare global {
  interface Window {
    __tokamakBrowserMsmWorkerPoolResult?: BrowserMsmWorkerPoolResult;
  }
}

window.__tokamakBrowserMsmWorkerPoolResult = { status: "pending" };

main().catch((error: unknown) => {
  window.__tokamakBrowserMsmWorkerPoolResult = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  };
});

async function main(): Promise<void> {
  const options = parseOptions(new URLSearchParams(window.location.search));
  const runtime = await createCurveRuntime({ singleThread: true });

  try {
    const memoryBefore = readMemorySnapshot();
    const jobs = buildJobs(runtime, options);
    const expected = await runSequential(runtime, jobs);
    const sequentialMs = await measure(options, async () => {
      await runSequential(runtime, jobs);
    });

    const assignments = assignJobsForWorkers(cloneJobs(jobs), options.maxWorkers);
    const preloadStart = performance.now();
    const workers = await createWorkerPool(assignments);
    const workerPreloadMs = performance.now() - preloadStart;
    const memoryAfterPreload = readMemorySnapshot();

    try {
      const workerResults = await runWorkerPool(workers);
      assertResultSetsEqual(runtime, expected, workerResults, "worker pool");

      const workerPoolMs = await measure(options, async () => {
        await runWorkerPool(workers);
      });
      const row = buildBenchmarkRow(jobs, assignments, workerPreloadMs, sequentialMs, workerPoolMs);

      window.__tokamakBrowserMsmWorkerPoolResult = {
        status: "ok",
        report: {
          benchmark: "browser-msm-worker-pool",
          seed: formatSeed(options.seed),
          lengths: options.lengths,
          iterations: options.iterations,
          warmup: options.warmup,
          workerCount: assignments.length,
          hardwareConcurrency: navigator.hardwareConcurrency,
          rows: [row],
          memory: {
            before: memoryBefore,
            afterPreload: memoryAfterPreload,
            afterBenchmark: readMemorySnapshot(),
          },
        },
      };
    } finally {
      for (const worker of workers) {
        worker.terminate();
      }
    }
  } finally {
    await runtime.terminate();
  }
}

function parseOptions(params: URLSearchParams): BenchmarkOptions {
  return {
    seed: parseSeed(params.get("seed") ?? "0x544f4b414d414b"),
    lengths: parseLengths(params.get("lengths") ?? "16384,16384,16384,32768,16384,16384"),
    iterations: parsePositiveInteger(params.get("iterations") ?? "2", "iterations"),
    warmup: parseNonNegativeInteger(params.get("warmup") ?? "1", "warmup"),
    maxWorkers: parsePositiveInteger(params.get("workers") ?? "6", "workers"),
  };
}

function parseSeed(value: string): bigint {
  if (!/^(0x[0-9a-fA-F]+|[0-9]+)$/.test(value)) {
    throw new Error("Seed must be a decimal integer or 0x-prefixed hexadecimal integer.");
  }

  return BigInt(value);
}

function parseLengths(value: string): number[] {
  const lengths = value.split(",").map((entry) => parsePositiveInteger(entry.trim(), "length"));
  if (lengths.length === 0) {
    throw new Error("At least one benchmark length is required.");
  }
  return lengths;
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

function buildJobs(runtime: CurveRuntime, options: BenchmarkOptions): MsmJob[] {
  return options.lengths.map((length, index) => buildJob(runtime, length, index, options.seed));
}

function buildJob(runtime: CurveRuntime, length: number, index: number, seed: bigint): MsmJob {
  return {
    index,
    length,
    rawBases: buildSequentialAffineBases(runtime, length, index),
    rawScalars: buildRawScalars(runtime, length, seed + BigInt(index) * 0x100000001b3n),
  };
}

function buildSequentialAffineBases(runtime: CurveRuntime, length: number, offset: number): Uint8Array {
  const output = new Uint8Array(length * G1_AFFINE_BYTES);
  let point = runtime.G1.mulAffineScalar(runtime.G1.generator, runtime.Fr.fromBigInt(BigInt(offset + 1)));
  for (let index = 0; index < length; index += 1) {
    output.set(runtime.G1.toAffine(point), index * G1_AFFINE_BYTES);
    point = runtime.G1.add(point, runtime.G1.generator);
  }
  return output;
}

function buildRawScalars(runtime: CurveRuntime, length: number, seed: bigint): Uint8Array {
  const random = createSplitMix64(seed);
  const output = new Uint8Array(length * runtime.Fr.byteLength);
  for (let index = 0; index < length; index += 1) {
    output.set(runtime.Fr.toRawLittleEndian(randomFieldElement(runtime, random)), index * runtime.Fr.byteLength);
  }
  return output;
}

function createSplitMix64(seed: bigint): () => bigint {
  let state = seed & 0xffffffffffffffffn;

  return () => {
    state = (state + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
    let value = state;
    value = ((value ^ (value >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
    value = ((value ^ (value >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
    return value ^ (value >> 31n);
  };
}

function randomFieldElement(runtime: CurveRuntime, random: () => bigint): FieldElement {
  let value = 0n;
  for (let index = 0; index < 4; index += 1) {
    value = (value << 64n) | random();
  }

  return runtime.Fr.fromBigInt((value % (runtime.Fr.modulus - 1n)) + 1n);
}

function cloneJobs(jobs: readonly MsmJob[]): MsmJob[] {
  return jobs.map((job) => ({
    index: job.index,
    length: job.length,
    rawBases: new Uint8Array(job.rawBases),
    rawScalars: new Uint8Array(job.rawScalars),
  }));
}

function assignJobsForWorkers(jobs: readonly MsmJob[], maxWorkers: number): WorkerAssignment[] {
  const workerCount = Math.min(maxWorkers, jobs.length);
  const assignments: Array<{ workerIndex: number; jobs: MsmJob[]; totalPoints: number }> = Array.from(
    { length: workerCount },
    (_, workerIndex) => ({
      workerIndex,
      jobs: [],
      totalPoints: 0,
    }),
  );

  const sorted = [...jobs].sort((left, right) => right.length - left.length);
  for (const job of sorted) {
    const target = assignments.reduce((lightest, candidate) =>
      candidate.totalPoints < lightest.totalPoints ? candidate : lightest,
    );
    target.jobs.push(job);
    target.totalPoints += job.length;
  }

  return assignments.filter((assignment) => assignment.jobs.length > 0);
}

async function createWorkerPool(assignments: readonly WorkerAssignment[]): Promise<WorkerHandle[]> {
  const workers = assignments.map((assignment) => createWorkerHandle(assignment.workerIndex));
  await Promise.all(workers.map((worker, index) => worker.init(assignments[index])));
  return workers;
}

function createWorkerHandle(workerIndex: number): WorkerHandle {
  const worker = new Worker("/browser/msm-worker.js", { type: "module" });
  let nextId = 0;

  return {
    worker,
    workerIndex,
    init(assignment) {
      const id = nextId;
      nextId += 1;
      const transfer = assignment.jobs.flatMap((job) => [job.rawBases.buffer, job.rawScalars.buffer]);
      return callWorker(worker, {
        id,
        command: "init",
        workerIndex,
        jobs: assignment.jobs.map((job) => ({
          index: job.index,
          length: job.length,
          rawBases: job.rawBases,
          rawScalars: job.rawScalars,
        })),
      }, transfer).then(() => undefined);
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

function callWorker(
  worker: Worker,
  message: Record<string, unknown>,
  transfer?: Transferable[],
): Promise<readonly WorkerResult[]> {
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

      resolve(data.results ?? []);
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
  readonly error: string;
  readonly results?: readonly WorkerResult[];
} {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "number" &&
    ((value as { status?: unknown }).status === "ok" || (value as { status?: unknown }).status === "error")
  );
}

async function runSequential(runtime: CurveRuntime, jobs: readonly MsmJob[]): Promise<WorkerResult[]> {
  const output: WorkerResult[] = [];
  for (const job of jobs) {
    output.push({
      index: job.index,
      result: await runtime.G1.msmAffineRaw(job.rawBases, job.rawScalars),
    });
  }
  return output;
}

async function runWorkerPool(workers: readonly WorkerHandle[]): Promise<WorkerResult[]> {
  const nested = await Promise.all(workers.map((worker) => worker.run()));
  return nested.flat().sort((left, right) => left.index - right.index);
}

function assertResultSetsEqual(
  runtime: CurveRuntime,
  expected: readonly WorkerResult[],
  actual: readonly WorkerResult[],
  label: string,
): void {
  const sortedExpected = [...expected].sort((left, right) => left.index - right.index);
  const sortedActual = [...actual].sort((left, right) => left.index - right.index);

  if (sortedExpected.length !== sortedActual.length) {
    throw new Error(`${label} result count mismatch.`);
  }

  for (let index = 0; index < sortedExpected.length; index += 1) {
    if (sortedExpected[index].index !== sortedActual[index].index) {
      throw new Error(`${label} result index mismatch at position ${index}.`);
    }
    if (!runtime.G1.eq(sortedExpected[index].result, sortedActual[index].result)) {
      throw new Error(`${label} result ${sortedExpected[index].index} mismatch.`);
    }
  }
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

function buildBenchmarkRow(
  jobs: readonly MsmJob[],
  assignments: readonly WorkerAssignment[],
  workerPreloadMs: number,
  sequentialMs: number,
  workerPoolMs: number,
): BenchmarkRow {
  const totalPoints = jobs.reduce((sum, job) => sum + job.length, 0);
  const maxJobPoints = Math.max(...jobs.map((job) => job.length));
  const transferredInputBytes = jobs.reduce(
    (sum, job) => sum + job.rawBases.byteLength + job.rawScalars.byteLength,
    0,
  );

  return {
    jobCount: jobs.length,
    totalPoints,
    maxJobPoints,
    assignmentPoints: assignments.map((assignment) => assignment.totalPoints),
    transferredInputBytes,
    workerPreloadMs,
    sequentialMs,
    workerPoolMs,
    workerPoolSpeedup: sequentialMs / workerPoolMs,
  };
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
