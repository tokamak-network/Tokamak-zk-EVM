import type { FfField } from "./curve.js";

export type FieldElement = Uint8Array;

export interface FieldRuntime {
  readonly byteLength: number;
  readonly modulus: bigint;
  readonly zero: FieldElement;
  readonly one: FieldElement;
  fromBigInt(value: bigint): FieldElement;
  fromHex(value: string): FieldElement;
  toBigInt(value: FieldElement): bigint;
  toHex(value: FieldElement): string;
  toRawLittleEndian(value: FieldElement): Uint8Array;
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
