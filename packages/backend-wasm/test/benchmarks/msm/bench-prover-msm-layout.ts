import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BivariatePolynomialBuffer,
  createCurveRuntime,
  type CurveRuntime,
  type FieldElement,
  type ProverCrsRuntime,
  type ProverSetupParams,
} from "../../../src/index.js";
import { encodePolynomialBufferWithSigma1 } from "../../../src/prover/internal/initial-relation.js";

const G1_AFFINE_BYTES = 96;

interface BenchmarkOptions {
  readonly seed: bigint;
  readonly lengths: readonly number[];
  readonly iterations: number;
  readonly warmup: number;
  readonly singleThread: boolean;
  readonly jsonPath?: string;
}

interface BenchmarkCase {
  readonly length: number;
  readonly rawBases: Uint8Array;
  readonly crs: ProverCrsRuntime;
  readonly setup: ProverSetupParams;
  readonly polynomial: BivariatePolynomialBuffer;
  readonly snarkjsRawScalars: Uint8Array;
}

interface PreparedMsmInput {
  readonly bases: Uint8Array;
  readonly scalars: Uint8Array;
}

interface TimingRow {
  readonly length: number;
  readonly currentPrepMs: number;
  readonly currentMsmMs: number;
  readonly currentTotalMs: number;
  readonly rawSlicePrepMs: number;
  readonly rawSliceMsmMs: number;
  readonly rawSliceTotalMs: number;
  readonly snarkjsPrepMs: number;
  readonly snarkjsMsmMs: number;
  readonly snarkjsTotalMs: number;
  readonly rawSliceSpeedup: number;
  readonly totalSpeedup: number;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const runtime = await createCurveRuntime({ singleThread: options.singleThread });

