import type { FfField, FfWorkerCommand } from "../../curve/curve.js";
import {
  assembleTaskOutputs,
  assertMatchingFieldBuffers,
  checkedPowerOfTwoLog,
  requireTaskOutputs,
  splitRanges,
} from "../buffer-utils.js";
import type { FieldElement, SpecialPolynomialOperation } from "../field-types.js";
import {
  FIELD_BATCH_ADD,
  FIELD_BATCH_ADD_SCALED,
  FIELD_BATCH_ADD_SCALED_PREFIX,
  FIELD_BATCH_MUL,
  FIELD_BATCH_MUL_SHIFTED,
  FIELD_BATCH_SCALE_X,
  FIELD_BATCH_SCALE_Y,
  FIELD_BATCH_SUB,
  FIELD_EVAL_REDUCE,
  FIELD_EVAL_REDUCE_FUSED,
  FIELD_EVAL_ROWS,
  FIELD_EVAL_ROWS_FUSED,
  FIELD_FUSED_LINEAR_X,
  FIELD_FUSED_LINEAR_Y,
  FIELD_K0_RECURRENCE,
  FIELD_KL_RECURRENCE_X,
  FIELD_KL_RECURRENCE_Y,
  FIELD_RUFFINI_X,
  FIELD_RUFFINI_Y,
  FIELD_RECURSION_RECURRENCE,
  FIELD_SPECIAL_LINEAR_X,
  FIELD_SPECIAL_LINEAR_Y,
  FIELD_SPECIAL_ONE_MINUS_X,
  FIELD_SPECIAL_TERM9,
  FIELD_SPECIAL_X_MINUS_ONE,
  FIELD_SPARSE_ROW_DOT,
  FIELD_VANISHING_X,
  FIELD_VANISHING_Y,
} from "../kernel-names.js";

interface FfFieldWithWorkerTasks extends FfField {
  readonly prefix: string;
}

const MAX_FFT_MIX_BITS_PER_BATCH_TASK = 14;

export async function batchFftBuffer(
  field: FfField,
  buffer: Uint8Array,
  segmentSize: number,
  direction: "forward" | "inverse",
): Promise<Uint8Array> {
  const segmentBits = checkedPowerOfTwoLog(segmentSize);
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

  return await transformSmallSegmentsWithWorkerTasks(
    field as FfFieldWithWorkerTasks,
    buffer,
    segmentSize,
    segmentBits,
    direction,
  );
}

async function transformLargeSegmentsWithPublicFft(
  field: FfField,
  buffer: Uint8Array,
  segmentSize: number,
  direction: "forward" | "inverse",
): Promise<Uint8Array> {
  const transform = direction === "forward" ? field.fft.bind(field) : field.ifft.bind(field);
  const segmentByteLength = segmentSize * field.n8;
  const segmentCount = buffer.byteLength / segmentByteLength;
  const output = new Uint8Array(buffer.byteLength);

  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const segmentStart = segmentIndex * segmentByteLength;
    output.set(await transform(buffer.slice(segmentStart, segmentStart + segmentByteLength)), segmentStart);
  }

  return output;
}

