import type { FfField } from "../curve/curve.js";

export type FieldElement = Uint8Array;

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
  batchFromMontgomeryBuffer(buffer: Uint8Array): Promise<Uint8Array>;
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
      const output = new Uint8Array(elementCount * field.n8);
      for (let index = 0; index < elementCount; index += 1) {
        output.set(field.zero, index * field.n8);
      }
      return output;
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
    async batchFromMontgomeryBuffer(buffer) {
      assertFieldBuffer(buffer, field.n8);
      return await field.batchFromMontgomery(buffer);
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
