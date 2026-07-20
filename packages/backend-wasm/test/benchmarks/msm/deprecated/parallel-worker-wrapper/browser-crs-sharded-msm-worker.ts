import { createCurveRuntime, type CurveRuntime, type FieldElement } from "../../../../../src/index.js";

const G1_AFFINE_BYTES = 96;
const SCALAR_RAW_BYTES = 32;

type BenchmarkMode = "shared" | "transfer";
type ResolvedBaseLayout = "stride" | "packed";

interface WorkerInitCommand {
  readonly id: number;
  readonly command: "init";
  readonly mode: BenchmarkMode;
  readonly workerIndex: number;
  readonly rowStart: number;
  readonly rowEnd: number;
  readonly colEnd: number;
  readonly stride: number;
  readonly chunkPoints: number;
  readonly baseLayout: ResolvedBaseLayout;
  readonly seed: string;
  readonly sharedBaseBuffer?: SharedArrayBuffer;
  readonly sharedBaseByteOffset?: number;
  readonly transferredBaseShard?: Uint8Array;
}

interface WorkerRunCommand {
  readonly id: number;
  readonly command: "run";
}

type WorkerCommand = WorkerInitCommand | WorkerRunCommand;

interface WorkerResult {
  readonly workerIndex: number;
  readonly result: Uint8Array;
}

let runtime: CurveRuntime | undefined;
let workerIndex = -1;
let bases: Uint8Array | undefined;
let config: WorkerConfig | undefined;

interface WorkerConfig {
  readonly baseStorage: "stride" | "packed";
  readonly rowStart: number;
  readonly rowEnd: number;
  readonly colEnd: number;
  readonly stride: number;
  readonly chunkPoints: number;
  readonly baseLayout: ResolvedBaseLayout;
  readonly seed: bigint;
}

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  void handleMessage(event.data);
});

async function handleMessage(message: unknown): Promise<void> {
  if (!isWorkerCommand(message)) {
    return;
  }

  try {
    if (message.command === "init") {
      await handleInit(message);
      postOk(message.id, {
        workerIndex,
        result: new Uint8Array(),
      });
      return;
    }

    postOk(message.id, await handleRun());
  } catch (error) {
    postError(message.id, error instanceof Error ? error.message : String(error));
  }
}

async function handleInit(message: WorkerInitCommand): Promise<void> {
  runtime = await createCurveRuntime({ singleThread: true });
  workerIndex = message.workerIndex;

  const rows = message.rowEnd - message.rowStart;
  if (rows <= 0) {
    throw new Error("Worker shard row range must be non-empty.");
  }
  if (message.colEnd > message.stride) {
    throw new Error("Worker shard colEnd must be less than or equal to stride.");
  }
  if (message.chunkPoints <= 0) {
    throw new Error("Worker shard chunkPoints must be positive.");
  }

  if (message.mode === "shared") {
    if (message.sharedBaseBuffer === undefined || message.sharedBaseByteOffset === undefined) {
      throw new Error("Shared CRS shard initialization requires a SharedArrayBuffer and base offset.");
    }
    bases = new Uint8Array(message.sharedBaseBuffer, message.sharedBaseByteOffset, rows * message.stride * G1_AFFINE_BYTES);
  } else {
    if (message.transferredBaseShard === undefined) {
      throw new Error("Transfer CRS shard initialization requires a transferred base shard.");
    }
    const transferredPointsPerRow = message.baseLayout === "stride" ? message.stride : message.colEnd;
    const baseByteLength = rows * transferredPointsPerRow * G1_AFFINE_BYTES;
    if (message.transferredBaseShard.byteLength !== baseByteLength) {
      throw new Error("Transferred CRS shard byte length does not match the requested row range.");
    }
    bases = message.transferredBaseShard;
  }

  config = {
    baseStorage: message.mode === "shared" ? "stride" : message.baseLayout,
    rowStart: message.rowStart,
    rowEnd: message.rowEnd,
    colEnd: message.colEnd,
    stride: message.stride,
    chunkPoints: message.chunkPoints,
    baseLayout: message.baseLayout,
    seed: parseSeed(message.seed),
  };
}

