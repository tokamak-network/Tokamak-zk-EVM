import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";

import {
  BivariatePolynomialBuffer,
  createCurveRuntime,
  type FieldElement,
  type FieldRuntime,
} from "../../../src/index.js";
import { buildLagrangeK0 } from "../../../src/prover/internal/polynomial-ops.js";

interface Shape {
  readonly mI: number;
  readonly inputXSize: number;
  readonly inputYSize: number;
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

interface BenchmarkCase {
  readonly factor: BivariatePolynomialBuffer;
  readonly input: BivariatePolynomialBuffer;
}

interface BenchmarkCandidate {
  readonly name: string;
  readonly run: (testCase: BenchmarkCase) => Promise<BivariatePolynomialBuffer>;
  readonly temporaryBytes: (testCase: BenchmarkCase, output: BivariatePolynomialBuffer) => number;
  readonly notes: string;
}

const CANDIDATES: readonly BenchmarkCandidate[] = [
  {
    name: "current-production",
    run: async ({ factor, input }) => await factor.mul(input),
    temporaryBytes: (testCase, output) =>
      output.coefficients.byteLength
      + output.xSize * testCase.input.field.byteLength * 4,
    notes: "Current per-Y-column FFT/IFFT path with accessor-based gather/scatter and cloned output.",
  },
  {
    name: "candidate-a-sequential-raw-owned",
    run: multiplyXUnivariateSequentialRawOwned,
    temporaryBytes: (testCase, output) =>
      output.xSize * testCase.input.field.byteLength * 4,
    notes: "Candidate A preserves sequential FFT/IFFT scheduling and changes only raw-buffer data movement and output ownership.",
  },
  {
    name: "candidate-b-batched-x-univariate",
    run: multiplyXUnivariateBatched,
    temporaryBytes: (testCase, output) =>
      output.coefficients.byteLength * 3
      + output.xSize * testCase.input.field.byteLength,
    notes: "Candidate B packs all X columns once and uses one batched forward and inverse transform.",
  },
  {
    name: "candidate-c-k0-sliding-scalar",
    run: multiplyK0SlidingScalar,
    temporaryBytes: (testCase, output) =>
      output.coefficients.byteLength
      + output.ySize * testCase.input.field.byteLength,
    notes: "Candidate C replaces FFT multiplication with K0 sliding sums while retaining accessor-based writes, per-output scaling, and cloned output.",
  },
  {
    name: "candidate-ca-k0-sliding-raw-owned-scalar",
    run: multiplyK0SlidingRawOwnedScalar,
    temporaryBytes: (testCase, output) =>
      output.ySize * testCase.input.field.byteLength,
    notes: "C+A combination: K0 sliding sums with direct byte views, per-output scaling, and owned output.",
  },
  {
    name: "candidate-cab-k0-sliding-raw-owned-batch-scale",
    run: multiplyK0SlidingRawOwnedBatchScale,
    temporaryBytes: (testCase, output) =>
      output.coefficients.byteLength
      + output.ySize * testCase.input.field.byteLength,
    notes: "C+A plus one primitive-parallel whole-output scaling pass after unscaled sliding sums.",
  },
];

let resultSink = 0;

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const runtime = await createCurveRuntime();

