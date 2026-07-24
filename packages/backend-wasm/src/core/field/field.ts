import type { FfField, FfWorkerCommand } from "../curve/curve.js";
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
} from "./linear-batch-plugin.js";

export type FieldElement = Uint8Array;
export type SpecialPolynomialOperation =
  | "x-minus-one"
  | "one-minus-x"
  | "linear-x"
  | "linear-y"
  | "term9";

export interface FieldRuntime {
  readonly byteLength: number;
  readonly modulus: bigint;
  readonly zero: FieldElement;
  readonly one: FieldElement;
  bufferElementCount(buffer: Uint8Array): number;
  createZeroBuffer(elementCount: number): Uint8Array;
  cloneBuffer(buffer: Uint8Array): Uint8Array;
  concat(elements: readonly FieldElement[]): Uint8Array;
  split(buffer: Uint8Array): FieldElement[];
  readBufferElement(buffer: Uint8Array, index: number): FieldElement;
  writeBufferElement(buffer: Uint8Array, index: number, value: FieldElement): void;
  fromBigInt(value: bigint): FieldElement;
  fromHex(value: string): FieldElement;
  toBigInt(value: FieldElement): bigint;
  toHex(value: FieldElement): string;
  toRawLittleEndian(value: FieldElement): Uint8Array;
  rootOfUnity(size: number): FieldElement;
  fftBuffer(buffer: Uint8Array): Promise<Uint8Array>;
  ifftBuffer(buffer: Uint8Array): Promise<Uint8Array>;
  batchFftBuffer(
    buffer: Uint8Array,
    segmentSize: number,
    direction: "forward" | "inverse",
  ): Promise<Uint8Array>;
  batchApplyKeyBuffer(buffer: Uint8Array, first: FieldElement, increment: FieldElement): Promise<Uint8Array>;
  batchAddBuffer(left: Uint8Array, right: Uint8Array): Promise<Uint8Array>;
  batchSubBuffer(left: Uint8Array, right: Uint8Array): Promise<Uint8Array>;
  batchMulBuffer(left: Uint8Array, right: Uint8Array): Promise<Uint8Array>;
  batchMulShiftedBuffer(
    left: Uint8Array,
    right: Uint8Array,
    xSize: number,
    ySize: number,
    xShift: number,
    yShift: number,
  ): Promise<Uint8Array>;
  batchScaleBuffer(buffer: Uint8Array, factor: FieldElement): Promise<Uint8Array>;
  batchAddScaledBuffer(target: Uint8Array, source: Uint8Array, factor: FieldElement): Promise<Uint8Array>;
  batchAddScaledPrefixBuffer(
    target: Uint8Array,
    targetXSize: number,
    targetYSize: number,
    source: Uint8Array,
    sourceXSize: number,
    sourceYSize: number,
    factor: FieldElement,
  ): Promise<Uint8Array>;
  batchScaleCoeffsXBuffer(
    buffer: Uint8Array,
    xSize: number,
    ySize: number,
    factor: FieldElement,
  ): Promise<Uint8Array>;
  batchScaleCoeffsYBuffer(
    buffer: Uint8Array,
    xSize: number,
    ySize: number,
    factor: FieldElement,
  ): Promise<Uint8Array>;
  batchFromMontgomeryBuffer(buffer: Uint8Array): Promise<Uint8Array>;
  batchInverseBuffer(buffer: Uint8Array): Promise<Uint8Array>;
  ruffiniXBuffer(
    buffer: Uint8Array,
    xSize: number,
    ySize: number,
    point: FieldElement,
  ): Promise<{ readonly quotient: Uint8Array; readonly remainder: Uint8Array }>;
  ruffiniYBuffer(
    buffer: Uint8Array,
    ySize: number,
    point: FieldElement,
  ): Promise<{ readonly quotient: Uint8Array; readonly remainder: FieldElement }>;
  evaluatePolynomialBuffer(
    buffer: Uint8Array,
    xSize: number,
    ySize: number,
    xPoint: FieldElement,
    yPoint: FieldElement,
  ): Promise<FieldElement>;
  evaluateScaledChallengeSetBuffer(
    buffer: Uint8Array,
    xSize: number,
    ySize: number,
    xPoint: FieldElement,
    scaledXPoint: FieldElement,
    yPoint: FieldElement,
    scaledYPoint: FieldElement,
  ): Promise<readonly [FieldElement, FieldElement, FieldElement]>;
  divideByVanishingBuffer(
    buffer: Uint8Array,
    xSize: number,
    ySize: number,
    xDegree: number,
    yDegree: number,
  ): Promise<{ readonly quotientX: Uint8Array; readonly quotientY: Uint8Array }>;
  computeRecursionRecurrenceBuffer(
    gEvals: Uint8Array,
    inverseFEvals: Uint8Array,
    mI: number,
    sMax: number,
  ): Promise<Uint8Array>;
  k0RecurrenceBuffer(
    buffer: Uint8Array,
    inputXSize: number,
    inputYSize: number,
    outputXSize: number,
    outputYSize: number,
    mI: number,
  ): Promise<Uint8Array>;
  klRecurrenceBuffer(
    buffer: Uint8Array,
    inputXSize: number,
    inputYSize: number,
    outputXSize: number,
    outputYSize: number,
    mI: number,
    sMax: number,
  ): Promise<Uint8Array>;
  specialPolynomialBuffer(
    buffer: Uint8Array,
    inputXSize: number,
    inputYSize: number,
    activeXSize: number,
    activeYSize: number,
    outputXSize: number,
    outputYSize: number,
    operation: SpecialPolynomialOperation,
    constant: FieldElement,
    xCoefficient: FieldElement,
    yCoefficient: FieldElement,
  ): Promise<Uint8Array>;
  fusedLinearPolynomialBuffer(
    buffer: Uint8Array,
    inputXSize: number,
    inputYSize: number,
    activeXSize: number,
    activeYSize: number,
    addend: Uint8Array,
    addendXSize: number,
    addendYSize: number,
    outputXSize: number,
    outputYSize: number,
    axis: "x" | "y",
    constant: FieldElement,
    shiftCoefficient: FieldElement,
    addendScale: FieldElement,
  ): Promise<Uint8Array>;
  sparseRowDotBuffer(
    rowOffsets: Uint8Array,
    columns: Uint8Array,
    coefficients: Uint8Array,
    variables: Uint8Array,
    rowCount: number,
  ): Promise<Uint8Array>;
  fft(values: readonly FieldElement[]): Promise<FieldElement[]>;
  ifft(values: readonly FieldElement[]): Promise<FieldElement[]>;
  add(left: FieldElement, right: FieldElement): FieldElement;
  sub(left: FieldElement, right: FieldElement): FieldElement;
  neg(value: FieldElement): FieldElement;
  mul(left: FieldElement, right: FieldElement): FieldElement;
  div(left: FieldElement, right: FieldElement): FieldElement;
  inv(value: FieldElement): FieldElement;
  square(value: FieldElement): FieldElement;
  pow(value: FieldElement, exponent: bigint | number | string): FieldElement;
  eq(left: FieldElement, right: FieldElement): boolean;
  isZero(value: FieldElement): boolean;
  random(): FieldElement;
}

