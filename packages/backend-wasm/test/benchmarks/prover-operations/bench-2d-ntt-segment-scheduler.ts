import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { getCurveFromName } from "ffjavascript";

import {
  biNttBuffer,
  createFieldRuntime,
  type FfCurve,
  type FieldRuntime,
} from "../../../src/index.js";
import { installLinearBatchPlugin } from "../../../src/runtime/field/linear-batch-plugin.js";

interface BenchmarkOptions {
  readonly shapes: readonly Shape[];
  readonly modes: readonly RuntimeMode[];
  readonly directions: readonly NttDirection[];
  readonly iterations: number;
  readonly warmup: number;
  readonly seed: bigint;
  readonly jsonPath: string;
}

interface Shape {
  readonly xSize: number;
  readonly ySize: number;
}

type RuntimeMode = "single" | "parallel";
type NttDirection = "forward" | "inverse";

interface BenchmarkRecord {
  readonly mode: RuntimeMode;
  readonly direction: NttDirection;
  readonly candidate: string;
  readonly shape: string;
  readonly ms: number;
  readonly notes: string;
}

interface BenchmarkReport {
  readonly generatedAt: string;
  readonly options: {
    readonly shapes: readonly string[];
    readonly modes: readonly RuntimeMode[];
    readonly directions: readonly NttDirection[];
    readonly iterations: number;
    readonly warmup: number;
    readonly seed: string;
  };
  readonly records: readonly BenchmarkRecord[];
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const records: BenchmarkRecord[] = [];

  for (const mode of options.modes) {
    const raw = (await getCurveFromName(
      "bls12381",
      mode === "single",
      installLinearBatchPlugin,
    )) as FfCurve;
    const field = createFieldRuntime(raw.Fr);

    try {
      for (const shape of options.shapes) {
        const values = randomFieldBuffer(field, shape.xSize * shape.ySize, options.seed + BigInt(shape.xSize * 257 + shape.ySize));
        for (const direction of options.directions) {
          await assertCandidateParity(field, values, shape, direction);
          records.push(
            await benchmarkCandidate(options, mode, direction, "legacy-sequential-biNttBuffer", shape, () =>
              legacyBiNttBuffer(field, values, shape.xSize, shape.ySize, direction),
            ),
          );
          records.push(
            await benchmarkCandidate(options, mode, direction, "production-biNttBuffer", shape, () =>
              biNttBuffer(field, values, shape.xSize, shape.ySize, direction),
            ),
          );
        }
      }
    } finally {
      await raw.terminate?.();
    }
  }

  printRecords(records);
  await writeReport(options, records);
}

async function assertCandidateParity(
  field: FieldRuntime,
  values: Uint8Array,
  shape: Shape,
  direction: NttDirection,
): Promise<void> {
  const expected = await biNttBuffer(field, values, shape.xSize, shape.ySize, direction);
  const legacy = await legacyBiNttBuffer(field, values, shape.xSize, shape.ySize, direction);
  if (!buffersEqual(expected, legacy)) {
    throw new Error(`Legacy 2D NTT mismatch for ${shape.xSize}x${shape.ySize} ${direction}.`);
  }
}

async function benchmarkCandidate(
  options: BenchmarkOptions,
  mode: RuntimeMode,
  direction: NttDirection,
  candidate: string,
  shape: Shape,
  run: () => Promise<Uint8Array>,
): Promise<BenchmarkRecord> {
  for (let index = 0; index < options.warmup; index += 1) {
    await run();
  }

  const start = performance.now();
  for (let index = 0; index < options.iterations; index += 1) {
    await run();
  }
  const elapsed = performance.now() - start;

  return {
    mode,
    direction,
    candidate,
    shape: formatShape(shape),
    ms: elapsed / options.iterations,
    notes: "parity-checked against production biNttBuffer before measurement",
  };
}

