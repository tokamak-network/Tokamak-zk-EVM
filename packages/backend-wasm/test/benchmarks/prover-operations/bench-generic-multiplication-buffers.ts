import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";

import {
  BivariatePolynomialBuffer,
  type FieldRuntime,
} from "../../../src/index.js";
import {
  batchMultiplyOneTask,
  batchMultiplyWorkers,
  createPointwiseBenchmarkRuntimes,
  type PointwiseBenchmarkRuntimes,
} from "./pointwise-mul-benchmark-support.js";

type Candidate =
  | "legacy-production"
  | "retained-scalar-production"
  | "current-production"
  | "row-copy-padding"
  | "raw-pointwise"
  | "combined"
  | "wasm-single-pointwise"
  | "wasm-worker-pointwise";
type ProfileStage =
  | "degree-discovery"
  | "left-padding"
  | "left-forward-ntt"
  | "right-padding"
  | "right-forward-ntt"
  | "pointwise-multiplication"
  | "pointwise-multiplication-wasm-single"
  | "pointwise-multiplication-wasm-workers"
  | "inverse-ntt-and-output";

interface Shape {
  readonly xSize: number;
  readonly ySize: number;
}

interface Options {
  readonly seed: bigint;
  readonly shapes: readonly Shape[];
  readonly candidates: readonly Candidate[];
  readonly iterations: number;
  readonly warmup: number;
  readonly profileIterations: number;
  readonly jsonPath: string;
}

interface Summary {
  readonly medianMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly samplesMs: readonly number[];
}

interface BenchmarkRecord extends Summary {
  readonly candidate: Candidate;
  readonly shape: string;
  readonly outputBytes: number;
}

interface ProfileRecord extends Summary {
  readonly stage: ProfileStage;
  readonly shape: string;
}

let resultSink = 0;

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const runtimes = await createPointwiseBenchmarkRuntimes();

  try {
    await checkSmallParity(runtimes);
    const benchmarkRecords: BenchmarkRecord[] = [];
    const profileRecords: ProfileRecord[] = [];
    for (const shape of options.shapes) {
      const result = await benchmarkShape(runtimes, shape, options);
      benchmarkRecords.push(...result.benchmarks);
      profileRecords.push(...result.profiles);
    }
    printRecords(benchmarkRecords, profileRecords);
    await writeReport(options, benchmarkRecords, profileRecords);
  } finally {
    await runtimes.terminate();
  }
}

async function benchmarkShape(
  runtimes: PointwiseBenchmarkRuntimes,
  shape: Shape,
  options: Options,
): Promise<{
  readonly benchmarks: readonly BenchmarkRecord[];
  readonly profiles: readonly ProfileRecord[];
}> {
  const field = runtimes.field;
  const left = deterministicPolynomial(field, shape, options.seed);
  const right = deterministicPolynomial(field, shape, options.seed + 1n);
  const expected = await left.mul(right);

  for (const candidate of options.candidates) {
    assertPolynomialEqual(
      await runCandidate(candidate, left, right, runtimes),
      expected,
      `${formatShape(shape)} ${candidate}`,
    );
  }

  const samples = new Map<Candidate, number[]>(
    options.candidates.map((candidate) => [candidate, []]),
  );
  for (let index = 0; index < options.warmup; index += 1) {
    for (const candidate of options.candidates) {
      consume(await runCandidate(candidate, left, right, runtimes));
    }
  }
  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    const offset = iteration % options.candidates.length;
    for (let index = 0; index < options.candidates.length; index += 1) {
      const candidate = options.candidates[(index + offset) % options.candidates.length];
      const start = performance.now();
      consume(await runCandidate(candidate, left, right, runtimes));
      samples.get(candidate)?.push(performance.now() - start);
    }
  }

  const profileSamples = new Map<ProfileStage, number[]>();
  for (let iteration = 0; iteration < options.profileIterations; iteration += 1) {
    const profile = await profileCurrentMultiplication(left, right);
    consume(profile.result);
    for (const [stage, durationMs] of profile.durations) {
      const values = profileSamples.get(stage) ?? [];
      values.push(durationMs);
      profileSamples.set(stage, values);
    }
  }
  const pointwiseProfiles = await profilePointwiseCandidates(left, right, runtimes, options.profileIterations);
  for (const [stage, values] of pointwiseProfiles) {
    profileSamples.set(stage, values);
  }

  return {
    benchmarks: options.candidates.map((candidate) => ({
      candidate,
      shape: formatShape(shape),
      outputBytes: expected.coefficients.byteLength,
      ...summarize(requiredSamples(samples, candidate)),
    })),
    profiles: [...profileSamples].map(([stage, values]) => ({
      stage,
      shape: formatShape(shape),
      ...summarize(values),
    })),
  };
}

