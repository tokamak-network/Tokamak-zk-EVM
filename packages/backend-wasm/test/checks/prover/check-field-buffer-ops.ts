import { fileURLToPath } from "node:url";

import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import type { FieldElement, FieldRuntime } from "../../../src/runtime/field/field-runtime.js";
import { assertJsonEqual as assertEqual } from "../../support/assertions.js";
import { assertBytesEqual, concatBytes } from "../../support/bytes.js";

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

  assertBytesEqual(field.zero, new Uint8Array(field.byteLength), "field zero byte representation");
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
  assertBytesEqual(zeros, new Uint8Array(3 * field.byteLength), "createZeroBuffer raw bytes");
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

  const otherValues = [13n, 17n, 19n, 23n].map((value) => field.fromBigInt(value));
  const otherBuffer = field.concat(otherValues);
  assertFields(
    field,
    field.split(await field.batchAddBuffer(buffer, otherBuffer)),
    values.map((value, index) => field.add(value, otherValues[index])),
    "batchAddBuffer",
  );
  assertFields(
    field,
    field.split(await field.batchSubBuffer(buffer, otherBuffer)),
    values.map((value, index) => field.sub(value, otherValues[index])),
    "batchSubBuffer",
  );
  assertFields(
    field,
    field.split(await field.batchMulBuffer(buffer, otherBuffer)),
    values.map((value, index) => field.mul(value, otherValues[index])),
    "batchMulBuffer",
  );
  assertFields(
    field,
    field.split(await field.batchMulShiftedBuffer(buffer, otherBuffer, 2, 2, -1, -1)),
    [
      field.mul(values[3], otherValues[0]),
      field.mul(values[2], otherValues[1]),
      field.mul(values[1], otherValues[2]),
      field.mul(values[0], otherValues[3]),
    ],
    "batchMulShiftedBuffer",
  );
  assertFields(
    field,
    field.split(await field.batchScaleBuffer(buffer, firstKey)),
    values.map((value) => field.mul(value, firstKey)),
    "batchScaleBuffer",
  );
  assertFields(
    field,
    field.split(await field.batchAddScaledBuffer(buffer, otherBuffer, firstKey)),
    values.map((value, index) => field.add(value, field.mul(otherValues[index], firstKey))),
    "batchAddScaledBuffer",
  );

  const prefixSource = field.concat(otherValues.slice(0, 2));
  const prefixResult = await field.batchAddScaledPrefixBuffer(buffer, 2, 2, prefixSource, 2, 1, firstKey);
  assertFields(
    field,
    field.split(prefixResult),
    [
      field.add(values[0], field.mul(otherValues[0], firstKey)),
      values[1],
      field.add(values[2], field.mul(otherValues[1], firstKey)),
      values[3],
    ],
    "batchAddScaledPrefixBuffer",
  );
  assertFields(
    field,
    field.split(await field.batchScaleCoeffsXBuffer(buffer, 2, 2, firstKey)),
    [values[0], values[1], field.mul(values[2], firstKey), field.mul(values[3], firstKey)],
    "batchScaleCoeffsXBuffer",
  );
  assertFields(
    field,
    field.split(await field.batchScaleCoeffsYBuffer(buffer, 2, 2, firstKey)),
    [values[0], field.mul(values[1], firstKey), values[2], field.mul(values[3], firstKey)],
    "batchScaleCoeffsYBuffer",
  );

  const raw = await field.batchFromMontgomeryBuffer(buffer);
  assertBytesEqual(raw, concatBytes(values.map((value) => field.toRawLittleEndian(value))), "batchFromMontgomeryBuffer");

  const inverses = await field.batchInverseBuffer(buffer);
  assertFields(
    field,
    field.split(inverses),
    values.map((value) => field.inv(value)),
    "batchInverseBuffer",
  );
}

function assertFields(
  field: FieldRuntime,
  actual: readonly FieldElement[],
  expected: readonly FieldElement[],
  label: string,
): void {
  assertEqual(actual.map((value) => field.toHex(value)), expected.map((value) => field.toHex(value)), label);
}

const entrypoint = fileURLToPath(import.meta.url);

if (process.argv[1] === entrypoint) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Field buffer operation check failed: ${message}`);
    process.exitCode = 1;
  });
}
