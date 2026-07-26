import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";

import {
  BivariatePolynomialBuffer,
  createCurveRuntime,
  type BivariateBufferVanishingQuotientResult,
  type CurveRuntime,
} from "../../../src/index.js";

interface Case {
  readonly xSize: number;
  readonly ySize: number;
  readonly xDegree: number;
  readonly yDegree: number;
}

interface Options {
  readonly cases: readonly Case[];
  readonly iterations: number;
  readonly warmup: number;
  readonly jsonPath: string;
}

const CANDIDATES = [
  {
    name: "current-production",
    run: async (
      polynomial: BivariatePolynomialBuffer,
      xDegree: number,
      yDegree: number,
    ) => await polynomial.divByVanishingOptBatch(xDegree, yDegree),
  },
  {
    name: "scalar-js-baseline",
    run: async (
      polynomial: BivariatePolynomialBuffer,
      xDegree: number,
      yDegree: number,
    ) => polynomial.divByVanishingOpt(xDegree, yDegree),
  },
] as const;

let sink = 0;

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const runtime = await createCurveRuntime();
  try {
    const records = [];
    for (const testCase of options.cases) {
      const polynomial = buildDivisibleNumerator(runtime, testCase);
      const expected = await CANDIDATES[0].run(polynomial, testCase.xDegree, testCase.yDegree);
      for (const candidate of CANDIDATES.slice(1)) {
        assertEqual(
          await candidate.run(polynomial, testCase.xDegree, testCase.yDegree),
          expected,
          `${formatCase(testCase)} ${candidate.name}`,
        );
      }
      const samples = new Map(CANDIDATES.map((candidate) => [candidate.name, [] as number[]]));
      for (let iteration = 0; iteration < options.warmup; iteration += 1) {
        for (const candidate of CANDIDATES) {
          consume(await candidate.run(polynomial, testCase.xDegree, testCase.yDegree));
        }
      }
      for (let iteration = 0; iteration < options.iterations; iteration += 1) {
        const ordered = iteration % 2 === 0 ? CANDIDATES : [...CANDIDATES].reverse();
        for (const candidate of ordered) {
          const start = performance.now();
          consume(await candidate.run(polynomial, testCase.xDegree, testCase.yDegree));
          samples.get(candidate.name)!.push(performance.now() - start);
        }
      }
      for (const candidate of CANDIDATES) {
        const values = samples.get(candidate.name)!.slice().sort((a, b) => a - b);
        records.push({
          candidate: candidate.name,
          case: formatCase(testCase),
          medianMs: median(values),
          minMs: values[0],
          maxMs: values[values.length - 1],
          samplesMs: samples.get(candidate.name),
          inputBytes: testCase.xSize * testCase.ySize * runtime.Fr.byteLength,
          temporaryBytes: candidate.name === "current-production"
            ? vanishingTemporaryBytes(
                testCase.xSize,
                testCase.ySize,
                testCase.xDegree,
                runtime.Fr.byteLength,
              )
            : 0,
        });
      }
    }
    console.table(records.map((record) => ({
      candidate: record.candidate,
      case: record.case,
      "median ms": record.medianMs.toFixed(3),
      "min ms": record.minMs.toFixed(3),
      "max ms": record.maxMs.toFixed(3),
      "temporary MiB": (record.temporaryBytes / (1024 ** 2)).toFixed(3),
    })));
    await mkdir(path.dirname(path.resolve(options.jsonPath)), { recursive: true });
    await writeFile(path.resolve(options.jsonPath), `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      options,
      records,
    }, null, 2)}\n`);
    console.log(`Wrote ${path.resolve(options.jsonPath)}`);
  } finally {
    await runtime.terminate();
  }
}