async function runCandidate(
  candidate: Candidate,
  left: BivariatePolynomialBuffer,
  right: BivariatePolynomialBuffer,
  runtimes: PointwiseBenchmarkRuntimes,
): Promise<BivariatePolynomialBuffer> {
  switch (candidate) {
    case "legacy-production":
      return await genericMultiply(left, right, false, "legacy", runtimes);
    case "retained-scalar-production":
      return await genericMultiply(left, right, true, "raw", runtimes);
    case "current-production":
      return await left.mul(right);
    case "row-copy-padding":
      return await genericMultiply(left, right, true, "legacy", runtimes);
    case "raw-pointwise":
      return await genericMultiply(left, right, false, "raw", runtimes);
    case "combined":
      return await genericMultiply(left, right, true, "raw", runtimes);
    case "wasm-single-pointwise":
      return await genericMultiply(left, right, true, "wasm-single", runtimes);
    case "wasm-worker-pointwise":
      return await genericMultiply(left, right, true, "wasm-workers", runtimes);
  }
}

async function genericMultiply(
  left: BivariatePolynomialBuffer,
  right: BivariatePolynomialBuffer,
  rowCopyPadding: boolean,
  pointwise: "legacy" | "raw" | "wasm-single" | "wasm-workers",
  runtimes: PointwiseBenchmarkRuntimes,
): Promise<BivariatePolynomialBuffer> {
  const shape = multiplicationShape(left, right);
  const leftPadded = rowCopyPadding
    ? resizeByRowCopy(left, shape.xSize, shape.ySize)
    : left.resize(shape.xSize, shape.ySize);
  const rightPadded = rowCopyPadding
    ? resizeByRowCopy(right, shape.xSize, shape.ySize)
    : right.resize(shape.xSize, shape.ySize);
  const leftEvals = await leftPadded.toRouEvals();
  const rightEvals = await rightPadded.toRouEvals();
  let productEvals: Uint8Array;
  switch (pointwise) {
    case "legacy":
      productEvals = pointwiseLegacy(left.field, leftEvals, rightEvals);
      break;
    case "raw":
      productEvals = pointwiseRaw(left.field, leftEvals, rightEvals);
      break;
    case "wasm-single":
      productEvals = await batchMultiplyOneTask(runtimes.singleField, leftEvals, rightEvals);
      break;
    case "wasm-workers":
      productEvals = await batchMultiplyWorkers(runtimes.multiField, leftEvals, rightEvals);
      break;
  }
  return await BivariatePolynomialBuffer.fromRouEvals(
    left.field,
    productEvals,
    shape.xSize,
    shape.ySize,
  );
}