export function createFieldRuntime(field: FfField): FieldRuntime {
  if (field.zero.byteLength !== field.n8 || field.zero.some((byte) => byte !== 0)) {
    throw new Error("Field runtime requires an all-zero byte representation for the additive identity.");
  }
  assertLinearBatchExports(field);

  return {
    byteLength: field.n8,
    modulus: field.p,
    zero: field.zero,
    one: field.one,
    bufferElementCount(buffer) {
      assertFieldBuffer(buffer, field.n8);
      return buffer.byteLength / field.n8;
    },
    createZeroBuffer(elementCount) {
      assertNonNegativeSafeInteger(elementCount, "Field buffer element count");
      return new Uint8Array(elementCount * field.n8);
    },
    cloneBuffer(buffer) {
      assertFieldBuffer(buffer, field.n8);
      return buffer.slice();
    },
    concat(elements) {
      return concatFieldElements(elements, field.n8);
    },
    split(buffer) {
      return splitFieldBuffer(buffer, field.n8);
    },
    readBufferElement(buffer, index) {
      assertFieldBuffer(buffer, field.n8);
      assertBufferIndex(index, buffer.byteLength / field.n8);
      return buffer.slice(index * field.n8, (index + 1) * field.n8);
    },
    writeBufferElement(buffer, index, value) {
      assertFieldBuffer(buffer, field.n8);
      assertBufferIndex(index, buffer.byteLength / field.n8);
      if (value.byteLength !== field.n8) {
        throw new Error("Field element byte length does not match the runtime field.");
      }
      buffer.set(value, index * field.n8);
    },
    fromBigInt(value) {
      assertInField(value, field.p);
      return field.fromObject(value);
    },
    fromHex(value) {
      return field.fromObject(parseCanonicalHex(value, field.p));
    },
    toBigInt(value) {
      return field.toObject(value);
    },
    toHex(value) {
      return formatHex(field.toObject(value), field.n8);
    },
    toRawLittleEndian(value) {
      const output = new Uint8Array(field.n8);
      field.toRprLE(output, 0, value);
      return output;
    },
    rootOfUnity(size) {
      const logSize = checkedPowerOfTwoLog(size);
      if (logSize > field.s || field.w[logSize] === undefined) {
        throw new Error(`No root of unity is available for size ${size}.`);
      }

      return field.w[logSize].slice();
    },
    async fftBuffer(buffer) {
      assertFieldBuffer(buffer, field.n8);
      return await field.fft(buffer);
    },
    async ifftBuffer(buffer) {
      assertFieldBuffer(buffer, field.n8);
      return await field.ifft(buffer);
    },
    async batchFftBuffer(buffer, segmentSize, direction) {
      assertFieldBuffer(buffer, field.n8);
      return await batchFftBuffer(field, buffer, segmentSize, direction);
    },
    async batchApplyKeyBuffer(buffer, first, increment) {
      assertFieldBuffer(buffer, field.n8);
      return await field.batchApplyKey(buffer, first, increment);
    },
    async batchAddBuffer(left, right) {
      return await batchBinaryBuffer(field, left, right, FIELD_BATCH_ADD);
    },
    async batchSubBuffer(left, right) {
      return await batchBinaryBuffer(field, left, right, FIELD_BATCH_SUB);
    },
    async batchMulBuffer(left, right) {
      return await batchBinaryBuffer(field, left, right, FIELD_BATCH_MUL);
    },
    async batchMulShiftedBuffer(left, right, xSize, ySize, xShift, yShift) {
      assertPolynomialBufferShape(left, xSize, ySize, field.n8, "Shifted multiplication left");
      assertPolynomialBufferShape(right, xSize, ySize, field.n8, "Shifted multiplication right");
      const normalizedXShift = modulo(xShift, xSize);
      const normalizedYShift = modulo(yShift, ySize);
      const rowBytes = ySize * field.n8;
      const ranges = splitRanges(xSize, field.tm.concurrency);
      const results = await Promise.all(
        ranges.map(({ start, count }) => {
          const leftRows = new Uint8Array(count * rowBytes);
          for (let localX = 0; localX < count; localX += 1) {
            const sourceX = modulo(start + localX + normalizedXShift, xSize);
            leftRows.set(
              left.subarray(sourceX * rowBytes, (sourceX + 1) * rowBytes),
              localX * rowBytes,
            );
          }
          const rightRows = right.slice(start * rowBytes, (start + count) * rowBytes);
          return field.tm.queueAction(
            buildShiftedMultiplyTask(leftRows, rightRows, count, ySize, normalizedYShift, field.n8),
          );
        }),
      );
      return assembleTaskOutputs(results, left.byteLength);
    },
    async batchScaleBuffer(buffer, factor) {
      assertFieldBuffer(buffer, field.n8);
      assertFieldElement(factor, field.n8, "Scale factor");
      return await field.batchApplyKey(buffer, factor, field.one);
    },
    async batchAddScaledBuffer(target, source, factor) {
      assertMatchingFieldBuffers(target, source, field.n8, "Add-scaled buffers");
      assertFieldElement(factor, field.n8, "Add-scaled factor");
      const elementCount = target.byteLength / field.n8;
      const ranges = splitRanges(elementCount, field.tm.concurrency);
      const results = await Promise.all(
        ranges.map(({ start, count }) => {
          const byteStart = start * field.n8;
          const byteLength = count * field.n8;
          return field.tm.queueAction([
            { cmd: "ALLOCSET", var: 0, buff: target.slice(byteStart, byteStart + byteLength) },
            { cmd: "ALLOCSET", var: 1, buff: source.slice(byteStart, byteStart + byteLength) },
            { cmd: "ALLOCSET", var: 2, buff: factor },
            { cmd: "ALLOC", var: 3, len: byteLength },
            {
              cmd: "CALL",
              fnName: FIELD_BATCH_ADD_SCALED,
              params: [{ var: 0 }, { var: 1 }, { var: 2 }, { val: count }, { var: 3 }],
            },
            { cmd: "GET", out: 0, var: 3, len: byteLength },
          ]);
        }),
      );
      return assembleTaskOutputs(results, target.byteLength);
    },
    async batchAddScaledPrefixBuffer(
      target,
      targetXSize,
      targetYSize,
      source,
      sourceXSize,
      sourceYSize,
      factor,
    ) {
      assertPolynomialBufferShape(target, targetXSize, targetYSize, field.n8, "Target");
      assertPolynomialBufferShape(source, sourceXSize, sourceYSize, field.n8, "Source");
      assertFieldElement(factor, field.n8, "Add-scaled prefix factor");
      if (sourceXSize > targetXSize || sourceYSize > targetYSize) {
        throw new Error("Source polynomial shape must fit inside the target polynomial shape.");
      }

      const ranges = splitRanges(sourceXSize, field.tm.concurrency);
      const output = target.slice();
      const results = await Promise.all(
        ranges.map(({ start, count }) => {
          const targetByteStart = start * targetYSize * field.n8;
          const targetByteLength = count * targetYSize * field.n8;
          const sourceByteStart = start * sourceYSize * field.n8;
          const sourceByteLength = count * sourceYSize * field.n8;
          return field.tm.queueAction([
            { cmd: "ALLOCSET", var: 0, buff: target.slice(targetByteStart, targetByteStart + targetByteLength) },
            { cmd: "ALLOCSET", var: 1, buff: source.slice(sourceByteStart, sourceByteStart + sourceByteLength) },
            { cmd: "ALLOCSET", var: 2, buff: factor },
            {
              cmd: "CALL",
              fnName: FIELD_BATCH_ADD_SCALED_PREFIX,
              params: [
                { var: 0 },
                { var: 1 },
                { var: 2 },
                { val: count },
                { val: targetYSize },
                { val: sourceYSize },
              ],
            },
            { cmd: "GET", out: 0, var: 0, len: targetByteLength },
          ]);
        }),
      );
      for (let index = 0; index < ranges.length; index += 1) {
        output.set(results[index][0], ranges[index].start * targetYSize * field.n8);
      }
      return output;
    },
    async batchScaleCoeffsXBuffer(buffer, xSize, ySize, factor) {
      assertPolynomialBufferShape(buffer, xSize, ySize, field.n8, "X-scaled");
      assertFieldElement(factor, field.n8, "X scale factor");
      const ranges = splitRanges(xSize, field.tm.concurrency);
      const results = await Promise.all(
        ranges.map(({ start, count }) => {
          const byteStart = start * ySize * field.n8;
          const byteLength = count * ySize * field.n8;
          return field.tm.queueAction([
            { cmd: "ALLOCSET", var: 0, buff: buffer.slice(byteStart, byteStart + byteLength) },
            { cmd: "ALLOCSET", var: 1, buff: factor },
            { cmd: "ALLOCSET", var: 2, buff: field.exp(factor, start) },
            { cmd: "ALLOC", var: 3, len: byteLength },
            {
              cmd: "CALL",
              fnName: FIELD_BATCH_SCALE_X,
              params: [{ var: 0 }, { var: 1 }, { var: 2 }, { val: count }, { val: ySize }, { var: 3 }],
            },
            { cmd: "GET", out: 0, var: 3, len: byteLength },
          ]);
        }),
      );
      return assembleTaskOutputs(results, buffer.byteLength);
    },
    async batchScaleCoeffsYBuffer(buffer, xSize, ySize, factor) {
      assertPolynomialBufferShape(buffer, xSize, ySize, field.n8, "Y-scaled");
      assertFieldElement(factor, field.n8, "Y scale factor");
      const ranges = splitRanges(xSize, field.tm.concurrency);
      const results = await Promise.all(
        ranges.map(({ start, count }) => {
          const byteStart = start * ySize * field.n8;
          const byteLength = count * ySize * field.n8;
          return field.tm.queueAction([
            { cmd: "ALLOCSET", var: 0, buff: buffer.slice(byteStart, byteStart + byteLength) },
            { cmd: "ALLOCSET", var: 1, buff: factor },
            { cmd: "ALLOCSET", var: 2, buff: field.one },
            { cmd: "ALLOCSET", var: 3, buff: field.one },
            { cmd: "ALLOC", var: 4, len: byteLength },
            {
              cmd: "CALL",
              fnName: FIELD_BATCH_SCALE_Y,
              params: [
                { var: 0 },
                { var: 1 },
                { var: 2 },
                { var: 3 },
                { val: count },
                { val: ySize },
                { var: 4 },
              ],
            },
            { cmd: "GET", out: 0, var: 4, len: byteLength },
          ]);
        }),
      );
      return assembleTaskOutputs(results, buffer.byteLength);
    },
    async batchFromMontgomeryBuffer(buffer) {
      assertFieldBuffer(buffer, field.n8);
      return await field.batchFromMontgomery(buffer);
    },
    async batchInverseBuffer(buffer) {
      assertFieldBuffer(buffer, field.n8);
      return await field.batchInverse(buffer);
    },
    async ruffiniXBuffer(buffer, xSize, ySize, point) {
      assertPolynomialBufferShape(buffer, xSize, ySize, field.n8, "Ruffini X input");
      assertFieldElement(point, field.n8, "Ruffini X point");
      if (xSize === 1) {
        return {
          quotient: new Uint8Array(ySize * field.n8),
          remainder: buffer.slice(),
        };
      }

      const ranges = splitRanges(ySize, field.tm.concurrency);
      const results = await Promise.all(
        ranges.map(({ start, count }) => {
          const input = extractPolynomialColumns(buffer, xSize, ySize, start, count, field.n8);
          return field.tm.queueAction(buildRuffiniXTask(field, input, xSize, count, point));
        }),
      );
      const quotientShards = results.map((result) => requireTaskOutputs(result, 2, "Ruffini X")[0]);
      const quotient = assemblePolynomialColumns(quotientShards, ranges, xSize, ySize, field.n8);
      const remainder = new Uint8Array(ySize * field.n8);
      for (let index = 0; index < ranges.length; index += 1) {
        const taskOutputs = requireTaskOutputs(results[index], 2, "Ruffini X");
        remainder.set(taskOutputs[1], ranges[index].start * field.n8);
      }
      return { quotient, remainder };
    },
    async ruffiniYBuffer(buffer, ySize, point) {
      assertPolynomialBufferShape(buffer, 1, ySize, field.n8, "Ruffini Y input");
      assertFieldElement(point, field.n8, "Ruffini Y point");
      if (ySize === 1) {
        return {
          quotient: new Uint8Array(field.n8),
          remainder: buffer.slice(0, field.n8),
        };
      }
      const result = requireTaskOutputs(
        await field.tm.queueAction(buildRuffiniYTask(field, buffer, ySize, point)),
        2,
        "Ruffini Y",
      );
      return { quotient: result[0], remainder: result[1] };
    },
    async evaluatePolynomialBuffer(buffer, xSize, ySize, xPoint, yPoint) {
      assertPolynomialBufferShape(buffer, xSize, ySize, field.n8, "Polynomial evaluation input");
      assertFieldElement(xPoint, field.n8, "Polynomial evaluation X point");
      assertFieldElement(yPoint, field.n8, "Polynomial evaluation Y point");
      const rows = await evaluateRows(field, buffer, xSize, ySize, yPoint);
      const result = requireTaskOutputs(
        await field.tm.queueAction(buildEvalReduceTask(rows, xSize, xPoint, field.n8)),
        1,
        "Polynomial evaluation reduction",
      );
      return result[0];
    },
    async evaluateScaledChallengeSetBuffer(
      buffer,
      xSize,
      ySize,
      xPoint,
      scaledXPoint,
      yPoint,
      scaledYPoint,
    ) {
      assertPolynomialBufferShape(buffer, xSize, ySize, field.n8, "Scaled evaluation input");
      assertFieldElement(xPoint, field.n8, "Scaled evaluation X point");
      assertFieldElement(scaledXPoint, field.n8, "Scaled evaluation adjusted X point");
      assertFieldElement(yPoint, field.n8, "Scaled evaluation Y point");
      assertFieldElement(scaledYPoint, field.n8, "Scaled evaluation adjusted Y point");
      const [baseRows, scaledRows] = await evaluateRowsFused(
        field,
        buffer,
        xSize,
        ySize,
        yPoint,
        scaledYPoint,
      );
      const result = requireTaskOutputs(
        await field.tm.queueAction(
          buildEvalReduceFusedTask(
            baseRows,
            scaledRows,
            xSize,
            xPoint,
            scaledXPoint,
            field.n8,
          ),
        ),
        3,
        "Scaled evaluation reduction",
      );
      return [result[0], result[1], result[2]];
    },
    async divideByVanishingBuffer(buffer, xSize, ySize, xDegree, yDegree) {
      assertPolynomialBufferShape(buffer, xSize, ySize, field.n8, "Vanishing division input");
      if (xSize < xDegree * 2 || ySize < yDegree * 2) {
        throw new Error("Vanishing division input must contain at least two blocks on each axis.");
      }
      if (xSize % xDegree !== 0 || ySize % yDegree !== 0) {
        throw new Error("Vanishing division shape must be divisible by both vanishing degrees.");
      }
      const xRanges = splitRanges(xDegree, field.tm.concurrency);
      const xBlockCount = xSize / xDegree;
      const yResults = await Promise.all(
        xRanges.map(({ start, count }) => field.tm.queueAction(
          buildVanishingYTask(
            extractPolynomialBlockRows(buffer, xSize, ySize, xDegree, start, count, field.n8),
            xBlockCount,
            count,
            ySize,
            yDegree,
            field.n8,
          ),
        )),
      );
      const quotientY = new Uint8Array(xDegree * ySize * field.n8);
      const corrected = buffer.slice();
      for (let index = 0; index < xRanges.length; index += 1) {
        const outputs = requireTaskOutputs(yResults[index], 2, "Vanishing Y");
        const offset = xRanges[index].start * ySize * field.n8;
        quotientY.set(outputs[0], offset);
        corrected.set(outputs[1], offset);
      }

      const yRanges = splitRanges(ySize, field.tm.concurrency);
      const xResults = await Promise.all(
        yRanges.map(({ start, count }) => field.tm.queueAction(
          buildVanishingXTask(
            extractPolynomialColumns(corrected, xSize, ySize, start, count, field.n8),
            xSize,
            count,
            xDegree,
            field.n8,
          ),
        )),
      );
      return {
        quotientX: assemblePolynomialColumns(
          xResults.map((result) => requireTaskOutputs(result, 1, "Vanishing X")[0]),
          yRanges,
          xSize,
          ySize,
          field.n8,
        ),
        quotientY,
      };
    },
    async computeRecursionRecurrenceBuffer(gEvals, inverseFEvals, mI, sMax) {
      assertMatchingFieldBuffers(gEvals, inverseFEvals, field.n8, "Recursion recurrence inputs");
      if (gEvals.byteLength / field.n8 !== mI * sMax || mI <= 0 || sMax <= 0) {
        throw new Error("Recursion recurrence input length does not match its domain.");
      }
      const outputBytes = gEvals.byteLength;
      const result = requireTaskOutputs(
        await field.tm.queueAction([
          { cmd: "ALLOCSET", var: 0, buff: gEvals },
          { cmd: "ALLOCSET", var: 1, buff: inverseFEvals },
          { cmd: "ALLOCSET", var: 2, buff: field.one },
          { cmd: "ALLOCSET", var: 3, buff: new Uint8Array(outputBytes) },
          {
            cmd: "CALL",
            fnName: FIELD_RECURSION_RECURRENCE,
            params: [
              { var: 0 },
              { var: 1 },
              { val: mI },
              { val: sMax },
              { val: mI * sMax },
              { var: 2 },
              { var: 3 },
            ],
          },
          { cmd: "GET", out: 0, var: 3, len: outputBytes },
        ]),
        1,
        "Recursion recurrence",
      );
      return result[0];
    },
    async k0RecurrenceBuffer(
      buffer,
      inputXSize,
      inputYSize,
      outputXSize,
      outputYSize,
      mI,
    ) {
      assertPolynomialBufferShape(buffer, inputXSize, inputYSize, field.n8, "K0 input");
      assertPositiveSafeInteger(outputXSize, "K0 output X size");
      assertPositiveSafeInteger(outputYSize, "K0 output Y size");
      assertPositiveSafeInteger(mI, "K0 domain size");
      if (outputYSize > inputYSize || outputXSize < inputXSize) {
        throw new Error("K0 output shape is incompatible with its input shape.");
      }
      const ranges = splitRanges(outputYSize, field.tm.concurrency);
      const results = await Promise.all(
        ranges.map(({ start, count }) => field.tm.queueAction(
          buildK0Task(
            extractPolynomialColumns(
              buffer,
              inputXSize,
              inputYSize,
              start,
              count,
              field.n8,
            ),
            inputXSize,
            count,
            outputXSize,
            mI,
            field.n8,
          ),
        )),
      );
      return assemblePolynomialColumns(
        results.map((result) => requireTaskOutputs(result, 1, "K0 recurrence")[0]),
        ranges,
        outputXSize,
        outputYSize,
        field.n8,
      );
    },
    async klRecurrenceBuffer(
      buffer,
      inputXSize,
      inputYSize,
      outputXSize,
      outputYSize,
      mI,
      sMax,
    ) {
      assertPolynomialBufferShape(buffer, inputXSize, inputYSize, field.n8, "KL input");
      assertPositiveSafeInteger(outputXSize, "KL output X size");
      assertPositiveSafeInteger(outputYSize, "KL output Y size");
      assertPositiveSafeInteger(mI, "KL X domain size");
      assertPositiveSafeInteger(sMax, "KL Y domain size");
      if (outputXSize < inputXSize || outputYSize < inputYSize) {
        throw new Error("KL output shape is incompatible with its input shape.");
      }

      const xRanges = splitRanges(inputYSize, field.tm.concurrency);
      const rootX = field.w[checkedPowerOfTwoLog(mI)];
      const xResults = await Promise.all(
        xRanges.map(({ start, count }) => field.tm.queueAction(
          buildKlXTask(
            extractPolynomialColumns(
              buffer,
              inputXSize,
              inputYSize,
              start,
              count,
              field.n8,
            ),
            inputXSize,
            count,
            outputXSize,
            mI,
            rootX,
            field.n8,
          ),
        )),
      );
      const intermediate = assemblePolynomialColumns(
        xResults.map((result) => requireTaskOutputs(result, 1, "KL X recurrence")[0]),
        xRanges,
        outputXSize,
        inputYSize,
        field.n8,
      );

      const yRanges = splitRanges(outputXSize, field.tm.concurrency);
      const rootY = field.w[checkedPowerOfTwoLog(sMax)];
      const inputRowBytes = inputYSize * field.n8;
      const yResults = await Promise.all(
        yRanges.map(({ start, count }) => field.tm.queueAction(
          buildKlYTask(
            intermediate.slice(start * inputRowBytes, (start + count) * inputRowBytes),
            count,
            inputYSize,
            outputYSize,
            sMax,
            rootY,
            field.n8,
          ),
        )),
      );
      return assembleTaskOutputs(yResults, outputXSize * outputYSize * field.n8);
    },
    async specialPolynomialBuffer(
      buffer,
      inputXSize,
      inputYSize,
      activeXSize,
      activeYSize,
      outputXSize,
      outputYSize,
      operation,
      constant,
      xCoefficient,
      yCoefficient,
    ) {
      assertPolynomialBufferShape(buffer, inputXSize, inputYSize, field.n8, "Special polynomial input");
      assertPositiveSafeInteger(activeXSize, "Special polynomial active X size");
      assertPositiveSafeInteger(activeYSize, "Special polynomial active Y size");
      assertPositiveSafeInteger(outputXSize, "Special polynomial output X size");
      assertPositiveSafeInteger(outputYSize, "Special polynomial output Y size");
      assertFieldElement(constant, field.n8, "Special polynomial constant");
      assertFieldElement(xCoefficient, field.n8, "Special polynomial X coefficient");
      assertFieldElement(yCoefficient, field.n8, "Special polynomial Y coefficient");
      if (
        activeXSize > inputXSize
        || activeYSize > inputYSize
        || outputXSize < activeXSize
        || outputYSize < activeYSize
      ) {
        throw new Error("Special polynomial active and output shapes are incompatible.");
      }

      const extendsX = operation !== "linear-y";
      const extendsY = operation === "linear-y" || operation === "term9";
      const activeOutputX = activeXSize + (extendsX ? 1 : 0);
      const activeOutputY = activeYSize + (extendsY ? 1 : 0);
      if (activeOutputX > outputXSize || activeOutputY > outputYSize) {
        throw new Error("Special polynomial output shape cannot contain the active result.");
      }

      const ranges = splitRanges(activeOutputX, field.tm.concurrency);
      const inputRowBytes = inputYSize * field.n8;
      const functionName = specialPolynomialFunctionName(operation);
      const results = await Promise.all(ranges.map(({ start, count }) => {
        const sourceStart = Math.max(0, start - 1);
        const sourceEnd = Math.min(activeXSize, start + count);
        const source = buffer.slice(
          sourceStart * inputRowBytes,
          sourceEnd * inputRowBytes,
        );
        return field.tm.queueAction(buildSpecialPolynomialTask(
          source,
          sourceStart,
          inputYSize,
          start,
          count,
          activeXSize,
          activeYSize,
          activeOutputY,
          functionName,
          constant,
          xCoefficient,
          yCoefficient,
          field.n8,
        ));
      }));
      const output = new Uint8Array(outputXSize * outputYSize * field.n8);
      for (let index = 0; index < ranges.length; index += 1) {
        const shard = requireTaskOutputs(results[index], 1, operation)[0];
        const { start, count } = ranges[index];
        for (let localX = 0; localX < count; localX += 1) {
          const sourceOffset = localX * activeOutputY * field.n8;
          output.set(
            shard.subarray(sourceOffset, sourceOffset + activeOutputY * field.n8),
            (start + localX) * outputYSize * field.n8,
          );
        }
      }
      return output;
    },
    async fusedLinearPolynomialBuffer(
      buffer,
      inputXSize,
      inputYSize,
      activeXSize,
      activeYSize,
      addend,
      addendXSize,
      addendYSize,
      outputXSize,
      outputYSize,
      axis,
      constant,
      shiftCoefficient,
      addendScale,
    ) {
      assertPolynomialBufferShape(buffer, inputXSize, inputYSize, field.n8, "Fused linear input");
      assertPolynomialBufferShape(addend, addendXSize, addendYSize, field.n8, "Fused linear addend");
      assertPositiveSafeInteger(activeXSize, "Fused linear active X size");
      assertPositiveSafeInteger(activeYSize, "Fused linear active Y size");
      assertPositiveSafeInteger(outputXSize, "Fused linear output X size");
      assertPositiveSafeInteger(outputYSize, "Fused linear output Y size");
      assertFieldElement(constant, field.n8, "Fused linear constant");
      assertFieldElement(shiftCoefficient, field.n8, "Fused linear shift coefficient");
      assertFieldElement(addendScale, field.n8, "Fused linear addend scale");
      const activeOutputX = activeXSize + (axis === "x" ? 1 : 0);
      const activeOutputY = activeYSize + (axis === "y" ? 1 : 0);
      if (
        activeXSize > inputXSize
        || activeYSize > inputYSize
        || activeOutputX > outputXSize
        || activeOutputY > outputYSize
        || addendXSize > outputXSize
        || addendYSize > outputYSize
      ) {
        throw new Error("Fused linear input and output shapes are incompatible.");
      }

      const ranges = splitRanges(activeOutputX, field.tm.concurrency);
      const inputRowBytes = inputYSize * field.n8;
      const addendRowBytes = addendYSize * field.n8;
      const functionName = axis === "x" ? FIELD_FUSED_LINEAR_X : FIELD_FUSED_LINEAR_Y;
      const results = await Promise.all(ranges.map(({ start, count }) => {
        const sourceStart = Math.max(0, start - (axis === "x" ? 1 : 0));
        const sourceEnd = Math.min(activeXSize, start + count);
        const addendStart = Math.min(start, addendXSize);
        const addendEnd = Math.min(start + count, addendXSize);
        return field.tm.queueAction(buildFusedLinearTask(
          buffer.slice(sourceStart * inputRowBytes, sourceEnd * inputRowBytes),
          sourceStart,
          inputYSize,
          addend.slice(addendStart * addendRowBytes, addendEnd * addendRowBytes),
          addendStart,
          addendEnd - addendStart,
          addendYSize,
          start,
          count,
          activeXSize,
          activeYSize,
          activeOutputY,
          functionName,
          constant,
          shiftCoefficient,
          addendScale,
          field.n8,
        ));
      }));
      const output = new Uint8Array(outputXSize * outputYSize * field.n8);
      for (let index = 0; index < ranges.length; index += 1) {
        const shard = requireTaskOutputs(results[index], 1, `fused-linear-${axis}`)[0];
        const { start, count } = ranges[index];
        for (let localX = 0; localX < count; localX += 1) {
          const sourceOffset = localX * activeOutputY * field.n8;
          output.set(
            shard.subarray(sourceOffset, sourceOffset + activeOutputY * field.n8),
            (start + localX) * outputYSize * field.n8,
          );
        }
      }
      return output;
    },
    async sparseRowDotBuffer(rowOffsets, columns, coefficients, variables, rowCount) {
      assertNonNegativeSafeInteger(rowCount, "Sparse row count");
      if (rowOffsets.byteLength !== (rowCount + 1) * 4) {
        throw new Error("Sparse row-offset buffer length does not match the row count.");
      }
      if (columns.byteLength % 4 !== 0) {
        throw new Error("Sparse column buffer length must be a multiple of four bytes.");
      }
      assertFieldBuffer(coefficients, field.n8);
      assertFieldBuffer(variables, field.n8);
      if (columns.byteLength / 4 !== coefficients.byteLength / field.n8) {
        throw new Error("Sparse columns and coefficients must contain the same number of entries.");
      }
      const outputBytes = rowCount * field.n8;
      const outputs = await field.tm.queueAction([
        { cmd: "ALLOCSET", var: 0, buff: rowOffsets },
        { cmd: "ALLOCSET", var: 1, buff: columns },
        { cmd: "ALLOCSET", var: 2, buff: coefficients },
        { cmd: "ALLOCSET", var: 3, buff: variables },
        { cmd: "ALLOC", var: 4, len: outputBytes },
        {
          cmd: "CALL",
          fnName: FIELD_SPARSE_ROW_DOT,
          params: [
            { var: 0 },
            { var: 1 },
            { var: 2 },
            { var: 3 },
            { val: rowCount },
            { var: 4 },
          ],
        },
        { cmd: "GET", out: 0, var: 4, len: outputBytes },
      ]);
      return requireTaskOutputs(outputs, 1, "sparse row dot")[0];
    },
    async fft(values) {
      return splitFieldBuffer(await field.fft(concatFieldElements(values, field.n8)), field.n8);
    },
    async ifft(values) {
      return splitFieldBuffer(await field.ifft(concatFieldElements(values, field.n8)), field.n8);
    },
    add(left, right) {
      return field.add(left, right);
    },
    sub(left, right) {
      return field.sub(left, right);
    },
    neg(value) {
      return field.neg(value);
    },
    mul(left, right) {
      return field.mul(left, right);
    },
    div(left, right) {
      return field.div(left, right);
    },
    inv(value) {
      return field.inv(value);
    },
    square(value) {
      return field.square(value);
    },
    pow(value, exponent) {
      return field.exp(value, exponent);
    },
    eq(left, right) {
      return field.eq(left, right);
    },
    isZero(value) {
      return field.isZero(value);
    },
    random() {
      return field.random();
    },
  };
}

