import type { FfField } from "../curve/curve.js";
import {
  assemblePolynomialColumns,
  assembleTaskOutputs,
  assertBufferIndex,
  assertFieldBuffer,
  assertFieldElement,
  assertMatchingFieldBuffers,
  assertNonNegativeSafeInteger,
  assertPolynomialBufferShape,
  assertPositiveSafeInteger,
  checkedPowerOfTwoLog,
  concatFieldElements,
  extractPolynomialBlockRows,
  extractPolynomialColumns,
  modulo,
  requireTaskOutputs,
  splitFieldBuffer,
  splitRanges,
} from "./buffer-utils.js";
import { assertInField, formatHex, parseCanonicalHex } from "./field-encoding.js";
import type { FieldRuntime } from "./field-types.js";
import {
  FIELD_BATCH_ADD,
  FIELD_BATCH_ADD_SCALED,
  FIELD_BATCH_ADD_SCALED_PREFIX,
  FIELD_BATCH_MUL,
  FIELD_BATCH_SCALE_X,
  FIELD_BATCH_SCALE_Y,
  FIELD_BATCH_SUB,
  FIELD_FUSED_LINEAR_X,
  FIELD_FUSED_LINEAR_Y,
  FIELD_RECURSION_RECURRENCE,
  FIELD_SPARSE_ROW_DOT,
} from "./kernel-names.js";
import {
  assertLinearBatchExports,
  batchBinaryBuffer,
  batchFftBuffer,
  buildEvalReduceFusedTask,
  buildEvalReduceTask,
  buildFusedLinearTask,
  buildK0Task,
  buildKlXTask,
  buildKlYTask,
  buildRuffiniXTask,
  buildRuffiniYTask,
  buildShiftedMultiplyTask,
  buildSpecialPolynomialTask,
  buildVanishingXTask,
  buildVanishingYTask,
  evaluateRows,
  evaluateRowsFused,
  specialPolynomialFunctionName,
} from "./tasks/field-tasks.js";

export type { FieldElement, FieldRuntime, SpecialPolynomialOperation } from "./field-types.js";
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