async function transformSmallSegmentsWithWorkerTasks(
  field: FfFieldWithWorkerTasks,
  buffer: Uint8Array,
  segmentSize: number,
  segmentBits: number,
  direction: "forward" | "inverse",
): Promise<Uint8Array> {
  const segmentByteLength = segmentSize * field.n8;
  const segmentCount = buffer.byteLength / segmentByteLength;
  const output = new Uint8Array(buffer.byteLength);
  const taskCount = Math.min(Math.max(1, field.tm.concurrency), segmentCount);
  const segmentsPerTask = Math.ceil(segmentCount / taskCount);
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
        buildBatchFftTask(
          field,
          buffer,
          segmentByteLength,
          startSegment,
          endSegment,
          segmentSize,
          segmentBits,
          direction,
        ),
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
  source: Uint8Array,
  segmentByteLength: number,
  startSegment: number,
  endSegment: number,
  segmentSize: number,
  segmentBits: number,
  direction: "forward" | "inverse",
): FfWorkerCommand[] {
  const task: FfWorkerCommand[] = [];
  const inverseFactorVar = 0;
  const firstSegmentVar = direction === "inverse" ? 1 : 0;
  const shard = new Uint8Array((endSegment - startSegment) * segmentByteLength);

  for (let segmentIndex = startSegment; segmentIndex < endSegment; segmentIndex += 1) {
    const sourceStart = segmentIndex * segmentByteLength;
    const shardStart = (segmentIndex - startSegment) * segmentByteLength;
    for (let index = 0; index < segmentSize; index += 1) {
      const reversedIndex = reverseBits(index, segmentBits);
      const elementStart = sourceStart + index * field.n8;
      shard.set(
        source.subarray(elementStart, elementStart + field.n8),
        shardStart + reversedIndex * field.n8,
      );
    }
  }

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
    const segmentStart = localIndex * segmentByteLength;
    task.push({
      cmd: "ALLOCSET",
      var: variable,
      buff: shard.subarray(segmentStart, segmentStart + segmentByteLength),
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

export function assertLinearBatchExports(field: FfField): void {
  const requiredExports = [
    FIELD_BATCH_ADD,
    FIELD_BATCH_SUB,
    FIELD_BATCH_ADD_SCALED,
    FIELD_BATCH_ADD_SCALED_PREFIX,
    FIELD_BATCH_MUL,
    FIELD_BATCH_MUL_SHIFTED,
    FIELD_BATCH_SCALE_X,
    FIELD_BATCH_SCALE_Y,
    FIELD_EVAL_REDUCE,
    FIELD_EVAL_REDUCE_FUSED,
    FIELD_EVAL_ROWS,
    FIELD_EVAL_ROWS_FUSED,
    FIELD_FUSED_LINEAR_X,
    FIELD_FUSED_LINEAR_Y,
    FIELD_K0_RECURRENCE,
    FIELD_KL_RECURRENCE_X,
    FIELD_KL_RECURRENCE_Y,
    FIELD_RUFFINI_X,
    FIELD_RUFFINI_Y,
    FIELD_RECURSION_RECURRENCE,
    FIELD_SPECIAL_LINEAR_X,
    FIELD_SPECIAL_LINEAR_Y,
    FIELD_SPECIAL_ONE_MINUS_X,
    FIELD_SPECIAL_TERM9,
    FIELD_SPECIAL_X_MINUS_ONE,
    FIELD_SPARSE_ROW_DOT,
    FIELD_VANISHING_X,
    FIELD_VANISHING_Y,
  ];
  for (const name of requiredExports) {
    if (typeof field.tm.instance?.exports[name] !== "function") {
      throw new Error(`Field runtime is missing required WASM batch export: ${name}.`);
    }
  }
}

export async function batchBinaryBuffer(
  field: FfField,
  left: Uint8Array,
  right: Uint8Array,
  functionName: typeof FIELD_BATCH_ADD | typeof FIELD_BATCH_SUB | typeof FIELD_BATCH_MUL,
): Promise<Uint8Array> {
  assertMatchingFieldBuffers(left, right, field.n8, "Binary batch buffers");
  const elementCount = left.byteLength / field.n8;
  const ranges = splitRanges(elementCount, field.tm.concurrency);
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
          fnName: functionName,
          params: [{ var: 0 }, { var: 1 }, { val: count }, { var: 2 }],
        },
        { cmd: "GET", out: 0, var: 2, len: byteLength },
      ]);
    }),
  );
  return assembleTaskOutputs(results, left.byteLength);
}

export function buildShiftedMultiplyTask(
  left: Uint8Array,
  right: Uint8Array,
  xSize: number,
  ySize: number,
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
        { val: 0 },
        { val: yShift },
        { var: 2 },
      ],
    },
    { cmd: "GET", out: 0, var: 2, len: outputBytes },
  ];
}

export function buildRuffiniXTask(
  field: FfField,
  input: Uint8Array,
  xSize: number,
  ySize: number,
  point: FieldElement,
): FfWorkerCommand[] {
  const quotientBytes = input.byteLength;
  const remainderBytes = ySize * field.n8;
  return [
    { cmd: "ALLOCSET", var: 0, buff: input },
    { cmd: "ALLOCSET", var: 1, buff: point },
    { cmd: "ALLOCSET", var: 2, buff: new Uint8Array(quotientBytes) },
    { cmd: "ALLOC", var: 3, len: remainderBytes },
    {
      cmd: "CALL",
      fnName: FIELD_RUFFINI_X,
      params: [
        { var: 0 },
        { val: xSize },
        { val: ySize },
        { var: 1 },
        { var: 2 },
        { var: 3 },
      ],
    },
    { cmd: "GET", out: 0, var: 2, len: quotientBytes },
    { cmd: "GET", out: 1, var: 3, len: remainderBytes },
  ];
}