interface FfFieldWithWorkerTasks extends FfField {
  readonly prefix: string;
}

const MAX_FFT_MIX_BITS_PER_BATCH_TASK = 14;

async function batchFftBuffer(
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
  direction: "forward" | "inverse",
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

function assertFieldBuffer(buffer: Uint8Array, byteLength: number): void {
  if (buffer.byteLength % byteLength !== 0) {
    throw new Error("Field buffer byte length is not divisible by the runtime field width.");
  }
}

function assertBufferIndex(index: number, elementCount: number): void {
  if (!Number.isSafeInteger(index) || index < 0 || index >= elementCount) {
    throw new Error("Field buffer index is out of bounds.");
  }
}

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
}

function checkedPowerOfTwoLog(size: number): number {
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new Error("Root of unity size must be a positive safe integer.");
  }

  let current = 1;
  let log = 0;
  while (current < size) {
    current *= 2;
    log += 1;
  }

  if (current !== size) {
    throw new Error("Root of unity size must be a power of two.");
  }

  return log;
}

function concatFieldElements(values: readonly FieldElement[], byteLength: number): Uint8Array {
  const output = new Uint8Array(values.length * byteLength);
  for (let index = 0; index < values.length; index += 1) {
    if (values[index].byteLength !== byteLength) {
      throw new Error("Field element byte length does not match the runtime field.");
    }

    output.set(values[index], index * byteLength);
  }

  return output;
}

