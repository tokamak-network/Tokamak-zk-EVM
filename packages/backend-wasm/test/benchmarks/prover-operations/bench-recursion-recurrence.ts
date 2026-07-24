import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";

import { createCurveRuntime, type FieldRuntime } from "../../../src/index.js";

interface Options {
  readonly mI: number;
  readonly sMax: number;
  readonly iterations: number;
  readonly warmup: number;
  readonly jsonPath: string;
}

let sink = 0;

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const runtime = await createCurveRuntime();
  try {
    const total = options.mI * options.sMax;
    const gEvals = deterministicBuffer(runtime.Fr, total, 17);
    const fEvals = deterministicBuffer(runtime.Fr, total, 29);
    const inverseF = await runtime.Fr.batchInverseBuffer(fEvals);
    const expected = recursionJs(runtime.Fr, gEvals, inverseF, options.mI, options.sMax);
    const actual = await runtime.Fr.computeRecursionRecurrenceBuffer(
      gEvals,
      inverseF,
      options.mI,
      options.sMax,
    );
    if (!bytesEqual(actual, expected)) {
      throw new Error("Whole-loop WASM recurrence does not match the current JavaScript recurrence.");
    }

    const candidates = [
      {
        name: "current-js-after-batch-inverse",
        run: async () => recursionJs(runtime.Fr, gEvals, inverseF, options.mI, options.sMax),
      },
      {
        name: "wasm-one-worker-after-batch-inverse",
        run: () => runtime.Fr.computeRecursionRecurrenceBuffer(
          gEvals,
          inverseF,
          options.mI,
          options.sMax,
        ),
      },
    ];
    for (let iteration = 0; iteration < options.warmup; iteration += 1) {
      for (const candidate of candidates) {
        consume(await candidate.run());
      }
    }
    const samples = new Map(candidates.map((candidate) => [candidate.name, [] as number[]]));
    for (let iteration = 0; iteration < options.iterations; iteration += 1) {
      const ordered = iteration % 2 === 0 ? candidates : [...candidates].reverse();
      for (const candidate of ordered) {
        const start = performance.now();
        consume(await candidate.run());
        samples.get(candidate.name)!.push(performance.now() - start);
      }
    }
    const records = candidates.map((candidate) => {
      const values = samples.get(candidate.name)!.slice().sort((a, b) => a - b);
      return {
        candidate: candidate.name,
        medianMs: median(values),
        minMs: values[0],
        maxMs: values[values.length - 1],
        samplesMs: samples.get(candidate.name),
        inputBytes: gEvals.byteLength + inverseF.byteLength,
        outputBytes: gEvals.byteLength,
      };
    });
    console.table(records.map((record) => ({
      candidate: record.candidate,
      "median ms": record.medianMs.toFixed(3),
      "min ms": record.minMs.toFixed(3),
      "max ms": record.maxMs.toFixed(3),
    })));
    await mkdir(path.dirname(path.resolve(options.jsonPath)), { recursive: true });
    await writeFile(path.resolve(options.jsonPath), `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      options,
      records,
    }, null, 2)}\n`);
    console.log(`Wrote ${path.resolve(options.jsonPath)}`);
  } finally {
    await runtime.terminate();
  }
}

function recursionJs(
  field: FieldRuntime,
  gEvals: Uint8Array,
  inverseF: Uint8Array,
  mI: number,
  sMax: number,
): Uint8Array {
  const total = mI * sMax;
  const output = field.createZeroBuffer(total);
  output.set(field.one, (total - 1) * field.byteLength);
  for (let transposed = total - 2; transposed >= 0; transposed -= 1) {
    const next = transposed + 1;
    const nextOriginal = (next % mI) * sMax + Math.floor(next / mI);
    const currentOriginal = (transposed % mI) * sMax + Math.floor(transposed / mI);
    const nextOffset = nextOriginal * field.byteLength;
    const currentOffset = currentOriginal * field.byteLength;
    const ratio = field.mul(
      gEvals.subarray(nextOffset, nextOffset + field.byteLength),
      inverseF.subarray(nextOffset, nextOffset + field.byteLength),
    );
    output.set(
      field.mul(output.subarray(nextOffset, nextOffset + field.byteLength), ratio),
      currentOffset,
    );
  }
  return output;
}

function deterministicBuffer(field: FieldRuntime, count: number, salt: number): Uint8Array {
  const pattern = Array.from({ length: 1024 }, (_, index) =>
    field.fromBigInt(BigInt(((index + 1) * 65537 + salt) % 1000003 + 1)));
  const output = field.createZeroBuffer(count);
  for (let index = 0; index < count; index += 1) {
    output.set(pattern[index % pattern.length], index * field.byteLength);
  }
  return output;
}

function parseOptions(args: readonly string[]): Options {
  const values = new Map<string, string>();
  for (const argument of args) {
    const match = /^--([a-zA-Z-]+)=(.+)$/.exec(argument);
    if (match === null) {
      throw new Error(`Unknown argument '${argument}'.`);
    }
    values.set(match[1], match[2]);
  }
  return {
    mI: parsePositive(values.get("m-i") ?? "4096", "m-i"),
    sMax: parsePositive(values.get("s-max") ?? "256", "s-max"),
    iterations: parsePositive(values.get("iterations") ?? "3", "iterations"),
    warmup: parseNonNegative(values.get("warmup") ?? "1", "warmup"),
    jsonPath: values.get("json") ?? "tmp/timing/recursion-recurrence.json",
  };
}

function parsePositive(value: string, label: string): number {
  const parsed = parseNonNegative(value, label);
  if (parsed === 0) {
    throw new Error(`${label} must be positive.`);
  }
  return parsed;
}

function parseNonNegative(value: string, label: string): number {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return Number(value);
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

function consume(value: Uint8Array): void {
  sink ^= value[0] ?? 0;
}

function median(values: readonly number[]): number {
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? (values[middle - 1] + values[middle]) / 2
    : values[middle];
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