export function buildSpecialPolynomialTask(
  source: Uint8Array,
  sourceStart: number,
  inputYSize: number,
  outputStart: number,
  outputXRows: number,
  activeXSize: number,
  activeYSize: number,
  activeOutputY: number,
  functionName: string,
  constant: FieldElement,
  xCoefficient: FieldElement,
  yCoefficient: FieldElement,
  elementBytes: number,
): FfWorkerCommand[] {
  const outputBytes = outputXRows * activeOutputY * elementBytes;
  return [
    { cmd: "ALLOCSET", var: 0, buff: source },
    { cmd: "ALLOCSET", var: 1, buff: constant },
    { cmd: "ALLOCSET", var: 2, buff: xCoefficient },
    { cmd: "ALLOCSET", var: 3, buff: yCoefficient },
    { cmd: "ALLOC", var: 4, len: outputBytes },
    {
      cmd: "CALL",
      fnName: functionName,
      params: [
        { var: 0 },
        { val: sourceStart },
        { val: inputYSize },
        { val: outputStart },
        { val: outputXRows },
        { val: activeXSize },
        { val: activeYSize },
        { val: activeOutputY },
        { var: 1 },
        { var: 2 },
        { var: 3 },
        { var: 4 },
      ],
    },
    { cmd: "GET", out: 0, var: 4, len: outputBytes },
  ];
}

export function buildFusedLinearTask(
  source: Uint8Array,
  sourceStart: number,
  inputYSize: number,
  addend: Uint8Array,
  addendStart: number,
  addendRows: number,
  addendYSize: number,
  outputStart: number,
  outputXRows: number,
  activeXSize: number,
  activeYSize: number,
  activeOutputY: number,
  functionName: string,
  constant: FieldElement,
  shiftCoefficient: FieldElement,
  addendScale: FieldElement,
  elementBytes: number,
): FfWorkerCommand[] {
  const outputBytes = outputXRows * activeOutputY * elementBytes;
  return [
    { cmd: "ALLOCSET", var: 0, buff: source },
    { cmd: "ALLOCSET", var: 1, buff: addend },
    { cmd: "ALLOCSET", var: 2, buff: constant },
    { cmd: "ALLOCSET", var: 3, buff: shiftCoefficient },
    { cmd: "ALLOCSET", var: 4, buff: addendScale },
    { cmd: "ALLOC", var: 5, len: outputBytes },
    {
      cmd: "CALL",
      fnName: functionName,
      params: [
        { var: 0 },
        { val: sourceStart },
        { val: inputYSize },
        { var: 1 },
        { val: addendStart },
        { val: addendRows },
        { val: addendYSize },
        { val: outputStart },
        { val: outputXRows },
        { val: activeXSize },
        { val: activeYSize },
        { val: activeOutputY },
        { var: 2 },
        { var: 3 },
        { var: 4 },
        { var: 5 },
      ],
    },
    { cmd: "GET", out: 0, var: 5, len: outputBytes },
  ];
}

export function specialPolynomialFunctionName(operation: SpecialPolynomialOperation): string {
  switch (operation) {
    case "x-minus-one":
      return FIELD_SPECIAL_X_MINUS_ONE;
    case "one-minus-x":
      return FIELD_SPECIAL_ONE_MINUS_X;
    case "linear-x":
      return FIELD_SPECIAL_LINEAR_X;
    case "linear-y":
      return FIELD_SPECIAL_LINEAR_Y;
    case "term9":
      return FIELD_SPECIAL_TERM9;
  }
}

export function buildRuffiniYTask(
  field: FfField,
  input: Uint8Array,
  ySize: number,
  point: FieldElement,
): FfWorkerCommand[] {
  const quotientBytes = ySize * field.n8;
  return [
    { cmd: "ALLOCSET", var: 0, buff: input },
    { cmd: "ALLOCSET", var: 1, buff: point },
    { cmd: "ALLOCSET", var: 2, buff: new Uint8Array(quotientBytes) },
    { cmd: "ALLOC", var: 3, len: field.n8 },
    {
      cmd: "CALL",
      fnName: FIELD_RUFFINI_Y,
      params: [{ var: 0 }, { val: ySize }, { var: 1 }, { var: 2 }, { var: 3 }],
    },
    { cmd: "GET", out: 0, var: 2, len: quotientBytes },
    { cmd: "GET", out: 1, var: 3, len: field.n8 },
  ];
}