async function legacyBiNttBuffer(
  field: FieldRuntime,
  values: Uint8Array,
  xSize: number,
  ySize: number,
  direction: NttDirection,
): Promise<Uint8Array> {
  validateShape(xSize, ySize);
  if (field.bufferElementCount(values) !== xSize * ySize) {
    throw new Error("NTT input count does not match the bivariate shape.");
  }

  const transform = direction === "forward" ? field.fftBuffer.bind(field) : field.ifftBuffer.bind(field);
  if (xSize === 1 || ySize === 1) {
    return await transform(values);
  }

  const yTransformed = field.createZeroBuffer(xSize * ySize);
  for (let x = 0; x < xSize; x += 1) {
    const rowStart = x * ySize * field.byteLength;
    const row = values.slice(rowStart, rowStart + ySize * field.byteLength);
    yTransformed.set(await transform(row), rowStart);
  }

  const output = field.createZeroBuffer(xSize * ySize);
  for (let y = 0; y < ySize; y += 1) {
    const column = field.createZeroBuffer(xSize);
    for (let x = 0; x < xSize; x += 1) {
      field.writeBufferElement(column, x, field.readBufferElement(yTransformed, x * ySize + y));
    }

    const columnTransformed = await transform(column);
    for (let x = 0; x < xSize; x += 1) {
      field.writeBufferElement(output, x * ySize + y, field.readBufferElement(columnTransformed, x));
    }
  }

  return output;
}

function randomFieldBuffer(field: FieldRuntime, elementCount: number, seed: bigint): Uint8Array {
  const output = new Uint8Array(elementCount * field.byteLength);
  let state = seed & ((1n << 64n) - 1n);
  for (let index = 0; index < elementCount; index += 1) {
    state = (state * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
    field.writeBufferElement(output, index, field.fromBigInt((state + BigInt(index)) % field.modulus));
  }
  return output;
}

function buffersEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function parseOptions(args: readonly string[]): BenchmarkOptions {
  return {
    shapes: parseShapes(readOption(args, "shapes") ?? "1024x256,4096x256"),
    modes: parseModes(readOption(args, "modes") ?? "single,parallel"),
    directions: parseDirections(readOption(args, "directions") ?? "forward,inverse"),
    iterations: parsePositiveInteger(readOption(args, "iterations") ?? "1", "iterations"),
    warmup: parseNonNegativeInteger(readOption(args, "warmup") ?? "0", "warmup"),
    seed: BigInt(readOption(args, "seed") ?? "0x544f4b414d414b"),
    jsonPath: readOption(args, "json") ?? "tmp/timing/2d-ntt-segment-scheduler.json",
  };
}

function readOption(args: readonly string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function parseShapes(value: string): Shape[] {
  return value.split(",").map((shape) => {
    const [xRaw, yRaw] = shape.split("x");
    const xSize = parsePositiveInteger(xRaw, "shape x size");
    const ySize = parsePositiveInteger(yRaw, "shape y size");
    validateShape(xSize, ySize);
    return { xSize, ySize };
  });
}

function parseModes(value: string): RuntimeMode[] {
  return value.split(",").map((mode) => {
    if (mode !== "single" && mode !== "parallel") {
      throw new Error(`Unknown runtime mode: ${mode}`);
    }
    return mode;
  });
}

function parseDirections(value: string): NttDirection[] {
  return value.split(",").map((direction) => {
    if (direction !== "forward" && direction !== "inverse") {
      throw new Error(`Unknown NTT direction: ${direction}`);
    }
    return direction;
  });
}

function parsePositiveInteger(value: string | undefined, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return parsed;
}

function parseNonNegativeInteger(value: string | undefined, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return parsed;
}

function validateShape(xSize: number, ySize: number): void {
  if (!isPowerOfTwo(xSize) || !isPowerOfTwo(ySize)) {
    throw new Error("Bivariate NTT benchmark shapes must be powers of two.");
  }
}

function isPowerOfTwo(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && (value & (value - 1)) === 0;
}

function formatShape(shape: Shape): string {
  return `${shape.xSize}x${shape.ySize}`;
}

function printRecords(records: readonly BenchmarkRecord[]): void {
  console.table(
    records.map((record) => ({
      mode: record.mode,
      direction: record.direction,
      candidate: record.candidate,
      shape: record.shape,
      "ms/op": record.ms.toFixed(3),
    })),
  );
}

async function writeReport(options: BenchmarkOptions, records: readonly BenchmarkRecord[]): Promise<void> {
  const report: BenchmarkReport = {
    generatedAt: new Date().toISOString(),
    options: {
      shapes: options.shapes.map(formatShape),
      modes: options.modes,
      directions: options.directions,
      iterations: options.iterations,
      warmup: options.warmup,
      seed: `0x${options.seed.toString(16)}`,
    },
    records,
  };
  await mkdir(path.dirname(options.jsonPath), { recursive: true });
  await writeFile(options.jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${path.resolve(options.jsonPath)}`);
}

await main();