async function profilePointwiseCandidates(
  left: BivariatePolynomialBuffer,
  right: BivariatePolynomialBuffer,
  runtimes: PointwiseBenchmarkRuntimes,
  iterations: number,
): Promise<ReadonlyMap<ProfileStage, number[]>> {
  const shape = multiplicationShape(left, right);
  const leftEvals = await resizeByRowCopy(left, shape.xSize, shape.ySize).toRouEvals();
  const rightEvals = await resizeByRowCopy(right, shape.xSize, shape.ySize).toRouEvals();
  const expected = pointwiseRaw(left.field, leftEvals, rightEvals);
  const candidates: readonly {
    stage: ProfileStage;
    run(): Promise<Uint8Array> | Uint8Array;
  }[] = [
    {
      stage: "pointwise-multiplication",
      run: () => pointwiseRaw(left.field, leftEvals, rightEvals),
    },
    {
      stage: "pointwise-multiplication-wasm-single",
      run: async () => await batchMultiplyOneTask(runtimes.singleField, leftEvals, rightEvals),
    },
    {
      stage: "pointwise-multiplication-wasm-workers",
      run: async () => await batchMultiplyWorkers(runtimes.multiField, leftEvals, rightEvals),
    },
  ];
  for (const candidate of candidates) {
    assertBytesEqual(await candidate.run(), expected, candidate.stage);
  }

  const samples = new Map<ProfileStage, number[]>(candidates.map(({ stage }) => [stage, []]));
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const offset = iteration % candidates.length;
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[(index + offset) % candidates.length];
      const start = performance.now();
      consumeBytes(await candidate.run());
      samples.get(candidate.stage)?.push(performance.now() - start);
    }
  }
  return samples;
}

async function profileCurrentMultiplication(
  left: BivariatePolynomialBuffer,
  right: BivariatePolynomialBuffer,
): Promise<{
  readonly result: BivariatePolynomialBuffer;
  readonly durations: ReadonlyMap<ProfileStage, number>;
}> {
  const durations = new Map<ProfileStage, number>();
  let start = performance.now();
  const shape = multiplicationShape(left, right);
  durations.set("degree-discovery", performance.now() - start);

  start = performance.now();
  const leftPadded = left.resize(shape.xSize, shape.ySize);
  durations.set("left-padding", performance.now() - start);

  start = performance.now();
  const leftEvals = await leftPadded.toRouEvals();
  durations.set("left-forward-ntt", performance.now() - start);

  start = performance.now();
  const rightPadded = right.resize(shape.xSize, shape.ySize);
  durations.set("right-padding", performance.now() - start);

  start = performance.now();
  const rightEvals = await rightPadded.toRouEvals();
  durations.set("right-forward-ntt", performance.now() - start);

  start = performance.now();
  const productEvals = pointwiseLegacy(left.field, leftEvals, rightEvals);
  durations.set("pointwise-multiplication", performance.now() - start);

  start = performance.now();
  const result = await BivariatePolynomialBuffer.fromRouEvals(
    left.field,
    productEvals,
    shape.xSize,
    shape.ySize,
  );
  durations.set("inverse-ntt-and-output", performance.now() - start);
  return { result, durations };
}

function resizeByRowCopy(
  polynomial: BivariatePolynomialBuffer,
  targetXSize: number,
  targetYSize: number,
): BivariatePolynomialBuffer {
  const output = new Uint8Array(targetXSize * targetYSize * polynomial.field.byteLength);
  const sourceRowBytes = polynomial.ySize * polynomial.field.byteLength;
  const targetRowBytes = targetYSize * polynomial.field.byteLength;
  for (let x = 0; x < polynomial.xSize; x += 1) {
    output.set(
      polynomial.coefficients.subarray(x * sourceRowBytes, (x + 1) * sourceRowBytes),
      x * targetRowBytes,
    );
  }
  return BivariatePolynomialBuffer.fromOwnedBuffer(polynomial.field, output, targetXSize, targetYSize);
}

function pointwiseLegacy(field: FieldRuntime, left: Uint8Array, right: Uint8Array): Uint8Array {
  const count = field.bufferElementCount(left);
  if (field.bufferElementCount(right) !== count) {
    throw new Error("Pointwise multiplication buffers must have matching lengths.");
  }
  const output = field.createZeroBuffer(count);
  for (let index = 0; index < count; index += 1) {
    field.writeBufferElement(
      output,
      index,
      field.mul(field.readBufferElement(left, index), field.readBufferElement(right, index)),
    );
  }
  return output;
}

