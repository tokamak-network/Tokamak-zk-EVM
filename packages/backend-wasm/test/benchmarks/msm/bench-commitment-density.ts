import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { BivariatePolynomialBuffer, createCurveRuntime, type CurveRuntime, type FieldElement } from "../../../src/index.js";

const G1_AFFINE_BYTES = 96;

interface BenchmarkOptions {
  readonly seed: bigint;
  readonly lengths: readonly number[];
  readonly densities: readonly number[];
  readonly iterations: number;
  readonly warmup: number;
  readonly jsonPath?: string;
}

interface BenchmarkCase {
  readonly length: number;
  readonly density: number;
  readonly nonzeroCount: number;
  readonly rawBases: Uint8Array;
  readonly polynomial: BivariatePolynomialBuffer;
}

interface PreparedMsmInput {
  readonly bases: Uint8Array;
  readonly scalars: Uint8Array;
}

interface TimingRow {
  readonly length: number;
  readonly density: number;
  readonly nonzeroCount: number;
  readonly sparsePrepMs: number;
  readonly sparseMsmMs: number;
  readonly sparseTotalMs: number;
  readonly compactPrepMs: number;
  readonly compactMsmMs: number;
  readonly compactTotalMs: number;
  readonly compactSpeedup: number;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const runtime = await createCurveRuntime({ singleThread: true });