export async function evaluateRows(
  field: FfField,
  buffer: Uint8Array,
  xSize: number,
  ySize: number,
  yPoint: FieldElement,
): Promise<Uint8Array> {
  const ranges = splitRanges(xSize, field.tm.concurrency);
  const rowBytes = ySize * field.n8;
  const results = await Promise.all(
    ranges.map(({ start, count }) => field.tm.queueAction([
      { cmd: "ALLOCSET", var: 0, buff: buffer.slice(start * rowBytes, (start + count) * rowBytes) },
      { cmd: "ALLOCSET", var: 1, buff: yPoint },
      { cmd: "ALLOC", var: 2, len: count * field.n8 },
      {
        cmd: "CALL",
        fnName: FIELD_EVAL_ROWS,
        params: [{ var: 0 }, { val: count }, { val: ySize }, { var: 1 }, { var: 2 }],
      },
      { cmd: "GET", out: 0, var: 2, len: count * field.n8 },
    ])),
  );
  return assembleTaskOutputs(results, xSize * field.n8);
}

export async function evaluateRowsFused(
  field: FfField,
  buffer: Uint8Array,
  xSize: number,
  ySize: number,
  yPoint: FieldElement,
  scaledYPoint: FieldElement,
): Promise<readonly [Uint8Array, Uint8Array]> {
  const ranges = splitRanges(xSize, field.tm.concurrency);
  const rowBytes = ySize * field.n8;
  const results = await Promise.all(
    ranges.map(({ start, count }) => field.tm.queueAction([
      { cmd: "ALLOCSET", var: 0, buff: buffer.slice(start * rowBytes, (start + count) * rowBytes) },
      { cmd: "ALLOCSET", var: 1, buff: yPoint },
      { cmd: "ALLOCSET", var: 2, buff: scaledYPoint },
      { cmd: "ALLOC", var: 3, len: count * field.n8 },
      { cmd: "ALLOC", var: 4, len: count * field.n8 },
      {
        cmd: "CALL",
        fnName: FIELD_EVAL_ROWS_FUSED,
        params: [
          { var: 0 },
          { val: count },
          { val: ySize },
          { var: 1 },
          { var: 2 },
          { var: 3 },
          { var: 4 },
        ],
      },
      { cmd: "GET", out: 0, var: 3, len: count * field.n8 },
      { cmd: "GET", out: 1, var: 4, len: count * field.n8 },
    ])),
  );
  const baseRows = new Uint8Array(xSize * field.n8);
  const scaledRows = new Uint8Array(xSize * field.n8);
  for (let index = 0; index < ranges.length; index += 1) {
    const outputs = requireTaskOutputs(results[index], 2, "Scaled evaluation row");
    baseRows.set(outputs[0], ranges[index].start * field.n8);
    scaledRows.set(outputs[1], ranges[index].start * field.n8);
  }
  return [baseRows, scaledRows];
}

export function buildEvalReduceTask(
  rows: Uint8Array,
  xSize: number,
  xPoint: FieldElement,
  elementBytes: number,
): FfWorkerCommand[] {
  return [
    { cmd: "ALLOCSET", var: 0, buff: rows },
    { cmd: "ALLOCSET", var: 1, buff: xPoint },
    { cmd: "ALLOC", var: 2, len: elementBytes },
    {
      cmd: "CALL",
      fnName: FIELD_EVAL_REDUCE,
      params: [{ var: 0 }, { val: xSize }, { var: 1 }, { var: 2 }],
    },
    { cmd: "GET", out: 0, var: 2, len: elementBytes },
  ];
}

export function buildEvalReduceFusedTask(
  baseRows: Uint8Array,
  scaledRows: Uint8Array,
  xSize: number,
  xPoint: FieldElement,
  scaledXPoint: FieldElement,
  elementBytes: number,
): FfWorkerCommand[] {
  return [
    { cmd: "ALLOCSET", var: 0, buff: baseRows },
    { cmd: "ALLOCSET", var: 1, buff: scaledRows },
    { cmd: "ALLOCSET", var: 2, buff: xPoint },
    { cmd: "ALLOCSET", var: 3, buff: scaledXPoint },
    { cmd: "ALLOC", var: 4, len: elementBytes },
    { cmd: "ALLOC", var: 5, len: elementBytes },
    { cmd: "ALLOC", var: 6, len: elementBytes },
    {
      cmd: "CALL",
      fnName: FIELD_EVAL_REDUCE_FUSED,
      params: [
        { var: 0 },
        { var: 1 },
        { val: xSize },
        { var: 2 },
        { var: 3 },
        { var: 4 },
        { var: 5 },
        { var: 6 },
      ],
    },
    { cmd: "GET", out: 0, var: 4, len: elementBytes },
    { cmd: "GET", out: 1, var: 5, len: elementBytes },
    { cmd: "GET", out: 2, var: 6, len: elementBytes },
  ];
}

