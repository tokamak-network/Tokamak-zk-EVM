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

type Candidate =
  | "current"
  | "G1-cached-bit-reversal"
  | "G2-direct-task-shards"
  | "G3-direct-inverse-output"
  | "G1+G2-cached-direct-shards";
type Direction = "forward" | "inverse";

interface Shape {
  readonly xSize: number;
  readonly ySize: number;
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
  | { readonly cmd: "ALLOCSET"; readonly var: number; readonly buff: Uint8Array }
  | {
      readonly cmd: "CALL";
      readonly fnName: string;
      readonly params: readonly ({ readonly var: number } | { readonly val: number })[];
    }
  | { readonly cmd: "GET"; readonly out: number; readonly var: number; readonly len: number };

interface PhaseTotals {
  bitReversalMs: number;
  taskPreparationMs: number;
  workerBoundaryMs: number;
  outputAssemblyMs: number;
  transposeMs: number;
}

interface RunResult {
  readonly candidate: Candidate;
  readonly output: Uint8Array;
  readonly totalMs: number;
  readonly phases: PhaseTotals;
  readonly segmentAllocatedBytes: number;
  readonly retainedTableBytes: number;
}

const MAX_FFT_MIX_BITS_PER_BATCH_TASK = 14;
const CANDIDATES: readonly Candidate[] = [
  "current",
  "G1-cached-bit-reversal",
  "G2-direct-task-shards",
  "G3-direct-inverse-output",
  "G1+G2-cached-direct-shards",
];
const SHAPES: readonly Shape[] = [
  { xSize: 4096, ySize: 256 },
  { xSize: 8192, ySize: 512 },
];
const BIT_REVERSE_TABLES = new Map<number, Uint32Array>();

async function main(): Promise<void> {
  const raw = (await getCurveFromName(
    "bls12381",
    false,
    installLinearBatchPlugin,
  )) as FfCurve;
  const rawField = raw.Fr as FfFieldWithWorkerTasks;
  const field = createFieldRuntime(raw.Fr);
  try {
    await assertEdgeAndCosetParity(rawField, field);
    const records = [];
    for (const shape of SHAPES) {
      const values = patternedFieldBuffer(field, shape.xSize * shape.ySize);
      for (const direction of ["forward", "inverse"] as const) {
        console.log(`Checking ${shape.xSize}x${shape.ySize} ${direction} parity`);
        const expected = await biNttBuffer(field, values, shape.xSize, shape.ySize, direction);
        for (const candidate of CANDIDATES) {
          const actual = await runBiNtt(rawField, field, values, shape, direction, candidate);
          assertBytesEqual(expected, actual.output, `${candidate} ${direction} parity`);
        }
        for (const candidate of CANDIDATES) {
          await runBiNtt(rawField, field, values, shape, direction, candidate);
        }
        const samples = new Map<Candidate, RunResult[]>(CANDIDATES.map((candidate) => [candidate, []]));
        for (let iteration = 0; iteration < 3; iteration += 1) {
          const order = rotateCandidates(iteration);
          for (const candidate of order) {
            console.log(
              `Measuring ${shape.xSize}x${shape.ySize} ${direction} ${candidate}, `
                + `iteration ${iteration + 1}`,
            );
            samples.get(candidate)?.push(
              await runBiNtt(rawField, field, values, shape, direction, candidate),
            );
          }
        }
        for (const candidate of CANDIDATES) {
          records.push(summarize(shape, direction, candidate, samples.get(candidate) ?? []));
        }
      }
    }
    console.table(records.map((record) => ({
      shape: record.shape,
      direction: record.direction,
      candidate: record.candidate,
      "median ms": record.medianMs.toFixed(3),
      "bit reverse ms": record.medianPhases.bitReversalMs.toFixed(3),
      "task prep ms": record.medianPhases.taskPreparationMs.toFixed(3),
      "worker boundary ms": record.medianPhases.workerBoundaryMs.toFixed(3),
      "assembly ms": record.medianPhases.outputAssemblyMs.toFixed(3),
      "transpose ms": record.medianPhases.transposeMs.toFixed(3),
      "segment allocated MiB": (record.segmentAllocatedBytes / 2 ** 20).toFixed(3),
      "table KiB": (record.retainedTableBytes / 2 ** 10).toFixed(3),
    })));
    const report = {
      generatedAt: new Date().toISOString(),
      runtime: {
        mode: "parallel",
        concurrency: rawField.tm.concurrency,
      },
      shapes: SHAPES.map(formatShape),
      iterations: 3,
      warmup: 1,
      parity: {
        representativeForwardInverse: "pass",
        oneDimensionalEdges: "pass",
        twoDimensionalSmall: "pass",
        cosetForwardInverse: "pass",
      },
      allocationMetric:
        "Cumulative explicit segment-orchestration bytes allocated across both 1D passes; "
        + "input, output, transpose, worker-internal, and GC allocator bytes are excluded.",
      records,
    };
    const outputPath = path.resolve("tmp/timing/2d-ntt-micro-candidates.json");
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);
  } finally {
    await raw.terminate?.();
  }
}

