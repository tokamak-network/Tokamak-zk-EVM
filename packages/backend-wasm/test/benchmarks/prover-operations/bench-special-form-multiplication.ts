import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";

import {
  BivariatePolynomialBuffer,
  type FieldElement,
  type FieldRuntime,
} from "../../../src/index.js";
import {
  mulByLinearX,
  mulByLinearY,
  mulByOneMinusX,
  mulByTerm9,
  mulByXMinusOne,
} from "../../../src/prover/internal/polynomial-ops.js";
import {
  createStructuredBenchmarkRuntimes,
} from "./structured-wasm-benchmark-support.js";

type OperationName = "x-minus-one" | "one-minus-x" | "linear-x" | "linear-y" | "term9";

interface Shape {
  readonly xSize: number;
  readonly ySize: number;
}

interface BenchmarkOptions {
  readonly seed: bigint;
  readonly shapes: readonly Shape[];
  readonly operations: ReadonlySet<OperationName>;
  readonly iterations: number;
  readonly warmup: number;
  readonly jsonPath: string;
}

interface TimingSummary {
  readonly medianMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly samplesMs: readonly number[];
}

interface BenchmarkRecord extends TimingSummary {
  readonly operation: OperationName;
  readonly candidate: string;
  readonly shape: string;
  readonly outputShape: string;
  readonly inputBytes: number;
  readonly outputBytes: number;
  readonly temporaryBytesExcludingResult: number;
}

interface OperationCase {
  readonly name: OperationName;
  readonly legacy: (polynomial: BivariatePolynomialBuffer) => BivariatePolynomialBuffer;
  readonly candidate: (polynomial: BivariatePolynomialBuffer) => BivariatePolynomialBuffer;
  readonly production: (
    polynomial: BivariatePolynomialBuffer,
  ) => Promise<BivariatePolynomialBuffer>;
}

interface BenchmarkReport {
  readonly generatedAt: string;
  readonly options: {
    readonly seed: string;
    readonly shapes: readonly string[];
    readonly operations: readonly OperationName[];
    readonly iterations: number;
    readonly warmup: number;
  };
  readonly records: readonly BenchmarkRecord[];
}

const OPERATION_NAMES: readonly OperationName[] = [
  "x-minus-one",
  "one-minus-x",
  "linear-x",
  "linear-y",
  "term9",
];

let resultSink = 0;

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const runtime = await createStructuredBenchmarkRuntimes();

  try {
    const operations = createOperationCases(runtime.field).filter(({ name }) => options.operations.has(name));
    await runSmallParity(runtime.field, operations);

    const records: BenchmarkRecord[] = [];
    for (const shape of options.shapes) {
      const polynomial = deterministicPolynomial(runtime.field, shape, options.seed);
      for (const operation of operations) {
        records.push(...await benchmarkOperation(polynomial, operation, shape, options));
      }
    }

    printRecords(records);
    await writeReport(options, records);
  } finally {
    await runtime.terminate();
  }
}

function createOperationCases(field: FieldRuntime): readonly OperationCase[] {
  const linearX = [field.fromBigInt(3n), field.fromBigInt(5n)];
  const linearY = [field.fromBigInt(7n), field.fromBigInt(11n)];
  const rBX = [field.fromBigInt(13n), field.fromBigInt(17n)];
  const rBY = [field.fromBigInt(19n), field.fromBigInt(23n)];
  const tMiEval = field.fromBigInt(29n);
  const tSMaxEval = field.fromBigInt(31n);
  const term9Constant = field.add(field.mul(tMiEval, rBX[0]), field.mul(tSMaxEval, rBY[0]));
  const term9X = field.mul(tMiEval, rBX[1]);
  const term9Y = field.mul(tSMaxEval, rBY[1]);

  return [
    {
      name: "x-minus-one",
      legacy: (polynomial) => polynomial.mulMonomial(1, 0).sub(polynomial),
      candidate: multiplyByXMinusOneFused,
      production: mulByXMinusOne,
    },
    {
      name: "one-minus-x",
      legacy: (polynomial) => polynomial.sub(polynomial.mulMonomial(1, 0)),
      candidate: multiplyByOneMinusXFused,
      production: mulByOneMinusX,
    },
    {
      name: "linear-x",
      legacy: (polynomial) =>
        polynomial.scale(linearX[0]).add(polynomial.mulMonomial(1, 0).scale(linearX[1])),
      candidate: (polynomial) => multiplyByLinearXFused(polynomial, linearX[0], linearX[1]),
      production: (polynomial) => mulByLinearX(polynomial, linearX),
    },
    {
      name: "linear-y",
      legacy: (polynomial) =>
        polynomial.scale(linearY[0]).add(polynomial.mulMonomial(0, 1).scale(linearY[1])),
      candidate: (polynomial) => multiplyByLinearYFused(polynomial, linearY[0], linearY[1]),
      production: (polynomial) => mulByLinearY(polynomial, linearY),
    },
    {
      name: "term9",
      legacy: (polynomial) => polynomial
        .scale(term9Constant)
        .add(polynomial.mulMonomial(1, 0).scale(term9X))
        .add(polynomial.mulMonomial(0, 1).scale(term9Y)),
      candidate: (polynomial) => multiplyByTerm9Fused(polynomial, term9Constant, term9X, term9Y),
      production: (polynomial) => mulByTerm9(polynomial, rBX, rBY, tMiEval, tSMaxEval),
    },
  ];
}

