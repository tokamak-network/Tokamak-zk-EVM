import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";

import {
  BivariatePolynomialBuffer,
  type FieldRuntime,
} from "../../../src/index.js";
import { multiplyOmegaShiftedProducts } from "../../../src/prover/polynomial/polynomial-ops.js";
import {
  batchMultiplyOneTask,
  batchMultiplyShiftedOneTask,
  batchMultiplyShiftedWorkers,
  batchMultiplyWorkers,
  createPointwiseBenchmarkRuntimes,
  type PointwiseBenchmarkRuntimes,
} from "./pointwise-mul-benchmark-support.js";

type Candidate = "retained-scalar-production" | "current-production" | "wasm-single-pointwise";

interface Shape {
  readonly mI: number;
  readonly sMax: number;
}

interface Options {
  readonly seed: bigint;
  readonly shapes: readonly Shape[];
  readonly iterations: number;
  readonly warmup: number;
  readonly jsonPath: string;
}

interface ProductTriplet {
  readonly rG: BivariatePolynomialBuffer;
  readonly rOmegaF: BivariatePolynomialBuffer;
  readonly rOmegaOmegaF: BivariatePolynomialBuffer;
}

interface TimingSummary {
  readonly medianMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly samplesMs: readonly number[];
}

interface BenchmarkRecord extends TimingSummary {
  readonly candidate: Candidate;
  readonly shape: string;
  readonly outputBytes: number;
  readonly temporaryBytesExcludingResults: number;
}

let resultSink = 0;

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const runtimes = await createPointwiseBenchmarkRuntimes();

  try {
    await checkSmallParity(runtimes);
    const records: BenchmarkRecord[] = [];
    for (const shape of options.shapes) {
      records.push(...await benchmarkShape(runtimes, shape, options));
    }
    printRecords(records);
    await writeReport(options, records);
  } finally {
    await runtimes.terminate();
  }
}

async function benchmarkShape(
  runtimes: PointwiseBenchmarkRuntimes,
  shape: Shape,
  options: Options,
): Promise<BenchmarkRecord[]> {
  const field = runtimes.field;
  const r = deterministicPolynomial(field, shape, options.seed);
  const g = deterministicPolynomial(field, shape, options.seed + 1n);
  const f = deterministicPolynomial(field, shape, options.seed + 2n);
  const expected = await shiftedRouProducts(r, g, f, shape.mI, shape.sMax);
  const runs: Readonly<Record<Candidate, () => Promise<ProductTriplet>>> = {
    "retained-scalar-production": async () =>
      await scalarShiftedRouProducts(r, g, f, shape.mI, shape.sMax),
    "current-production": async () => await shiftedRouProducts(r, g, f, shape.mI, shape.sMax),
    "wasm-single-pointwise": async () =>
      await batchShiftedRouProducts(r, g, f, shape.mI, shape.sMax, runtimes, "single"),
  };
  for (const [candidate, run] of Object.entries(runs) as [Candidate, () => Promise<ProductTriplet>][]) {
    assertTripletEqual(await run(), expected, `${formatShape(shape)} ${candidate}`);
  }

  const summaries = await measureCandidates(options, runs);
  const resultBytes =
    expected.rG.coefficients.byteLength
    + expected.rOmegaF.coefficients.byteLength
    + expected.rOmegaOmegaF.coefficients.byteLength;
  const domainBytes = expected.rG.coefficients.byteLength;

  return (Object.keys(runs) as Candidate[]).map((candidate) => ({
    candidate,
    shape: formatShape(shape),
    outputBytes: resultBytes,
    temporaryBytesExcludingResults:
      candidate === "retained-scalar-production"
        ? domainBytes * 3
        : candidate === "wasm-single-pointwise"
          ? domainBytes * 5
          : domainBytes * 6,
    ...summaries.get(candidate)!,
  }));
}

