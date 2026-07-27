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

export function assertInField(value: bigint, modulus: bigint): void {
  if (value < 0n || value >= modulus) {
    throw new Error("Field value is outside the scalar field modulus.");
  }
}