  try {
    const rows: TimingRow[] = [];
    for (const length of options.lengths) {
      for (const density of options.densities) {
        const benchmarkCase = buildBenchmarkCase(runtime, length, density, options.seed);
        await assertEqualResults(runtime, benchmarkCase);
        rows.push(await measureCase(runtime, benchmarkCase, options));
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
    seed: parseSeed(values.get("seed") ?? "0x544f4b414d414b"),
    lengths: parseLengths(values.get("lengths") ?? "1024,4096,16384"),
    densities: parseDensities(values.get("densities") ?? "0.1,0.25,0.5,0.75,1"),
    iterations: parsePositiveInteger(values.get("iterations") ?? "2", "iterations"),
    warmup: parseNonNegativeInteger(values.get("warmup") ?? "1", "warmup"),
    jsonPath: values.get("json"),
  };
}

function parseSeed(value: string): bigint {
  if (!/^(0x[0-9a-fA-F]+|[0-9]+)$/.test(value)) {
    throw new Error("Seed must be a decimal integer or 0x-prefixed hexadecimal integer.");
  }

  return BigInt(value);
}

function parseLengths(value: string): number[] {
  const lengths = value.split(",").map((entry) => parsePositiveInteger(entry.trim(), "length"));
  if (lengths.length === 0) {
    throw new Error("At least one benchmark length is required.");
  }
  return lengths;
}

function parseDensities(value: string): number[] {
  const densities = value.split(",").map((entry) => {
    const parsed = Number(entry.trim());
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      throw new Error("Densities must be finite numbers between 0 and 1.");
    }
    return parsed;
  });
  if (densities.length === 0) {
    throw new Error("At least one density is required.");
  }
  return densities;
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

function buildBenchmarkCase(runtime: CurveRuntime, length: number, density: number, seed: bigint): BenchmarkCase {
  const rawBases = buildSequentialAffineBases(runtime, length);
  const { coefficients, nonzeroCount } = buildCoefficientBuffer(runtime, length, density, seed);
  return {
    length,
    density,
    nonzeroCount,
    rawBases,
    polynomial: BivariatePolynomialBuffer.fromBuffer(runtime.Fr, coefficients, 1, length),
  };
}

function buildSequentialAffineBases(runtime: CurveRuntime, length: number): Uint8Array {
  const output = new Uint8Array(length * G1_AFFINE_BYTES);
  let point = runtime.G1.generator;
  for (let index = 0; index < length; index += 1) {
    output.set(runtime.G1.toAffine(point), index * G1_AFFINE_BYTES);
    point = runtime.G1.add(point, runtime.G1.generator);
  }
  return output;
}

function buildCoefficientBuffer(
  runtime: CurveRuntime,
  length: number,
  density: number,
  seed: bigint,
): { readonly coefficients: Uint8Array; readonly nonzeroCount: number } {
  const random = createSplitMix64(seed + BigInt(length) * 0x9e3779b97f4a7c15n + BigInt(Math.round(density * 1000)));
  const output = runtime.Fr.createZeroBuffer(length);
  let nonzeroCount = 0;
  for (let index = 0; index < length; index += 1) {
    if (density >= 1 || randomUnit(random) < density) {
      runtime.Fr.writeBufferElement(output, index, randomFieldElement(runtime, random));
      nonzeroCount += 1;
    }
  }
  return { coefficients: output, nonzeroCount };
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

function randomFieldElement(runtime: CurveRuntime, random: () => bigint): FieldElement {
  let value = 0n;
  for (let index = 0; index < 4; index += 1) {
    value = (value << 64n) | random();
  }

  return runtime.Fr.fromBigInt((value % (runtime.Fr.modulus - 1n)) + 1n);
}

async function assertEqualResults(runtime: CurveRuntime, benchmarkCase: BenchmarkCase): Promise<void> {
  const sparse = await runSparse(runtime, benchmarkCase);
  const compact = await runCompact(runtime, benchmarkCase);
  if (!runtime.G1.eq(sparse, compact)) {
    throw new Error(`Sparse and compact commitments differ at length ${benchmarkCase.length}.`);
  }
}

async function measureCase(
  runtime: CurveRuntime,
  benchmarkCase: BenchmarkCase,
  options: BenchmarkOptions,
): Promise<TimingRow> {
  const sparsePrepared = prepareSparse(runtime, benchmarkCase);
  const sparsePrepMs = await measure(options, () => {
    prepareSparse(runtime, benchmarkCase);
  });
  const sparseMsmMs = await measure(options, async () => {
    await runtime.G1.msmAffineRaw(sparsePrepared.bases, sparsePrepared.scalars);
  });
  const sparseTotalMs = await measure(options, async () => {
    await runSparse(runtime, benchmarkCase);
  });

  const compactPrepared = await prepareCompact(runtime, benchmarkCase);
  const compactPrepMs = await measure(options, async () => {
    await prepareCompact(runtime, benchmarkCase);
  });
  const compactMsmMs = await measure(options, async () => {
    await runtime.G1.msmAffineRaw(compactPrepared.bases, compactPrepared.scalars);
  });
  const compactTotalMs = await measure(options, async () => {
    await runCompact(runtime, benchmarkCase);
  });

  return {
    length: benchmarkCase.length,
    density: benchmarkCase.density,
    nonzeroCount: benchmarkCase.nonzeroCount,
    sparsePrepMs,
    sparseMsmMs,
    sparseTotalMs,
    compactPrepMs,
    compactMsmMs,
    compactTotalMs,
    compactSpeedup: sparseTotalMs / compactTotalMs,
  };
}

async function runSparse(runtime: CurveRuntime, benchmarkCase: BenchmarkCase): Promise<Uint8Array> {
  const prepared = prepareSparse(runtime, benchmarkCase);
  if (prepared.scalars.byteLength === 0) {
    return runtime.G1.zero;
  }
  return runtime.G1.msmAffineRaw(prepared.bases, prepared.scalars);
}

function prepareSparse(runtime: CurveRuntime, benchmarkCase: BenchmarkCase): PreparedMsmInput {
  const bases = new Uint8Array(benchmarkCase.nonzeroCount * G1_AFFINE_BYTES);
  const scalars = new Uint8Array(benchmarkCase.nonzeroCount * runtime.Fr.byteLength);
  let outputIndex = 0;
  for (let index = 0; index < benchmarkCase.length; index += 1) {
    const scalar = benchmarkCase.polynomial.getCoeff(0, index);
    if (runtime.Fr.isZero(scalar)) {
      continue;
    }
    bases.set(
      benchmarkCase.rawBases.subarray(index * G1_AFFINE_BYTES, (index + 1) * G1_AFFINE_BYTES),
      outputIndex * G1_AFFINE_BYTES,
    );
    scalars.set(runtime.Fr.toRawLittleEndian(scalar), outputIndex * runtime.Fr.byteLength);
    outputIndex += 1;
  }
  return { bases, scalars };
}

async function runCompact(runtime: CurveRuntime, benchmarkCase: BenchmarkCase): Promise<Uint8Array> {
  const prepared = await prepareCompact(runtime, benchmarkCase);
  return runtime.G1.msmAffineRaw(prepared.bases, prepared.scalars);
}

async function prepareCompact(runtime: CurveRuntime, benchmarkCase: BenchmarkCase): Promise<PreparedMsmInput> {
  return {
    bases: benchmarkCase.rawBases,
    scalars: await runtime.Fr.batchFromMontgomeryBuffer(benchmarkCase.polynomial.coefficients),
  };
}

async function measure(options: BenchmarkOptions, callback: () => void | Promise<void>): Promise<number> {
  for (let index = 0; index < options.warmup; index += 1) {
    await callback();
  }

  const start = performance.now();
  for (let index = 0; index < options.iterations; index += 1) {
    await callback();
  }

  return (performance.now() - start) / options.iterations;
}

function printRows(rows: readonly TimingRow[], options: BenchmarkOptions): void {
  console.log(
    `Commitment density benchmark seed=${formatSeed(options.seed)} iterations=${options.iterations} warmup=${options.warmup}`,
  );
  console.log(
    "length | density | nonzero | sparse prep ms | sparse msm ms | sparse total ms | compact prep ms | compact msm ms | compact total ms | compact speedup",
  );
  console.log("---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:");
  for (const row of rows) {
    console.log(
      [
        row.length.toString(),
        row.density.toFixed(2),
        row.nonzeroCount.toString(),
        row.sparsePrepMs.toFixed(3),
        row.sparseMsmMs.toFixed(3),
        row.sparseTotalMs.toFixed(3),
        row.compactPrepMs.toFixed(3),
        row.compactMsmMs.toFixed(3),
        row.compactTotalMs.toFixed(3),
        `${row.compactSpeedup.toFixed(2)}x`,
      ].join(" | "),
    );
  }
}

async function writeJsonReport(
  jsonPath: string,
  options: BenchmarkOptions,
  rows: readonly TimingRow[],
): Promise<void> {
  const resolved = path.resolve(jsonPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(
    resolved,
    `${JSON.stringify(
      {
        benchmark: "commitment-density",
        seed: formatSeed(options.seed),
        lengths: options.lengths,
        densities: options.densities,
        iterations: options.iterations,
        warmup: options.warmup,
        rows,
      },
      null,
      2,
    )}\n`,
  );
}

function formatSeed(seed: bigint): string {
  return `0x${seed.toString(16)}`;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
