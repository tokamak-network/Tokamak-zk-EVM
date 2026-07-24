import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BivariatePolynomialBuffer,
  createCurveRuntime,
  type FieldElement,
  type FieldRuntime,
} from "../../../src/index.js";

interface Options {
  readonly xSize: number;
  readonly ySize: number;
  readonly iterations: number;
  readonly warmup: number;
  readonly jsonPath: string;
}

interface Record {
  readonly operation: string;
  readonly candidate: string;
  readonly ms: number;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const runtime = await createCurveRuntime();

  try {
    const field = runtime.Fr;
    const source = patternedBuffer(field, options.xSize * options.ySize);
    const scalar = field.fromBigInt(3n);
    const xFactor = field.inv(field.rootOfUnity(options.xSize));
    const yFactor = field.inv(field.rootOfUnity(options.ySize));

    const expectedScale = currentScale(field, source, options, scalar);
    const directScale = directUniformScale(field, source, scalar);
    const batchScale = await field.batchApplyKeyBuffer(source, scalar, field.one);
    assertBytesEqual(expectedScale, directScale, "uniform direct-subarray parity");
    assertBytesEqual(expectedScale, batchScale, "uniform batch-key parity");

    const expectedX = currentScaleX(field, source, options, xFactor);
    const directX = directScaleX(field, source, options, xFactor);
    assertBytesEqual(expectedX, directX, "X coefficient rescale parity");

    const expectedY = currentScaleY(field, source, options, yFactor);
    const directY = directScaleY(field, source, options, yFactor);
    const batchY = await field.batchApplyKeyBuffer(source, field.one, yFactor);
    assertBytesEqual(expectedY, directY, "Y coefficient rescale parity");
    assertBytesEqual(expectedY, batchY, "Y batch-key parity");

    const records: Record[] = [
      {
        operation: "scaleAssign",
        candidate: "current-read-write",
        ms: await measure(options, () => Promise.resolve(currentScale(field, source, options, scalar))),
      },
      {
        operation: "scaleAssign",
        candidate: "direct-subarray",
        ms: await measure(options, () => Promise.resolve(directUniformScale(field, source, scalar))),
      },
      {
        operation: "scaleAssign",
        candidate: "public-batch-apply-key",
        ms: await measure(options, () => field.batchApplyKeyBuffer(source, scalar, field.one)),
      },
      {
        operation: "scaleCoeffsXAssign",
        candidate: "current-read-write",
        ms: await measure(options, () => Promise.resolve(currentScaleX(field, source, options, xFactor))),
      },
      {
        operation: "scaleCoeffsXAssign",
        candidate: "direct-subarray",
        ms: await measure(options, () => Promise.resolve(directScaleX(field, source, options, xFactor))),
      },
      {
        operation: "scaleCoeffsYAssign",
        candidate: "current-read-write",
        ms: await measure(options, () => Promise.resolve(currentScaleY(field, source, options, yFactor))),
      },
      {
        operation: "scaleCoeffsYAssign",
        candidate: "direct-subarray",
        ms: await measure(options, () => Promise.resolve(directScaleY(field, source, options, yFactor))),
      },
      {
        operation: "scaleCoeffsYAssign",
        candidate: "public-batch-apply-key-root-cycle",
        ms: await measure(options, () => field.batchApplyKeyBuffer(source, field.one, yFactor)),
      },
    ];

    console.table(records.map((record) => ({
      operation: record.operation,
      candidate: record.candidate,
      "ms/op": record.ms.toFixed(3),
    })));
    await mkdir(path.dirname(options.jsonPath), { recursive: true });
    await writeFile(
      options.jsonPath,
      `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        shape: `${options.xSize}x${options.ySize}`,
        iterations: options.iterations,
        warmup: options.warmup,
        records,
      }, null, 2)}\n`,
    );
    console.log(`Wrote ${path.resolve(options.jsonPath)}`);
  } finally {
    await runtime.terminate();
  }
}

function currentScale(
  field: FieldRuntime,
  source: Uint8Array,
  options: Pick<Options, "xSize" | "ySize">,
  factor: FieldElement,
): Uint8Array {
  const polynomial = BivariatePolynomialBuffer.fromBuffer(field, source, options.xSize, options.ySize);
  polynomial.scaleAssign(factor);
  return polynomial.coefficients;
}

function currentScaleX(
  field: FieldRuntime,
  source: Uint8Array,
  options: Pick<Options, "xSize" | "ySize">,
  factor: FieldElement,
): Uint8Array {
  const polynomial = BivariatePolynomialBuffer.fromBuffer(field, source, options.xSize, options.ySize);
  polynomial.scaleCoeffsXAssign(factor);
  return polynomial.coefficients;
}

