import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { getCurveFromName } from "ffjavascript";

import {
  biNttBuffer,
  createFieldRuntime,
  type FfCurve,
  type FfField,
  type FieldRuntime,
} from "../../../src/index.js";
import { installLinearBatchPlugin } from "../../../src/core/field/linear-batch-plugin.js";

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

interface FfThreadManager {
  readonly concurrency: number;
  queueAction(actionData: readonly FfWorkerCommand[]): Promise<Uint8Array[]>;
}

interface FfFieldWithWorkerTasks extends FfField {
  readonly prefix: string;
  readonly tm: FfThreadManager;
}

type FfWorkerCommand =
  | {
      readonly cmd: "ALLOCSET";
      readonly var: number;
      readonly buff: Uint8Array;
    }
  | {
      readonly cmd: "CALL";
      readonly fnName: string;
      readonly params: readonly FfWorkerCallParam[];
    }
  | {
      readonly cmd: "GET";
      readonly out: number;
      readonly var: number;
      readonly len: number;
    };

type FfWorkerCallParam =
  | {
      readonly var: number;
    }
  | {
      readonly val: number;
    };

const MAX_FFT_MIX_BITS_PER_BATCH_TASK = 14;

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
          await assertCandidateParity(raw.Fr as FfFieldWithWorkerTasks, field, values, shape, direction);
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
          records.push(
            await benchmarkCandidate(options, mode, direction, "batched-segment-biNttBuffer", shape, () =>
              biNttBufferViaBatchedSegments(raw.Fr as FfFieldWithWorkerTasks, field, values, shape.xSize, shape.ySize, direction),
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
  rawField: FfFieldWithWorkerTasks,
  field: FieldRuntime,
  values: Uint8Array,
  shape: Shape,
  direction: NttDirection,
): Promise<void> {
  const expected = await biNttBuffer(field, values, shape.xSize, shape.ySize, direction);
  const legacy = await legacyBiNttBuffer(field, values, shape.xSize, shape.ySize, direction);
  const actual = await biNttBufferViaBatchedSegments(rawField, field, values, shape.xSize, shape.ySize, direction);
  if (!buffersEqual(expected, legacy)) {
    throw new Error(`Legacy 2D NTT mismatch for ${shape.xSize}x${shape.ySize} ${direction}.`);
  }
  if (!buffersEqual(expected, actual)) {
    throw new Error(`Batched 2D NTT mismatch for ${shape.xSize}x${shape.ySize} ${direction}.`);
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

async function biNttBufferViaBatchedSegments(
  rawField: FfFieldWithWorkerTasks,
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

  if (xSize === 1 || ySize === 1) {
    return await batchFftSegments(rawField, values, xSize * ySize, direction);
  }

  const yTransformed = await batchFftSegments(rawField, values, ySize, direction);
  const transposed = transposeRowMajorBuffer(field, yTransformed, xSize, ySize);
  const xTransformedTransposed = await batchFftSegments(rawField, transposed, xSize, direction);
  return transposeRowMajorBuffer(field, xTransformedTransposed, ySize, xSize);
}

async function batchFftSegments(
  field: FfFieldWithWorkerTasks,
  buffer: Uint8Array,
  segmentSize: number,
  direction: NttDirection,
): Promise<Uint8Array> {
  const segmentBits = checkedPowerOfTwoLog(segmentSize);
  if (buffer.byteLength % field.n8 !== 0) {
    throw new Error("Field buffer byte length is not divisible by the field width.");
  }
  const elementCount = buffer.byteLength / field.n8;
  if (elementCount % segmentSize !== 0) {
    throw new Error("Batch FFT input count must be divisible by the segment size.");
  }

  if (segmentSize === 1 || elementCount === 0) {
    return buffer.slice();
  }

  if (segmentBits > MAX_FFT_MIX_BITS_PER_BATCH_TASK) {
    return await transformLargeSegmentsWithPublicFft(field, buffer, segmentSize, direction);
  }

  return await transformSmallSegmentsWithWorkerTasks(field, buffer, segmentSize, segmentBits, direction);
}

async function transformLargeSegmentsWithPublicFft(
  field: FfField,
  buffer: Uint8Array,
  segmentSize: number,
  direction: NttDirection,
): Promise<Uint8Array> {
  const transform = direction === "forward" ? field.fft.bind(field) : field.ifft.bind(field);
  const segmentByteLength = segmentSize * field.n8;
  const segmentCount = buffer.byteLength / segmentByteLength;
  const output = new Uint8Array(buffer.byteLength);

  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const start = segmentIndex * segmentByteLength;
    output.set(await transform(buffer.slice(start, start + segmentByteLength)), start);
  }

  return output;
}

async function transformSmallSegmentsWithWorkerTasks(
  field: FfFieldWithWorkerTasks,
  buffer: Uint8Array,
  segmentSize: number,
  segmentBits: number,
  direction: NttDirection,
): Promise<Uint8Array> {
  const segmentByteLength = segmentSize * field.n8;
  const segmentCount = buffer.byteLength / segmentByteLength;
  const output = new Uint8Array(buffer.byteLength);
  const taskCount = Math.min(Math.max(1, field.tm.concurrency), segmentCount);
  const segmentsPerTask = Math.ceil(segmentCount / taskCount);
  const reversed = bitReverseSegments(buffer, segmentSize, field.n8);
  const promises: Promise<Uint8Array[]>[] = [];
  const taskStarts: number[] = [];

  for (let taskIndex = 0; taskIndex < taskCount; taskIndex += 1) {
    const startSegment = taskIndex * segmentsPerTask;
    const endSegment = Math.min(segmentCount, startSegment + segmentsPerTask);
    if (startSegment >= endSegment) {
      continue;
    }

    taskStarts.push(startSegment);
    promises.push(
      field.tm.queueAction(
        buildBatchFftTask(field, reversed, segmentByteLength, startSegment, endSegment, segmentSize, segmentBits, direction),
      ),
    );
  }

  const results = await Promise.all(promises);
  for (let taskIndex = 0; taskIndex < results.length; taskIndex += 1) {
    const startSegment = taskStarts[taskIndex];
    const taskResult = results[taskIndex];
    for (let localIndex = 0; localIndex < taskResult.length; localIndex += 1) {
      const segmentOutput =
        direction === "inverse" ? rotateInverseFftSegment(taskResult[localIndex], field.n8) : taskResult[localIndex];
      output.set(segmentOutput, (startSegment + localIndex) * segmentByteLength);
    }
  }

  return output;
}

function buildBatchFftTask(
  field: FfFieldWithWorkerTasks,
  reversed: Uint8Array,
  segmentByteLength: number,
  startSegment: number,
  endSegment: number,
  segmentSize: number,
  segmentBits: number,
  direction: NttDirection,
): FfWorkerCommand[] {
  const task: FfWorkerCommand[] = [];
  const inverseFactorVar = 0;
  const firstSegmentVar = direction === "inverse" ? 1 : 0;

  if (direction === "inverse") {
    task.push({
      cmd: "ALLOCSET",
      var: inverseFactorVar,
      buff: field.inv(field.e(segmentSize)),
    });
  }

  for (let segmentIndex = startSegment; segmentIndex < endSegment; segmentIndex += 1) {
    const localIndex = segmentIndex - startSegment;
    const variable = firstSegmentVar + localIndex;
    const segmentStart = segmentIndex * segmentByteLength;
    task.push({
      cmd: "ALLOCSET",
      var: variable,
      buff: reversed.slice(segmentStart, segmentStart + segmentByteLength),
    });

    for (let mixBits = 1; mixBits <= segmentBits; mixBits += 1) {
      task.push({
        cmd: "CALL",
        fnName: `${field.prefix}_fftMix`,
        params: [{ var: variable }, { val: segmentSize }, { val: mixBits }],
      });
    }

    if (direction === "inverse") {
      task.push({
        cmd: "CALL",
        fnName: `${field.prefix}_fftFinal`,
        params: [{ var: variable }, { val: segmentSize }, { var: inverseFactorVar }],
      });
    }

    task.push({
      cmd: "GET",
      out: localIndex,
      var: variable,
      len: segmentByteLength,
    });
  }

  return task;
}

function transposeRowMajorBuffer(
  field: FieldRuntime,
  values: Uint8Array,
  rowCount: number,
  columnCount: number,
): Uint8Array {
  if (field.bufferElementCount(values) !== rowCount * columnCount) {
    throw new Error("Cannot transpose a buffer whose length does not match its shape.");
  }

  const output = new Uint8Array(values.byteLength);
  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      output.set(
        values.subarray(
          (row * columnCount + column) * field.byteLength,
          (row * columnCount + column + 1) * field.byteLength,
        ),
        (column * rowCount + row) * field.byteLength,
      );
    }
  }

  return output;
}