async function currentProducts(
  r: BivariatePolynomialBuffer,
  rOmega: BivariatePolynomialBuffer,
  rOmegaOmega: BivariatePolynomialBuffer,
  g: BivariatePolynomialBuffer,
  f: BivariatePolynomialBuffer,
): Promise<ProductTriplet> {
  const rG = await r.mul(g);
  const sharedRightEvals = await f.resize(rG.xSize, rG.ySize).toRouEvals();
  const rOmegaF = await productFromShiftedEvals(
    r.field,
    await rOmega.resize(rG.xSize, rG.ySize).toRouEvals(),
    sharedRightEvals,
    rG.xSize,
    rG.ySize,
    0,
    0,
  );
  const rOmegaOmegaF = await productFromShiftedEvals(
    r.field,
    await rOmegaOmega.resize(rG.xSize, rG.ySize).toRouEvals(),
    sharedRightEvals,
    rG.xSize,
    rG.ySize,
    0,
    0,
  );
  return { rG, rOmegaF, rOmegaOmegaF };
}

async function shiftedRouProducts(
  r: BivariatePolynomialBuffer,
  g: BivariatePolynomialBuffer,
  f: BivariatePolynomialBuffer,
  mI: number,
  sMax: number,
): Promise<ProductTriplet> {
  const [rG, rOmegaF, rOmegaOmegaF] = await multiplyOmegaShiftedProducts(r, g, f, mI, sMax);
  return { rG, rOmegaF, rOmegaOmegaF };
}

async function scalarShiftedRouProducts(
  r: BivariatePolynomialBuffer,
  g: BivariatePolynomialBuffer,
  f: BivariatePolynomialBuffer,
  mI: number,
  sMax: number,
): Promise<ProductTriplet> {
  const shape = multiplicationShape(r, g);
  const fShape = multiplicationShape(r, f);
  if (shape.xSize !== fShape.xSize || shape.ySize !== fShape.ySize) {
    throw new Error("Scalar shifted products must have matching output shapes.");
  }
  const { xSize, ySize } = shape;
  const baseEvals = await r.resize(xSize, ySize).toRouEvals();
  const gEvals = await g.resize(xSize, ySize).toRouEvals();
  const fEvals = await f.resize(xSize, ySize).toRouEvals();
  const xShift = -(xSize / mI);
  const yShift = -(ySize / sMax);
  const rG = await productFromShiftedEvals(r.field, baseEvals, gEvals, xSize, ySize, 0, 0);
  const rOmegaF = await productFromShiftedEvals(r.field, baseEvals, fEvals, xSize, ySize, xShift, 0);
  const rOmegaOmegaF = await productFromShiftedEvals(
    r.field,
    baseEvals,
    fEvals,
    xSize,
    ySize,
    xShift,
    yShift,
  );
  return { rG, rOmegaF, rOmegaOmegaF };
}

async function batchShiftedRouProducts(
  r: BivariatePolynomialBuffer,
  g: BivariatePolynomialBuffer,
  f: BivariatePolynomialBuffer,
  mI: number,
  sMax: number,
  runtimes: PointwiseBenchmarkRuntimes,
  mode: "single" | "workers",
): Promise<ProductTriplet> {
  const shape = multiplicationShape(r, g);
  const fShape = multiplicationShape(r, f);
  if (shape.xSize !== fShape.xSize || shape.ySize !== fShape.ySize) {
    throw new Error("Shifted pointwise benchmark products must have matching output shapes.");
  }
  const { xSize, ySize } = shape;
  const baseEvals = await r.resize(xSize, ySize).toRouEvals();
  const gEvals = await g.resize(xSize, ySize).toRouEvals();
  const fEvals = await f.resize(xSize, ySize).toRouEvals();
  const xShift = -(xSize / mI);
  const yShift = -(ySize / sMax);
  const rawField = mode === "single" ? runtimes.singleField : runtimes.multiField;
  const multiply = mode === "single" ? batchMultiplyOneTask : batchMultiplyWorkers;
  const multiplyShifted =
    mode === "single" ? batchMultiplyShiftedOneTask : batchMultiplyShiftedWorkers;

  const rGEvals = await multiply(rawField, baseEvals, gEvals);
  const rOmegaFEvals = await multiplyShifted(
    rawField,
    baseEvals,
    fEvals,
    xSize,
    ySize,
    xShift,
    0,
  );
  const rOmegaOmegaFEvals = await multiplyShifted(
    rawField,
    baseEvals,
    fEvals,
    xSize,
    ySize,
    xShift,
    yShift,
  );
  const rG = await BivariatePolynomialBuffer.fromRouEvals(r.field, rGEvals, xSize, ySize);
  const rOmegaF = await BivariatePolynomialBuffer.fromRouEvals(r.field, rOmegaFEvals, xSize, ySize);
  const rOmegaOmegaF = await BivariatePolynomialBuffer.fromRouEvals(
    r.field,
    rOmegaOmegaFEvals,
    xSize,
    ySize,
  );
  return { rG, rOmegaF, rOmegaOmegaF };
}