async function benchmarkOperation(
  polynomial: BivariatePolynomialBuffer,
  operation: OperationCase,
  shape: Shape,
  options: BenchmarkOptions,
): Promise<BenchmarkRecord[]> {
  const expected = operation.legacy(polynomial);
  const actual = operation.candidate(polynomial);
  assertPolynomialEqual(actual, expected, `${operation.name} ${formatShape(shape)}`);
  const production = await operation.production(polynomial);
  assertPolynomialEqual(production, expected, `${operation.name} production ${formatShape(shape)}`);

  const implementations = [
    { name: "legacy-production" as const, run: operation.legacy },
    { name: "fused-owned-output" as const, run: operation.candidate },
    { name: "current-production" as const, run: operation.production },
  ];
  const samples = new Map(implementations.map(({ name }) => [name, [] as number[]]));
  for (let iteration = 0; iteration < options.warmup; iteration += 1) {
    for (const implementation of implementations) {
      consumeResult(await implementation.run(polynomial));
    }
  }
  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    const ordered = iteration % 2 === 0
      ? implementations
      : [...implementations].reverse();
    for (const implementation of ordered) {
      const start = performance.now();
      const result = await implementation.run(polynomial);
      const elapsed = performance.now() - start;
      consumeResult(result);
      samples.get(implementation.name)!.push(elapsed);
    }
  }

  const outputBytes = expected.coefficients.byteLength;
  return implementations.map((implementation) => ({
      operation: operation.name,
      candidate: implementation.name,
      shape: formatShape(shape),
      outputShape: `${expected.xSize}x${expected.ySize}`,
      inputBytes: polynomial.coefficients.byteLength,
      outputBytes,
      temporaryBytesExcludingResult: implementation.name === "legacy-production"
        ? outputBytes
        : 0,
      ...summarize(samples.get(implementation.name)!),
    }));
}

function multiplyByXMinusOneFused(polynomial: BivariatePolynomialBuffer): BivariatePolynomialBuffer {
  return multiplyByXDifferenceFused(polynomial, false);
}

function multiplyByOneMinusXFused(polynomial: BivariatePolynomialBuffer): BivariatePolynomialBuffer {
  return multiplyByXDifferenceFused(polynomial, true);
}

function multiplyByXDifferenceFused(
  polynomial: BivariatePolynomialBuffer,
  negateShift: boolean,
): BivariatePolynomialBuffer {
  const degree = polynomial.findDegree();
  if (degree.xDegree < 0 || degree.yDegree < 0) {
    return BivariatePolynomialBuffer.zero(polynomial.field);
  }

  const field = polynomial.field;
  const xSize = Math.max(polynomial.xSize, nextPowerOfTwo(degree.xDegree + 2));
  const ySize = polynomial.ySize;
  const output = new Uint8Array(xSize * ySize * field.byteLength);
  const sourceRowBytes = polynomial.ySize * field.byteLength;
  const outputRowBytes = ySize * field.byteLength;

  for (let x = 0; x <= degree.xDegree + 1; x += 1) {
    const outputRowOffset = x * outputRowBytes;
    const currentRowOffset = x * sourceRowBytes;
    const previousRowOffset = (x - 1) * sourceRowBytes;
    for (let y = 0; y <= degree.yDegree; y += 1) {
      const elementOffset = y * field.byteLength;
      const current = x <= degree.xDegree
        ? polynomial.coefficients.subarray(
          currentRowOffset + elementOffset,
          currentRowOffset + elementOffset + field.byteLength,
        )
        : field.zero;
      const previous = x > 0
        ? polynomial.coefficients.subarray(
          previousRowOffset + elementOffset,
          previousRowOffset + elementOffset + field.byteLength,
        )
        : field.zero;
      output.set(
        negateShift ? field.sub(current, previous) : field.sub(previous, current),
        outputRowOffset + elementOffset,
      );
    }
  }

  return BivariatePolynomialBuffer.fromOwnedBuffer(field, output, xSize, ySize);
}

