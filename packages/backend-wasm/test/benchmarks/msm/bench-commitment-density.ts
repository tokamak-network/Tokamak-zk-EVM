import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BivariatePolynomialBuffer,
  createCurveRuntime,
  type CurveRuntime,
  type FieldElement,
} from "../../../src/index.js";

const G1_AFFINE_BYTES = 96;
const DENSE_CHUNK_POINTS = 1 << 18;
const DENSE_MIN_DENSITY = 0.75;

type Candidate =
  | "scalar-two-scan"
  | "current-production";

interface Shape {
  readonly xSize: number;
  readonly ySize: number;
}

interface BenchmarkOptions {
  readonly seed: bigint;
  readonly shapes: readonly Shape[];
  readonly densities: readonly number[];
  readonly candidates: readonly Candidate[];
  readonly iterations: number;
  readonly warmup: number;
  readonly singleThread: boolean;
  readonly jsonPath?: string;
}

interface BenchmarkCase {
  readonly shape: Shape;
  readonly density: number;
  readonly rawBases: Uint8Array;
  readonly polynomial: BivariatePolynomialBuffer;
}

interface MsmChunk {
  readonly bases: Uint8Array;
  readonly montgomeryScalars: Uint8Array;
}

interface CompactedInput {
  readonly bases: Uint8Array;
  readonly montgomeryScalars: Uint8Array;
  readonly nonzeroCount: number;
}

interface PreparedCommitment {
  readonly path: "zero" | "sparse" | "dense";
  readonly nonzeroCount: number;
  readonly chunks: readonly MsmChunk[];
  readonly explicitTemporaryBytes: number;
}

interface RunMetrics {
  readonly result: Uint8Array;
  readonly path: PreparedCommitment["path"];
  readonly nonzeroCount: number;
  readonly preparationMs: number;
  readonly conversionMs: number;
  readonly msmMs: number;
  readonly accumulationMs: number;
  readonly totalMs: number;
  readonly explicitTemporaryBytes: number;
}

interface Summary {
  readonly median: number;
  readonly min: number;
  readonly max: number;
}

interface TimingRow {
  readonly candidate: Candidate;
  readonly shape: string;
  readonly density: number;
  readonly path: PreparedCommitment["path"];
  readonly nonzeroCount: number;
  readonly preparationMs: Summary;
  readonly conversionMs: Summary;
  readonly msmMs: Summary;
  readonly accumulationMs: Summary;
  readonly totalMs: Summary;
  readonly explicitTemporaryBytes: number;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const runtime = await createCurveRuntime({ singleThread: options.singleThread });

  try {
    await checkSmallParity(runtime);
    const rows: TimingRow[] = [];
    for (const shape of options.shapes) {
      const rawBases = buildPatternedAffineBases(runtime, shape.xSize * shape.ySize);
      for (const density of options.densities) {
        const benchmarkCase = buildBenchmarkCase(runtime, shape, density, options.seed, rawBases);
        rows.push(...await benchmarkCaseCandidates(runtime, benchmarkCase, options));
      }
    }
    printRows(rows, options);
    if (options.jsonPath !== undefined) {
      await writeJsonReport(options.jsonPath, options, rows);
    }
  } finally {
    await runtime.terminate();
  }
}

async function benchmarkCaseCandidates(
  runtime: CurveRuntime,
  benchmarkCase: BenchmarkCase,
  options: BenchmarkOptions,
): Promise<TimingRow[]> {
  const parityResults = new Map<Candidate, RunMetrics>();
  for (const candidate of options.candidates) {
    parityResults.set(candidate, await runCandidate(runtime, benchmarkCase, candidate));
  }
  const expected = parityResults.get("current-production");
  if (expected === undefined) {
    throw new Error("Commitment benchmark requires current-production.");
  }
  for (const [candidate, result] of parityResults) {
    if (!runtime.G1.eq(result.result, expected.result)) {
      throw new Error(`${formatShape(benchmarkCase.shape)} density ${benchmarkCase.density}: ${candidate} mismatch.`);
    }
    if (result.nonzeroCount !== expected.nonzeroCount || result.path !== expected.path) {
      throw new Error(`${formatShape(benchmarkCase.shape)} density ${benchmarkCase.density}: ${candidate} routing mismatch.`);
    }
  }

  for (let index = 0; index < options.warmup; index += 1) {
    for (const candidate of options.candidates) {
      await runCandidate(runtime, benchmarkCase, candidate);
    }
  }

  const samples = new Map<Candidate, RunMetrics[]>(
    options.candidates.map((candidate) => [candidate, []]),
  );
  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    const offset = iteration % options.candidates.length;
    for (let index = 0; index < options.candidates.length; index += 1) {
      const candidate = options.candidates[(index + offset) % options.candidates.length];
      samples.get(candidate)?.push(await runCandidate(runtime, benchmarkCase, candidate));
    }
  }

  return options.candidates.map((candidate) => {
    const values = samples.get(candidate);
    if (values === undefined || values.length === 0) {
      throw new Error(`No commitment benchmark samples for ${candidate}.`);
    }
    return {
      candidate,
      shape: formatShape(benchmarkCase.shape),
      density: benchmarkCase.density,
      path: values[0].path,
      nonzeroCount: values[0].nonzeroCount,
      preparationMs: summarize(values.map((value) => value.preparationMs)),
      conversionMs: summarize(values.map((value) => value.conversionMs)),
      msmMs: summarize(values.map((value) => value.msmMs)),
      accumulationMs: summarize(values.map((value) => value.accumulationMs)),
      totalMs: summarize(values.map((value) => value.totalMs)),
      explicitTemporaryBytes: values[0].explicitTemporaryBytes,
    };
  });
}

