import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";

import {
  BivariatePolynomialBuffer,
  createCurveRuntime,
  type FieldRuntime,
} from "../../../src/index.js";
import { multiplyOmegaShiftedProducts } from "../../../src/prover/internal/polynomial-ops.js";

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
  readonly candidate: "current-production" | "shifted-rou-reuse";
  readonly shape: string;
  readonly outputBytes: number;
  readonly temporaryBytesExcludingResults: number;
}

let resultSink = 0;

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const runtime = await createCurveRuntime();

  try {
    await checkSmallParity(runtime.Fr);
    const records: BenchmarkRecord[] = [];
    for (const shape of options.shapes) {
      records.push(...await benchmarkShape(runtime.Fr, shape, options));
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
  options: Options,
): Promise<BenchmarkRecord[]> {
  const r = deterministicPolynomial(field, shape, options.seed);
  const g = deterministicPolynomial(field, shape, options.seed + 1n);
  const f = deterministicPolynomial(field, shape, options.seed + 2n);
  const rOmega = r.scaleCoeffsX(field.inv(field.rootOfUnity(shape.mI)));
  const rOmegaOmega = rOmega.scaleCoeffsY(field.inv(field.rootOfUnity(shape.sMax)));

  const current = await currentProducts(r, rOmega, rOmegaOmega, g, f);
  const candidate = await shiftedRouProducts(r, g, f, shape.mI, shape.sMax);
  assertTripletEqual(candidate, current, `${formatShape(shape)} candidate`);

  const summaries = await measureAlternating(
    options,
    async () => await currentProducts(r, rOmega, rOmegaOmega, g, f),
    async () => await shiftedRouProducts(r, g, f, shape.mI, shape.sMax),
  );
  const resultBytes =
    current.rG.coefficients.byteLength
    + current.rOmegaF.coefficients.byteLength
    + current.rOmegaOmegaF.coefficients.byteLength;
  const domainBytes = current.rG.coefficients.byteLength;

  return [
    {
      candidate: "current-production",
      shape: formatShape(shape),
      outputBytes: resultBytes,
      temporaryBytesExcludingResults: domainBytes * 3,
      ...summaries.current,
    },
    {
      candidate: "shifted-rou-reuse",
      shape: formatShape(shape),
      outputBytes: resultBytes,
      temporaryBytesExcludingResults: domainBytes * 3,
      ...summaries.candidate,
    },
  ];
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

async function checkSmallParity(field: FieldRuntime): Promise<void> {
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

async function measureAlternating(
  options: Options,
  current: () => Promise<ProductTriplet>,
  candidate: () => Promise<ProductTriplet>,
): Promise<{ readonly current: TimingSummary; readonly candidate: TimingSummary }> {
  for (let index = 0; index < options.warmup; index += 1) {
    consume(await current());
    consume(await candidate());
  }

  const currentSamples: number[] = [];
  const candidateSamples: number[] = [];
  for (let index = 0; index < options.iterations; index += 1) {
    if (index % 2 === 0) {
      currentSamples.push(await timed(current));
      candidateSamples.push(await timed(candidate));
    } else {
      candidateSamples.push(await timed(candidate));
      currentSamples.push(await timed(current));
    }
  }
  return {
    current: summarize(currentSamples),
    candidate: summarize(candidateSamples),
  };
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
