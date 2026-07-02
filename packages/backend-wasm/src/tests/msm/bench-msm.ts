import { createCurveRuntime, type CurveRuntime, type FieldElement, type G1Point } from "../../index.js";

declare const process: {
  readonly argv: readonly string[];
  exitCode?: number;
};

interface BenchmarkOptions {
  readonly seed: bigint;
  readonly lengths: readonly number[];
  readonly iterations: number;
  readonly warmup: number;
  readonly singleThread: boolean;
}

interface BenchmarkCase {
  readonly bases: readonly G1Point[];
  readonly scalars: readonly FieldElement[];
  readonly rawBases: Uint8Array;
  readonly rawScalars: Uint8Array;
}

interface TimingRow {
  readonly length: number;
  readonly sequentialMs: number;
  readonly msmAffineMs: number;
  readonly msmAffineRawMs: number;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const runtime = await createCurveRuntime({ singleThread: options.singleThread });

  try {
    const rows: TimingRow[] = [];
    for (const length of options.lengths) {
      const benchmarkCase = buildBenchmarkCase(runtime, length, options.seed);
      await assertEqualResults(runtime, benchmarkCase);
      rows.push(await measureCase(runtime, benchmarkCase, options));
    }

    printRows(rows, options);
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
    lengths: parseLengths(values.get("lengths") ?? "1,2,3,4,5,6,8,10,12,16,24,32,48,64,96,128"),
    iterations: parsePositiveInteger(values.get("iterations") ?? "30", "iterations"),
    warmup: parsePositiveInteger(values.get("warmup") ?? "5", "warmup"),
    singleThread: values.get("singleThread") !== "false",
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

  return unique;
}

function parsePositiveInteger(value: string, label: string): number {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`${label} must be a positive integer.`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }

  return parsed;
}

function buildBenchmarkCase(runtime: CurveRuntime, length: number, seed: bigint): BenchmarkCase {
  const random = createSplitMix64(seed + BigInt(length) * 0x9e3779b97f4a7c15n);
  const bases: G1Point[] = [];
  const scalars: FieldElement[] = [];

  for (let index = 0; index < length; index += 1) {
    const baseScalar = randomFieldElement(runtime, random);
    const scalar = randomFieldElement(runtime, random);
    bases.push(runtime.G1.toAffine(runtime.G1.mulScalar(runtime.G1.generator, baseScalar)));
    scalars.push(scalar);
  }

  return {
    bases,
    scalars,
    rawBases: concatBytes(bases.map((base) => runtime.G1.toAffine(base))),
    rawScalars: concatBytes(scalars.map((scalar) => runtime.Fr.toRawLittleEndian(scalar))),
  };
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
  const sequential = sequentialInnerProduct(runtime, benchmarkCase);
  const msmAffine = await runtime.G1.msmAffine(benchmarkCase.bases, benchmarkCase.scalars);
  const msmAffineRaw = await runtime.G1.msmAffineRaw(benchmarkCase.rawBases, benchmarkCase.rawScalars);

  if (!runtime.G1.eq(sequential, msmAffine)) {
    throw new Error("Sequential inner product and msmAffine result differ.");
  }

  if (!runtime.G1.eq(sequential, msmAffineRaw)) {
    throw new Error("Sequential inner product and msmAffineRaw result differ.");
  }
}

function sequentialInnerProduct(runtime: CurveRuntime, benchmarkCase: BenchmarkCase): G1Point {
  let accumulator = runtime.G1.zero;
  for (let index = 0; index < benchmarkCase.bases.length; index += 1) {
    accumulator = runtime.G1.add(
      accumulator,
      runtime.G1.mulScalar(benchmarkCase.bases[index], benchmarkCase.scalars[index]),
    );
  }

  return accumulator;
}

async function measureCase(
  runtime: CurveRuntime,
  benchmarkCase: BenchmarkCase,
  options: BenchmarkOptions,
): Promise<TimingRow> {
  const sequentialMs = await measure(options, () => {
    sequentialInnerProduct(runtime, benchmarkCase);
  });
  const msmAffineMs = await measure(options, async () => {
    await runtime.G1.msmAffine(benchmarkCase.bases, benchmarkCase.scalars);
  });
  const msmAffineRawMs = await measure(options, async () => {
    await runtime.G1.msmAffineRaw(benchmarkCase.rawBases, benchmarkCase.rawScalars);
  });

  return {
    length: benchmarkCase.bases.length,
    sequentialMs,
    msmAffineMs,
    msmAffineRawMs,
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
    `MSM benchmark seed=${formatSeed(options.seed)} iterations=${options.iterations} warmup=${options.warmup} mode=${
      options.singleThread ? "single-thread" : "multi-thread"
    }`,
  );
  console.log("length | sequential ms/op | msmAffine ms/op | msmAffineRaw ms/op | best | raw speedup");
  console.log("---: | ---: | ---: | ---: | :--- | ---:");

  for (const row of rows) {
    const best = bestMethod(row);
    const rawSpeedup = row.sequentialMs / row.msmAffineRawMs;
    console.log(
      [
        row.length.toString(),
        row.sequentialMs.toFixed(3),
        row.msmAffineMs.toFixed(3),
        row.msmAffineRawMs.toFixed(3),
        best,
        `${rawSpeedup.toFixed(2)}x`,
      ].join(" | "),
    );
  }
}

function bestMethod(row: TimingRow): string {
  const entries = [
    ["sequential", row.sequentialMs],
    ["msmAffine", row.msmAffineMs],
    ["msmAffineRaw", row.msmAffineRawMs],
  ] as const;

  return entries.reduce((best, entry) => (entry[1] < best[1] ? entry : best))[0];
}

function formatSeed(seed: bigint): string {
  return `0x${seed.toString(16)}`;
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