async function runCandidate(
  runtime: CurveRuntime,
  benchmarkCase: BenchmarkCase,
  candidate: Candidate,
): Promise<RunMetrics> {
  const totalStart = performance.now();
  const preparationStart = performance.now();
  const prepared = await prepareCandidate(runtime, benchmarkCase, candidate);
  const preparationMs = performance.now() - preparationStart;

  let conversionMs = 0;
  let msmMs = 0;
  let accumulationMs = 0;
  let result = runtime.G1.zero;
  for (const chunk of prepared.chunks) {
    let start = performance.now();
    const rawScalars = await runtime.Fr.batchFromMontgomeryBuffer(chunk.montgomeryScalars);
    conversionMs += performance.now() - start;

    start = performance.now();
    const partial = await runtime.G1.msmAffineRaw(chunk.bases, rawScalars);
    msmMs += performance.now() - start;

    start = performance.now();
    result = runtime.G1.add(result, partial);
    accumulationMs += performance.now() - start;
  }

  return {
    result,
    path: prepared.path,
    nonzeroCount: prepared.nonzeroCount,
    preparationMs,
    conversionMs,
    msmMs,
    accumulationMs,
    totalMs: performance.now() - totalStart,
    explicitTemporaryBytes: prepared.explicitTemporaryBytes,
  };
}

async function prepareCandidate(
  runtime: CurveRuntime,
  benchmarkCase: BenchmarkCase,
  candidate: Candidate,
): Promise<PreparedCommitment> {
  switch (candidate) {
    case "scalar-two-scan":
      return prepareTwoScan(runtime, benchmarkCase, false);
    case "current-production":
      return prepareTwoScan(runtime, benchmarkCase, true);
  }
}

function prepareTwoScan(
  runtime: CurveRuntime,
  benchmarkCase: BenchmarkCase,
  rawZeroTest: boolean,
): PreparedCommitment {
  const degree = rawZeroTest
    ? findDegreeRaw(benchmarkCase.polynomial)
    : benchmarkCase.polynomial.findDegree();
  if (degree.xDegree < 0 || degree.yDegree < 0) {
    return zeroPrepared();
  }
  const xSize = degree.xDegree + 1;
  const ySize = degree.yDegree + 1;
  const nonzeroCount = countNonzero(
    runtime,
    benchmarkCase.polynomial,
    xSize,
    ySize,
    rawZeroTest,
  );
  if (shouldUseDense(xSize * ySize, nonzeroCount)) {
    return prepareDense(benchmarkCase, xSize, ySize, nonzeroCount);
  }
  const compact = compactInJavaScript(
    runtime,
    benchmarkCase,
    xSize,
    ySize,
    nonzeroCount,
    rawZeroTest,
  );
  return sparsePrepared(compact, compact.bases.byteLength + compact.montgomeryScalars.byteLength);
}