async function productFromShiftedEvals(
  field: FieldRuntime,
  leftEvals: Uint8Array,
  rightEvals: Uint8Array,
  xSize: number,
  ySize: number,
  xShift: number,
  yShift: number,
): Promise<BivariatePolynomialBuffer> {
  const output = new Uint8Array(leftEvals.byteLength);
  const elementBytes = field.byteLength;

  for (let x = 0; x < xSize; x += 1) {
    const sourceX = modulo(x + xShift, xSize);
    for (let y = 0; y < ySize; y += 1) {
      const sourceY = modulo(y + yShift, ySize);
      const leftOffset = (sourceX * ySize + sourceY) * elementBytes;
      const rightOffset = (x * ySize + y) * elementBytes;
      output.set(
        field.mul(
          leftEvals.subarray(leftOffset, leftOffset + elementBytes),
          rightEvals.subarray(rightOffset, rightOffset + elementBytes),
        ),
        rightOffset,
      );
    }
  }

  return await BivariatePolynomialBuffer.fromRouEvals(field, output, xSize, ySize);
}

async function checkSmallParity(runtimes: PointwiseBenchmarkRuntimes): Promise<void> {
  const field = runtimes.field;
  for (const shape of [{ mI: 2, sMax: 2 }, { mI: 4, sMax: 2 }, { mI: 4, sMax: 4 }]) {
    const r = deterministicPolynomial(field, shape, 0x524f55504152495459n);
    const g = deterministicPolynomial(field, shape, 0x524f5550415249545an);
    const f = deterministicPolynomial(field, shape, 0x524f5550415249545bn);
    const omegaXInv = field.inv(field.rootOfUnity(shape.mI));
    const omegaYInv = field.inv(field.rootOfUnity(shape.sMax));
    const rOmega = r.scaleCoeffsX(omegaXInv);
    const rOmegaOmega = rOmega.scaleCoeffsY(omegaYInv);
    const xSize = shape.mI * 2;
    const ySize = shape.sMax * 2;
    const rEvals = await r.resize(xSize, ySize).toRouEvals();
    const rOmegaEvals = await rOmega.resize(xSize, ySize).toRouEvals();
    const rOmegaOmegaEvals = await rOmegaOmega.resize(xSize, ySize).toRouEvals();

    assertShiftedEvalsEqual(
      field,
      rEvals,
      rOmegaEvals,
      xSize,
      ySize,
      -(xSize / shape.mI),
      0,
      `${formatShape(shape)} X shift`,
    );
    assertShiftedEvalsEqual(
      field,
      rEvals,
      rOmegaOmegaEvals,
      xSize,
      ySize,
      -(xSize / shape.mI),
      -(ySize / shape.sMax),
      `${formatShape(shape)} XY shift`,
    );

    assertTripletEqual(
      await shiftedRouProducts(r, g, f, shape.mI, shape.sMax),
      await currentProducts(r, rOmega, rOmegaOmega, g, f),
      `${formatShape(shape)} products`,
    );
    assertTripletEqual(
      await batchShiftedRouProducts(r, g, f, shape.mI, shape.sMax, runtimes, "single"),
      await shiftedRouProducts(r, g, f, shape.mI, shape.sMax),
      `${formatShape(shape)} single-task WASM products`,
    );
    assertTripletEqual(
      await batchShiftedRouProducts(r, g, f, shape.mI, shape.sMax, runtimes, "workers"),
      await shiftedRouProducts(r, g, f, shape.mI, shape.sMax),
      `${formatShape(shape)} worker WASM products`,
    );
  }
}