function currentScaleY(
  field: FieldRuntime,
  source: Uint8Array,
  options: Pick<Options, "xSize" | "ySize">,
  factor: FieldElement,
): Uint8Array {
  const polynomial = BivariatePolynomialBuffer.fromBuffer(field, source, options.xSize, options.ySize);
  polynomial.scaleCoeffsYAssign(factor);
  return polynomial.coefficients;
}

function directUniformScale(field: FieldRuntime, source: Uint8Array, factor: FieldElement): Uint8Array {
  const output = source.slice();
  const elementBytes = field.byteLength;
  for (let offset = 0; offset < output.byteLength; offset += elementBytes) {
    output.set(field.mul(output.subarray(offset, offset + elementBytes), factor), offset);
  }
  return output;
}

function directScaleX(
  field: FieldRuntime,
  source: Uint8Array,
  options: Pick<Options, "xSize" | "ySize">,
  factor: FieldElement,
): Uint8Array {
  const output = source.slice();
  const elementBytes = field.byteLength;
  const rowBytes = options.ySize * elementBytes;
  let power = field.one;
  for (let x = 0; x < options.xSize; x += 1) {
    const rowEnd = (x + 1) * rowBytes;
    for (let offset = x * rowBytes; offset < rowEnd; offset += elementBytes) {
      output.set(field.mul(output.subarray(offset, offset + elementBytes), power), offset);
    }
    power = field.mul(power, factor);
  }
  return output;
}

function directScaleY(
  field: FieldRuntime,
  source: Uint8Array,
  options: Pick<Options, "xSize" | "ySize">,
  factor: FieldElement,
): Uint8Array {
  const output = source.slice();
  const elementBytes = field.byteLength;
  const powers: FieldElement[] = [];
  let power = field.one;
  for (let y = 0; y < options.ySize; y += 1) {
    powers.push(power);
    power = field.mul(power, factor);
  }
  for (let x = 0; x < options.xSize; x += 1) {
    const rowOffset = x * options.ySize * elementBytes;
    for (let y = 0; y < options.ySize; y += 1) {
      const offset = rowOffset + y * elementBytes;
      output.set(field.mul(output.subarray(offset, offset + elementBytes), powers[y]), offset);
    }
  }
  return output;
}

function patternedBuffer(field: FieldRuntime, elementCount: number): Uint8Array {
  const values = Array.from({ length: 251 }, (_, index) => field.fromBigInt(BigInt(index + 1)));
  const output = new Uint8Array(elementCount * field.byteLength);
  for (let index = 0; index < elementCount; index += 1) {
    output.set(values[index % values.length], index * field.byteLength);
  }
  return output;
}

async function measure(options: Options, callback: () => Promise<Uint8Array>): Promise<number> {
  for (let index = 0; index < options.warmup; index += 1) {
    await callback();
  }
  const start = performance.now();
  for (let index = 0; index < options.iterations; index += 1) {
    await callback();
  }
  return (performance.now() - start) / options.iterations;
}

function assertBytesEqual(actual: Uint8Array, expected: Uint8Array, label: string): void {
  if (actual.byteLength !== expected.byteLength) {
    throw new Error(`${label}: byte length mismatch.`);
  }
  for (let index = 0; index < actual.byteLength; index += 1) {
    if (actual[index] !== expected[index]) {
      throw new Error(`${label}: mismatch at byte ${index}.`);
    }
  }
}

function parseOptions(args: readonly string[]): Options {
  const values = new Map<string, string>();
  for (const argument of args) {
    if (!argument.startsWith("--") || !argument.includes("=")) {
      throw new Error(`Expected --key=value argument, received '${argument}'.`);
    }
    const [key, value] = argument.slice(2).split("=", 2);
    values.set(key, value);
  }
  const shape = parseShape(values.get("shape") ?? "4096x256");
  return {
    ...shape,
    iterations: parsePositiveInteger(values.get("iterations") ?? "1", "iterations"),
    warmup: parseNonNegativeInteger(values.get("warmup") ?? "0", "warmup"),
    jsonPath: values.get("json") ?? "tmp/timing/coefficient-rescale.json",
  };
}

function parseShape(raw: string): { readonly xSize: number; readonly ySize: number } {
  const match = /^(\d+)x(\d+)$/.exec(raw);
  if (match === null) {
    throw new Error(`Invalid shape '${raw}'.`);
  }
  return {
    xSize: parsePowerOfTwo(match[1], "xSize"),
    ySize: parsePowerOfTwo(match[2], "ySize"),
  };
}

function parsePowerOfTwo(raw: string, label: string): number {
  const value = parsePositiveInteger(raw, label);
  if ((value & (value - 1)) !== 0) {
    throw new Error(`${label} must be a power of two.`);
  }
  return value;
}

function parsePositiveInteger(raw: string, label: string): number {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function parseNonNegativeInteger(raw: string, label: string): number {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
}

await main();