function prepareDense(
  benchmarkCase: BenchmarkCase,
  xSize: number,
  ySize: number,
  nonzeroCount: number,
): PreparedCommitment {
  const chunks: MsmChunk[] = [];
  const rowsPerChunk = Math.max(1, Math.floor(DENSE_CHUNK_POINTS / ySize));
  let ownedBytes = 0;
  for (let xStart = 0; xStart < xSize; xStart += rowsPerChunk) {
    const rowCount = Math.min(rowsPerChunk, xSize - xStart);
    const bases = extractRowRange(
      benchmarkCase.rawBases,
      benchmarkCase.shape.ySize,
      xStart,
      rowCount,
      ySize,
      G1_AFFINE_BYTES,
    );
    const montgomeryScalars = extractRowRange(
      benchmarkCase.polynomial.coefficients,
      benchmarkCase.shape.ySize,
      xStart,
      rowCount,
      ySize,
      benchmarkCase.polynomial.field.byteLength,
    );
    if (bases.buffer !== benchmarkCase.rawBases.buffer) {
      ownedBytes += bases.byteLength;
    }
    if (montgomeryScalars.buffer !== benchmarkCase.polynomial.coefficients.buffer) {
      ownedBytes += montgomeryScalars.byteLength;
    }
    chunks.push({ bases, montgomeryScalars });
  }
  return {
    path: "dense",
    nonzeroCount,
    chunks,
    explicitTemporaryBytes: ownedBytes,
  };
}

function compactInJavaScript(
  runtime: CurveRuntime,
  benchmarkCase: BenchmarkCase,
  xSize: number,
  ySize: number,
  nonzeroCount: number,
  rawZeroTest: boolean,
): CompactedInput {
  const bases = new Uint8Array(nonzeroCount * G1_AFFINE_BYTES);
  const scalars = new Uint8Array(nonzeroCount * runtime.Fr.byteLength);
  const words = rawZeroTest ? uint32Words(benchmarkCase.polynomial.coefficients) : undefined;
  let outputIndex = 0;
  for (let x = 0; x < xSize; x += 1) {
    for (let y = 0; y < ySize; y += 1) {
      const polynomialIndex = x * benchmarkCase.shape.ySize + y;
      const scalar = benchmarkCase.polynomial.coefficients.subarray(
        polynomialIndex * runtime.Fr.byteLength,
        (polynomialIndex + 1) * runtime.Fr.byteLength,
      );
      const isZero = words === undefined
        ? runtime.Fr.isZero(scalar)
        : isZeroWordElement(words, polynomialIndex);
      if (isZero) {
        continue;
      }
      bases.set(
        benchmarkCase.rawBases.subarray(
          polynomialIndex * G1_AFFINE_BYTES,
          (polynomialIndex + 1) * G1_AFFINE_BYTES,
        ),
        outputIndex * G1_AFFINE_BYTES,
      );
      scalars.set(scalar, outputIndex * runtime.Fr.byteLength);
      outputIndex += 1;
    }
  }
  if (outputIndex !== nonzeroCount) {
    throw new Error(`Sparse compaction count mismatch: expected ${nonzeroCount}, received ${outputIndex}.`);
  }
  return { bases, montgomeryScalars: scalars, nonzeroCount };
}

function countNonzero(
  runtime: CurveRuntime,
  polynomial: BivariatePolynomialBuffer,
  xSize: number,
  ySize: number,
  rawZeroTest: boolean,
): number {
  const words = rawZeroTest ? uint32Words(polynomial.coefficients) : undefined;
  let count = 0;
  for (let x = 0; x < xSize; x += 1) {
    for (let y = 0; y < ySize; y += 1) {
      const index = x * polynomial.ySize + y;
      const isZero = words === undefined
        ? runtime.Fr.isZero(polynomial.getCoeff(x, y))
        : isZeroWordElement(words, index);
      if (!isZero) {
        count += 1;
      }
    }
  }
  return count;
}

function findDegreeRaw(polynomial: BivariatePolynomialBuffer): {
  readonly xDegree: number;
  readonly yDegree: number;
} {
  const words = uint32Words(polynomial.coefficients);
  let xDegree = -1;
  let yDegree = -1;
  for (let x = polynomial.xSize - 1; x >= 0 && xDegree < 0; x -= 1) {
    for (let y = 0; y < polynomial.ySize; y += 1) {
      if (!isZeroWordElement(words, x * polynomial.ySize + y)) {
        xDegree = x;
        break;
      }
    }
  }
  for (let y = polynomial.ySize - 1; y >= 0 && yDegree < 0; y -= 1) {
    for (let x = 0; x < polynomial.xSize; x += 1) {
      if (!isZeroWordElement(words, x * polynomial.ySize + y)) {
        yDegree = y;
        break;
      }
    }
  }
  return { xDegree, yDegree };
}

function uint32Words(buffer: Uint8Array): Uint32Array {
  if (buffer.byteOffset % 4 !== 0 || buffer.byteLength % 4 !== 0) {
    throw new Error("Raw zero scan requires a four-byte-aligned field buffer.");
  }
  return new Uint32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
}