function pointwiseRaw(field: FieldRuntime, left: Uint8Array, right: Uint8Array): Uint8Array {
  const count = field.bufferElementCount(left);
  if (field.bufferElementCount(right) !== count) {
    throw new Error("Pointwise multiplication buffers must have matching lengths.");
  }
  const output = new Uint8Array(left.byteLength);
  for (let offset = 0; offset < left.byteLength; offset += field.byteLength) {
    output.set(
      field.mul(
        left.subarray(offset, offset + field.byteLength),
        right.subarray(offset, offset + field.byteLength),
      ),
      offset,
    );
  }
  return output;
}

function multiplicationShape(
  left: BivariatePolynomialBuffer,
  right: BivariatePolynomialBuffer,
): Shape {
  const leftDegree = left.findDegree();
  const rightDegree = right.findDegree();
  if (
    leftDegree.xDegree < 0
    || leftDegree.yDegree < 0
    || rightDegree.xDegree < 0
    || rightDegree.yDegree < 0
  ) {
    throw new Error("Generic multiplication benchmark inputs must be non-zero.");
  }
  return {
    xSize: nextPowerOfTwo(leftDegree.xDegree + rightDegree.xDegree + 1),
    ySize: nextPowerOfTwo(leftDegree.yDegree + rightDegree.yDegree + 1),
  };
}

async function checkSmallParity(runtimes: PointwiseBenchmarkRuntimes): Promise<void> {
  const field = runtimes.field;
  for (const shape of [{ xSize: 2, ySize: 2 }, { xSize: 4, ySize: 2 }, { xSize: 4, ySize: 4 }]) {
    const left = deterministicPolynomial(field, shape, 0x47454e455249434dn);
    const right = deterministicPolynomial(field, shape, 0x47454e455249434en);
    const expected = await left.mul(right);
    for (
      const candidate of [
        "row-copy-padding",
        "raw-pointwise",
        "combined",
        "wasm-single-pointwise",
        "wasm-worker-pointwise",
      ] as const
    ) {
      assertPolynomialEqual(
        await runCandidate(candidate, left, right, runtimes),
        expected,
        `small ${formatShape(shape)} ${candidate}`,
      );
    }
  }
}

function deterministicPolynomial(field: FieldRuntime, shape: Shape, seed: bigint): BivariatePolynomialBuffer {
  const count = shape.xSize * shape.ySize;
  const patternLength = Math.min(count, 256);
  const pattern = Array.from({ length: patternLength }, (_, index) =>
    field.fromBigInt(((seed + BigInt(index + 1) * 0x9e3779b1n) % (field.modulus - 1n)) + 1n),
  );
  const coefficients = new Uint8Array(count * field.byteLength);
  for (let index = 0; index < count; index += 1) {
    coefficients.set(pattern[index % patternLength], index * field.byteLength);
  }
  return BivariatePolynomialBuffer.fromOwnedBuffer(field, coefficients, shape.xSize, shape.ySize);
}

function assertPolynomialEqual(
  actual: BivariatePolynomialBuffer,
  expected: BivariatePolynomialBuffer,
  label: string,
): void {
  if (actual.xSize !== expected.xSize || actual.ySize !== expected.ySize) {
    throw new Error(`${label}: shape mismatch.`);
  }
  for (let index = 0; index < actual.coefficients.byteLength; index += 1) {
    if (actual.coefficients[index] !== expected.coefficients[index]) {
      throw new Error(`${label}: coefficient mismatch at byte ${index}.`);
    }
  }
}

function consume(polynomial: BivariatePolynomialBuffer): void {
  resultSink ^= polynomial.coefficients[0] ?? 0;
  resultSink ^= polynomial.coefficients[polynomial.coefficients.byteLength - 1] ?? 0;
}

function consumeBytes(buffer: Uint8Array): void {
  resultSink ^= buffer[0] ?? 0;
  resultSink ^= buffer[buffer.byteLength - 1] ?? 0;
}