async function handleRun(): Promise<WorkerResult> {
  if (runtime === undefined || bases === undefined || config === undefined) {
    throw new Error("CRS-sharded MSM worker was not initialized.");
  }

  let accumulator = runtime.G1.zero;
  const pointsPerRow = config.baseLayout === "stride" ? config.stride : config.colEnd;
  const pointCount = (config.rowEnd - config.rowStart) * pointsPerRow;
  for (let offset = 0; offset < pointCount; offset += config.chunkPoints) {
    const count = Math.min(config.chunkPoints, pointCount - offset);
    const baseChunk = buildBaseChunk(bases, config, offset, count);
    const scalarChunk = buildScalarChunk(runtime, config, offset, count);
    accumulator = runtime.G1.add(accumulator, await runtime.G1.msmAffineRaw(baseChunk, scalarChunk));
  }

  return {
    workerIndex,
    result: accumulator,
  };
}

function buildScalarChunk(
  runtime: CurveRuntime,
  workerConfig: WorkerConfig,
  pointOffset: number,
  count: number,
): Uint8Array {
  const output = new Uint8Array(count * SCALAR_RAW_BYTES);
  const pointsPerRow = workerConfig.baseLayout === "stride" ? workerConfig.stride : workerConfig.colEnd;

  for (let index = 0; index < count; index += 1) {
    const localPoint = pointOffset + index;
    const localRow = Math.floor(localPoint / pointsPerRow);
    const col = localPoint % pointsPerRow;
    if (workerConfig.baseLayout === "stride" && col >= workerConfig.colEnd) {
      continue;
    }

    const globalRow = workerConfig.rowStart + localRow;
    const scalar = scalarForCell(runtime, workerConfig.seed, globalRow, col, workerConfig.stride);
    output.set(runtime.Fr.toRawLittleEndian(scalar), index * SCALAR_RAW_BYTES);
  }

  return output;
}

function buildBaseChunk(
  source: Uint8Array,
  workerConfig: WorkerConfig,
  pointOffset: number,
  count: number,
): Uint8Array {
  if (workerConfig.baseLayout === "stride" && workerConfig.baseStorage === "stride") {
    return source.subarray(pointOffset * G1_AFFINE_BYTES, (pointOffset + count) * G1_AFFINE_BYTES);
  }

  if (workerConfig.baseStorage === "packed") {
    return source.subarray(pointOffset * G1_AFFINE_BYTES, (pointOffset + count) * G1_AFFINE_BYTES);
  }

  const output = new Uint8Array(count * G1_AFFINE_BYTES);
  const pointsPerRow = workerConfig.colEnd;
  for (let index = 0; index < count; index += 1) {
    const localPoint = pointOffset + index;
    const localRow = Math.floor(localPoint / pointsPerRow);
    const col = localPoint % pointsPerRow;
    const sourcePoint = localRow * workerConfig.stride + col;
    output.set(
      source.subarray(sourcePoint * G1_AFFINE_BYTES, (sourcePoint + 1) * G1_AFFINE_BYTES),
      index * G1_AFFINE_BYTES,
    );
  }
  return output;
}

function scalarForCell(
  runtime: CurveRuntime,
  seed: bigint,
  row: number,
  col: number,
  stride: number,
): FieldElement {
  const index = BigInt(row * stride + col);
  const random = createSplitMix64(seed + index * 0x100000001b3n);
  let value = 0n;
  for (let limb = 0; limb < 4; limb += 1) {
    value = (value << 64n) | random();
  }

  return runtime.Fr.fromBigInt((value % (runtime.Fr.modulus - 1n)) + 1n);
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

function parseSeed(value: string): bigint {
  if (!/^(0x[0-9a-fA-F]+|[0-9]+)$/.test(value)) {
    throw new Error("Seed must be a decimal integer or 0x-prefixed hexadecimal integer.");
  }

  return BigInt(value);
}

function postOk(id: number, result: WorkerResult): void {
  self.postMessage({ id, status: "ok", result });
}

function postError(id: number, error: string): void {
  self.postMessage({ id, status: "error", error });
}

function isWorkerCommand(value: unknown): value is WorkerCommand {
  return (
    typeof value === "object" &&
    value !== null &&
    Number.isSafeInteger((value as { id?: unknown }).id) &&
    ((value as { command?: unknown }).command === "init" || (value as { command?: unknown }).command === "run")
  );
}