function multiplyByLinearXFused(
  polynomial: BivariatePolynomialBuffer,
  constant: FieldElement,
  xCoefficient: FieldElement,
): BivariatePolynomialBuffer {
  const degree = polynomial.findDegree();
  if (degree.xDegree < 0 || degree.yDegree < 0) {
    return BivariatePolynomialBuffer.zero(polynomial.field);
  }

  const field = polynomial.field;
  const xSize = Math.max(polynomial.xSize, nextPowerOfTwo(degree.xDegree + 2));
  const ySize = polynomial.ySize;
  const output = new Uint8Array(xSize * ySize * field.byteLength);
  const sourceRowBytes = polynomial.ySize * field.byteLength;
  const outputRowBytes = ySize * field.byteLength;

  for (let x = 0; x <= degree.xDegree + 1; x += 1) {
    const outputRowOffset = x * outputRowBytes;
    const currentRowOffset = x * sourceRowBytes;
    const previousRowOffset = (x - 1) * sourceRowBytes;
    for (let y = 0; y <= degree.yDegree; y += 1) {
      const elementOffset = y * field.byteLength;
      let value = field.zero;
      if (x <= degree.xDegree) {
        value = field.mul(
          polynomial.coefficients.subarray(
            currentRowOffset + elementOffset,
            currentRowOffset + elementOffset + field.byteLength,
          ),
          constant,
        );
      }
      if (x > 0) {
        const shifted = field.mul(
          polynomial.coefficients.subarray(
            previousRowOffset + elementOffset,
            previousRowOffset + elementOffset + field.byteLength,
          ),
          xCoefficient,
        );
        value = x <= degree.xDegree ? field.add(value, shifted) : shifted;
      }
      output.set(value, outputRowOffset + elementOffset);
    }
  }

  return BivariatePolynomialBuffer.fromOwnedBuffer(field, output, xSize, ySize);
}

function multiplyByLinearYFused(
  polynomial: BivariatePolynomialBuffer,
  constant: FieldElement,
  yCoefficient: FieldElement,
): BivariatePolynomialBuffer {
  const degree = polynomial.findDegree();
  if (degree.xDegree < 0 || degree.yDegree < 0) {
    return BivariatePolynomialBuffer.zero(polynomial.field);
  }

  const field = polynomial.field;
  const xSize = polynomial.xSize;
  const ySize = Math.max(polynomial.ySize, nextPowerOfTwo(degree.yDegree + 2));
  const output = new Uint8Array(xSize * ySize * field.byteLength);
  const sourceRowBytes = polynomial.ySize * field.byteLength;
  const outputRowBytes = ySize * field.byteLength;

  for (let x = 0; x <= degree.xDegree; x += 1) {
    const sourceRowOffset = x * sourceRowBytes;
    const outputRowOffset = x * outputRowBytes;
    for (let y = 0; y <= degree.yDegree + 1; y += 1) {
      let value = field.zero;
      if (y <= degree.yDegree) {
        value = field.mul(
          polynomial.coefficients.subarray(
            sourceRowOffset + y * field.byteLength,
            sourceRowOffset + (y + 1) * field.byteLength,
          ),
          constant,
        );
      }
      if (y > 0) {
        const shifted = field.mul(
          polynomial.coefficients.subarray(
            sourceRowOffset + (y - 1) * field.byteLength,
            sourceRowOffset + y * field.byteLength,
          ),
          yCoefficient,
        );
        value = y <= degree.yDegree ? field.add(value, shifted) : shifted;
      }
      output.set(value, outputRowOffset + y * field.byteLength);
    }
  }

  return BivariatePolynomialBuffer.fromOwnedBuffer(field, output, xSize, ySize);
}