  try {
    const rows: TimingRow[] = [];
    for (const length of options.lengths) {
      const benchmarkCase = await buildBenchmarkCase(runtime, length, options.seed);
      await assertEqualResults(runtime, benchmarkCase);
      rows.push(await measureCase(runtime, benchmarkCase, options));
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
    if (arg === "--multi-thread") {
      values.set("singleThread", "false");
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
    lengths: parseLengths(values.get("lengths") ?? "1024,4096,16384"),
    iterations: parsePositiveInteger(values.get("iterations") ?? "3", "iterations"),
    warmup: parseNonNegativeInteger(values.get("warmup") ?? "1", "warmup"),
    singleThread: values.get("singleThread") !== "false",
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
  const unique = [...new Set(lengths)].sort((left, right) => left - right);
  if (unique.length === 0) {
    throw new Error("At least one benchmark length is required.");
  }

  for (const length of unique) {
    if (length % 2 !== 0) {
      throw new Error("Lengths must be even because the synthetic setup uses s_max = length / 2.");
    }
  }

  return unique;
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

async function buildBenchmarkCase(runtime: CurveRuntime, length: number, seed: bigint): Promise<BenchmarkCase> {
  const rawBases = buildSequentialAffineBases(runtime, length);
  const coefficientBuffer = buildNonzeroCoefficientBuffer(runtime, length, seed);
  const polynomial = BivariatePolynomialBuffer.fromBuffer(runtime.Fr, coefficientBuffer, 1, length);
  const setup = {
    n: 1,
    s_max: length / 2,
    l: 0,
    l_D: 1,
  } as ProverSetupParams;
  const crs = {
    sigma1: {
      xyPowers: {
        data: rawBases,
        count: length,
        elementByteLength: G1_AFFINE_BYTES,
      },
    },
  } as unknown as ProverCrsRuntime;

  return {
    length,
    rawBases,
    crs,
    setup,
    polynomial,
    snarkjsRawScalars: await prepareSnarkjsStyleScalars(runtime, polynomial),
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

function buildNonzeroCoefficientBuffer(runtime: CurveRuntime, length: number, seed: bigint): Uint8Array {
  const random = createSplitMix64(seed + BigInt(length) * 0x9e3779b97f4a7c15n);
  const output = new Uint8Array(length * runtime.Fr.byteLength);

  for (let index = 0; index < length; index += 1) {
    output.set(randomFieldElement(runtime, random), index * runtime.Fr.byteLength);
  }

  return output;
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

function randomFieldElement(runtime: CurveRuntime, random: () => bigint): FieldElement {
  let value = 0n;
  for (let index = 0; index < 4; index += 1) {
    value = (value << 64n) | random();
  }

  return runtime.Fr.fromBigInt((value % (runtime.Fr.modulus - 1n)) + 1n);
}

async function assertEqualResults(runtime: CurveRuntime, benchmarkCase: BenchmarkCase): Promise<void> {
  const current = await encodePolynomialBufferWithSigma1(
    runtime,
    benchmarkCase.crs,
    benchmarkCase.setup,
    benchmarkCase.polynomial,
  );
  const snarkjsStyle = await runSnarkjsStyleMsm(runtime, benchmarkCase);
  const rawSliceStyle = await runRawSliceSparseMsm(runtime, benchmarkCase);

  if (!runtime.G1.eq(current, snarkjsStyle)) {
    throw new Error(`Current and snarkjs-style MSM results differ at length ${benchmarkCase.length}.`);
  }
  if (!runtime.G1.eq(current, rawSliceStyle)) {
    throw new Error(`Current and raw-slice MSM results differ at length ${benchmarkCase.length}.`);
  }
}

async function measureCase(
  runtime: CurveRuntime,
  benchmarkCase: BenchmarkCase,
  options: BenchmarkOptions,
): Promise<TimingRow> {
  const currentPrepared = prepareCurrentStyleMsm(runtime, benchmarkCase);
  const currentPrepMs = await measure(options, () => {
    prepareCurrentStyleMsm(runtime, benchmarkCase);
  });
  const currentMsmMs = await measure(options, async () => {
    await runtime.G1.msmAffineRaw(currentPrepared.bases, currentPrepared.scalars);
  });
  const currentTotalMs = await measure(options, async () => {
    const prepared = prepareCurrentStyleMsm(runtime, benchmarkCase);
    await runtime.G1.msmAffineRaw(prepared.bases, prepared.scalars);
  });

  const rawSlicePrepared = prepareRawSliceSparseMsm(runtime, benchmarkCase);
  const rawSlicePrepMs = await measure(options, () => {
    prepareRawSliceSparseMsm(runtime, benchmarkCase);
  });
  const rawSliceMsmMs = await measure(options, async () => {
    await runtime.G1.msmAffineRaw(rawSlicePrepared.bases, rawSlicePrepared.scalars);
  });
  const rawSliceTotalMs = await measure(options, async () => {
    const prepared = prepareRawSliceSparseMsm(runtime, benchmarkCase);
    await runtime.G1.msmAffineRaw(prepared.bases, prepared.scalars);
  });

  const snarkjsPrepMs = await measure(options, async () => {
    await prepareSnarkjsStyleScalars(runtime, benchmarkCase.polynomial);
  });
  const snarkjsMsmMs = await measure(options, async () => {
    await runtime.G1.msmAffineRaw(benchmarkCase.rawBases, benchmarkCase.snarkjsRawScalars);
  });
  const snarkjsTotalMs = await measure(options, async () => {
    const scalars = await prepareSnarkjsStyleScalars(runtime, benchmarkCase.polynomial);
    await runtime.G1.msmAffineRaw(benchmarkCase.rawBases, scalars);
  });

  return {
    length: benchmarkCase.length,
    currentPrepMs,
    currentMsmMs,
    currentTotalMs,
    rawSlicePrepMs,
    rawSliceMsmMs,
    rawSliceTotalMs,
    snarkjsPrepMs,
    snarkjsMsmMs,
    snarkjsTotalMs,
    rawSliceSpeedup: currentTotalMs / rawSliceTotalMs,
    totalSpeedup: currentTotalMs / snarkjsTotalMs,
  };
}

function prepareCurrentStyleMsm(runtime: CurveRuntime, benchmarkCase: BenchmarkCase): PreparedMsmInput {
  const { xDegree, yDegree } = benchmarkCase.polynomial.findDegree();
  if (xDegree < 0 || yDegree < 0) {
    return { bases: new Uint8Array(), scalars: new Uint8Array() };
  }

  const xSize = xDegree + 1;
  const ySize = yDegree + 1;
  const referenceStringYSize = benchmarkCase.setup.s_max * 2;
  let nonzeroCount = 0;
  for (let x = 0; x < xSize; x += 1) {
    for (let y = 0; y < ySize; y += 1) {
      if (!runtime.Fr.isZero(benchmarkCase.polynomial.getCoeff(x, y))) {
        nonzeroCount += 1;
      }
    }
  }

  const bases = new Uint8Array(nonzeroCount * G1_AFFINE_BYTES);
  const scalars = new Uint8Array(nonzeroCount * runtime.Fr.byteLength);
  let outputIndex = 0;
  for (let x = 0; x < xSize; x += 1) {
    for (let y = 0; y < ySize; y += 1) {
      const scalar = benchmarkCase.polynomial.getCoeff(x, y);
      if (runtime.Fr.isZero(scalar)) {
        continue;
      }

      const baseIndex = referenceStringYSize * x + y;
      const baseOffset = baseIndex * G1_AFFINE_BYTES;
      const base = benchmarkCase.crs.sigma1.xyPowers.data.subarray(
        baseOffset,
        baseOffset + G1_AFFINE_BYTES,
      );
      if (base.byteLength !== G1_AFFINE_BYTES) {
        throw new Error("Synthetic CRS is shorter than the current-style MSM shape.");
      }

      bases.set(base, outputIndex * G1_AFFINE_BYTES);
      scalars.set(runtime.Fr.toRawLittleEndian(scalar), outputIndex * runtime.Fr.byteLength);
      outputIndex += 1;
    }
  }

  return { bases, scalars };
}

function prepareRawSliceSparseMsm(runtime: CurveRuntime, benchmarkCase: BenchmarkCase): PreparedMsmInput {
  const { xDegree, yDegree } = benchmarkCase.polynomial.findDegree();
  if (xDegree < 0 || yDegree < 0) {
    return { bases: new Uint8Array(), scalars: new Uint8Array() };
  }

  const xSize = xDegree + 1;
  const ySize = yDegree + 1;
  const referenceStringYSize = benchmarkCase.setup.s_max * 2;
  let nonzeroCount = 0;
  for (let x = 0; x < xSize; x += 1) {
    for (let y = 0; y < ySize; y += 1) {
      if (!runtime.Fr.isZero(benchmarkCase.polynomial.getCoeff(x, y))) {
        nonzeroCount += 1;
      }
    }
  }

  const bases = new Uint8Array(nonzeroCount * G1_AFFINE_BYTES);
  const scalars = new Uint8Array(nonzeroCount * runtime.Fr.byteLength);
  let outputIndex = 0;
  for (let x = 0; x < xSize; x += 1) {
    for (let y = 0; y < ySize; y += 1) {
      const scalar = benchmarkCase.polynomial.getCoeff(x, y);
      if (runtime.Fr.isZero(scalar)) {
        continue;
      }

      const crsIndex = referenceStringYSize * x + y;
      const baseOffset = crsIndex * G1_AFFINE_BYTES;
      const baseEnd = baseOffset + G1_AFFINE_BYTES;
      if (baseEnd > benchmarkCase.crs.sigma1.xyPowers.data.byteLength) {
        throw new Error("Synthetic CRS raw xy-powers section is shorter than the raw-slice MSM shape.");
      }

      bases.set(
        benchmarkCase.crs.sigma1.xyPowers.data.subarray(baseOffset, baseEnd),
        outputIndex * G1_AFFINE_BYTES,
      );
      scalars.set(runtime.Fr.toRawLittleEndian(scalar), outputIndex * runtime.Fr.byteLength);
      outputIndex += 1;
    }
  }

  return { bases, scalars };
}

async function prepareSnarkjsStyleScalars(
  runtime: CurveRuntime,
  polynomial: BivariatePolynomialBuffer,
): Promise<Uint8Array> {
  return await runtime.Fr.batchFromMontgomeryBuffer(polynomial.coefficients);
}

async function runRawSliceSparseMsm(runtime: CurveRuntime, benchmarkCase: BenchmarkCase): Promise<Uint8Array> {
  const prepared = prepareRawSliceSparseMsm(runtime, benchmarkCase);
  return await runtime.G1.msmAffineRaw(prepared.bases, prepared.scalars);
}

async function runSnarkjsStyleMsm(runtime: CurveRuntime, benchmarkCase: BenchmarkCase): Promise<Uint8Array> {
  const scalars = await prepareSnarkjsStyleScalars(runtime, benchmarkCase.polynomial);
  return await runtime.G1.msmAffineRaw(benchmarkCase.rawBases, scalars);
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
    `Prover MSM layout benchmark seed=${formatSeed(options.seed)} iterations=${options.iterations} warmup=${
      options.warmup
    } mode=${options.singleThread ? "single-thread" : "multi-thread"}`,
  );
  console.log(
    "length | current prep ms | current msm ms | current total ms | raw-slice prep ms | raw-slice msm ms | raw-slice total ms | raw-slice speedup | snarkjs prep ms | snarkjs msm ms | snarkjs total ms | snarkjs speedup",
  );
  console.log("---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:");

  for (const row of rows) {
    console.log(
      [
        row.length.toString(),
        row.currentPrepMs.toFixed(3),
        row.currentMsmMs.toFixed(3),
        row.currentTotalMs.toFixed(3),
        row.rawSlicePrepMs.toFixed(3),
        row.rawSliceMsmMs.toFixed(3),
        row.rawSliceTotalMs.toFixed(3),
        `${row.rawSliceSpeedup.toFixed(2)}x`,
        row.snarkjsPrepMs.toFixed(3),
        row.snarkjsMsmMs.toFixed(3),
        row.snarkjsTotalMs.toFixed(3),
        `${row.totalSpeedup.toFixed(2)}x`,
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
        benchmark: "prover-msm-layout",
        seed: formatSeed(options.seed),
        iterations: options.iterations,
        warmup: options.warmup,
        mode: options.singleThread ? "single-thread" : "multi-thread",
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