  try {
    const candidates = CANDIDATES.filter((candidate) => options.candidateNames.has(candidate.name));
    await runSmallParity(runtime.Fr, candidates);

    const records: BenchmarkRecord[] = [];
    for (const shape of options.shapes) {
      records.push(...await benchmarkShape(runtime.Fr, shape, options, candidates));
    }

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
  candidates: readonly BenchmarkCandidate[],
): Promise<BenchmarkRecord[]> {
  const testCase = await createBenchmarkCase(field, shape, options.seed);
  const baseline = await CANDIDATES[0].run(testCase);
  const outputBytes = baseline.coefficients.byteLength;

  for (const candidate of candidates.filter((candidate) => candidate.name !== CANDIDATES[0].name)) {
    const actual = await candidate.run(testCase);
    assertPolynomialEqual(actual, baseline, `${formatShape(shape)} ${candidate.name}`);
  }

  const timings = await measureCandidates(testCase, options, candidates);
  return candidates.map((candidate) => ({
    candidate: candidate.name,
    shape: formatShape(shape),
    inputBytes: testCase.input.coefficients.byteLength + testCase.factor.coefficients.byteLength,
    outputBytes,
    temporaryBytes: candidate.temporaryBytes(testCase, baseline),
    notes: candidate.notes,
    ...timings.get(candidate.name)!,
  }));
}

async function measureCandidates(
  testCase: BenchmarkCase,
  options: BenchmarkOptions,
  candidates: readonly BenchmarkCandidate[],
): Promise<ReadonlyMap<string, TimingSummary>> {
  for (let iteration = 0; iteration < options.warmup; iteration += 1) {
    for (const candidate of candidates) {
      consumeResult(await candidate.run(testCase));
    }
  }

  const samples = new Map(candidates.map((candidate) => [candidate.name, [] as number[]]));
  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    const ordered = iteration % 2 === 0 ? candidates : [...candidates].reverse();
    for (const candidate of ordered) {
      const start = performance.now();
      const result = await candidate.run(testCase);
      samples.get(candidate.name)!.push(performance.now() - start);
      consumeResult(result);
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

async function multiplyXUnivariateSequentialRawOwned(
  testCase: BenchmarkCase,
): Promise<BivariatePolynomialBuffer> {
  const { factor, input } = testCase;
  const field = input.field;
  const factorDegree = factor.findDegree();
  const inputDegree = input.findDegree();
  const xSize = nextPowerOfTwo(factorDegree.xDegree + inputDegree.xDegree + 1);
  const ySize = nextPowerOfTwo(inputDegree.yDegree + 1);
  const elementBytes = field.byteLength;
  const factorEvals = await factor.resize(xSize, 1).toRouEvals();
  const output = field.createZeroBuffer(xSize * ySize);

  for (let y = 0; y < ySize; y += 1) {
    const column = field.createZeroBuffer(xSize);
    if (y < input.ySize) {
      for (let x = 0; x < Math.min(input.xSize, xSize); x += 1) {
        const sourceOffset = (x * input.ySize + y) * elementBytes;
        column.set(input.coefficients.subarray(sourceOffset, sourceOffset + elementBytes), x * elementBytes);
      }
    }

    const columnEvals = await field.fftBuffer(column);
    for (let x = 0; x < xSize; x += 1) {
      const offset = x * elementBytes;
      columnEvals.set(
        field.mul(
          columnEvals.subarray(offset, offset + elementBytes),
          factorEvals.subarray(offset, offset + elementBytes),
        ),
        offset,
      );
    }
    const columnCoefficients = await field.ifftBuffer(columnEvals);
    for (let x = 0; x < xSize; x += 1) {
      const sourceOffset = x * elementBytes;
      const targetOffset = (x * ySize + y) * elementBytes;
      output.set(columnCoefficients.subarray(sourceOffset, sourceOffset + elementBytes), targetOffset);
    }
  }

  return BivariatePolynomialBuffer.fromOwnedBuffer(field, output, xSize, ySize);
}

async function multiplyXUnivariateBatched(
  testCase: BenchmarkCase,
): Promise<BivariatePolynomialBuffer> {
  const { factor, input } = testCase;
  const field = input.field;
  const factorDegree = factor.findDegree();
  const inputDegree = input.findDegree();
  const xSize = nextPowerOfTwo(factorDegree.xDegree + inputDegree.xDegree + 1);
  const ySize = nextPowerOfTwo(inputDegree.yDegree + 1);
  const elementBytes = field.byteLength;
  const factorEvals = await factor.resize(xSize, 1).toRouEvals();
  const columns = field.createZeroBuffer(xSize * ySize);

  for (let y = 0; y < input.ySize; y += 1) {
    const targetColumnOffset = y * xSize * elementBytes;
    for (let x = 0; x < input.xSize; x += 1) {
      const sourceOffset = (x * input.ySize + y) * elementBytes;
      columns.set(
        input.coefficients.subarray(sourceOffset, sourceOffset + elementBytes),
        targetColumnOffset + x * elementBytes,
      );
    }
  }

  const columnEvals = await field.batchFftBuffer(columns, xSize, "forward");
  for (let y = 0; y < ySize; y += 1) {
    const columnOffset = y * xSize * elementBytes;
    for (let x = 0; x < xSize; x += 1) {
      const factorOffset = x * elementBytes;
      const outputOffset = columnOffset + factorOffset;
      columnEvals.set(
        field.mul(
          columnEvals.subarray(outputOffset, outputOffset + elementBytes),
          factorEvals.subarray(factorOffset, factorOffset + elementBytes),
        ),
        outputOffset,
      );
    }
  }

  const columnCoefficients = await field.batchFftBuffer(columnEvals, xSize, "inverse");
  const output = field.createZeroBuffer(xSize * ySize);
  for (let y = 0; y < ySize; y += 1) {
    const sourceColumnOffset = y * xSize * elementBytes;
    for (let x = 0; x < xSize; x += 1) {
      const sourceOffset = sourceColumnOffset + x * elementBytes;
      output.set(
        columnCoefficients.subarray(sourceOffset, sourceOffset + elementBytes),
        (x * ySize + y) * elementBytes,
      );
    }
  }

  return BivariatePolynomialBuffer.fromOwnedBuffer(field, output, xSize, ySize);
}

async function multiplyK0SlidingScalar(
  testCase: BenchmarkCase,
): Promise<BivariatePolynomialBuffer> {
  const { factor, input } = testCase;
  const field = input.field;
  const factorDegree = factor.findDegree();
  const inputDegree = input.findDegree();
  const mI = factorDegree.xDegree + 1;
  const xSize = nextPowerOfTwo(factorDegree.xDegree + inputDegree.xDegree + 1);
  const ySize = nextPowerOfTwo(inputDegree.yDegree + 1);
  const inverseMI = field.inv(field.fromBigInt(BigInt(mI)));
  const window = field.createZeroBuffer(ySize);
  const output = field.createZeroBuffer(xSize * ySize);

  for (let x = 0; x < xSize; x += 1) {
    for (let y = 0; y < ySize; y += 1) {
      let sum = field.readBufferElement(window, y);
      if (x < input.xSize) {
        sum = field.add(sum, input.getCoeff(x, y));
      }
      const removedX = x - mI;
      if (removedX >= 0 && removedX < input.xSize) {
        sum = field.sub(sum, input.getCoeff(removedX, y));
      }
      field.writeBufferElement(window, y, sum);
      field.writeBufferElement(output, x * ySize + y, field.mul(sum, inverseMI));
    }
  }

  return BivariatePolynomialBuffer.fromBuffer(field, output, xSize, ySize);
}

async function multiplyK0SlidingRawOwnedScalar(
  testCase: BenchmarkCase,
): Promise<BivariatePolynomialBuffer> {
  const { factor, input } = testCase;
  const field = input.field;
  const factorDegree = factor.findDegree();
  const inputDegree = input.findDegree();
  const mI = factorDegree.xDegree + 1;
  const xSize = nextPowerOfTwo(factorDegree.xDegree + inputDegree.xDegree + 1);
  const ySize = nextPowerOfTwo(inputDegree.yDegree + 1);
  const elementBytes = field.byteLength;
  const inverseMI = field.inv(field.fromBigInt(BigInt(mI)));
  const window = field.createZeroBuffer(ySize);
  const output = field.createZeroBuffer(xSize * ySize);

  for (let x = 0; x < xSize; x += 1) {
    const inputRowOffset = x * input.ySize * elementBytes;
    const removedX = x - mI;
    const removedRowOffset = removedX * input.ySize * elementBytes;
    const outputRowOffset = x * ySize * elementBytes;
    for (let y = 0; y < ySize; y += 1) {
      const elementOffset = y * elementBytes;
      let sum = window.subarray(elementOffset, elementOffset + elementBytes);
      if (x < input.xSize) {
        sum = field.add(
          sum,
          input.coefficients.subarray(
            inputRowOffset + elementOffset,
            inputRowOffset + elementOffset + elementBytes,
          ),
        );
      }
      if (removedX >= 0 && removedX < input.xSize) {
        sum = field.sub(
          sum,
          input.coefficients.subarray(
            removedRowOffset + elementOffset,
            removedRowOffset + elementOffset + elementBytes,
          ),
        );
      }
      window.set(sum, elementOffset);
      output.set(field.mul(sum, inverseMI), outputRowOffset + elementOffset);
    }
  }

  return BivariatePolynomialBuffer.fromOwnedBuffer(field, output, xSize, ySize);
}

async function multiplyK0SlidingRawOwnedBatchScale(
  testCase: BenchmarkCase,
): Promise<BivariatePolynomialBuffer> {
  const { factor, input } = testCase;
  const field = input.field;
  const factorDegree = factor.findDegree();
  const inputDegree = input.findDegree();
  const mI = factorDegree.xDegree + 1;
  const xSize = nextPowerOfTwo(factorDegree.xDegree + inputDegree.xDegree + 1);
  const ySize = nextPowerOfTwo(inputDegree.yDegree + 1);
  const elementBytes = field.byteLength;
  const inverseMI = field.inv(field.fromBigInt(BigInt(mI)));
  const window = field.createZeroBuffer(ySize);
  const unscaledOutput = field.createZeroBuffer(xSize * ySize);

  for (let x = 0; x < xSize; x += 1) {
    const inputRowOffset = x * input.ySize * elementBytes;
    const removedX = x - mI;
    const removedRowOffset = removedX * input.ySize * elementBytes;
    const outputRowOffset = x * ySize * elementBytes;
    for (let y = 0; y < ySize; y += 1) {
      const elementOffset = y * elementBytes;
      let sum = window.subarray(elementOffset, elementOffset + elementBytes);
      if (x < input.xSize) {
        sum = field.add(
          sum,
          input.coefficients.subarray(
            inputRowOffset + elementOffset,
            inputRowOffset + elementOffset + elementBytes,
          ),
        );
      }
      if (removedX >= 0 && removedX < input.xSize) {
        sum = field.sub(
          sum,
          input.coefficients.subarray(
            removedRowOffset + elementOffset,
            removedRowOffset + elementOffset + elementBytes,
          ),
        );
      }
      window.set(sum, elementOffset);
      unscaledOutput.set(sum, outputRowOffset + elementOffset);
    }
  }

  const output = await field.batchApplyKeyBuffer(unscaledOutput, inverseMI, field.one);
  return BivariatePolynomialBuffer.fromOwnedBuffer(field, output, xSize, ySize);
}

async function runSmallParity(
  field: FieldRuntime,
  candidates: readonly BenchmarkCandidate[],
): Promise<void> {
  const shapes: readonly Shape[] = [
    { mI: 1, inputXSize: 1, inputYSize: 1 },
    { mI: 2, inputXSize: 4, inputYSize: 2 },
    { mI: 4, inputXSize: 8, inputYSize: 4 },
    { mI: 8, inputXSize: 8, inputYSize: 1 },
  ];

  for (const [index, shape] of shapes.entries()) {
    const testCase = await createBenchmarkCase(field, shape, 0x4b304f5241434c45n + BigInt(index));
    const baseline = await CANDIDATES[0].run(testCase);
    const oracle = directK0Convolution(testCase.input, shape.mI, baseline.xSize);
    assertPolynomialEqual(baseline, oracle, `${formatShape(shape)} current-production oracle`);
    for (const candidate of candidates.filter((candidate) => candidate.name !== CANDIDATES[0].name)) {
      assertPolynomialEqual(
        await candidate.run(testCase),
        baseline,
        `${formatShape(shape)} ${candidate.name}`,
      );
    }
  }
}

function directK0Convolution(
  input: BivariatePolynomialBuffer,
  mI: number,
  outputXSize: number,
): BivariatePolynomialBuffer {
  const field = input.field;
  const inverseMI = field.inv(field.fromBigInt(BigInt(mI)));
  const output = field.createZeroBuffer(outputXSize * input.ySize);

  for (let inputX = 0; inputX < input.xSize; inputX += 1) {
    for (let factorX = 0; factorX < mI; factorX += 1) {
      const outputX = inputX + factorX;
      for (let y = 0; y < input.ySize; y += 1) {
        const outputIndex = outputX * input.ySize + y;
        const outputOffset = outputIndex * field.byteLength;
        output.set(
          field.add(
            output.subarray(outputOffset, outputOffset + field.byteLength),
            field.mul(input.getCoeff(inputX, y), inverseMI),
          ),
          outputOffset,
        );
      }
    }
  }

  return BivariatePolynomialBuffer.fromOwnedBuffer(field, output, outputXSize, input.ySize);
}

async function createBenchmarkCase(
  field: FieldRuntime,
  shape: Shape,
  seed: bigint,
): Promise<BenchmarkCase> {
  const factor = await buildLagrangeK0(field, shape.mI);
  const input = deterministicPolynomial(field, shape, seed);
  return { factor, input };
}

function deterministicPolynomial(field: FieldRuntime, shape: Shape, seed: bigint): BivariatePolynomialBuffer {
  const elementCount = shape.inputXSize * shape.inputYSize;
  const patternLength = Math.min(elementCount, 256);
  const pattern = Array.from({ length: patternLength }, (_, index) =>
    field.fromBigInt(((seed + BigInt(index + 1) * 0x9e3779b1n) % (field.modulus - 1n)) + 1n),
  );
  const coefficients = field.createZeroBuffer(elementCount);
  for (let index = 0; index < elementCount; index += 1) {
    coefficients.set(pattern[index % patternLength], index * field.byteLength);
  }
  return BivariatePolynomialBuffer.fromOwnedBuffer(
    field,
    coefficients,
    shape.inputXSize,
    shape.inputYSize,
  );
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
    seed: parseSeed(values.get("seed") ?? "0x4b304d554c"),
    shapes: parseShapes(values.get("shapes") ?? "4x8x4"),
    candidateNames: parseCandidates(
      values.get("candidates") ?? CANDIDATES.map((candidate) => candidate.name).join(","),
    ),
    iterations: parsePositiveInteger(values.get("iterations") ?? "3", "iterations"),
    warmup: parseNonNegativeInteger(values.get("warmup") ?? "1", "warmup"),
    jsonPath: values.get("json") ?? "tmp/timing/k0-multiplication.json",
  };
}

function parseCandidates(value: string): ReadonlySet<string> {
  const names = new Set(value.split(",").map((entry) => entry.trim()));
  const knownNames = new Set(CANDIDATES.map((candidate) => candidate.name));
  if (!names.has(CANDIDATES[0].name)) {
    throw new Error(`K0 multiplication benchmarks must include '${CANDIDATES[0].name}' as the baseline.`);
  }
  for (const name of names) {
    if (!knownNames.has(name)) {
      throw new Error(`Unknown K0 multiplication candidate '${name}'.`);
    }
  }
  return names;
}

function parseShapes(value: string): Shape[] {
  const shapes = value.split(",").map((entry) => {
    const match = /^([0-9]+)x([0-9]+)x([0-9]+)$/.exec(entry.trim());
    if (match === null) {
      throw new Error(`Invalid shape '${entry}'. Expected <mI>x<inputXSize>x<inputYSize>.`);
    }
    return {
      mI: parsePowerOfTwo(match[1], "mI"),
      inputXSize: parsePowerOfTwo(match[2], "inputXSize"),
      inputYSize: parsePowerOfTwo(match[3], "inputYSize"),
    };
  });
  if (shapes.length === 0) {
    throw new Error("At least one shape is required.");
  }
  return shapes;
}

function parsePowerOfTwo(value: string, label: string): number {
  const parsed = parsePositiveInteger(value, label);
  if ((parsed & (parsed - 1)) !== 0) {
    throw new Error(`${label} must be a power of two.`);
  }
  return parsed;
}

function parseSeed(value: string): bigint {
  if (!/^(0x[0-9a-fA-F]+|[0-9]+)$/.test(value)) {
    throw new Error("Seed must be a decimal integer or 0x-prefixed hexadecimal integer.");
  }
  return BigInt(value);
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

function nextPowerOfTwo(value: number): number {
  let size = 1;
  while (size < value) {
    size *= 2;
  }
  return size;
}

function formatShape(shape: Shape): string {
  return `${shape.mI}x${shape.inputXSize}x${shape.inputYSize}`;
}

function assertPolynomialEqual(
  actual: BivariatePolynomialBuffer,
  expected: BivariatePolynomialBuffer,
  label: string,
): void {
  if (actual.xSize !== expected.xSize || actual.ySize !== expected.ySize) {
    throw new Error(
      `${label}: shape mismatch ${actual.xSize}x${actual.ySize} !== ${expected.xSize}x${expected.ySize}.`,
    );
  }
  assertBytesEqual(actual.coefficients, expected.coefficients, label);
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

function median(sortedValues: readonly number[]): number {
  const midpoint = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2 === 0
    ? (sortedValues[midpoint - 1] + sortedValues[midpoint]) / 2
    : sortedValues[midpoint];
}

function consumeResult(result: BivariatePolynomialBuffer): void {
  resultSink ^= result.coefficients[0] ?? 0;
  resultSink ^= result.coefficients[result.coefficients.byteLength - 1] ?? 0;
}

function printRecords(records: readonly BenchmarkRecord[]): void {
  console.table(
    records.map((record) => ({
      candidate: record.candidate,
      shape: record.shape,
      "median ms": record.medianMs.toFixed(3),
      "min ms": record.minMs.toFixed(3),
      "max ms": record.maxMs.toFixed(3),
      "output MiB": (record.outputBytes / 1024 / 1024).toFixed(1),
      "temporary MiB": (record.temporaryBytes / 1024 / 1024).toFixed(1),
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