async function runBiNtt(
  rawField: FfFieldWithWorkerTasks,
  field: FieldRuntime,
  values: Uint8Array,
  shape: Shape,
  direction: Direction,
  candidate: Candidate,
): Promise<RunResult> {
  const phases = zeroPhases();
  const started = performance.now();
  if (shape.xSize === 1 || shape.ySize === 1) {
    const batch = await runBatchSegments(
      rawField,
      values,
      shape.xSize * shape.ySize,
      direction,
      candidate,
    );
    addPhases(phases, batch.phases);
    return {
      candidate,
      output: batch.output,
      totalMs: performance.now() - started,
      phases,
      segmentAllocatedBytes: batch.segmentAllocatedBytes,
      retainedTableBytes: batch.retainedTableBytes,
    };
  }

  const yBatch = await runBatchSegments(rawField, values, shape.ySize, direction, candidate);
  addPhases(phases, yBatch.phases);
  const firstTransposeStarted = performance.now();
  const transposed = transposeRowMajorBuffer(field, yBatch.output, shape.xSize, shape.ySize);
  phases.transposeMs += performance.now() - firstTransposeStarted;
  const xBatch = await runBatchSegments(rawField, transposed, shape.xSize, direction, candidate);
  addPhases(phases, xBatch.phases);
  const secondTransposeStarted = performance.now();
  const output = transposeRowMajorBuffer(field, xBatch.output, shape.ySize, shape.xSize);
  phases.transposeMs += performance.now() - secondTransposeStarted;
  return {
    candidate,
    output,
    totalMs: performance.now() - started,
    phases,
    segmentAllocatedBytes: yBatch.segmentAllocatedBytes + xBatch.segmentAllocatedBytes,
    retainedTableBytes: yBatch.retainedTableBytes + xBatch.retainedTableBytes,
  };
}

