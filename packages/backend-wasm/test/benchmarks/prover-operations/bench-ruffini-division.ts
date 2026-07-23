import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";

import {
  BivariatePolynomialBuffer,
  createCurveRuntime,
  type BivariateBufferRuffiniDivisionResult,
  type FieldElement,
  type FieldRuntime,
} from "../../../src/index.js";

interface Shape {
  readonly xSize: number;
  readonly ySize: number;
}

interface BenchmarkOptions {
  readonly seed: bigint;
  readonly shapes: readonly Shape[];
  readonly iterations: number;
  readonly warmup: number;
  readonly jsonPath: string;
}

interface TimingSummary {
  readonly medianMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly samplesMs: readonly number[];
}

interface BenchmarkRecord extends TimingSummary {
  readonly candidate: string;
  readonly shape: string;
  readonly inputBytes: number;
  readonly outputBytes: number;
  readonly temporaryBytes: number;
  readonly notes: string;
}

interface BenchmarkReport {
  readonly generatedAt: string;
  readonly options: {
    readonly seed: string;
    readonly shapes: readonly string[];
    readonly iterations: number;
    readonly warmup: number;
  };
  readonly records: readonly BenchmarkRecord[];
}

interface BenchmarkCandidate {
  readonly name: string;
  readonly run: (
    polynomial: BivariatePolynomialBuffer,
    xPoint: FieldElement,
    yPoint: FieldElement,
  ) => BivariateBufferRuffiniDivisionResult;
  readonly notes: string;
}

const CANDIDATES: readonly BenchmarkCandidate[] = [
  {
    name: "current-production",
    run: (polynomial, xPoint, yPoint) => polynomial.divByRuffini(xPoint, yPoint),
    notes: "Current production traversal: fixed Y column with reverse X recurrence.",
  },
  {
    name: "candidate-a-row-major-x",
    run: divideRuffiniRowMajorX,
    notes: "Benchmark-only Candidate A: reverse X recurrence with contiguous Y-row processing.",
  },
];

let resultSink = 0;

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const runtime = await createCurveRuntime({ singleThread: true });

  try {
    runEdgeCaseParity(runtime.Fr);

    const records: BenchmarkRecord[] = [];
    for (const shape of options.shapes) {
      records.push(...await benchmarkShape(runtime.Fr, shape, options));
    }
    records.push(...buildWeightedWorkloadRecords(records, runtime.Fr.byteLength));

    printRecords(records);
    await writeReport(options, records);
  } finally {
    await runtime.terminate();
  }
}

async function benchmarkShape(
  field: FieldRuntime,
  shape: Shape,
  options: BenchmarkOptions,
): Promise<BenchmarkRecord[]> {
  const polynomial = deterministicPolynomial(field, shape, options.seed);
  const xPoint = field.fromBigInt(11n);
  const yPoint = field.fromBigInt(13n);
  const baseline = CANDIDATES[0].run(polynomial, xPoint, yPoint);

  assertReconstruction(field, polynomial, baseline, xPoint, yPoint, `${formatShape(shape)} baseline`);
  for (const candidate of CANDIDATES.slice(1)) {
    const actual = candidate.run(polynomial, xPoint, yPoint);
    assertDivisionEqual(actual, baseline, `${formatShape(shape)} ${candidate.name}`);
  }

  const timings = await measureCandidates(CANDIDATES, polynomial, xPoint, yPoint, options);
  const inputBytes = shape.xSize * shape.ySize * field.byteLength;
  const outputBytes = (shape.xSize * shape.ySize + shape.ySize + 1) * field.byteLength;
  const temporaryBytes = shape.ySize * field.byteLength;

  return CANDIDATES.map((candidate) => ({
    candidate: candidate.name,
    shape: formatShape(shape),
    inputBytes,
    outputBytes,
    temporaryBytes,
    notes: candidate.notes,
    ...timings.get(candidate.name)!,
  }));
}

