import type { FfField, FfWorkerCommand } from "../curve/curve.js";
import {
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
  requireTaskOutputs,
  splitFieldBuffer,
  splitRanges,
} from "./buffer-utils.js";
import { assertInField, formatHex, parseCanonicalHex } from "./field-encoding.js";
import type { FieldRuntime } from "./field-types.js";
import {
  FIELD_BATCH_ADD,
  FIELD_BATCH_ADD_SCALED,
  FIELD_BATCH_SCALE_X,
  FIELD_BATCH_MUL,
  FIELD_BATCH_SUB,
  FIELD_SPARSE_ROW_DOT,
  FIELD_SELECTION_ACCUMULATE,
  FIELD_ORDERED_RECURRENCE,
  FIELD_COPY_OPERANDS,
  FIELD_UNIVARIATE_VANISHING,
  FIELD_PRODUCT_DIFFERENCE,
  FIELD_SHORT_CONVOLUTION,
  FIELD_RUFFINI_Y,
} from "./kernel-names.js";
import {
  assertLinearBatchExports,
  batchBinaryBuffer,
  batchFftBuffer,
  buildEvalReduceTask,
  buildRuffiniYTask,
  evaluateRows,
} from "./tasks/field-tasks.js";

export type { FieldElement, FieldRuntime } from "./field-types.js";
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
    async batchProductDifferenceBuffer(a, b, c, d) {
      for (const other of [b, c, d]) assertMatchingFieldBuffers(a, other, field.n8, "Product difference");
      const results = await Promise.all(splitRanges(a.byteLength / field.n8, field.tm.concurrency).map(({ start, count }) => {
        const from = start * field.n8, end = (start + count) * field.n8, bytes = count * field.n8;
        return field.tm.queueAction([
          { cmd: "ALLOCSET", var: 0, buff: a.slice(from, end) },
          { cmd: "ALLOCSET", var: 1, buff: b.slice(from, end) },
          { cmd: "ALLOCSET", var: 2, buff: c.slice(from, end) },
          { cmd: "ALLOCSET", var: 3, buff: d.slice(from, end) },
          { cmd: "ALLOC", var: 4, len: bytes },
          { cmd: "CALL", fnName: FIELD_PRODUCT_DIFFERENCE, params: [{ var: 0 }, { var: 1 }, { var: 2 }, { var: 3 }, { val: count }, { var: 4 }] },
          { cmd: "GET", out: 0, var: 4, len: bytes },
        ]);
      }));
      return assembleTaskOutputs(results, a.byteLength);
    },
    async shortConvolutionBuffer(long, short) {
      assertFieldBuffer(long, field.n8); assertFieldBuffer(short, field.n8);
      const n = long.byteLength / field.n8, width = short.byteLength / field.n8;
      if (n < 1 || width < 1 || width > 4) throw new Error("Short convolution requires a nonempty polynomial and one to four mask coefficients.");
      const length = n + width - 1;
      const results = await Promise.all(splitRanges(length, field.tm.concurrency).map(({ start, count }) => {
        const first = start - width + 1, from = Math.max(0, first), end = Math.min(n, start + count);
        const halo = new Uint8Array((count + width - 1) * field.n8);
        halo.set(long.subarray(from * field.n8, end * field.n8), (from - first) * field.n8);
        return field.tm.queueAction([
          { cmd: "ALLOCSET", var: 0, buff: halo },
          { cmd: "ALLOCSET", var: 1, buff: short },
          { cmd: "ALLOC", var: 2, len: count * field.n8 },
          { cmd: "CALL", fnName: FIELD_SHORT_CONVOLUTION, params: [{ var: 0 }, { var: 1 }, { val: width }, { val: count }, { var: 2 }] },
          { cmd: "GET", out: 0, var: 2, len: count * field.n8 },
        ]);
      }));
      return assembleTaskOutputs(results, length * field.n8);
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
    async batchScaleBuffer(buffer, factor) {
      assertFieldBuffer(buffer, field.n8);
      assertFieldElement(factor, field.n8, "Scale factor");
      return await field.batchApplyKey(buffer, factor, field.one);
    },
    async divideUnivariateVanishingBuffer(coefficients, domainSize) {
      assertFieldBuffer(coefficients, field.n8);
      assertPositiveSafeInteger(domainSize, "Vanishing domain size");
      const count = coefficients.length / field.n8;
      if (count <= domainSize) throw new Error("Vanishing division requires degree at least the domain size.");
      const quotientBytes = (count - domainSize) * field.n8;
      const outputs = requireTaskOutputs(await field.tm.queueAction([
        { cmd: "ALLOCSET", var: 0, buff: coefficients },
        { cmd: "ALLOC", var: 1, len: quotientBytes },
        { cmd: "CALL", fnName: FIELD_UNIVARIATE_VANISHING, params: [{ var: 0 }, { val: count }, { val: domainSize }, { var: 1 }] },
        { cmd: "GET", out: 0, var: 1, len: quotientBytes },
        { cmd: "GET", out: 1, var: 0, len: domainSize * field.n8 },
      ]), 2, "Univariate vanishing division");
      return { quotient: outputs[0], remainder: outputs[1] };
    },
    async copyOperandsBuffer(b, sc, root, beta, gamma) {
      assertMatchingFieldBuffers(b, sc, field.n8, "Copy operands");
      for (const value of [root, beta, gamma]) assertFieldElement(value, field.n8, "Copy operand scalar");
      const length = b.byteLength / field.n8;
      assertPositiveSafeInteger(length, "Copy operand length");
      const ranges = splitRanges(length, field.tm.concurrency);
      const results = await Promise.all(ranges.map(({ start, count }) => {
        const bytes = count * field.n8;
        return field.tm.queueAction([
          { cmd: "ALLOCSET", var: 0, buff: b.slice(start * field.n8, (start + count) * field.n8) },
          { cmd: "ALLOCSET", var: 1, buff: sc.slice(start * field.n8, (start + count) * field.n8) },
          { cmd: "ALLOCSET", var: 2, buff: beta },
          { cmd: "ALLOCSET", var: 3, buff: gamma },
          { cmd: "ALLOCSET", var: 4, buff: field.mul(beta, field.exp(root, BigInt(start))) },
          { cmd: "ALLOCSET", var: 5, buff: root },
          { cmd: "ALLOC", var: 6, len: bytes },
          { cmd: "ALLOC", var: 7, len: bytes },
          { cmd: "CALL", fnName: FIELD_COPY_OPERANDS, params: [{ var: 0 }, { var: 1 }, { var: 2 }, { var: 3 }, { var: 4 }, { var: 5 }, { val: count }, { var: 6 }, { var: 7 }] },
          { cmd: "GET", out: 0, var: 6, len: bytes },
          { cmd: "GET", out: 1, var: 7, len: bytes },
        ]);
      }));
      const numerators = new Uint8Array(b.byteLength), denominators = new Uint8Array(b.byteLength);
      for (let i = 0; i < ranges.length; i++) {
        const out = requireTaskOutputs(results[i], 2, "Copy operands");
        numerators.set(out[0], ranges[i].start * field.n8);
        denominators.set(out[1], ranges[i].start * field.n8);
      }
      return { numerators, denominators };
    },
    async orderedRecurrenceBuffer(numerators, inverseDenominators) {
      assertMatchingFieldBuffers(numerators, inverseDenominators, field.n8, "Ordered recurrence");
      const count = numerators.byteLength / field.n8;
      assertPositiveSafeInteger(count, "Ordered recurrence length");
      const outputs = await field.tm.queueAction([
        { cmd: "ALLOCSET", var: 0, buff: numerators },
        { cmd: "ALLOCSET", var: 1, buff: inverseDenominators },
        { cmd: "ALLOCSET", var: 2, buff: field.one },
        { cmd: "ALLOC", var: 3, len: numerators.byteLength },
        { cmd: "CALL", fnName: FIELD_ORDERED_RECURRENCE, params: [{ var: 0 }, { var: 1 }, { val: count }, { var: 2 }, { var: 3 }] },
        { cmd: "GET", out: 0, var: 3, len: numerators.byteLength },
      ]);
      return requireTaskOutputs(outputs, 1, "Ordered recurrence")[0];
    },
    async selectionCofactorsBuffer(polynomial, roots, inverse) {
      assertFieldBuffer(roots, field.n8);
      const width = roots.byteLength / field.n8;
      assertPositiveSafeInteger(width, "Selection cofactor width");
      assertPolynomialBufferShape(polynomial, 1, width + 1, field.n8, "Selection polynomial");
      assertFieldElement(inverse, field.n8, "Selection normalization");
      const rowBytes = width * field.n8;
      const results = await Promise.all(splitRanges(width, field.tm.concurrency).map(({ start, count }) => {
        const task: FfWorkerCommand[] = [
          { cmd: "ALLOCSET", var: 0, buff: polynomial },
          { cmd: "ALLOCSET", var: 1, buff: field.one },
          { cmd: "ALLOC", var: 2, len: rowBytes },
          { cmd: "ALLOC", var: 3, len: field.n8 },
        ];
        for (let i = 0; i < count; i++) {
          const root = roots.slice((start + i) * field.n8, (start + i + 1) * field.n8);
          task.push(
            { cmd: "ALLOCSET", var: 4, buff: root },
            { cmd: "ALLOCSET", var: 5, buff: field.mul(root, inverse) },
            { cmd: "CALL", fnName: FIELD_RUFFINI_Y, params: [{ var: 0 }, { val: width + 1 }, { var: 4 }, { var: 2 }, { var: 3 }] },
            { cmd: "CALL", fnName: FIELD_BATCH_SCALE_X, params: [{ var: 2 }, { var: 1 }, { var: 5 }, { val: 1 }, { val: width }, { var: 2 }] },
            { cmd: "GET", out: i, var: 2, len: rowBytes },
          );
        }
        return field.tm.queueAction(task);
      }));
      const packed = new Uint8Array(width * rowBytes);
      let offset = 0;
      for (const rows of results) for (const row of rows) { packed.set(row, offset); offset += rowBytes; }
      return packed;
    },
    async selectionAccumulateBuffer(values, cofactors, width) {
      assertPositiveSafeInteger(width, "Selection row width");
      assertFieldBuffer(values, field.n8);
      assertPolynomialBufferShape(cofactors, width, width, field.n8, "Selection cofactors");
      const rowBytes = width * field.n8;
      if (values.byteLength % rowBytes !== 0) throw new Error("Incomplete selection witness row.");
      const results = await Promise.all(splitRanges(values.byteLength / rowBytes, field.tm.concurrency).map(({ start, count }) => {
        const bytes = count * rowBytes;
        return field.tm.queueAction([
          { cmd: "ALLOCSET", var: 0, buff: values.slice(start * rowBytes, (start + count) * rowBytes) },
          { cmd: "ALLOCSET", var: 1, buff: cofactors },
          { cmd: "ALLOCSET", var: 2, buff: new Uint8Array(bytes) },
          { cmd: "CALL", fnName: FIELD_SELECTION_ACCUMULATE, params: [{ var: 0 }, { var: 1 }, { val: count }, { val: width }, { var: 2 }] },
          { cmd: "GET", out: 0, var: 2, len: bytes },
        ]);
      }));
      return assembleTaskOutputs(results, values.byteLength);
    },
    async linearCombinationBuffer(terms) {
      let length = 1;
      for (const [source, factor] of terms) {
        assertFieldBuffer(source, field.n8);
        assertFieldElement(factor, field.n8, "Linear combination factor");
        length = Math.max(length, source.byteLength / field.n8);
      }
      const active = terms.filter(([, factor]) => !field.isZero(factor));
      if (active.length === 0) return new Uint8Array(length * field.n8);
      const results = await Promise.all(splitRanges(length, field.tm.concurrency).map(({ start, count }) => {
        // Retain each range's accumulator inside one existing-worker task.
        // Short sources leave the remaining accumulator coefficients untouched.
        const task: FfWorkerCommand[] = [{ cmd: "ALLOCSET", var: 0, buff: new Uint8Array(count * field.n8) }];
        for (const [source, factor] of active) {
          const available = Math.min(count, source.byteLength / field.n8 - start);
          if (available <= 0) continue;
          task.push(
            { cmd: "ALLOCSET", var: 1, buff: source.slice(start * field.n8, (start + available) * field.n8) },
            { cmd: "ALLOCSET", var: 2, buff: factor },
            { cmd: "CALL", fnName: FIELD_BATCH_ADD_SCALED, params: [{ var: 0 }, { var: 1 }, { var: 2 }, { val: available }, { var: 0 }] },
          );
        }
        task.push({ cmd: "GET", out: 0, var: 0, len: count * field.n8 });
        return field.tm.queueAction(task);
      }));
      return assembleTaskOutputs(results, length * field.n8);
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
    async batchFromMontgomeryBuffer(buffer) {
      assertFieldBuffer(buffer, field.n8);
      return await field.batchFromMontgomery(buffer);
    },
    async batchInverseBuffer(buffer) {
      assertFieldBuffer(buffer, field.n8);
      return await field.batchInverse(buffer);
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