function bitReverseSegments(buffer: Uint8Array, segmentSize: number, elementByteLength: number): Uint8Array {
  const segmentByteLength = segmentSize * elementByteLength;
  const segmentCount = buffer.byteLength / segmentByteLength;
  const bits = checkedPowerOfTwoLog(segmentSize);
  const output = new Uint8Array(buffer.byteLength);

  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const segmentStart = segmentIndex * segmentByteLength;
    for (let index = 0; index < segmentSize; index += 1) {
      const reversedIndex = reverseBits(index, bits);
      output.set(
        buffer.subarray(segmentStart + index * elementByteLength, segmentStart + (index + 1) * elementByteLength),
        segmentStart + reversedIndex * elementByteLength,
      );
    }
  }

  return output;
}

function reverseBits(value: number, bits: number): number {
  let output = 0;
  for (let index = 0; index < bits; index += 1) {
    output = (output << 1) | (value & 1);
    value >>= 1;
  }
  return output;
}

function rotateInverseFftSegment(segment: Uint8Array, elementByteLength: number): Uint8Array {
  const elementCount = segment.byteLength / elementByteLength;
  const output = new Uint8Array(segment.byteLength);
  output.set(segment.subarray((elementCount - 1) * elementByteLength), 0);
  output.set(segment.subarray(0, (elementCount - 1) * elementByteLength), elementByteLength);
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

function checkedPowerOfTwoLog(size: number): number {
  if (!isPowerOfTwo(size)) {
    throw new Error("FFT segment size must be a power of two.");
  }
  let current = 1;
  let log = 0;
  while (current < size) {
    current *= 2;
    log += 1;
  }
  return log;
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