async function runBatchSegments(
  field: FfFieldWithWorkerTasks,
  buffer: Uint8Array,
  segmentSize: number,
  direction: Direction,
  candidate: Candidate,
): Promise<{
  readonly output: Uint8Array;
  readonly phases: PhaseTotals;
  readonly segmentAllocatedBytes: number;
  readonly retainedTableBytes: number;
}> {
  const phases = zeroPhases();
  const segmentBits = checkedPowerOfTwoLog(segmentSize);
  const segmentByteLength = segmentSize * field.n8;
  const segmentCount = buffer.byteLength / segmentByteLength;
  if (segmentSize === 1 || buffer.byteLength === 0) {
    return {
      output: buffer.slice(),
      phases,
      segmentAllocatedBytes: buffer.byteLength,
      retainedTableBytes: 0,
    };
  }
  if (segmentBits > MAX_FFT_MIX_BITS_PER_BATCH_TASK) {
    throw new Error(`Diagnostic candidate does not support segment bit length ${segmentBits}.`);
  }

  const output = new Uint8Array(buffer.byteLength);
  const taskCount = Math.min(Math.max(1, field.tm.concurrency), segmentCount);
  const segmentsPerTask = Math.ceil(segmentCount / taskCount);
  let reversed: Uint8Array | undefined;
  let retainedTableBytes = 0;
  if (!usesDirectTaskShards(candidate)) {
    const reverseStarted = performance.now();
    if (candidate === "G1-cached-bit-reversal") {
      const table = getBitReverseTable(segmentSize);
      retainedTableBytes = table.byteLength;
      reversed = bitReverseSegmentsWithTable(buffer, segmentSize, field.n8, table);
    } else {
      reversed = bitReverseSegments(buffer, segmentSize, field.n8);
    }
    phases.bitReversalMs += performance.now() - reverseStarted;
  }

  const promises: Promise<Uint8Array[]>[] = [];
  const taskStarts: number[] = [];
  const workerStarted = performance.now();
  for (let taskIndex = 0; taskIndex < taskCount; taskIndex += 1) {
    const startSegment = taskIndex * segmentsPerTask;
    const endSegment = Math.min(segmentCount, startSegment + segmentsPerTask);
    if (startSegment >= endSegment) {
      continue;
    }
    const taskStarted = performance.now();
    const task = usesDirectTaskShards(candidate)
      ? buildDirectShardTask(
          field,
          buffer,
          segmentByteLength,
          startSegment,
          endSegment,
          segmentSize,
          segmentBits,
          direction,
          candidate === "G1+G2-cached-direct-shards"
            ? getBitReverseTable(segmentSize)
            : undefined,
        )
      : buildReversedTask(
          field,
          requireBuffer(reversed),
          segmentByteLength,
          startSegment,
          endSegment,
          segmentSize,
          segmentBits,
          direction,
        );
    phases.taskPreparationMs += performance.now() - taskStarted;
    taskStarts.push(startSegment);
    promises.push(field.tm.queueAction(task));
  }
  const results = await Promise.all(promises);
  phases.workerBoundaryMs += performance.now() - workerStarted;

  const assemblyStarted = performance.now();
  for (let taskIndex = 0; taskIndex < results.length; taskIndex += 1) {
    const startSegment = taskStarts[taskIndex];
    const taskResult = results[taskIndex];
    for (let localIndex = 0; localIndex < taskResult.length; localIndex += 1) {
      const targetOffset = (startSegment + localIndex) * segmentByteLength;
      if (direction === "inverse" && candidate === "G3-direct-inverse-output") {
        writeRotatedInverseSegment(output, targetOffset, taskResult[localIndex], field.n8);
      } else if (direction === "inverse") {
        output.set(rotateInverseFftSegment(taskResult[localIndex], field.n8), targetOffset);
      } else {
        output.set(taskResult[localIndex], targetOffset);
      }
    }
  }
  phases.outputAssemblyMs += performance.now() - assemblyStarted;

  if (candidate === "G1+G2-cached-direct-shards") {
    retainedTableBytes = getBitReverseTable(segmentSize).byteLength;
  }
  const perPassCopies = usesDirectTaskShards(candidate)
    ? buffer.byteLength
    : 2 * buffer.byteLength;
  const rotationBytes = direction === "inverse" && candidate !== "G3-direct-inverse-output"
    ? buffer.byteLength
    : 0;
  return {
    output,
    phases,
    segmentAllocatedBytes: perPassCopies + rotationBytes,
    retainedTableBytes,
  };
}

function buildReversedTask(
  field: FfFieldWithWorkerTasks,
  reversed: Uint8Array,
  segmentByteLength: number,
  startSegment: number,
  endSegment: number,
  segmentSize: number,
  segmentBits: number,
  direction: Direction,
): FfWorkerCommand[] {
  return buildTask(
    field,
    startSegment,
    endSegment,
    segmentSize,
    segmentBits,
    direction,
    (segmentIndex) => {
      const start = segmentIndex * segmentByteLength;
      return reversed.slice(start, start + segmentByteLength);
    },
  );
}

function buildDirectShardTask(
  field: FfFieldWithWorkerTasks,
  source: Uint8Array,
  segmentByteLength: number,
  startSegment: number,
  endSegment: number,
  segmentSize: number,
  segmentBits: number,
  direction: Direction,
  reverseTable: Uint32Array | undefined,
): FfWorkerCommand[] {
  const shard = new Uint8Array((endSegment - startSegment) * segmentByteLength);
  for (let segmentIndex = startSegment; segmentIndex < endSegment; segmentIndex += 1) {
    const sourceStart = segmentIndex * segmentByteLength;
    const shardStart = (segmentIndex - startSegment) * segmentByteLength;
    for (let index = 0; index < segmentSize; index += 1) {
      const reversedIndex = reverseTable?.[index] ?? reverseBits(index, segmentBits);
      const elementStart = sourceStart + index * field.n8;
      shard.set(
        source.subarray(elementStart, elementStart + field.n8),
        shardStart + reversedIndex * field.n8,
      );
    }
  }
  return buildTask(
    field,
    startSegment,
    endSegment,
    segmentSize,
    segmentBits,
    direction,
    (segmentIndex) => {
      const start = (segmentIndex - startSegment) * segmentByteLength;
      return shard.subarray(start, start + segmentByteLength);
    },
  );
}

