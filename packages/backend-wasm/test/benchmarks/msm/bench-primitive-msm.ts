import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { getCurveFromName } from "ffjavascript";

import { createCurveRuntime, type CurveRuntime, type FfCurve, type FieldElement } from "../../../src/index.js";

const G1_AFFINE_BYTES = 96;

interface BenchmarkOptions {
  readonly length: number;
  readonly iterations: number;
  readonly warmup: number;
  readonly seed: bigint;
  readonly jsonPath?: string;
}

interface BenchmarkRecord {
  readonly mode: "single-thread" | "multi-thread";
  readonly length: number;
  readonly baseGenerationMs: number;
  readonly scalarGenerationMs: number;
  readonly msmAffineMs: number;
}

interface BenchmarkReport {
  readonly generatedAt: string;
  readonly options: {
    readonly length: number;
    readonly iterations: number;
    readonly warmup: number;
    readonly seed: string;
  };
  readonly records: readonly BenchmarkRecord[];
  readonly speedup: number;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const single = await runMode(options, true);
  const multi = await runMode(options, false);

  if (!single.curve.G1.eq(single.result, multi.result)) {
    throw new Error("Single-thread and multi-thread MSM outputs differ.");
  }

  const records = [single.record, multi.record];
  const speedup = single.record.msmAffineMs / multi.record.msmAffineMs;
  printRecords(records, speedup);

  if (options.jsonPath !== undefined) {
    await writeReport(options, records, speedup);
  }

  await single.curve.terminate?.();
  await multi.curve.terminate?.();
  await single.runtime.terminate();
  await multi.runtime.terminate();
}

async function runMode(
  options: BenchmarkOptions,
  singleThread: boolean,
): Promise<{
  readonly curve: FfCurve;
  readonly runtime: CurveRuntime;
  readonly record: BenchmarkRecord;
  readonly result: Uint8Array;
}> {
  const curve = (await getCurveFromName("bls12381", singleThread)) as FfCurve;
  const runtime = await createCurveRuntime({ singleThread });

  const baseStart = performance.now();
  const bases = buildSequentialAffineBases(runtime, options.length);
  const baseGenerationMs = performance.now() - baseStart;

  const scalarStart = performance.now();
  const scalars = buildRawScalars(runtime, options.length, options.seed);
  const scalarGenerationMs = performance.now() - scalarStart;

  for (let index = 0; index < options.warmup; index += 1) {
    await curve.G1.multiExpAffine(bases, scalars);
  }

  const start = performance.now();
  let result = curve.G1.zero;
  for (let index = 0; index < options.iterations; index += 1) {
    result = await curve.G1.multiExpAffine(bases, scalars);
  }
  const msmAffineMs = (performance.now() - start) / options.iterations;

  return {
    curve,
    runtime,
    record: {
      mode: singleThread ? "single-thread" : "multi-thread",
      length: options.length,
      baseGenerationMs,
      scalarGenerationMs,
      msmAffineMs,
    },
    result,
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

function buildRawScalars(runtime: CurveRuntime, length: number, seed: bigint): Uint8Array {
  const output = new Uint8Array(length * runtime.Fr.byteLength);
  const random = createSplitMix64(seed + BigInt(length) * 0x9e3779b97f4a7c15n);
  for (let index = 0; index < length; index += 1) {
    output.set(runtime.Fr.toRawLittleEndian(randomFieldElement(runtime, random)), index * runtime.Fr.byteLength);
  }
  return output;
}

function randomFieldElement(runtime: CurveRuntime, random: () => bigint): FieldElement {
  let value = 0n;
  for (let index = 0; index < 4; index += 1) {
    value = (value << 64n) | random();
  }

  return runtime.Fr.fromBigInt((value % (runtime.Fr.modulus - 1n)) + 1n);
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
    length: parsePositiveInteger(values.get("length") ?? `${1 << 20}`, "length"),
    iterations: parsePositiveInteger(values.get("iterations") ?? "1", "iterations"),
    warmup: parseNonNegativeInteger(values.get("warmup") ?? "0", "warmup"),
    seed: BigInt(values.get("seed") ?? "0x544f4b414d414b"),
    jsonPath: values.get("json"),
  };
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

function printRecords(records: readonly BenchmarkRecord[], speedup: number): void {
  console.table(
    records.map((record) => ({
      mode: record.mode,
      length: record.length,
      "base generation ms": record.baseGenerationMs.toFixed(3),
      "scalar generation ms": record.scalarGenerationMs.toFixed(3),
      "multiExpAffine ms/op": record.msmAffineMs.toFixed(3),
    })),
  );
  console.log(`multi-thread speedup: ${speedup.toFixed(2)}x`);
}

async function writeReport(
  options: BenchmarkOptions,
  records: readonly BenchmarkRecord[],
  speedup: number,
): Promise<void> {
  if (options.jsonPath === undefined) {
    return;
  }

  const report: BenchmarkReport = {
    generatedAt: new Date().toISOString(),
    options: {
      length: options.length,
      iterations: options.iterations,
      warmup: options.warmup,
      seed: `0x${options.seed.toString(16)}`,
    },
    records,
    speedup,
  };
  await mkdir(path.dirname(options.jsonPath), { recursive: true });
  await writeFile(options.jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${path.resolve(options.jsonPath)}`);
}

await main();