function isZeroWordElement(words: Uint32Array, elementIndex: number): boolean {
  const offset = elementIndex * 8;
  return (
    words[offset] | words[offset + 1] | words[offset + 2] | words[offset + 3]
    | words[offset + 4] | words[offset + 5] | words[offset + 6] | words[offset + 7]
  ) === 0;
}

function sparsePrepared(compact: CompactedInput, explicitTemporaryBytes: number): PreparedCommitment {
  return {
    path: compact.nonzeroCount === 0 ? "zero" : "sparse",
    nonzeroCount: compact.nonzeroCount,
    chunks: compact.nonzeroCount === 0
      ? []
      : [{ bases: compact.bases, montgomeryScalars: compact.montgomeryScalars }],
    explicitTemporaryBytes,
  };
}

function zeroPrepared(): PreparedCommitment {
  return {
    path: "zero",
    nonzeroCount: 0,
    chunks: [],
    explicitTemporaryBytes: 0,
  };
}

function shouldUseDense(pointCount: number, nonzeroCount: number): boolean {
  return pointCount > DENSE_CHUNK_POINTS && nonzeroCount / pointCount >= DENSE_MIN_DENSITY;
}

function extractRowRange(
  source: Uint8Array,
  sourceYSize: number,
  xStart: number,
  rowCount: number,
  ySize: number,
  elementBytes: number,
): Uint8Array {
  if (ySize === sourceYSize) {
    return source.subarray(
      xStart * sourceYSize * elementBytes,
      (xStart + rowCount) * sourceYSize * elementBytes,
    );
  }
  const output = new Uint8Array(rowCount * ySize * elementBytes);
  for (let row = 0; row < rowCount; row += 1) {
    const sourceStart = ((xStart + row) * sourceYSize) * elementBytes;
    output.set(
      source.subarray(sourceStart, sourceStart + ySize * elementBytes),
      row * ySize * elementBytes,
    );
  }
  return output;
}

function buildBenchmarkCase(
  runtime: CurveRuntime,
  shape: Shape,
  density: number,
  seed: bigint,
  rawBases: Uint8Array,
): BenchmarkCase {
  return {
    shape,
    density,
    rawBases,
    polynomial: BivariatePolynomialBuffer.fromOwnedBuffer(
      runtime.Fr,
      buildCoefficientBuffer(runtime, shape, density, seed),
      shape.xSize,
      shape.ySize,
    ),
  };
}

function buildPatternedAffineBases(
  runtime: CurveRuntime,
  length: number,
): Uint8Array {
  const patternLength = Math.min(length, 256);
  const pattern: Uint8Array[] = [];
  let point = runtime.G1.generator;
  for (let index = 0; index < patternLength; index += 1) {
    pattern.push(runtime.G1.toAffine(point));
    point = runtime.G1.add(point, runtime.G1.generator);
  }
  const output = new Uint8Array(length * G1_AFFINE_BYTES);
  for (let index = 0; index < length; index += 1) {
    output.set(pattern[index % patternLength], index * G1_AFFINE_BYTES);
  }
  return output;
}

function buildCoefficientBuffer(
  runtime: CurveRuntime,
  shape: Shape,
  density: number,
  seed: bigint,
): Uint8Array {
  const count = shape.xSize * shape.ySize;
  const random = createSplitMix64(
    seed + BigInt(count) * 0x9e3779b97f4a7c15n + BigInt(Math.round(density * 1000)),
  );
  const pattern = Array.from({ length: Math.min(count, 256) }, () =>
    randomFieldElement(runtime, random));
  const output = runtime.Fr.createZeroBuffer(count);
  for (let index = 0; index < count; index += 1) {
    if (density >= 1 || (density > 0 && randomUnit(random) < density)) {
      runtime.Fr.writeBufferElement(output, index, pattern[index % pattern.length]);
    }
  }
  return output;
}

async function checkSmallParity(runtime: CurveRuntime): Promise<void> {
  const rawBases = buildPatternedAffineBases(runtime, 32);
  for (const density of [0, 0.1, 0.5, 1]) {
    const benchmarkCase = buildBenchmarkCase(runtime, { xSize: 8, ySize: 4 }, density, 0x504152495459n, rawBases);
    const current = await runCandidate(runtime, benchmarkCase, "current-production");
    const actual = await runCandidate(runtime, benchmarkCase, "scalar-two-scan");
    if (!runtime.G1.eq(actual.result, current.result)) {
      throw new Error(`Small commitment parity failed at density ${density}.`);
    }
  }
}

