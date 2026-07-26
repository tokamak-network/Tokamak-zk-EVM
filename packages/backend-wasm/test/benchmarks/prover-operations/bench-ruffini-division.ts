import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";

import {
  BivariatePolynomialBuffer,
  type BivariateBufferRuffiniDivisionResult,
  type FieldElement,
  type FieldRuntime,
} from "../../../src/index.js";
import {
  createRuffiniBenchmarkRuntimes,
  divideRuffiniWasmSingleTask,
  singleTaskTemporaryBytes,
  workerShardTemporaryBytes,
  type RuffiniBenchmarkRuntimes,
} from "./ruffini-wasm-benchmark-support.js";

interface Shape {
  readonly xSize: number;
  readonly ySize: number;
}

interface BenchmarkOptions {
  readonly seed: bigint;
  readonly shapes: readonly Shape[];
  readonly candidateNames: ReadonlySet<string>;
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
    readonly candidates: readonly string[];
    readonly iterations: number;
    readonly warmup: number;
  };
  readonly records: readonly BenchmarkRecord[];
}

interface BenchmarkCandidate {
  readonly name: string;
  readonly run: (
    runtime: RuffiniBenchmarkRuntimes,
    polynomial: BivariatePolynomialBuffer,
    xPoint: FieldElement,
    yPoint: FieldElement,
  ) => Promise<BivariateBufferRuffiniDivisionResult>;
  readonly temporaryBytes: (shape: Shape, elementBytes: number) => number;
  readonly notes: string;
}

const CANDIDATES: readonly BenchmarkCandidate[] = [
  {
    name: "current-production",
    run: async (_runtime, polynomial, xPoint, yPoint) =>
      polynomial.divByRuffiniBatch(xPoint, yPoint),
    temporaryBytes: (shape, elementBytes) =>
      workerShardTemporaryBytes(shape.xSize, shape.ySize, elementBytes),
    notes: "Current production Y-column-sharded WASM X recurrence plus one dependent Y recurrence.",
  },
  {
    name: "scalar-production-baseline",
    run: async (_runtime, polynomial, xPoint, yPoint) => polynomial.divByRuffini(xPoint, yPoint),
    temporaryBytes: (shape, elementBytes) => shape.ySize * elementBytes,
    notes: "Retained pre-promotion row-major raw-buffer scalar recurrence.",
  },
  {
    name: "candidate-wasm-single-task",
    run: divideRuffiniWasmSingleTask,
    temporaryBytes: (shape, elementBytes) =>
      singleTaskTemporaryBytes(shape.xSize, shape.ySize, elementBytes),
    notes: "Benchmark-only whole-loop WASM X and dependent Y recurrences on the single-thread runtime.",
  },
];

let resultSink = 0;

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const runtime = await createRuffiniBenchmarkRuntimes();

  try {
    const candidates = CANDIDATES.filter((candidate) => options.candidateNames.has(candidate.name));
    await runEdgeCaseParity(runtime, candidates);

    const records: BenchmarkRecord[] = [];
    for (const shape of options.shapes) {
      records.push(...await benchmarkShape(runtime, shape, options, candidates));
    }
    records.push(...buildWeightedWorkloadRecords(records, candidates));

    printRecords(records);
    await writeReport(options, records);
  } finally {
    await runtime.terminate();
  }
}

async function benchmarkShape(
  runtime: RuffiniBenchmarkRuntimes,
  shape: Shape,
  options: BenchmarkOptions,
  candidates: readonly BenchmarkCandidate[],
): Promise<BenchmarkRecord[]> {
  const field = runtime.field;
  const polynomial = deterministicPolynomial(field, shape, options.seed);
  const xPoint = field.fromBigInt(11n);
  const yPoint = field.fromBigInt(13n);
  const baseline = await CANDIDATES[0].run(runtime, polynomial, xPoint, yPoint);

  assertReconstruction(field, polynomial, baseline, xPoint, yPoint, `${formatShape(shape)} baseline`);
  for (const candidate of candidates.filter((candidate) => candidate.name !== "current-production")) {
    const actual = await candidate.run(runtime, polynomial, xPoint, yPoint);
    assertDivisionEqual(actual, baseline, `${formatShape(shape)} ${candidate.name}`);
  }

  const timings = await measureCandidates(runtime, candidates, polynomial, xPoint, yPoint, options);
  const inputBytes = shape.xSize * shape.ySize * field.byteLength;
  const outputBytes = (shape.xSize * shape.ySize + shape.ySize + 1) * field.byteLength;

  return candidates.map((candidate) => ({
    candidate: candidate.name,
    shape: formatShape(shape),
    inputBytes,
    outputBytes,
    temporaryBytes: candidate.temporaryBytes(shape, field.byteLength),
    notes: candidate.notes,
    ...timings.get(candidate.name)!,
  }));
}

