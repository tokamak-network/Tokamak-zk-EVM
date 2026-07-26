import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BivariatePolynomialBuffer,
  createCurveRuntime,
  type FieldElement,
  type FieldRuntime,
} from "../../../src/index.js";
import { linearCombinationBuffer } from "../../../src/prover/polynomial/polynomial-ops.js";

interface Shape {
  readonly xSize: number;
  readonly ySize: number;
}

interface BenchmarkOptions {
  readonly baseShape: Shape;
  readonly iterations: number;
  readonly warmup: number;
  readonly jsonPath: string;
}

interface PcInputs {
  readonly fXY: BivariatePolynomialBuffer;
  readonly gXY: BivariatePolynomialBuffer;
  readonly lagrangeKlXY: BivariatePolynomialBuffer;
  readonly q2XY: BivariatePolynomialBuffer;
  readonly q3XY: BivariatePolynomialBuffer;
  readonly smallREval: FieldElement;
  readonly smallROmegaXEval: FieldElement;
  readonly smallROmegaXOmegaYEval: FieldElement;
  readonly lagrangeKlScale: FieldElement;
  readonly term5Scale: FieldElement;
  readonly term6Scale: FieldElement;
  readonly q2Scale: FieldElement;
  readonly q3Scale: FieldElement;
}

interface BenchmarkRecord {
  readonly candidate: string;
  readonly baseShape: string;
  readonly outputShape: string;
  readonly ms: number;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const runtime = await createCurveRuntime({ singleThread: true });

  try {
    const inputs = buildInputs(runtime.Fr, options.baseShape);
    const current = buildCurrentPc(runtime.Fr, inputs);
    const fused = buildFusedPc(runtime.Fr, inputs);
    assertBytesEqual(current.coefficients, fused.coefficients, "opening pC fusion parity");

    const records: BenchmarkRecord[] = [
      {
        candidate: "current-materialized-term5-term6-pc",
        baseShape: formatShape(options.baseShape),
        outputShape: `${current.xSize}x${current.ySize}`,
        ms: await measure(options, () => buildCurrentPc(runtime.Fr, inputs)),
      },
      {
        candidate: "fused-term5-term6-pc",
        baseShape: formatShape(options.baseShape),
        outputShape: `${fused.xSize}x${fused.ySize}`,
        ms: await measure(options, () => buildFusedPc(runtime.Fr, inputs)),
      },
    ];

    console.table(records.map((record) => ({
      candidate: record.candidate,
      "base shape": record.baseShape,
      "output shape": record.outputShape,
      "ms/op": record.ms.toFixed(3),
    })));
    await writeReport(options, records);
  } finally {
    await runtime.terminate();
  }
}

function buildInputs(field: FieldRuntime, baseShape: Shape): PcInputs {
  const outputShape = {
    xSize: baseShape.xSize * 2,
    ySize: baseShape.ySize * 2,
  };

  return {
    fXY: patternedPolynomial(field, baseShape, 0x11n),
    gXY: patternedPolynomial(field, baseShape, 0x22n),
    lagrangeKlXY: patternedPolynomial(field, baseShape, 0x33n),
    q2XY: patternedPolynomial(field, outputShape, 0x44n),
    q3XY: patternedPolynomial(field, outputShape, 0x55n),
    smallREval: field.fromBigInt(3n),
    smallROmegaXEval: field.fromBigInt(5n),
    smallROmegaXOmegaYEval: field.fromBigInt(7n),
    lagrangeKlScale: field.fromBigInt(11n),
    term5Scale: field.fromBigInt(13n),
    term6Scale: field.fromBigInt(17n),
    q2Scale: field.fromBigInt(19n),
    q3Scale: field.fromBigInt(23n),
  };
}

