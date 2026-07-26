import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";

import { getCurveFromName } from "ffjavascript";

import {
  BivariatePolynomialBuffer,
  createFieldRuntime,
  type FfCurve,
  type FieldElement,
  type FieldRuntime,
} from "../../../src/index.js";
import { installLinearBatchPlugin } from "../../../src/core/field/linear-batch-plugin.js";
import {
  evaluateAtScaledChallengeSet,
  evaluateAtScaledChallengeSetBatch,
} from "../../../src/prover/internal/polynomial-ops.js";

interface Shape {
  readonly xSize: number;
  readonly ySize: number;
}

interface Options {
  readonly shapes: readonly Shape[];
  readonly iterations: number;
  readonly warmup: number;
  readonly jsonPath: string;
}

interface Record {
  readonly workload: "single" | "fused";
  readonly candidate: string;
  readonly shape: string;
  readonly medianMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly samplesMs: readonly number[];
  readonly inputBytes: number;
  readonly temporaryBytes: number;
}

interface EvaluationBenchmarkRuntime {
  readonly field: FieldRuntime;
  readonly workerCount: number;
  terminate(): Promise<void>;
}

type SingleRunner = (
  runtime: EvaluationBenchmarkRuntime,
  polynomial: BivariatePolynomialBuffer,
  xPoint: FieldElement,
  scaledXPoint: FieldElement,
  yPoint: FieldElement,
  scaledYPoint: FieldElement,
) => Promise<readonly FieldElement[]>;

const SINGLE_CANDIDATES: readonly { readonly name: string; readonly run: SingleRunner }[] = [
  {
    name: "current-production",
    run: async (_runtime, polynomial, xPoint, _scaledX, yPoint) => [
      await polynomial.evalBatch(xPoint, yPoint),
    ],
  },
  {
    name: "scalar-js-baseline",
    run: async (_runtime, polynomial, xPoint, _scaledX, yPoint) => [polynomial.eval(xPoint, yPoint)],
  },
];

const FUSED_CANDIDATES: readonly { readonly name: string; readonly run: SingleRunner }[] = [
  {
    name: "current-production-fused",
    run: async (runtime, polynomial, xPoint, scaledXPoint, yPoint, scaledYPoint) =>
      evaluateAtScaledChallengeSetBatch(
        runtime.field,
        polynomial,
        xPoint,
        scaledXPoint,
        yPoint,
        scaledYPoint,
      ),
  },
  {
    name: "scalar-js-fused-baseline",
    run: async (runtime, polynomial, xPoint, scaledXPoint, yPoint, scaledYPoint) =>
      evaluateAtScaledChallengeSet(
        runtime.field,
        polynomial,
        xPoint,
        scaledXPoint,
        yPoint,
        scaledYPoint,
      ),
  },
];

let sink = 0;

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const runtime = await createEvaluationBenchmarkRuntime();
  try {
    const records: Record[] = [];
    for (const shape of options.shapes) {
      records.push(...await benchmarkShape(runtime, shape, options));
    }
    console.table(records.map((record) => ({
      workload: record.workload,
      candidate: record.candidate,
      shape: record.shape,
      "median ms": record.medianMs.toFixed(3),
      "min ms": record.minMs.toFixed(3),
      "max ms": record.maxMs.toFixed(3),
      "temporary MiB": (record.temporaryBytes / (1024 ** 2)).toFixed(3),
    })));
    await mkdir(path.dirname(path.resolve(options.jsonPath)), { recursive: true });
    await writeFile(path.resolve(options.jsonPath), `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      workerCount: runtime.workerCount,
      options,
      records,
    }, null, 2)}\n`);
    console.log(`Wrote ${path.resolve(options.jsonPath)}`);
  } finally {
    await runtime.terminate();
  }
}

async function benchmarkShape(
  runtime: EvaluationBenchmarkRuntime,
  shape: Shape,
  options: Options,
): Promise<Record[]> {
  const polynomial = deterministicPolynomial(runtime, shape);
  const xPoint = runtime.field.fromBigInt(11n);
  const scaledXPoint = runtime.field.fromBigInt(17n);
  const yPoint = runtime.field.fromBigInt(13n);
  const scaledYPoint = runtime.field.fromBigInt(19n);
  const args: Parameters<SingleRunner> = [
    runtime,
    polynomial,
    xPoint,
    scaledXPoint,
    yPoint,
    scaledYPoint,
  ];
  const singleExpected = await SINGLE_CANDIDATES[0].run(...args);
  const fusedExpected = await FUSED_CANDIDATES[0].run(...args);

  for (const candidate of SINGLE_CANDIDATES.slice(1)) {
    assertValues(runtime, await candidate.run(...args), singleExpected, `${formatShape(shape)} ${candidate.name}`);
  }
  for (const candidate of FUSED_CANDIDATES.slice(1)) {
    assertValues(runtime, await candidate.run(...args), fusedExpected, `${formatShape(shape)} ${candidate.name}`);
  }

  const records: Record[] = [];
  records.push(...await measureCandidates("single", SINGLE_CANDIDATES, args, shape, options));
  records.push(...await measureCandidates("fused", FUSED_CANDIDATES, args, shape, options));
  return records;
}