function multiplyByTerm9Fused(
  polynomial: BivariatePolynomialBuffer,
  constant: FieldElement,
  xCoefficient: FieldElement,
  yCoefficient: FieldElement,
): BivariatePolynomialBuffer {
  const degree = polynomial.findDegree();
  if (degree.xDegree < 0 || degree.yDegree < 0) {
    return BivariatePolynomialBuffer.zero(polynomial.field);
  }

  const field = polynomial.field;
  const xSize = Math.max(polynomial.xSize, nextPowerOfTwo(degree.xDegree + 2));
  const ySize = Math.max(polynomial.ySize, nextPowerOfTwo(degree.yDegree + 2));
  const output = new Uint8Array(xSize * ySize * field.byteLength);
  const sourceRowBytes = polynomial.ySize * field.byteLength;
  const outputRowBytes = ySize * field.byteLength;

  for (let x = 0; x <= degree.xDegree + 1; x += 1) {
    const outputRowOffset = x * outputRowBytes;
    const currentRowOffset = x * sourceRowBytes;
    const previousRowOffset = (x - 1) * sourceRowBytes;
    for (let y = 0; y <= degree.yDegree + 1; y += 1) {
      const outputOffset = outputRowOffset + y * field.byteLength;
      let value = field.zero;
      let hasValue = false;
      if (x <= degree.xDegree && y <= degree.yDegree) {
        value = field.mul(
          polynomial.coefficients.subarray(
            currentRowOffset + y * field.byteLength,
            currentRowOffset + (y + 1) * field.byteLength,
          ),
          constant,
        );
        hasValue = true;
      }
      if (x > 0 && y <= degree.yDegree) {
        const xTerm = field.mul(
          polynomial.coefficients.subarray(
            previousRowOffset + y * field.byteLength,
            previousRowOffset + (y + 1) * field.byteLength,
          ),
          xCoefficient,
        );
        value = hasValue ? field.add(value, xTerm) : xTerm;
        hasValue = true;
      }
      if (x <= degree.xDegree && y > 0) {
        const yTerm = field.mul(
          polynomial.coefficients.subarray(
            currentRowOffset + (y - 1) * field.byteLength,
            currentRowOffset + y * field.byteLength,
          ),
          yCoefficient,
        );
        value = hasValue ? field.add(value, yTerm) : yTerm;
      }
      output.set(value, outputOffset);
    }
  }

  return BivariatePolynomialBuffer.fromOwnedBuffer(field, output, xSize, ySize);
}

async function runSmallParity(
  field: FieldRuntime,
  operations: readonly OperationCase[],
): Promise<void> {
  const shapes: readonly Shape[] = [
    { xSize: 1, ySize: 1 },
    { xSize: 2, ySize: 2 },
    { xSize: 4, ySize: 2 },
  ];
  for (const shape of shapes) {
    const polynomial = deterministicPolynomial(field, shape, 0x5350454349414cn);
    for (const operation of operations) {
      assertPolynomialEqual(
        operation.candidate(polynomial),
        operation.legacy(polynomial),
        `small parity ${operation.name} ${formatShape(shape)}`,
      );
      assertPolynomialEqual(
        await operation.production(polynomial),
        operation.legacy(polynomial),
        `small production parity ${operation.name} ${formatShape(shape)}`,
      );
    }
  }

  const zero = BivariatePolynomialBuffer.zero(field);
  for (const operation of operations) {
    assertPolynomialEqual(operation.candidate(zero), operation.legacy(zero), `zero parity ${operation.name}`);
    assertPolynomialEqual(
      await operation.production(zero),
      operation.legacy(zero),
      `zero production parity ${operation.name}`,
    );
  }

  const sparse = BivariatePolynomialBuffer.zero(field).resize(8, 4);
  sparse.setCoeff(1, 1, field.fromBigInt(37n));
  for (const operation of operations) {
    assertPolynomialEqual(operation.candidate(sparse), operation.legacy(sparse), `sparse parity ${operation.name}`);
    assertPolynomialEqual(
      await operation.production(sparse),
      operation.legacy(sparse),
      `sparse production parity ${operation.name}`,
    );
  }
}