function splitFieldBuffer(buffer: Uint8Array, byteLength: number): FieldElement[] {
  if (buffer.byteLength % byteLength !== 0) {
    throw new Error("Field buffer byte length is not divisible by the runtime field width.");
  }

  const values: FieldElement[] = [];
  for (let offset = 0; offset < buffer.byteLength; offset += byteLength) {
    values.push(buffer.slice(offset, offset + byteLength));
  }

  return values;
}

export function parseCanonicalHex(value: string, modulus?: bigint): bigint {
  if (!/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new Error("Expected a 0x-prefixed hexadecimal field value.");
  }

  const parsed = BigInt(value);

  if (modulus !== undefined) {
    assertInField(parsed, modulus);
  }

  return parsed;
}

export function formatHex(value: bigint, byteLength: number): string {
  if (value < 0n) {
    throw new Error("Cannot format a negative field value.");
  }

  const width = byteLength * 2;
  const hex = value.toString(16);

  if (hex.length > width) {
    throw new Error(`Field value does not fit in ${byteLength} bytes.`);
  }

  return `0x${hex.padStart(width, "0")}`;
}

function assertInField(value: bigint, modulus: bigint): void {
  if (value < 0n || value >= modulus) {
    throw new Error("Field value is outside the scalar field modulus.");
  }
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
}