async function measureCandidates(
  candidates: readonly BenchmarkCandidate[],
  polynomial: BivariatePolynomialBuffer,
  xPoint: FieldElement,
  yPoint: FieldElement,
  options: BenchmarkOptions,
): Promise<ReadonlyMap<string, TimingSummary>> {
  for (let iteration = 0; iteration < options.warmup; iteration += 1) {
    for (const candidate of candidates) {
      consumeResult(candidate.run(polynomial, xPoint, yPoint));
    }
  }

  const samples = new Map(candidates.map((candidate) => [candidate.name, [] as number[]]));
  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    const ordered = iteration % 2 === 0 ? candidates : [...candidates].reverse();
    for (const candidate of ordered) {
      const start = performance.now();
      const result = candidate.run(polynomial, xPoint, yPoint);
      const durationMs = performance.now() - start;
      consumeResult(result);
      samples.get(candidate.name)!.push(durationMs);
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  return new Map(
    [...samples].map(([name, values]) => {
      const sorted = [...values].sort((left, right) => left - right);
      return [
        name,
        {
          medianMs: median(sorted),
          minMs: sorted[0],
          maxMs: sorted[sorted.length - 1],
          samplesMs: values,
        },
      ];
    }),
  );
}

function divideRuffiniRowMajorX(
  polynomial: BivariatePolynomialBuffer,
  xPoint: FieldElement,
  yPoint: FieldElement,
): BivariateBufferRuffiniDivisionResult {
  const field = polynomial.field;
  const quotientX = BivariatePolynomialBuffer.fromOwnedBuffer(
    field,
    field.createZeroBuffer(polynomial.xSize * polynomial.ySize),
    polynomial.xSize,
    polynomial.ySize,
  );
  const xRemainder = BivariatePolynomialBuffer.fromOwnedBuffer(
    field,
    field.createZeroBuffer(polynomial.ySize),
    1,
    polynomial.ySize,
  );

  if (polynomial.xSize === 1) {
    for (let y = 0; y < polynomial.ySize; y += 1) {
      xRemainder.setCoeff(0, y, polynomial.getCoeff(0, y));
    }
  } else {
    for (let y = 0; y < polynomial.ySize; y += 1) {
      quotientX.setCoeff(polynomial.xSize - 2, y, polynomial.getCoeff(polynomial.xSize - 1, y));
    }
    for (let x = polynomial.xSize - 3; x >= 0; x -= 1) {
      for (let y = 0; y < polynomial.ySize; y += 1) {
        quotientX.setCoeff(
          x,
          y,
          field.add(polynomial.getCoeff(x + 1, y), field.mul(xPoint, quotientX.getCoeff(x + 1, y))),
        );
      }
    }
    for (let y = 0; y < polynomial.ySize; y += 1) {
      xRemainder.setCoeff(
        0,
        y,
        field.add(polynomial.getCoeff(0, y), field.mul(xPoint, quotientX.getCoeff(0, y))),
      );
    }
  }

  const quotientY = BivariatePolynomialBuffer.fromOwnedBuffer(
    field,
    field.createZeroBuffer(polynomial.ySize),
    1,
    polynomial.ySize,
  );
  let remainder: FieldElement;
  if (polynomial.ySize === 1) {
    remainder = xRemainder.getCoeff(0, 0);
  } else {
    quotientY.setCoeff(0, polynomial.ySize - 2, xRemainder.getCoeff(0, polynomial.ySize - 1));
    for (let y = polynomial.ySize - 3; y >= 0; y -= 1) {
      quotientY.setCoeff(
        0,
        y,
        field.add(xRemainder.getCoeff(0, y + 1), field.mul(yPoint, quotientY.getCoeff(0, y + 1))),
      );
    }
    remainder = field.add(xRemainder.getCoeff(0, 0), field.mul(yPoint, quotientY.getCoeff(0, 0)));
  }

  return { quotientX, quotientY, remainder };
}

function runEdgeCaseParity(field: FieldRuntime): void {
  const xPoint = field.fromBigInt(11n);
  const yPoint = field.fromBigInt(13n);
  const cases: readonly { readonly label: string; readonly polynomial: BivariatePolynomialBuffer }[] = [
    {
      label: "zero",
      polynomial: BivariatePolynomialBuffer.fromOwnedBuffer(field, field.createZeroBuffer(8), 4, 2),
    },
    {
      label: "constant",
      polynomial: BivariatePolynomialBuffer.fromCoeffs(
        field,
        [field.fromBigInt(17n), ...Array.from({ length: 7 }, () => field.zero)],
        4,
        2,
      ),
    },
    {
      label: "x-only",
      polynomial: deterministicPolynomial(field, { xSize: 8, ySize: 1 }, 0x58n),
    },
    {
      label: "y-only",
      polynomial: deterministicPolynomial(field, { xSize: 1, ySize: 8 }, 0x59n),
    },
    {
      label: "general",
      polynomial: deterministicPolynomial(field, { xSize: 8, ySize: 4 }, 0x47454en),
    },
  ];

  for (const testCase of cases) {
    const baseline = testCase.polynomial.divByRuffini(xPoint, yPoint);
    const candidate = divideRuffiniRowMajorX(testCase.polynomial, xPoint, yPoint);
    assertDivisionEqual(candidate, baseline, `${testCase.label} Candidate A`);
    assertReconstruction(field, testCase.polynomial, candidate, xPoint, yPoint, testCase.label);
  }
}

function assertReconstruction(
  field: FieldRuntime,
  polynomial: BivariatePolynomialBuffer,
  division: BivariateBufferRuffiniDivisionResult,
  xPoint: FieldElement,
  yPoint: FieldElement,
  label: string,
): void {
  const reconstructed = field.createZeroBuffer(polynomial.xSize * polynomial.ySize);
  const elementBytes = field.byteLength;

  for (let x = 0; x < polynomial.xSize - 1; x += 1) {
    for (let y = 0; y < polynomial.ySize; y += 1) {
      const quotient = division.quotientX.getCoeff(x, y);
      addToBufferElement(reconstructed, (x + 1) * polynomial.ySize + y, quotient);
      addToBufferElement(reconstructed, x * polynomial.ySize + y, field.neg(field.mul(xPoint, quotient)));
    }
  }
  for (let y = 0; y < polynomial.ySize - 1; y += 1) {
    const quotient = division.quotientY.getCoeff(0, y);
    addToBufferElement(reconstructed, y + 1, quotient);
    addToBufferElement(reconstructed, y, field.neg(field.mul(yPoint, quotient)));
  }
  addToBufferElement(reconstructed, 0, division.remainder);

  assertBytesEqual(reconstructed, polynomial.coefficients, `${label} reconstruction`);

  function addToBufferElement(target: Uint8Array, index: number, value: FieldElement): void {
    const offset = index * elementBytes;
    target.set(field.add(target.subarray(offset, offset + elementBytes), value), offset);
  }
}

function assertDivisionEqual(
  actual: BivariateBufferRuffiniDivisionResult,
  expected: BivariateBufferRuffiniDivisionResult,
  label: string,
): void {
  assertBytesEqual(actual.quotientX.coefficients, expected.quotientX.coefficients, `${label} quotientX`);
  assertBytesEqual(actual.quotientY.coefficients, expected.quotientY.coefficients, `${label} quotientY`);
  assertBytesEqual(actual.remainder, expected.remainder, `${label} remainder`);
}

function deterministicPolynomial(field: FieldRuntime, shape: Shape, seed: bigint): BivariatePolynomialBuffer {
  const elementCount = shape.xSize * shape.ySize;
  const patternLength = Math.min(elementCount, 256);
  const pattern = Array.from({ length: patternLength }, (_, index) =>
    field.fromBigInt(((seed + BigInt(index + 1) * 0x9e3779b1n) % (field.modulus - 1n)) + 1n),
  );
  const coefficients = field.createZeroBuffer(elementCount);
  for (let index = 0; index < elementCount; index += 1) {
    coefficients.set(pattern[index % patternLength], index * field.byteLength);
  }
  return BivariatePolynomialBuffer.fromOwnedBuffer(field, coefficients, shape.xSize, shape.ySize);
}

function buildWeightedWorkloadRecords(
  records: readonly BenchmarkRecord[],
  elementBytes: number,
): BenchmarkRecord[] {
  const requiredShapes = new Map([
    ["8192x512", 3],
    ["16384x512", 1],
    ["128x1", 1],
  ]);
  if ([...requiredShapes].some(([shape]) => !records.some((record) => record.shape === shape))) {
    return [];
  }

  return CANDIDATES.map((candidate) => {
    const selected = [...requiredShapes].map(([shape, count]) => ({
      record: records.find((record) => record.candidate === candidate.name && record.shape === shape)!,
      count,
    }));
    return {
      candidate: candidate.name,
      shape: "prover-five-call-weighted-estimate",
      medianMs: selected.reduce((sum, entry) => sum + entry.record.medianMs * entry.count, 0),
      minMs: selected.reduce((sum, entry) => sum + entry.record.minMs * entry.count, 0),
      maxMs: selected.reduce((sum, entry) => sum + entry.record.maxMs * entry.count, 0),
      samplesMs: [],
      inputBytes: selected.reduce((sum, entry) => sum + entry.record.inputBytes * entry.count, 0),
      outputBytes: selected.reduce((sum, entry) => sum + entry.record.outputBytes * entry.count, 0),
      temporaryBytes: (3 * 512 + 512 + 1) * elementBytes,
      notes: "Derived as 3 * 8192x512 + 1 * 16384x512 + 1 * 128x1 from per-shape timing summaries.",
    };
  });
}

function consumeResult(result: BivariateBufferRuffiniDivisionResult): void {
  resultSink ^= result.quotientX.coefficients[0] ?? 0;
  resultSink ^= result.quotientY.coefficients[0] ?? 0;
  resultSink ^= result.remainder[0] ?? 0;
}

function median(sortedValues: readonly number[]): number {
  const midpoint = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2 === 0
    ? (sortedValues[midpoint - 1] + sortedValues[midpoint]) / 2
    : sortedValues[midpoint];
}

function parseOptions(args: readonly string[]): BenchmarkOptions {
  const values = new Map<string, string>();
  for (const arg of args) {
    const match = /^--([a-zA-Z-]+)=(.+)$/.exec(arg);
    if (match === null) {
      throw new Error(`Unknown argument '${arg}'.`);
    }
    values.set(match[1], match[2]);
  }

  return {
    seed: parseSeed(values.get("seed") ?? "0x52554646494e49"),
    shapes: parseShapes(values.get("shapes") ?? "4x2,8x4"),
    iterations: parsePositiveInteger(values.get("iterations") ?? "3", "iterations"),
    warmup: parseNonNegativeInteger(values.get("warmup") ?? "1", "warmup"),
    jsonPath: values.get("json") ?? "tmp/timing/ruffini-division.json",
  };
}

function parseSeed(value: string): bigint {
  if (!/^(0x[0-9a-fA-F]+|[0-9]+)$/.test(value)) {
    throw new Error("Seed must be a decimal integer or 0x-prefixed hexadecimal integer.");
  }
  return BigInt(value);
}

function parseShapes(value: string): Shape[] {
  const shapes = value.split(",").map((entry) => {
    const match = /^([0-9]+)x([0-9]+)$/.exec(entry.trim());
    if (match === null) {
      throw new Error(`Invalid shape '${entry}'. Expected <xSize>x<ySize>.`);
    }
    return {
      xSize: parsePositiveInteger(match[1], "xSize"),
      ySize: parsePositiveInteger(match[2], "ySize"),
    };
  });
  if (shapes.length === 0) {
    throw new Error("At least one shape is required.");
  }
  return shapes;
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = parseNonNegativeInteger(value, label);
  if (parsed <= 0) {
    throw new Error(`${label} must be positive.`);
  }
  return parsed;
}

function parseNonNegativeInteger(value: string, label: string): number {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${label} must be a safe integer.`);
  }
  return parsed;
}

function assertBytesEqual(actual: Uint8Array, expected: Uint8Array, label: string): void {
  if (actual.byteLength !== expected.byteLength) {
    throw new Error(`${label}: byte length mismatch ${actual.byteLength} !== ${expected.byteLength}.`);
  }
  for (let index = 0; index < actual.byteLength; index += 1) {
    if (actual[index] !== expected[index]) {
      throw new Error(`${label}: byte mismatch at offset ${index}.`);
    }
  }
}

function formatShape(shape: Shape): string {
  return `${shape.xSize}x${shape.ySize}`;
}

function printRecords(records: readonly BenchmarkRecord[]): void {
  console.table(
    records.map((record) => ({
      candidate: record.candidate,
      shape: record.shape,
      "median ms": record.medianMs.toFixed(3),
      "min ms": record.minMs.toFixed(3),
      "max ms": record.maxMs.toFixed(3),
      "temporary MiB": (record.temporaryBytes / 1024 / 1024).toFixed(3),
    })),
  );
}

async function writeReport(options: BenchmarkOptions, records: readonly BenchmarkRecord[]): Promise<void> {
  const report: BenchmarkReport = {
    generatedAt: new Date().toISOString(),
    options: {
      seed: `0x${options.seed.toString(16)}`,
      shapes: options.shapes.map(formatShape),
      iterations: options.iterations,
      warmup: options.warmup,
    },
    records,
  };
  const outputPath = path.resolve(options.jsonPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
