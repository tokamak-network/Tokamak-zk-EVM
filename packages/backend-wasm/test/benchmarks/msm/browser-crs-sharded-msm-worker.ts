import { createCurveRuntime, type CurveRuntime, type FieldElement } from "../../../src/index.js";

const G1_AFFINE_BYTES = 96;
const SCALAR_RAW_BYTES = 32;

type BenchmarkMode = "shared" | "transfer";

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
let scalars: Uint8Array | undefined;

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

  const baseByteLength = rows * message.stride * G1_AFFINE_BYTES;
  if (message.mode === "shared") {
    if (message.sharedBaseBuffer === undefined || message.sharedBaseByteOffset === undefined) {
      throw new Error("Shared CRS shard initialization requires a SharedArrayBuffer and base offset.");
    }
    bases = new Uint8Array(message.sharedBaseBuffer, message.sharedBaseByteOffset, baseByteLength);
  } else {
    if (message.transferredBaseShard === undefined) {
      throw new Error("Transfer CRS shard initialization requires a transferred base shard.");
    }
    if (message.transferredBaseShard.byteLength !== baseByteLength) {
      throw new Error("Transferred CRS shard byte length does not match the requested row range.");
    }
    bases = message.transferredBaseShard;
  }

  scalars = buildScalarShard(runtime, message);
}

async function handleRun(): Promise<WorkerResult> {
  if (runtime === undefined || bases === undefined || scalars === undefined) {
    throw new Error("CRS-sharded MSM worker was not initialized.");
  }

  return {
    workerIndex,
    result: await runtime.G1.msmAffineRaw(bases, scalars),
  };
}

function buildScalarShard(runtime: CurveRuntime, message: WorkerInitCommand): Uint8Array {
  const rows = message.rowEnd - message.rowStart;
  const output = new Uint8Array(rows * message.stride * SCALAR_RAW_BYTES);
  const seed = parseSeed(message.seed);

  for (let localRow = 0; localRow < rows; localRow += 1) {
    const globalRow = message.rowStart + localRow;
    for (let col = 0; col < message.colEnd; col += 1) {
      const scalar = scalarForCell(runtime, seed, globalRow, col, message.stride);
      output.set(runtime.Fr.toRawLittleEndian(scalar), (localRow * message.stride + col) * SCALAR_RAW_BYTES);
    }
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