function assertBytesEqual(actual: Uint8Array, expected: Uint8Array, label: string): void {
  if (actual.byteLength !== expected.byteLength) {
    throw new Error(`${label}: byte-length mismatch.`);
  }
  for (let index = 0; index < actual.byteLength; index += 1) {
    if (actual[index] !== expected[index]) {
      throw new Error(`${label}: mismatch at byte ${index}.`);
    }
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
    seed: parseSeed(values.get("seed") ?? "0x47454e455249434d"),
    shapes: parseShapes(values.get("shapes") ?? "4096x256"),
    candidates: parseCandidates(
      values.get("candidates") ?? "retained-scalar-production,current-production,wasm-single-pointwise",
    ),
    iterations: parsePositiveInteger(values.get("iterations") ?? "3", "iterations"),
    warmup: parseNonNegativeInteger(values.get("warmup") ?? "1", "warmup"),
    profileIterations: parsePositiveInteger(values.get("profile-iterations") ?? "3", "profile-iterations"),
    jsonPath: values.get("json") ?? "tmp/timing/generic-multiplication-buffers.json",
  };
}

function parseCandidates(value: string): Candidate[] {
  const valid = new Set<Candidate>([
    "legacy-production",
    "retained-scalar-production",
    "current-production",
    "row-copy-padding",
    "raw-pointwise",
    "combined",
    "wasm-single-pointwise",
    "wasm-worker-pointwise",
  ]);
  const candidates = value.split(",").map((entry) => entry.trim() as Candidate);
  if (candidates.length === 0 || !candidates.includes("current-production")) {
    throw new Error("Candidate selection must include current-production.");
  }
  for (const candidate of candidates) {
    if (!valid.has(candidate)) {
      throw new Error(`Unknown candidate '${candidate}'.`);
    }
  }
  return candidates;
}

function parseShapes(value: string): Shape[] {
  return value.split(",").map((entry) => {
    const match = /^([0-9]+)x([0-9]+)$/.exec(entry.trim());
    if (match === null) {
      throw new Error(`Invalid shape '${entry}'. Expected <xSize>x<ySize>.`);
    }
    return {
      xSize: parsePowerOfTwo(match[1], "xSize"),
      ySize: parsePowerOfTwo(match[2], "ySize"),
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

function requiredSamples(samples: ReadonlyMap<Candidate, readonly number[]>, candidate: Candidate): readonly number[] {
  const values = samples.get(candidate);
  if (values === undefined || values.length === 0) {
    throw new Error(`No timing samples were recorded for ${candidate}.`);
  }
  return values;
}

function summarize(samples: readonly number[]): Summary {
  const sorted = [...samples].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return {
    medianMs: sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle],
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
    samplesMs: [...samples],
  };
}

function nextPowerOfTwo(value: number): number {
  let size = 1;
  while (size < value) {
    size *= 2;
  }
  return size;
}

function formatShape(shape: Shape): string {
  return `${shape.xSize}x${shape.ySize}`;
}

function printRecords(benchmarks: readonly BenchmarkRecord[], profiles: readonly ProfileRecord[]): void {
  console.table(benchmarks.map((record) => ({
    candidate: record.candidate,
    shape: record.shape,
    "median ms": record.medianMs.toFixed(3),
    "min ms": record.minMs.toFixed(3),
    "max ms": record.maxMs.toFixed(3),
    "output MiB": (record.outputBytes / 1024 / 1024).toFixed(1),
  })));
  console.table(profiles.map((record) => ({
    stage: record.stage,
    shape: record.shape,
    "median ms": record.medianMs.toFixed(3),
    "min ms": record.minMs.toFixed(3),
    "max ms": record.maxMs.toFixed(3),
  })));
}

async function writeReport(
  options: Options,
  benchmarks: readonly BenchmarkRecord[],
  profiles: readonly ProfileRecord[],
): Promise<void> {
  const outputPath = path.resolve(options.jsonPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    options: {
      seed: `0x${options.seed.toString(16)}`,
      shapes: options.shapes.map(formatShape),
      candidates: options.candidates,
      iterations: options.iterations,
      warmup: options.warmup,
      profileIterations: options.profileIterations,
    },
    benchmarks,
    profiles,
  }, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
