import type { FieldElement } from "./field-types.js";

export interface BufferRange {
  readonly start: number;
  readonly count: number;
}

export function assertFieldBuffer(buffer: Uint8Array, byteLength: number): void {
  if (buffer.byteLength % byteLength !== 0) {
    throw new Error("Field buffer byte length is not divisible by the runtime field width.");
  }
}

export function assertBufferIndex(index: number, elementCount: number): void {
  if (!Number.isSafeInteger(index) || index < 0 || index >= elementCount) {
    throw new Error("Field buffer index is out of bounds.");
  }
}

export function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
}

export function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
}

export function checkedPowerOfTwoLog(size: number): number {
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

export function concatFieldElements(values: readonly FieldElement[], byteLength: number): Uint8Array {
  const output = new Uint8Array(values.length * byteLength);
  for (let index = 0; index < values.length; index += 1) {
    if (values[index].byteLength !== byteLength) {
      throw new Error("Field element byte length does not match the runtime field.");
    }

    output.set(values[index], index * byteLength);
  }

  return output;
}

export function splitFieldBuffer(buffer: Uint8Array, byteLength: number): FieldElement[] {
  assertFieldBuffer(buffer, byteLength);

  const values: FieldElement[] = [];
  for (let offset = 0; offset < buffer.byteLength; offset += byteLength) {
    values.push(buffer.slice(offset, offset + byteLength));
  }

  return values;
}

export function requireTaskOutputs(
  result: readonly Uint8Array[],
  expectedCount: number,
  label: string,
): readonly Uint8Array[] {
  if (result.length !== expectedCount) {
    throw new Error(`${label} task returned ${result.length} outputs; expected ${expectedCount}.`);
  }
  return result;
}

export function splitRanges(elementCount: number, requestedTaskCount: number): readonly BufferRange[] {
  assertNonNegativeSafeInteger(elementCount, "Batch element count");
  assertPositiveSafeInteger(requestedTaskCount, "Batch task count");
  if (elementCount === 0) {
    return [];
  }

  const taskCount = Math.min(elementCount, requestedTaskCount);
  const ranges: BufferRange[] = [];
  for (let index = 0; index < taskCount; index += 1) {
    const start = Math.floor((elementCount * index) / taskCount);
    const end = Math.floor((elementCount * (index + 1)) / taskCount);
    ranges.push({ start, count: end - start });
  }
  return ranges;
}

export function assembleTaskOutputs(
  results: readonly (readonly Uint8Array[])[],
  outputByteLength: number,
): Uint8Array {
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

export function assertMatchingFieldBuffers(
  left: Uint8Array,
  right: Uint8Array,
  elementBytes: number,
  label: string,
): void {
  assertFieldBuffer(left, elementBytes);
  assertFieldBuffer(right, elementBytes);
  if (left.byteLength !== right.byteLength) {
    throw new Error(`${label} must have equal byte lengths.`);
  }
}

export function assertFieldElement(value: Uint8Array, elementBytes: number, label: string): void {
  if (value.byteLength !== elementBytes) {
    throw new Error(`${label} byte length does not match the runtime field.`);
  }
}

export function assertPolynomialBufferShape(
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