function buildDivisibleNumerator(
  runtime: CurveRuntime,
  testCase: Case,
): BivariatePolynomialBuffer {
  const field = runtime.Fr;
  const coefficients = field.createZeroBuffer(testCase.xSize * testCase.ySize);
  const pattern = Array.from({ length: 256 }, (_, index) =>
    field.fromBigInt(BigInt((index * 65537 + 19) % 1000003)));
  for (let x = 0; x < testCase.xSize - testCase.xDegree; x += 1) {
    for (let y = 0; y < testCase.ySize; y += 1) {
      const value = pattern[(x + y) % pattern.length];
      field.writeBufferElement(coefficients, x * testCase.ySize + y, field.neg(value));
      field.writeBufferElement(
        coefficients,
        (x + testCase.xDegree) * testCase.ySize + y,
        value,
      );
    }
  }
  for (let x = 0; x < testCase.xDegree; x += 1) {
    for (let y = 0; y < testCase.ySize - testCase.yDegree; y += 1) {
      const value = pattern[(x * 3 + y * 5 + 1) % pattern.length];
      const lowIndex = x * testCase.ySize + y;
      const highIndex = x * testCase.ySize + y + testCase.yDegree;
      field.writeBufferElement(
        coefficients,
        lowIndex,
        field.sub(field.readBufferElement(coefficients, lowIndex), value),
      );
      field.writeBufferElement(
        coefficients,
        highIndex,
        field.add(field.readBufferElement(coefficients, highIndex), value),
      );
    }
  }
  return BivariatePolynomialBuffer.fromOwnedBuffer(
    field,
    coefficients,
    testCase.xSize,
    testCase.ySize,
  );
}

function vanishingTemporaryBytes(
  xSize: number,
  ySize: number,
  xDegree: number,
  elementBytes: number,
): number {
  const input = xSize * ySize * elementBytes;
  const quotientX = input;
  const quotientY = xDegree * ySize * elementBytes;
  return input * 3 + quotientX * 2 + quotientY * 3;
}

function assertEqual(
  actual: BivariateBufferVanishingQuotientResult,
  expected: BivariateBufferVanishingQuotientResult,
  label: string,
): void {
  if (
    !bytesEqual(actual.quotientX.coefficients, expected.quotientX.coefficients)
    || !bytesEqual(actual.quotientY.coefficients, expected.quotientY.coefficients)
  ) {
    throw new Error(`${label}: quotient byte mismatch.`);
  }
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

function consume(result: BivariateBufferVanishingQuotientResult): void {
  sink ^= result.quotientX.coefficients[0] ?? 0;
  sink ^= result.quotientY.coefficients[0] ?? 0;
}

function parseOptions(args: readonly string[]): Options {
  const values = new Map<string, string>();
  for (const argument of args) {
    const match = /^--([a-zA-Z-]+)=(.+)$/.exec(argument);
    if (match === null) {
      throw new Error(`Unknown argument '${argument}'.`);
    }
    values.set(match[1], match[2]);
  }
  return {
    cases: parseCases(values.get("cases") ?? "8x8:4x4,16x8:4x4"),
    iterations: parsePositive(values.get("iterations") ?? "3", "iterations"),
    warmup: parseNonNegative(values.get("warmup") ?? "1", "warmup"),
    jsonPath: values.get("json") ?? "tmp/timing/vanishing-division.json",
  };
}

function parseCases(value: string): Case[] {
  return value.split(",").map((entry) => {
    const match = /^([0-9]+)x([0-9]+):([0-9]+)x([0-9]+)$/.exec(entry.trim());
    if (match === null) {
      throw new Error(`Invalid case '${entry}'. Expected <xSize>x<ySize>:<xDegree>x<yDegree>.`);
    }
    return {
      xSize: parsePositive(match[1], "xSize"),
      ySize: parsePositive(match[2], "ySize"),
      xDegree: parsePositive(match[3], "xDegree"),
      yDegree: parsePositive(match[4], "yDegree"),
    };
  });
}

function parsePositive(value: string, label: string): number {
  const parsed = parseNonNegative(value, label);
  if (parsed === 0) {
    throw new Error(`${label} must be positive.`);
  }
  return parsed;
}

function parseNonNegative(value: string, label: string): number {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${label} exceeds the safe integer range.`);
  }
  return parsed;
}

function formatCase(testCase: Case): string {
  return `${testCase.xSize}x${testCase.ySize}:${testCase.xDegree}x${testCase.yDegree}`;
}

function median(values: readonly number[]): number {
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? (values[middle - 1] + values[middle]) / 2
    : values[middle];
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
