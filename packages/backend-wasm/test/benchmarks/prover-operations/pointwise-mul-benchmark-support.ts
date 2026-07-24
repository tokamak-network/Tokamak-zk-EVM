import { getCurveFromName } from "ffjavascript";

import type { FfField, FfWorkerCommand } from "../../../src/core/curve/curve.js";
import { createFieldRuntime, type FieldRuntime } from "../../../src/core/field/field.js";
import {
  FIELD_BATCH_MUL,
  FIELD_BATCH_MUL_SHIFTED,
  installLinearBatchPlugin,
  type WasmModuleBuilder,
} from "../../../src/core/field/linear-batch-plugin.js";

interface RawCurve {
  readonly Fr: FfField;
  terminate?(): Promise<void>;
}

export interface PointwiseBenchmarkRuntimes {
  readonly field: FieldRuntime;
  readonly singleField: FfField;
  readonly multiField: FfField;
  readonly workerCount: number;
  terminate(): Promise<void>;
}

export async function createPointwiseBenchmarkRuntimes(): Promise<PointwiseBenchmarkRuntimes> {
  const loadCurve = getCurveFromName as unknown as (
    name: string,
    singleThread: boolean,
    plugin: (module: WasmModuleBuilder) => void,
  ) => Promise<RawCurve>;
  const single = await loadCurve("bls12381", true, installPointwiseBenchmarkPlugin);
  const multi = await loadCurve("bls12381", false, installPointwiseBenchmarkPlugin);
  const field = createFieldRuntime(multi.Fr);

  return {
    field,
    singleField: single.Fr,
    multiField: multi.Fr,
    workerCount: multi.Fr.tm.concurrency,
    async terminate() {
      await Promise.all([single.terminate?.(), multi.terminate?.()]);
    },
  };
}

export async function batchMultiplyOneTask(
  field: FfField,
  left: Uint8Array,
  right: Uint8Array,
): Promise<Uint8Array> {
  return await batchMultiply(field, left, right, 1);
}

export async function batchMultiplyWorkers(
  field: FfField,
  left: Uint8Array,
  right: Uint8Array,
): Promise<Uint8Array> {
  return await batchMultiply(field, left, right, field.tm.concurrency);
}

export async function batchMultiplyShiftedOneTask(
  field: FfField,
  left: Uint8Array,
  right: Uint8Array,
  xSize: number,
  ySize: number,
  xShift: number,
  yShift: number,
): Promise<Uint8Array> {
  assertShiftedBuffers(field, left, right, xSize, ySize);
  const result = await field.tm.queueAction(
    buildShiftedTask(
      left,
      right,
      xSize,
      ySize,
      modulo(xShift, xSize),
      modulo(yShift, ySize),
      field.n8,
    ),
  );
  return oneOutput(result, left.byteLength);
}

export async function batchMultiplyShiftedWorkers(
  field: FfField,
  left: Uint8Array,
  right: Uint8Array,
  xSize: number,
  ySize: number,
  xShift: number,
  yShift: number,
): Promise<Uint8Array> {
  assertShiftedBuffers(field, left, right, xSize, ySize);
  const normalizedXShift = modulo(xShift, xSize);
  const normalizedYShift = modulo(yShift, ySize);
  const rowBytes = ySize * field.n8;
  const ranges = splitRanges(xSize, field.tm.concurrency);
  const results = await Promise.all(
    ranges.map(({ start, count }) => {
      const leftRows = new Uint8Array(count * rowBytes);
      for (let localX = 0; localX < count; localX += 1) {
        const sourceX = modulo(start + localX + normalizedXShift, xSize);
        leftRows.set(left.subarray(sourceX * rowBytes, (sourceX + 1) * rowBytes), localX * rowBytes);
      }
      const rightRows = right.slice(start * rowBytes, (start + count) * rowBytes);
      return field.tm.queueAction(
        buildShiftedTask(leftRows, rightRows, count, ySize, 0, normalizedYShift, field.n8),
      );
    }),
  );
  return assembleOutputs(results, left.byteLength);
}

const installPointwiseBenchmarkPlugin = installLinearBatchPlugin;