function parseOptions(args: readonly string[]): BenchmarkOptions {
  const values = new Map<string, string>();
  for (const arg of args) {
    if (arg === "--single-thread") {
      values.set("single-thread", "true");
      continue;
    }
    const match = /^--([a-zA-Z-]+)=(.+)$/.exec(arg);
    if (match === null) {
      throw new Error(`Unknown argument '${arg}'.`);
    }
    values.set(match[1], match[2]);
  }
  return {
    seed: parseSeed(values.get("seed") ?? "0x544f4b414d414b"),
    shapes: parseShapes(values.get("shapes") ?? "1024x256"),
    densities: parseDensities(values.get("densities") ?? "0,0.1,0.25,0.5,0.75,1"),
    candidates: parseCandidates(
      values.get("candidates")
      ?? "scalar-two-scan,current-production",
    ),
    iterations: parsePositiveInteger(values.get("iterations") ?? "3", "iterations"),
    warmup: parseNonNegativeInteger(values.get("warmup") ?? "1", "warmup"),
    singleThread: values.get("single-thread") === "true",
    jsonPath: values.get("json"),
  };
}

function parseShapes(value: string): Shape[] {
  return value.split(",").map((entry) => {
    const match = /^([0-9]+)x([0-9]+)$/.exec(entry.trim());
    if (match === null) {
      throw new Error(`Invalid shape '${entry}'. Expected <xSize>x<ySize>.`);
    }
    return {
      xSize: parsePositiveInteger(match[1], "xSize"),
      ySize: parsePositiveInteger(match[2], "ySize"),
    };
  });
}

function parseDensities(value: string): number[] {
  return value.split(",").map((entry) => {
    const parsed = Number(entry.trim());
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      throw new Error("Densities must be finite numbers between zero and one.");
    }
    return parsed;
  });
}

function parseCandidates(value: string): Candidate[] {
  const valid = new Set<Candidate>([
    "scalar-two-scan",
    "current-production",
  ]);
  const candidates = value.split(",").map((entry) => entry.trim() as Candidate);
  if (!candidates.includes("current-production")) {
    throw new Error("Candidate selection must include current-production.");
  }
  for (const candidate of candidates) {
    if (!valid.has(candidate)) {
      throw new Error(`Unknown candidate '${candidate}'.`);
    }
  }
  return candidates;
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

function createSplitMix64(seed: bigint): () => bigint {
  let state = seed & 0xffffffffffffffffn;
  return () => {
    state = (state + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
    let value = state;
    value = ((value ^ (value >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
    value = ((value ^ (value >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
    return value ^ (value >> 31n);
  };
}

function randomUnit(random: () => bigint): number {
  return Number(random() >> 11n) / 2 ** 53;
}

function randomFieldElement(
  runtime: CurveRuntime,
  random: () => bigint,
): FieldElement {
  let value = 0n;
  for (let index = 0; index < 4; index += 1) {
    value = (value << 64n) | random();
  }
  return runtime.Fr.fromBigInt((value % (runtime.Fr.modulus - 1n)) + 1n);
}

function summarize(samples: readonly number[]): Summary {
  const sorted = [...samples].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return {
    median: sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle],
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

function printRows(rows: readonly TimingRow[], options: BenchmarkOptions): void {
  console.log(
    `Commitment density benchmark mode=${options.singleThread ? "single-thread" : "multi-thread"}`
    + ` seed=0x${options.seed.toString(16)} iterations=${options.iterations} warmup=${options.warmup}`,
  );
  console.table(rows.map((row) => ({
    candidate: row.candidate,
    shape: row.shape,
    density: row.density.toFixed(2),
    path: row.path,
    nonzero: row.nonzeroCount,
    "prep ms": row.preparationMs.median.toFixed(3),
    "convert ms": row.conversionMs.median.toFixed(3),
    "msm ms": row.msmMs.median.toFixed(3),
    "accumulate ms": row.accumulationMs.median.toFixed(3),
    "total ms": row.totalMs.median.toFixed(3),
    "temporary MiB": (row.explicitTemporaryBytes / 1024 / 1024).toFixed(1),
  })));
}

async function writeJsonReport(
  jsonPath: string,
  options: BenchmarkOptions,
  rows: readonly TimingRow[],
): Promise<void> {
  const resolved = path.resolve(jsonPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify({
    benchmark: "commitment-density-production-boundary",
    mode: options.singleThread ? "single-thread" : "multi-thread",
    seed: `0x${options.seed.toString(16)}`,
    shapes: options.shapes.map(formatShape),
    densities: options.densities,
    candidates: options.candidates,
    iterations: options.iterations,
    warmup: options.warmup,
    rows,
  }, null, 2)}\n`);
}

function formatShape(shape: Shape): string {
  return `${shape.xSize}x${shape.ySize}`;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