function assertShiftedEvalsEqual(
  field: FieldRuntime,
  base: Uint8Array,
  expected: Uint8Array,
  xSize: number,
  ySize: number,
  xShift: number,
  yShift: number,
  label: string,
): void {
  for (let x = 0; x < xSize; x += 1) {
    for (let y = 0; y < ySize; y += 1) {
      const actualIndex = modulo(x + xShift, xSize) * ySize + modulo(y + yShift, ySize);
      const expectedIndex = x * ySize + y;
      if (!field.eq(field.readBufferElement(base, actualIndex), field.readBufferElement(expected, expectedIndex))) {
        throw new Error(`${label}: evaluation mismatch at (${x}, ${y}).`);
      }
    }
  }
}

async function measureCandidates(
  options: Options,
  runs: Readonly<Record<Candidate, () => Promise<ProductTriplet>>>,
): Promise<ReadonlyMap<Candidate, TimingSummary>> {
  const candidates = Object.keys(runs) as Candidate[];
  for (let index = 0; index < options.warmup; index += 1) {
    for (const candidate of candidates) {
      consume(await runs[candidate]());
    }
  }

  const samples = new Map<Candidate, number[]>(candidates.map((candidate) => [candidate, []]));
  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    const offset = iteration % candidates.length;
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[(index + offset) % candidates.length];
      samples.get(candidate)?.push(await timed(runs[candidate]));
    }
  }
  return new Map(candidates.map((candidate) => [candidate, summarize(samples.get(candidate)!)]));
}

async function timed(run: () => Promise<ProductTriplet>): Promise<number> {
  const start = performance.now();
  consume(await run());
  return performance.now() - start;
}

function deterministicPolynomial(field: FieldRuntime, shape: Shape, seed: bigint): BivariatePolynomialBuffer {
  const elementCount = shape.mI * shape.sMax;
  const patternLength = Math.min(elementCount, 256);
  const pattern = Array.from({ length: patternLength }, (_, index) =>
    field.fromBigInt(((seed + BigInt(index + 1) * 0x9e3779b1n) % (field.modulus - 1n)) + 1n),
  );
  const coefficients = new Uint8Array(elementCount * field.byteLength);
  for (let index = 0; index < elementCount; index += 1) {
    coefficients.set(pattern[index % patternLength], index * field.byteLength);
  }
  return BivariatePolynomialBuffer.fromOwnedBuffer(field, coefficients, shape.mI, shape.sMax);
}

function assertTripletEqual(actual: ProductTriplet, expected: ProductTriplet, label: string): void {
  assertPolynomialEqual(actual.rG, expected.rG, `${label} rG`);
  assertPolynomialEqual(actual.rOmegaF, expected.rOmegaF, `${label} rOmegaF`);
  assertPolynomialEqual(actual.rOmegaOmegaF, expected.rOmegaOmegaF, `${label} rOmegaOmegaF`);
}