function assertLinearBatchExports(field: FfField): void {
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

async function batchBinaryBuffer(
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

function buildShiftedMultiplyTask(
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

function buildRuffiniXTask(
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

function buildSpecialPolynomialTask(
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

function buildFusedLinearTask(
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

function specialPolynomialFunctionName(operation: SpecialPolynomialOperation): string {
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

function buildRuffiniYTask(
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

async function evaluateRows(
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

async function evaluateRowsFused(
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

function buildEvalReduceTask(
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

function buildEvalReduceFusedTask(
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

function buildK0Task(
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

function buildKlXTask(
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

function buildKlYTask(
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

function buildVanishingYTask(
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

function buildVanishingXTask(
  input: Uint8Array,
  xSize: number,
  yColumns: number,
  xDegree: number,
  elementBytes: number,
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

function extractPolynomialBlockRows(
  source: Uint8Array,
  xSize: number,
  ySize: number,
  xDegree: number,
  localStart: number,
  localCount: number,
  elementBytes: number,
): Uint8Array {
  const blockCount = xSize / xDegree;
  const rowBytes = ySize * elementBytes;
  const output = new Uint8Array(blockCount * localCount * rowBytes);
  for (let block = 0; block < blockCount; block += 1) {
    const sourceStart = (block * xDegree + localStart) * rowBytes;
    output.set(
      source.subarray(sourceStart, sourceStart + localCount * rowBytes),
      block * localCount * rowBytes,
    );
  }
  return output;
}

function extractPolynomialColumns(
  source: Uint8Array,
  xSize: number,
  sourceYSize: number,
  yStart: number,
  yCount: number,
  elementBytes: number,
): Uint8Array {
  const output = new Uint8Array(xSize * yCount * elementBytes);
  for (let x = 0; x < xSize; x += 1) {
    const sourceStart = (x * sourceYSize + yStart) * elementBytes;
    output.set(
      source.subarray(sourceStart, sourceStart + yCount * elementBytes),
      x * yCount * elementBytes,
    );
  }
  return output;
}

function assemblePolynomialColumns(
  shards: readonly Uint8Array[],
  ranges: readonly { start: number; count: number }[],
  xSize: number,
  ySize: number,
  elementBytes: number,
): Uint8Array {
  const output = new Uint8Array(xSize * ySize * elementBytes);
  for (let shardIndex = 0; shardIndex < shards.length; shardIndex += 1) {
    const shard = shards[shardIndex];
    const { start, count } = ranges[shardIndex];
    for (let x = 0; x < xSize; x += 1) {
      output.set(
        shard.subarray(x * count * elementBytes, (x + 1) * count * elementBytes),
        (x * ySize + start) * elementBytes,
      );
    }
  }
  return output;
}

function requireTaskOutputs(
  result: readonly Uint8Array[],
  expectedCount: number,
  label: string,
): readonly Uint8Array[] {
  if (result.length !== expectedCount) {
    throw new Error(`${label} task returned ${result.length} outputs; expected ${expectedCount}.`);
  }
  return result;
}

function splitRanges(elementCount: number, requestedTaskCount: number): readonly { start: number; count: number }[] {
  if (!Number.isSafeInteger(elementCount) || elementCount < 0) {
    throw new Error("Batch element count must be a non-negative safe integer.");
  }
  if (!Number.isSafeInteger(requestedTaskCount) || requestedTaskCount <= 0) {
    throw new Error("Batch task count must be a positive safe integer.");
  }
  if (elementCount === 0) {
    return [];
  }

  const taskCount = Math.min(elementCount, requestedTaskCount);
  const ranges: { start: number; count: number }[] = [];
  for (let index = 0; index < taskCount; index += 1) {
    const start = Math.floor((elementCount * index) / taskCount);
    const end = Math.floor((elementCount * (index + 1)) / taskCount);
    ranges.push({ start, count: end - start });
  }
  return ranges;
}

function assembleTaskOutputs(results: readonly (readonly Uint8Array[])[], outputByteLength: number): Uint8Array {
  const output = new Uint8Array(outputByteLength);
  let offset = 0;
  for (const result of results) {
    if (result.length !== 1) {
      throw new Error("Field batch task must return exactly one output buffer.");
    }
    output.set(result[0], offset);
    offset += result[0].byteLength;
  }
  if (offset !== outputByteLength) {
    throw new Error(`Field batch output byte length mismatch: expected ${outputByteLength}, received ${offset}.`);
  }
  return output;
}

function assertMatchingFieldBuffers(left: Uint8Array, right: Uint8Array, elementBytes: number, label: string): void {
  assertFieldBuffer(left, elementBytes);
  assertFieldBuffer(right, elementBytes);
  if (left.byteLength !== right.byteLength) {
    throw new Error(`${label} must have equal byte lengths.`);
  }
}

function assertFieldElement(value: Uint8Array, elementBytes: number, label: string): void {
  if (value.byteLength !== elementBytes) {
    throw new Error(`${label} byte length does not match the runtime field.`);
  }
}

function modulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function assertPolynomialBufferShape(
  buffer: Uint8Array,
  xSize: number,
  ySize: number,
  elementBytes: number,
  label: string,
): void {
  assertPositiveSafeInteger(xSize, `${label} polynomial X size`);
  assertPositiveSafeInteger(ySize, `${label} polynomial Y size`);
  assertFieldBuffer(buffer, elementBytes);
  if (buffer.byteLength !== xSize * ySize * elementBytes) {
    throw new Error(`${label} polynomial shape does not match its buffer byte length.`);
  }
}