async function batchMultiply(
  field: FfField,
  left: Uint8Array,
  right: Uint8Array,
  requestedTaskCount: number,
): Promise<Uint8Array> {
  assertMatchingBuffers(field, left, right);
  const elementCount = left.byteLength / field.n8;
  const ranges = splitRanges(elementCount, requestedTaskCount);
  const results = await Promise.all(
    ranges.map(({ start, count }) => {
      const byteStart = start * field.n8;
      const byteLength = count * field.n8;
      return field.tm.queueAction([
        { cmd: "ALLOCSET", var: 0, buff: left.slice(byteStart, byteStart + byteLength) },
        { cmd: "ALLOCSET", var: 1, buff: right.slice(byteStart, byteStart + byteLength) },
        { cmd: "ALLOC", var: 2, len: byteLength },
        {
          cmd: "CALL",
          fnName: FIELD_BATCH_MUL,
          params: [{ var: 0 }, { var: 1 }, { val: count }, { var: 2 }],
        },
        { cmd: "GET", out: 0, var: 2, len: byteLength },
      ]);
    }),
  );
  return assembleOutputs(results, left.byteLength);
}

function buildShiftedTask(
  left: Uint8Array,
  right: Uint8Array,
  xSize: number,
  ySize: number,
  xShift: number,
  yShift: number,
  elementBytes: number,
): FfWorkerCommand[] {
  const outputBytes = xSize * ySize * elementBytes;
  return [
    { cmd: "ALLOCSET", var: 0, buff: left },
    { cmd: "ALLOCSET", var: 1, buff: right },
    { cmd: "ALLOC", var: 2, len: outputBytes },
    {
      cmd: "CALL",
      fnName: FIELD_BATCH_MUL_SHIFTED,
      params: [
        { var: 0 },
        { var: 1 },
        { val: xSize },
        { val: ySize },
        { val: xShift },
        { val: yShift },
        { var: 2 },
      ],
    },
    { cmd: "GET", out: 0, var: 2, len: outputBytes },
  ];
}

function assertMatchingBuffers(field: FfField, left: Uint8Array, right: Uint8Array): void {
  if (left.byteLength !== right.byteLength || left.byteLength % field.n8 !== 0) {
    throw new Error("Pointwise multiplication buffers must have matching field-aligned byte lengths.");
  }
}

function assertShiftedBuffers(
  field: FfField,
  left: Uint8Array,
  right: Uint8Array,
  xSize: number,
  ySize: number,
): void {
  assertMatchingBuffers(field, left, right);
  if (
    !Number.isSafeInteger(xSize)
    || xSize <= 0
    || !Number.isSafeInteger(ySize)
    || ySize <= 0
    || left.byteLength !== xSize * ySize * field.n8
  ) {
    throw new Error("Shifted pointwise multiplication shape does not match its buffers.");
  }
}

function splitRanges(
  elementCount: number,
  requestedTaskCount: number,
): readonly { start: number; count: number }[] {
  if (!Number.isSafeInteger(requestedTaskCount) || requestedTaskCount <= 0) {
    throw new Error("Pointwise multiplication task count must be positive.");
  }
  if (elementCount === 0) {
    return [];
  }
  const taskCount = Math.min(elementCount, requestedTaskCount);
  return Array.from({ length: taskCount }, (_, index) => {
    const start = Math.floor((elementCount * index) / taskCount);
    const end = Math.floor((elementCount * (index + 1)) / taskCount);
    return { start, count: end - start };
  });
}

function assembleOutputs(
  results: readonly (readonly Uint8Array[])[],
  outputByteLength: number,
): Uint8Array {
  const output = new Uint8Array(outputByteLength);
  let offset = 0;
  for (const result of results) {
    const chunk = oneOutput(result);
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (offset !== outputByteLength) {
    throw new Error("Pointwise multiplication output length mismatch.");
  }
  return output;
}

function oneOutput(result: readonly Uint8Array[], expectedBytes?: number): Uint8Array {
  if (result.length !== 1) {
    throw new Error("Pointwise multiplication task must return one output.");
  }
  if (expectedBytes !== undefined && result[0].byteLength !== expectedBytes) {
    throw new Error("Pointwise multiplication task output length mismatch.");
  }
  return result[0];
}

function modulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}
