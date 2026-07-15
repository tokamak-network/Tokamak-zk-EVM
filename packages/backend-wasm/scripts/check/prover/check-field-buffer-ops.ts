import { fileURLToPath } from "node:url";

import { createCurveRuntime } from "../../../src/index.js";
import type { FieldElement, FieldRuntime } from "../../../src/index.js";

async function main(): Promise<void> {
  const runtime = await createCurveRuntime();
  try {
    await checkFieldBufferOps(runtime.Fr);
  } finally {
    await runtime.terminate();
  }

  console.log("Checked field buffer operation parity");
}

async function checkFieldBufferOps(field: FieldRuntime): Promise<void> {
  const values = [3n, 5n, 7n, 11n].map((value) => field.fromBigInt(value));
  const buffer = field.concat(values);

  assertEqual(field.bufferElementCount(buffer), values.length, "buffer element count");
  assertFields(field, field.split(buffer), values, "split");
  assertFields(
    field,
    Array.from({ length: values.length }, (_, index) => field.readBufferElement(buffer, index)),
    values,
    "readBufferElement",
  );

  const cloned = field.cloneBuffer(buffer);
  field.writeBufferElement(cloned, 1, field.fromBigInt(13n));
  assertFields(field, field.split(buffer), values, "cloneBuffer must not alias the source");
  assertFields(
    field,
    field.split(cloned),
    [field.fromBigInt(3n), field.fromBigInt(13n), field.fromBigInt(7n), field.fromBigInt(11n)],
    "writeBufferElement",
  );

  const zeros = field.createZeroBuffer(3);
  assertFields(field, field.split(zeros), [field.zero, field.zero, field.zero], "createZeroBuffer");

  const fftBuffer = await field.fftBuffer(buffer);
  const fftElements = await field.fft(values);
  assertBytesEqual(fftBuffer, field.concat(fftElements), "fftBuffer");
  const ifftBuffer = await field.ifftBuffer(fftBuffer);
  assertBytesEqual(ifftBuffer, buffer, "ifftBuffer");

  const firstKey = field.fromBigInt(17n);
  const keyIncrement = field.fromBigInt(19n);
  const keyed = await field.batchApplyKeyBuffer(buffer, firstKey, keyIncrement);
  const expectedKeyed: FieldElement[] = [];
  let key = firstKey;
  for (const value of values) {
    expectedKeyed.push(field.mul(value, key));
    key = field.mul(key, keyIncrement);
  }
  assertFields(field, field.split(keyed), expectedKeyed, "batchApplyKeyBuffer");

  const raw = await field.batchFromMontgomeryBuffer(buffer);
  assertBytesEqual(raw, concatBytes(values.map((value) => field.toRawLittleEndian(value))), "batchFromMontgomeryBuffer");
}

function assertFields(
  field: FieldRuntime,
  actual: readonly FieldElement[],
  expected: readonly FieldElement[],
  label: string,
): void {
  assertEqual(actual.map((value) => field.toHex(value)), expected.map((value) => field.toHex(value)), label);
}

function assertBytesEqual(actual: Uint8Array, expected: Uint8Array, label: string): void {
  assertEqual(Array.from(actual), Array.from(expected), label);
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

const entrypoint = fileURLToPath(import.meta.url);

if (process.argv[1] === entrypoint) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Field buffer operation check failed: ${message}`);
    process.exitCode = 1;
  });
}