function assertPolynomialEqual(
  actual: BivariatePolynomialBuffer,
  expected: BivariatePolynomialBuffer,
  label: string,
): void {
  if (actual.xSize !== expected.xSize || actual.ySize !== expected.ySize) {
    throw new Error(`${label}: shape mismatch.`);
  }
  if (actual.coefficients.byteLength !== expected.coefficients.byteLength) {
    throw new Error(`${label}: byte-length mismatch.`);
  }
  for (let index = 0; index < actual.coefficients.byteLength; index += 1) {
    if (actual.coefficients[index] !== expected.coefficients[index]) {
      throw new Error(`${label}: coefficient mismatch at byte ${index}.`);
    }
  }
}

function consume(result: ProductTriplet): void {
  for (const polynomial of [result.rG, result.rOmegaF, result.rOmegaOmegaF]) {
    resultSink ^= polynomial.coefficients[0] ?? 0;
    resultSink ^= polynomial.coefficients[polynomial.coefficients.byteLength - 1] ?? 0;
  }
}

function parseOptions(args: readonly string[]): Options {
  const values = new Map<string, string>();
  for (const arg of args) {
    const match = /^--([a-zA-Z-]+)=(.+)$/.exec(arg);
    if (match === null) {
      throw new Error(`Unknown argument '${arg}'.`);
    }
    values.set(match[1], match[2]);
  }
  return {
    seed: parseSeed(values.get("seed") ?? "0x524f555245555345"),
    shapes: parseShapes(values.get("shapes") ?? "4096x256"),
    iterations: parsePositiveInteger(values.get("iterations") ?? "3", "iterations"),
    warmup: parseNonNegativeInteger(values.get("warmup") ?? "1", "warmup"),
    jsonPath: values.get("json") ?? "tmp/timing/shifted-rou-products.json",
  };
}

function parseShapes(value: string): Shape[] {
  return value.split(",").map((entry) => {
    const match = /^([0-9]+)x([0-9]+)$/.exec(entry.trim());
    if (match === null) {
      throw new Error(`Invalid shape '${entry}'. Expected <mI>x<sMax>.`);
    }
    return {
      mI: parsePowerOfTwo(match[1], "mI"),
      sMax: parsePowerOfTwo(match[2], "sMax"),
    };
  });
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

function summarize(samples: readonly number[]): TimingSummary {
  const sorted = [...samples].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return {
    medianMs:
      sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle],
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
    samplesMs: [...samples],
  };
}

function modulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function multiplicationShape(
  left: BivariatePolynomialBuffer,
  right: BivariatePolynomialBuffer,
): { readonly xSize: number; readonly ySize: number } {
  const leftDegree = left.findDegree();
  const rightDegree = right.findDegree();
  if (
    leftDegree.xDegree < 0
    || leftDegree.yDegree < 0
    || rightDegree.xDegree < 0
    || rightDegree.yDegree < 0
  ) {
    throw new Error("Shifted pointwise benchmark inputs must be non-zero.");
  }
  return {
    xSize: nextPowerOfTwo(leftDegree.xDegree + rightDegree.xDegree + 1),
    ySize: nextPowerOfTwo(leftDegree.yDegree + rightDegree.yDegree + 1),
  };
}

function nextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) {
    result *= 2;
  }
  return result;
}

function formatShape(shape: Shape): string {
  return `${shape.mI}x${shape.sMax}`;
}

function printRecords(records: readonly BenchmarkRecord[]): void {
  console.table(records.map((record) => ({
    candidate: record.candidate,
    shape: record.shape,
    "median ms": record.medianMs.toFixed(3),
    "min ms": record.minMs.toFixed(3),
    "max ms": record.maxMs.toFixed(3),
    "output MiB": (record.outputBytes / 1024 / 1024).toFixed(1),
    "temporary MiB": (record.temporaryBytesExcludingResults / 1024 / 1024).toFixed(1),
  })));
}

async function writeReport(options: Options, records: readonly BenchmarkRecord[]): Promise<void> {
  const outputPath = path.resolve(options.jsonPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    options: {
      seed: `0x${options.seed.toString(16)}`,
      shapes: options.shapes.map(formatShape),
      iterations: options.iterations,
      warmup: options.warmup,
    },
    records,
  }, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