function buildCurrentPc(field: FieldRuntime, inputs: PcInputs): BivariatePolynomialBuffer {
  const term5 = linearCombinationBuffer(field, [
    [inputs.smallREval, inputs.gXY],
    [field.neg(inputs.smallROmegaXEval), inputs.fXY],
  ]);
  const term6 = linearCombinationBuffer(field, [
    [inputs.smallREval, inputs.gXY],
    [field.neg(inputs.smallROmegaXOmegaYEval), inputs.fXY],
  ]);

  return linearCombinationBuffer(field, [
    [inputs.lagrangeKlScale, inputs.lagrangeKlXY],
    [inputs.term5Scale, term5],
    [inputs.term6Scale, term6],
    [inputs.q2Scale, inputs.q2XY],
    [inputs.q3Scale, inputs.q3XY],
  ]);
}

function buildFusedPc(field: FieldRuntime, inputs: PcInputs): BivariatePolynomialBuffer {
  const gScale = field.mul(
    inputs.smallREval,
    field.add(inputs.term5Scale, inputs.term6Scale),
  );
  const fScale = field.neg(
    field.add(
      field.mul(inputs.term5Scale, inputs.smallROmegaXEval),
      field.mul(inputs.term6Scale, inputs.smallROmegaXOmegaYEval),
    ),
  );

  return linearCombinationBuffer(field, [
    [inputs.lagrangeKlScale, inputs.lagrangeKlXY],
    [gScale, inputs.gXY],
    [fScale, inputs.fXY],
    [inputs.q2Scale, inputs.q2XY],
    [inputs.q3Scale, inputs.q3XY],
  ]);
}

function patternedPolynomial(
  field: FieldRuntime,
  shape: Shape,
  seed: bigint,
): BivariatePolynomialBuffer {
  const values = Array.from(
    { length: 16 },
    (_, index) => field.fromBigInt(seed + BigInt(index + 1)),
  );
  const coefficients = field.createZeroBuffer(shape.xSize * shape.ySize);
  for (let index = 0; index < shape.xSize * shape.ySize; index += 1) {
    field.writeBufferElement(coefficients, index, values[index % values.length]);
  }
  return BivariatePolynomialBuffer.fromOwnedBuffer(field, coefficients, shape.xSize, shape.ySize);
}

async function measure(
  options: BenchmarkOptions,
  callback: () => BivariatePolynomialBuffer,
): Promise<number> {
  for (let index = 0; index < options.warmup; index += 1) {
    callback();
  }

  const start = performance.now();
  for (let index = 0; index < options.iterations; index += 1) {
    callback();
  }
  return (performance.now() - start) / options.iterations;
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
    baseShape: parseShape(values.get("base-shape") ?? "16x16"),
    iterations: parsePositiveInteger(values.get("iterations") ?? "2", "iterations"),
    warmup: parseNonNegativeInteger(values.get("warmup") ?? "1", "warmup"),
    jsonPath: values.get("json") ?? "tmp/timing/opening-pc-fusion.json",
  };
}

function parseShape(value: string): Shape {
  const match = /^([0-9]+)x([0-9]+)$/.exec(value);
  if (match === null) {
    throw new Error(`Invalid shape '${value}'. Expected <xSize>x<ySize>.`);
  }
  return {
    xSize: parsePositiveInteger(match[1], "xSize"),
    ySize: parsePositiveInteger(match[2], "ySize"),
  };
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = parseNonNegativeInteger(value, label);
  if (parsed === 0) {
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

function assertBytesEqual(actual: Uint8Array, expected: Uint8Array, label: string): void {
  if (actual.byteLength !== expected.byteLength) {
    throw new Error(`${label}: byte length mismatch ${actual.byteLength} !== ${expected.byteLength}.`);
  }
  for (let index = 0; index < actual.byteLength; index += 1) {
    if (actual[index] !== expected[index]) {
      throw new Error(`${label}: byte mismatch at offset ${index}.`);
    }
  }
}

function formatShape(shape: Shape): string {
  return `${shape.xSize}x${shape.ySize}`;
}

async function writeReport(
  options: BenchmarkOptions,
  records: readonly BenchmarkRecord[],
): Promise<void> {
  const outputPath = path.resolve(options.jsonPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    options: {
      baseShape: formatShape(options.baseShape),
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