function buildTask(
  field: FfFieldWithWorkerTasks,
  startSegment: number,
  endSegment: number,
  segmentSize: number,
  segmentBits: number,
  direction: Direction,
  segmentAt: (segmentIndex: number) => Uint8Array,
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
    task.push({ cmd: "ALLOCSET", var: variable, buff: segmentAt(segmentIndex) });
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
    task.push({ cmd: "GET", out: localIndex, var: variable, len: segmentSize * field.n8 });
  }
  return task;
}

async function assertEdgeAndCosetParity(
  rawField: FfFieldWithWorkerTasks,
  field: FieldRuntime,
): Promise<void> {
  for (const shape of [
    { xSize: 1, ySize: 8 },
    { xSize: 8, ySize: 1 },
    { xSize: 8, ySize: 4 },
  ]) {
    const values = patternedFieldBuffer(field, shape.xSize * shape.ySize);
    for (const direction of ["forward", "inverse"] as const) {
      const expected = await biNttBuffer(field, values, shape.xSize, shape.ySize, direction);
      for (const candidate of CANDIDATES) {
        const actual = await runBiNtt(rawField, field, values, shape, direction, candidate);
        assertBytesEqual(expected, actual.output, `${candidate} ${formatShape(shape)} ${direction}`);
      }
    }
    const cosetX = field.fromBigInt(7n);
    const cosetY = field.fromBigInt(11n);
    const scaledX = await field.batchScaleCoeffsXBuffer(
      values,
      shape.xSize,
      shape.ySize,
      cosetX,
    );
    const scaledXY = await field.batchScaleCoeffsYBuffer(
      scaledX,
      shape.xSize,
      shape.ySize,
      cosetY,
    );
    const expectedCoset = await biNttBuffer(
      field,
      scaledXY,
      shape.xSize,
      shape.ySize,
      "forward",
    );
    for (const candidate of CANDIDATES) {
      const forward = await runBiNtt(
        rawField,
        field,
        scaledXY,
        shape,
        "forward",
        candidate,
      );
      assertBytesEqual(expectedCoset, forward.output, `${candidate} coset forward`);
      const inverse = await runBiNtt(
        rawField,
        field,
        forward.output,
        shape,
        "inverse",
        candidate,
      );
      const unscaledY = await field.batchScaleCoeffsYBuffer(
        inverse.output,
        shape.xSize,
        shape.ySize,
        field.inv(cosetY),
      );
      const unscaled = await field.batchScaleCoeffsXBuffer(
        unscaledY,
        shape.xSize,
        shape.ySize,
        field.inv(cosetX),
      );
      assertBytesEqual(values, unscaled, `${candidate} inverse coset`);
    }
  }
}

function bitReverseSegments(
  buffer: Uint8Array,
  segmentSize: number,
  elementByteLength: number,
): Uint8Array {
  const segmentByteLength = segmentSize * elementByteLength;
  const segmentCount = buffer.byteLength / segmentByteLength;
  const bits = checkedPowerOfTwoLog(segmentSize);
  const output = new Uint8Array(buffer.byteLength);
  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const segmentStart = segmentIndex * segmentByteLength;
    for (let index = 0; index < segmentSize; index += 1) {
      const reversedIndex = reverseBits(index, bits);
      const sourceStart = segmentStart + index * elementByteLength;
      output.set(
        buffer.subarray(sourceStart, sourceStart + elementByteLength),
        segmentStart + reversedIndex * elementByteLength,
      );
    }
  }
  return output;
}

function bitReverseSegmentsWithTable(
  buffer: Uint8Array,
  segmentSize: number,
  elementByteLength: number,
  table: Uint32Array,
): Uint8Array {
  const segmentByteLength = segmentSize * elementByteLength;
  const segmentCount = buffer.byteLength / segmentByteLength;
  const output = new Uint8Array(buffer.byteLength);
  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const segmentStart = segmentIndex * segmentByteLength;
    for (let index = 0; index < segmentSize; index += 1) {
      const sourceStart = segmentStart + index * elementByteLength;
      output.set(
        buffer.subarray(sourceStart, sourceStart + elementByteLength),
        segmentStart + table[index] * elementByteLength,
      );
    }
  }
  return output;
}