async function measureCandidates(
  runtime: RuffiniBenchmarkRuntimes,
  candidates: readonly BenchmarkCandidate[],
  polynomial: BivariatePolynomialBuffer,
  xPoint: FieldElement,
  yPoint: FieldElement,
  options: BenchmarkOptions,
): Promise<ReadonlyMap<string, TimingSummary>> {
  for (let iteration = 0; iteration < options.warmup; iteration += 1) {
    for (const candidate of candidates) {
      consumeResult(await candidate.run(runtime, polynomial, xPoint, yPoint));
    }
  }

  const samples = new Map(candidates.map((candidate) => [candidate.name, [] as number[]]));
  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    const ordered = iteration % 2 === 0 ? candidates : [...candidates].reverse();
    for (const candidate of ordered) {
      const start = performance.now();
      const result = await candidate.run(runtime, polynomial, xPoint, yPoint);
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

async function runEdgeCaseParity(
  runtime: RuffiniBenchmarkRuntimes,
  candidates: readonly BenchmarkCandidate[],
): Promise<void> {
  const field = runtime.field;
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
    const production = await testCase.polynomial.divByRuffiniBatch(xPoint, yPoint);
    assertDivisionEqual(production, baseline, `${testCase.label} current-production`);
    assertReconstruction(field, testCase.polynomial, production, xPoint, yPoint, `${testCase.label} production`);
    await assertConstantCorrectionParity(field, testCase.polynomial, production, xPoint, yPoint, testCase.label);
    for (const candidate of candidates.filter((candidate) => candidate.name !== "current-production")) {
      const actual = await candidate.run(runtime, testCase.polynomial, xPoint, yPoint);
      assertDivisionEqual(actual, baseline, `${testCase.label} ${candidate.name}`);
      assertReconstruction(field, testCase.polynomial, actual, xPoint, yPoint, `${testCase.label} ${candidate.name}`);
    }
  }
}

async function assertConstantCorrectionParity(
  field: FieldRuntime,
  polynomial: BivariatePolynomialBuffer,
  division: BivariateBufferRuffiniDivisionResult,
  xPoint: FieldElement,
  yPoint: FieldElement,
  label: string,
): Promise<void> {
  const constant = division.remainder;
  const correctedPolynomial = polynomial.sub(constantPolynomial(field, constant));
  const materialized = await correctedPolynomial.divByRuffiniBatch(xPoint, yPoint);
  const remainderAdjusted = {
    quotientX: division.quotientX,
    quotientY: division.quotientY,
    remainder: field.sub(division.remainder, constant),
  };
  assertDivisionEqual(remainderAdjusted, materialized, `${label} constant correction`);
  assertReconstruction(
    field,
    correctedPolynomial,
    remainderAdjusted,
    xPoint,
    yPoint,
    `${label} constant correction`,
  );
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

function constantPolynomial(field: FieldRuntime, value: FieldElement): BivariatePolynomialBuffer {
  return BivariatePolynomialBuffer.fromCoeffs(field, [value], 1, 1);
}

function buildWeightedWorkloadRecords(
  records: readonly BenchmarkRecord[],
  candidates: readonly BenchmarkCandidate[],
): BenchmarkRecord[] {
  const requiredShapes = new Map([
    ["8192x512", 3],
    ["16384x512", 1],
    ["128x1", 1],
  ]);
  if ([...requiredShapes].some(([shape]) => !records.some((record) => record.shape === shape))) {
    return [];
  }

  return candidates.map((candidate) => {
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
      temporaryBytes: Math.max(...selected.map((entry) => entry.record.temporaryBytes)),
      notes:
        "Timing is derived as 3 * 8192x512 + 1 * 16384x512 + 1 * 128x1; temporary bytes are the largest per-call explicit allocation bound.",
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
    candidateNames: parseCandidates(values.get("candidates") ?? CANDIDATES.map((candidate) => candidate.name).join(",")),
    iterations: parsePositiveInteger(values.get("iterations") ?? "3", "iterations"),
    warmup: parseNonNegativeInteger(values.get("warmup") ?? "1", "warmup"),
    jsonPath: values.get("json") ?? "tmp/benchmarks/prover-operations/ruffini-division.json",
  };
}

function parseCandidates(value: string): ReadonlySet<string> {
  const names = new Set(value.split(",").map((entry) => entry.trim()));
  const knownNames = new Set(CANDIDATES.map((candidate) => candidate.name));
  if (!names.has("current-production")) {
    throw new Error("Ruffini benchmarks must include 'current-production' as the baseline.");
  }
  for (const name of names) {
    if (!knownNames.has(name)) {
      throw new Error(`Unknown Ruffini candidate '${name}'.`);
    }
  }
  return names;
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
      candidates: [...options.candidateNames],
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