export function buildK0Task(
  input: Uint8Array,
  inputXSize: number,
  localYSize: number,
  outputXSize: number,
  mI: number,
  elementBytes: number,
): FfWorkerCommand[] {
  const outputBytes = outputXSize * localYSize * elementBytes;
  return [
    { cmd: "ALLOCSET", var: 0, buff: input },
    { cmd: "ALLOC", var: 1, len: localYSize * elementBytes },
    { cmd: "ALLOC", var: 2, len: outputBytes },
    {
      cmd: "CALL",
      fnName: FIELD_K0_RECURRENCE,
      params: [
        { var: 0 },
        { val: inputXSize },
        { val: localYSize },
        { val: outputXSize },
        { val: mI },
        { var: 1 },
        { var: 2 },
      ],
    },
    { cmd: "GET", out: 0, var: 2, len: outputBytes },
  ];
}

export function buildKlXTask(
  input: Uint8Array,
  inputXSize: number,
  localYSize: number,
  outputXSize: number,
  mI: number,
  rootX: Uint8Array,
  elementBytes: number,
): FfWorkerCommand[] {
  const outputBytes = outputXSize * localYSize * elementBytes;
  return [
    { cmd: "ALLOCSET", var: 0, buff: input },
    { cmd: "ALLOCSET", var: 1, buff: rootX },
    { cmd: "ALLOC", var: 2, len: outputBytes },
    {
      cmd: "CALL",
      fnName: FIELD_KL_RECURRENCE_X,
      params: [
        { var: 0 },
        { val: inputXSize },
        { val: localYSize },
        { val: outputXSize },
        { val: mI },
        { var: 1 },
        { var: 2 },
      ],
    },
    { cmd: "GET", out: 0, var: 2, len: outputBytes },
  ];
}

export function buildKlYTask(
  input: Uint8Array,
  xRows: number,
  inputYSize: number,
  outputYSize: number,
  sMax: number,
  rootY: Uint8Array,
  elementBytes: number,
): FfWorkerCommand[] {
  const outputBytes = xRows * outputYSize * elementBytes;
  return [
    { cmd: "ALLOCSET", var: 0, buff: input },
    { cmd: "ALLOCSET", var: 1, buff: rootY },
    { cmd: "ALLOC", var: 2, len: outputBytes },
    {
      cmd: "CALL",
      fnName: FIELD_KL_RECURRENCE_Y,
      params: [
        { var: 0 },
        { val: xRows },
        { val: inputYSize },
        { val: outputYSize },
        { val: sMax },
        { var: 1 },
        { var: 2 },
      ],
    },
    { cmd: "GET", out: 0, var: 2, len: outputBytes },
  ];
}

export function buildVanishingYTask(
  input: Uint8Array,
  xBlockCount: number,
  xRows: number,
  ySize: number,
  yDegree: number,
  elementBytes: number,
): FfWorkerCommand[] {
  const outputBytes = xRows * ySize * elementBytes;
  return [
    { cmd: "ALLOCSET", var: 0, buff: input },
    { cmd: "ALLOC", var: 1, len: outputBytes },
    { cmd: "ALLOCSET", var: 2, buff: new Uint8Array(outputBytes) },
    { cmd: "ALLOC", var: 3, len: outputBytes },
    {
      cmd: "CALL",
      fnName: FIELD_VANISHING_Y,
      params: [
        { var: 0 },
        { val: xBlockCount },
        { val: xRows },
        { val: ySize },
        { val: yDegree },
        { var: 1 },
        { var: 2 },
        { var: 3 },
      ],
    },
    { cmd: "GET", out: 0, var: 2, len: outputBytes },
    { cmd: "GET", out: 1, var: 3, len: outputBytes },
  ];
}

export function buildVanishingXTask(
  input: Uint8Array,
  xSize: number,
  yColumns: number,
  xDegree: number,
): FfWorkerCommand[] {
  return [
    { cmd: "ALLOCSET", var: 0, buff: input },
    { cmd: "ALLOCSET", var: 1, buff: new Uint8Array(input.byteLength) },
    {
      cmd: "CALL",
      fnName: FIELD_VANISHING_X,
      params: [{ var: 0 }, { val: xSize }, { val: yColumns }, { val: xDegree }, { var: 1 }],
    },
    { cmd: "GET", out: 0, var: 1, len: input.byteLength },
  ];
}