function getBitReverseTable(segmentSize: number): Uint32Array {
  const existing = BIT_REVERSE_TABLES.get(segmentSize);
  if (existing !== undefined) {
    return existing;
  }
  const bits = checkedPowerOfTwoLog(segmentSize);
  const table = new Uint32Array(segmentSize);
  for (let index = 0; index < segmentSize; index += 1) {
    table[index] = reverseBits(index, bits);
  }
  BIT_REVERSE_TABLES.set(segmentSize, table);
  return table;
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

function writeRotatedInverseSegment(
  output: Uint8Array,
  targetOffset: number,
  segment: Uint8Array,
  elementByteLength: number,
): void {
  const lastOffset = segment.byteLength - elementByteLength;
  output.set(segment.subarray(lastOffset), targetOffset);
  output.set(segment.subarray(0, lastOffset), targetOffset + elementByteLength);
}

function transposeRowMajorBuffer(
  field: FieldRuntime,
  values: Uint8Array,
  rowCount: number,
  columnCount: number,
): Uint8Array {
  const output = new Uint8Array(values.byteLength);
  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      const source = (row * columnCount + column) * field.byteLength;
      const target = (column * rowCount + row) * field.byteLength;
      output.set(values.subarray(source, source + field.byteLength), target);
    }
  }
  return output;
}

function patternedFieldBuffer(field: FieldRuntime, elementCount: number): Uint8Array {
  const patternSize = Math.min(elementCount, 4096);
  const pattern = new Uint8Array(patternSize * field.byteLength);
  let state = 0x544f4b414d414bn;
  for (let index = 0; index < patternSize; index += 1) {
    state = (state * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
    pattern.set(field.fromBigInt((state + BigInt(index)) % field.modulus), index * field.byteLength);
  }
  const output = new Uint8Array(elementCount * field.byteLength);
  for (let offset = 0; offset < output.byteLength; offset += pattern.byteLength) {
    output.set(pattern.subarray(0, Math.min(pattern.byteLength, output.byteLength - offset)), offset);
  }
  return output;
}

function summarize(
  shape: Shape,
  direction: Direction,
  candidate: Candidate,
  runs: readonly RunResult[],
) {
  if (runs.length === 0) {
    throw new Error(`Missing ${candidate} samples.`);
  }
  const sorted = [...runs].sort((left, right) => left.totalMs - right.totalMs);
  const median = sorted[Math.floor(sorted.length / 2)];
  return {
    shape: formatShape(shape),
    direction,
    candidate,
    medianMs: median.totalMs,
    minMs: sorted[0].totalMs,
    maxMs: sorted[sorted.length - 1].totalMs,
    medianPhases: median.phases,
    segmentAllocatedBytes: median.segmentAllocatedBytes,
    retainedTableBytes: median.retainedTableBytes,
  };
}

function zeroPhases(): PhaseTotals {
  return {
    bitReversalMs: 0,
    taskPreparationMs: 0,
    workerBoundaryMs: 0,
    outputAssemblyMs: 0,
    transposeMs: 0,
  };
}

function addPhases(target: PhaseTotals, source: PhaseTotals): void {
  target.bitReversalMs += source.bitReversalMs;
  target.taskPreparationMs += source.taskPreparationMs;
  target.workerBoundaryMs += source.workerBoundaryMs;
  target.outputAssemblyMs += source.outputAssemblyMs;
  target.transposeMs += source.transposeMs;
}

function checkedPowerOfTwoLog(size: number): number {
  if (!Number.isSafeInteger(size) || size <= 0 || (size & (size - 1)) !== 0) {
    throw new Error("NTT segment size must be a positive power of two.");
  }
  return Math.log2(size);
}

function rotateCandidates(iteration: number): Candidate[] {
  const offset = iteration % CANDIDATES.length;
  return [...CANDIDATES.slice(offset), ...CANDIDATES.slice(0, offset)];
}

function usesDirectTaskShards(candidate: Candidate): boolean {
  return candidate === "G2-direct-task-shards" || candidate === "G1+G2-cached-direct-shards";
}

function formatShape(shape: Shape): string {
  return `${shape.xSize}x${shape.ySize}`;
}

function requireBuffer(buffer: Uint8Array | undefined): Uint8Array {
  if (buffer === undefined) {
    throw new Error("Reversed input buffer is required.");
  }
  return buffer;
}

function assertBytesEqual(left: Uint8Array, right: Uint8Array, label: string): void {
  if (left.byteLength !== right.byteLength) {
    throw new Error(`${label}: byte length mismatch.`);
  }
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      throw new Error(`${label}: mismatch at byte ${index}.`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