async function measureCandidates(
  workload: "single" | "fused",
  candidates: readonly { readonly name: string; readonly run: SingleRunner }[],
  args: Parameters<SingleRunner>,
  shape: Shape,
  options: Options,
): Promise<Record[]> {
  for (let iteration = 0; iteration < options.warmup; iteration += 1) {
    for (const candidate of candidates) {
      consume(await candidate.run(...args));
    }
  }
  const samples = new Map(candidates.map((candidate) => [candidate.name, [] as number[]]));
  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    const ordered = iteration % 2 === 0 ? candidates : [...candidates].reverse();
    for (const candidate of ordered) {
      const start = performance.now();
      consume(await candidate.run(...args));
      samples.get(candidate.name)!.push(performance.now() - start);
    }
  }
  const inputBytes = shape.xSize * shape.ySize * args[0].field.byteLength;
  return candidates.map((candidate) => {
    const values = samples.get(candidate.name)!.slice().sort((left, right) => left - right);
    return {
      workload,
      candidate: candidate.name,
      shape: formatShape(shape),
      medianMs: median(values),
      minMs: values[0],
      maxMs: values[values.length - 1],
      samplesMs: samples.get(candidate.name)!,
      inputBytes,
      temporaryBytes: candidate.name.includes("current-production")
        ? productionEvaluationTemporaryBytes(
            inputBytes,
            shape.xSize,
            args[0].field.byteLength,
            workload === "fused",
          )
        : 0,
    };
  });
}

async function createEvaluationBenchmarkRuntime(): Promise<EvaluationBenchmarkRuntime> {
  const curve = (await getCurveFromName(
    "bls12381",
    false,
    installLinearBatchPlugin,
  )) as FfCurve;
  return {
    field: createFieldRuntime(curve.Fr),
    workerCount: curve.Fr.tm.concurrency,
    async terminate() {
      await curve.terminate?.();
    },
  };
}

function productionEvaluationTemporaryBytes(
  inputBytes: number,
  xSize: number,
  elementBytes: number,
  fused: boolean,
): number {
  const rowBytes = xSize * elementBytes * (fused ? 2 : 1);
  return inputBytes * 2 + rowBytes * 3 + elementBytes * 12;
}

function deterministicPolynomial(
  runtime: EvaluationBenchmarkRuntime,
  shape: Shape,
): BivariatePolynomialBuffer {
  const patternElements = Math.min(1024, shape.xSize * shape.ySize);
  const pattern = new Uint8Array(patternElements * runtime.field.byteLength);
  for (let index = 0; index < patternElements; index += 1) {
    pattern.set(
      runtime.field.fromBigInt(BigInt((index * 65537 + 17) % 1000003)),
      index * runtime.field.byteLength,
    );
  }
  const coefficients = new Uint8Array(shape.xSize * shape.ySize * runtime.field.byteLength);
  for (let offset = 0; offset < coefficients.byteLength; offset += pattern.byteLength) {
    coefficients.set(pattern.subarray(0, Math.min(pattern.byteLength, coefficients.byteLength - offset)), offset);
  }
  return BivariatePolynomialBuffer.fromOwnedBuffer(
    runtime.field,
    coefficients,
    shape.xSize,
    shape.ySize,
  );
}

function assertValues(
  runtime: EvaluationBenchmarkRuntime,
  actual: readonly FieldElement[],
  expected: readonly FieldElement[],
  label: string,
): void {
  if (actual.length !== expected.length) {
    throw new Error(`${label}: output count mismatch.`);
  }
  for (let index = 0; index < actual.length; index += 1) {
    if (!runtime.field.eq(actual[index], expected[index])) {
      throw new Error(`${label}: field output ${index} mismatch.`);
    }
  }
}

function consume(values: readonly FieldElement[]): void {
  for (const value of values) {
    sink ^= value[0] ?? 0;
  }
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
    shapes: parseShapes(values.get("shapes") ?? "16x8,32x16"),
    iterations: parsePositive(values.get("iterations") ?? "3", "iterations"),
    warmup: parseNonNegative(values.get("warmup") ?? "1", "warmup"),
    jsonPath: values.get("json") ?? "tmp/timing/polynomial-evaluation.json",
  };
}

function parseShapes(value: string): Shape[] {
  return value.split(",").map((entry) => {
    const match = /^([0-9]+)x([0-9]+)$/.exec(entry.trim());
    if (match === null) {
      throw new Error(`Invalid shape '${entry}'. Expected <xSize>x<ySize>.`);
    }
    return {
      xSize: parsePositive(match[1], "xSize"),
      ySize: parsePositive(match[2], "ySize"),
    };
  });
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
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${label} exceeds the safe integer range.`);
  }
  return parsed;
}

function formatShape(shape: Shape): string {
  return `${shape.xSize}x${shape.ySize}`;
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