function deterministicPolynomial(
  field: FieldRuntime,
  shape: Shape,
  seed: bigint,
): BivariatePolynomialBuffer {
  const elementCount = shape.xSize * shape.ySize;
  const patternLength = Math.min(elementCount, 256);
  const pattern = Array.from({ length: patternLength }, (_, index) =>
    field.fromBigInt(((seed + BigInt(index + 1) * 0x9e3779b1n) % (field.modulus - 1n)) + 1n),
  );
  const coefficients = new Uint8Array(elementCount * field.byteLength);
  for (let index = 0; index < elementCount; index += 1) {
    coefficients.set(pattern[index % patternLength], index * field.byteLength);
  }
  return BivariatePolynomialBuffer.fromOwnedBuffer(field, coefficients, shape.xSize, shape.ySize);
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
    seed: parseSeed(values.get("seed") ?? "0x5350454349414c"),
    shapes: parseShapes(values.get("shapes") ?? "4096x256"),
    operations: parseOperations(values.get("operations") ?? OPERATION_NAMES.join(",")),
    iterations: parsePositiveInteger(values.get("iterations") ?? "3", "iterations"),
    warmup: parseNonNegativeInteger(values.get("warmup") ?? "1", "warmup"),
    jsonPath: values.get("json") ?? "tmp/timing/special-form-multiplication.json",
  };
}

function parseOperations(value: string): ReadonlySet<OperationName> {
  const names = new Set(value.split(",").map((entry) => entry.trim()));
  const known = new Set<string>(OPERATION_NAMES);
  for (const name of names) {
    if (!known.has(name)) {
      throw new Error(`Unknown special-form operation '${name}'.`);
    }
  }
  return names as ReadonlySet<OperationName>;
}

function parseShapes(value: string): Shape[] {
  const shapes = value.split(",").map((entry) => {
    const match = /^([0-9]+)x([0-9]+)$/.exec(entry.trim());
    if (match === null) {
      throw new Error(`Invalid shape '${entry}'. Expected <xSize>x<ySize>.`);
    }
    return {
      xSize: parsePowerOfTwo(match[1], "xSize"),
      ySize: parsePowerOfTwo(match[2], "ySize"),
    };
  });
  if (shapes.length === 0) {
    throw new Error("At least one shape is required.");
  }
  return shapes;
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

function summarize(samples: readonly number[]): TimingSummary {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    medianMs: median(sorted),
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
    samplesMs: [...samples],
  };
}

function median(sortedValues: readonly number[]): number {
  const midpoint = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2 === 0
    ? (sortedValues[midpoint - 1] + sortedValues[midpoint]) / 2
    : sortedValues[midpoint];
}

function assertPolynomialEqual(
  actual: BivariatePolynomialBuffer,
  expected: BivariatePolynomialBuffer,
  label: string,
): void {
  if (actual.xSize !== expected.xSize || actual.ySize !== expected.ySize) {
    throw new Error(
      `${label}: shape mismatch ${actual.xSize}x${actual.ySize} !== ${expected.xSize}x${expected.ySize}.`,
    );
  }
  if (actual.coefficients.byteLength !== expected.coefficients.byteLength) {
    throw new Error(`${label}: coefficient byte length mismatch.`);
  }
  for (let index = 0; index < actual.coefficients.byteLength; index += 1) {
    if (actual.coefficients[index] !== expected.coefficients[index]) {
      throw new Error(`${label}: coefficient mismatch at byte ${index}.`);
    }
  }
}

function consumeResult(result: BivariatePolynomialBuffer): void {
  resultSink ^= result.coefficients[0] ?? 0;
  resultSink ^= result.coefficients[result.coefficients.byteLength - 1] ?? 0;
}

function printRecords(records: readonly BenchmarkRecord[]): void {
  console.table(
    records.map((record) => ({
      operation: record.operation,
      candidate: record.candidate,
      input: record.shape,
      output: record.outputShape,
      "median ms": record.medianMs.toFixed(3),
      "min ms": record.minMs.toFixed(3),
      "max ms": record.maxMs.toFixed(3),
      "temporary MiB": (record.temporaryBytesExcludingResult / 1024 / 1024).toFixed(1),
    })),
  );
}

async function writeReport(options: BenchmarkOptions, records: readonly BenchmarkRecord[]): Promise<void> {
  const report: BenchmarkReport = {
    generatedAt: new Date().toISOString(),
    options: {
      seed: `0x${options.seed.toString(16)}`,
      shapes: options.shapes.map(formatShape),
      operations: [...options.operations],
      iterations: options.iterations,
      warmup: options.warmup,
    },
    records,
  };
  const outputPath = path.resolve(options.jsonPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
