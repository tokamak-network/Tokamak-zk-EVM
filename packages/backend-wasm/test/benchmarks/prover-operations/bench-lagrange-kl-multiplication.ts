import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";

import {
  BivariatePolynomialBuffer,
  type FieldRuntime,
} from "../../../src/index.js";
import {
  buildLagrangeKl,
  multiplyByLagrangeKl,
} from "../../../src/prover/internal/polynomial-ops.js";
import {
  createStructuredBenchmarkRuntimes,
  klTemporaryBytes,
  multiplyKlWasmOneWorker,
  multiplyKlWasmSingle,
  multiplyKlWasmWorkers,
  type StructuredBenchmarkRuntimes,
} from "./structured-wasm-benchmark-support.js";

interface Shape {
  readonly mI: number;
  readonly sMax: number;
}

interface BenchmarkOptions {
  readonly seed: bigint;
  readonly shapes: readonly Shape[];
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
  readonly operation: "build-kl" | "multiply-by-kl" | "combined";
  readonly candidate: string;
  readonly shape: string;
  readonly outputBytes: number;
  readonly temporaryBytesExcludingResult: number;
}

interface BenchmarkReport {
  readonly generatedAt: string;
  readonly options: {
    readonly seed: string;
    readonly shapes: readonly string[];
    readonly iterations: number;
    readonly warmup: number;
  };
  readonly records: readonly BenchmarkRecord[];
}

let resultSink = 0;

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const runtime = await createStructuredBenchmarkRuntimes();

  try {
    await runSmallParity(runtime);
    const records: BenchmarkRecord[] = [];
    for (const shape of options.shapes) {
      records.push(...await benchmarkShape(runtime, shape, options));
    }
    printRecords(records);
    await writeReport(options, records);
  } finally {
    await runtime.terminate();
  }
}

async function benchmarkShape(
  runtime: StructuredBenchmarkRuntimes,
  shape: Shape,
  options: BenchmarkOptions,
): Promise<BenchmarkRecord[]> {
  const field = runtime.field;
  const input = deterministicPolynomial(field, shape, options.seed);
  const legacyKl = await buildLagrangeKlLegacy(field, shape.mI, shape.sMax);
  const directKl = buildLagrangeKlDirect(field, shape.mI, shape.sMax);
  const productionKl = await buildLagrangeKl(field, shape.mI, shape.sMax);
  assertPolynomialEqual(directKl, legacyKl, `${formatShape(shape)} direct KL`);
  assertPolynomialEqual(productionKl, legacyKl, `${formatShape(shape)} production KL`);

  const expectedProduct = await legacyKl.mul(input);
  const candidateProduct = await multiplyByLagrangeKlWeighted(input, shape.mI, shape.sMax);
  const productionProduct = await multiplyByLagrangeKl(input, shape.mI, shape.sMax);
  assertPolynomialEqual(candidateProduct, expectedProduct, `${formatShape(shape)} weighted KL product`);
  assertPolynomialEqual(productionProduct, expectedProduct, `${formatShape(shape)} production KL product`);
  const wasmProducts = [
    {
      name: "wasm-single-task",
      run: () => multiplyKlWasmSingle(runtime, input, shape.mI, shape.sMax),
      taskCount: 1,
    },
    {
      name: "wasm-one-worker",
      run: () => multiplyKlWasmOneWorker(runtime, input, shape.mI, shape.sMax),
      taskCount: 1,
    },
    {
      name: "worker-kernel-mirror",
      run: () => multiplyKlWasmWorkers(runtime, input, shape.mI, shape.sMax),
      taskCount: runtime.workerCount,
    },
  ] as const;
  for (const candidate of wasmProducts) {
    assertPolynomialEqual(
      await candidate.run(),
      expectedProduct,
      `${formatShape(shape)} ${candidate.name}`,
    );
  }

  const buildLegacy = await measureAsync(options, async () => await buildLagrangeKlLegacy(field, shape.mI, shape.sMax));
  const buildDirect = measureSync(options, () => buildLagrangeKlDirect(field, shape.mI, shape.sMax));
  const buildProduction = await measureAsync(options, async () => await buildLagrangeKl(field, shape.mI, shape.sMax));
  const multiplyLegacy = await measureAsync(options, async () => await legacyKl.mul(input));
  const multiplyCandidate = await measureAsync(
    options,
    async () => await multiplyByLagrangeKlWeighted(input, shape.mI, shape.sMax),
  );
  const recurrenceCandidates = [
    {
      name: "current-production",
      run: async () => await multiplyByLagrangeKl(input, shape.mI, shape.sMax),
    },
    ...wasmProducts.map(({ name, run }) => ({ name, run })),
  ];
  const recurrenceTimings = await measureAlternatingAsync(options, recurrenceCandidates);
  const multiplyProduction = recurrenceTimings.get("current-production")!;

  const records: BenchmarkRecord[] = [
    {
      operation: "build-kl",
      candidate: "legacy-production",
      shape: formatShape(shape),
      outputBytes: legacyKl.coefficients.byteLength,
      temporaryBytesExcludingResult: legacyKl.coefficients.byteLength * 2,
      ...buildLegacy,
    },
    {
      operation: "build-kl",
      candidate: "benchmark-candidate",
      shape: formatShape(shape),
      outputBytes: directKl.coefficients.byteLength,
      temporaryBytesExcludingResult: 0,
      ...buildDirect,
    },
    {
      operation: "build-kl",
      candidate: "current-production",
      shape: formatShape(shape),
      outputBytes: productionKl.coefficients.byteLength,
      temporaryBytesExcludingResult: 0,
      ...buildProduction,
    },
    {
      operation: "multiply-by-kl",
      candidate: "legacy-production",
      shape: formatShape(shape),
      outputBytes: expectedProduct.coefficients.byteLength,
      temporaryBytesExcludingResult: expectedProduct.coefficients.byteLength * 3,
      ...multiplyLegacy,
    },
    {
      operation: "multiply-by-kl",
      candidate: "scalar-production-baseline",
      shape: formatShape(shape),
      outputBytes: candidateProduct.coefficients.byteLength,
      temporaryBytesExcludingResult:
        candidateProduct.xSize * input.ySize * field.byteLength
        + candidateProduct.coefficients.byteLength,
      ...multiplyCandidate,
    },
    {
      operation: "multiply-by-kl",
      candidate: "current-production",
      shape: formatShape(shape),
      outputBytes: productionProduct.coefficients.byteLength,
      temporaryBytesExcludingResult: klTemporaryBytes(
        input.xSize,
        input.ySize,
        productionProduct.xSize,
        productionProduct.ySize,
        field.byteLength,
        runtime.workerCount,
      ),
      ...multiplyProduction,
    },
    {
      operation: "combined",
      candidate: "legacy-production",
      shape: formatShape(shape),
      outputBytes: expectedProduct.coefficients.byteLength,
      temporaryBytesExcludingResult: expectedProduct.coefficients.byteLength * 3,
      ...combineSummaries(buildLegacy, multiplyLegacy),
    },
    {
      operation: "combined",
      candidate: "scalar-production-baseline",
      shape: formatShape(shape),
      outputBytes: candidateProduct.coefficients.byteLength,
      temporaryBytesExcludingResult:
        candidateProduct.xSize * input.ySize * field.byteLength
        + candidateProduct.coefficients.byteLength,
      ...combineSummaries(buildDirect, multiplyCandidate),
    },
    {
      operation: "combined",
      candidate: "current-production",
      shape: formatShape(shape),
      outputBytes: productionProduct.coefficients.byteLength,
      temporaryBytesExcludingResult: klTemporaryBytes(
        input.xSize,
        input.ySize,
        productionProduct.xSize,
        productionProduct.ySize,
        field.byteLength,
        runtime.workerCount,
      ),
      ...combineSummaries(buildProduction, multiplyProduction),
    },
  ];
  for (const candidate of wasmProducts) {
    const timing = recurrenceTimings.get(candidate.name)!;
    const temporaryBytes = klTemporaryBytes(
      input.xSize,
      input.ySize,
      productionProduct.xSize,
      productionProduct.ySize,
      field.byteLength,
      candidate.taskCount,
    );
    records.push(
      {
        operation: "multiply-by-kl",
        candidate: candidate.name,
        shape: formatShape(shape),
        outputBytes: productionProduct.coefficients.byteLength,
        temporaryBytesExcludingResult: temporaryBytes,
        ...timing,
      },
      {
        operation: "combined",
        candidate: candidate.name,
        shape: formatShape(shape),
        outputBytes: productionProduct.coefficients.byteLength,
        temporaryBytesExcludingResult: temporaryBytes,
        ...combineSummaries(buildProduction, timing),
      },
    );
  }
  return records;
}

async function buildLagrangeKlLegacy(
  field: FieldRuntime,
  mI: number,
  sMax: number,
): Promise<BivariatePolynomialBuffer> {
  const kEvals = field.createZeroBuffer(mI);
  field.writeBufferElement(kEvals, mI - 1, field.one);
  const lagrangeK = await BivariatePolynomialBuffer.fromRouEvals(field, kEvals, mI, 1);
  const lEvals = field.createZeroBuffer(sMax);
  field.writeBufferElement(lEvals, sMax - 1, field.one);
  const lagrangeL = await BivariatePolynomialBuffer.fromRouEvals(field, lEvals, 1, sMax);
  return await lagrangeK.mul(lagrangeL);
}

function buildLagrangeKlDirect(
  field: FieldRuntime,
  mI: number,
  sMax: number,
): BivariatePolynomialBuffer {
  const inverseDomain = field.inv(field.fromBigInt(BigInt(mI * sMax)));
  const rootX = field.rootOfUnity(mI);
  const rootY = field.rootOfUnity(sMax);
  const output = new Uint8Array(mI * sMax * field.byteLength);
  let rowStart = inverseDomain;

  for (let x = 0; x < mI; x += 1) {
    let value = rowStart;
    const rowOffset = x * sMax * field.byteLength;
    for (let y = 0; y < sMax; y += 1) {
      output.set(value, rowOffset + y * field.byteLength);
      value = field.mul(value, rootY);
    }
    rowStart = field.mul(rowStart, rootX);
  }

  return BivariatePolynomialBuffer.fromOwnedBuffer(field, output, mI, sMax);
}

async function multiplyByLagrangeKlWeighted(
  polynomial: BivariatePolynomialBuffer,
  mI: number,
  sMax: number,
): Promise<BivariatePolynomialBuffer> {
  const degree = polynomial.findDegree();
  if (degree.xDegree < 0 || degree.yDegree < 0) {
    return BivariatePolynomialBuffer.zero(polynomial.field);
  }

  const field = polynomial.field;
  const xSize = nextPowerOfTwo(degree.xDegree + mI);
  const ySize = nextPowerOfTwo(degree.yDegree + sMax);
  const elementBytes = field.byteLength;
  const intermediate = new Uint8Array(xSize * polynomial.ySize * elementBytes);
  const intermediateRowBytes = polynomial.ySize * elementBytes;
  const inputRowBytes = polynomial.ySize * elementBytes;
  const rootX = field.rootOfUnity(mI);

  for (let x = 0; x < xSize; x += 1) {
    const outputRowOffset = x * intermediateRowBytes;
    const previousRowOffset = (x - 1) * intermediateRowBytes;
    const inputRowOffset = x * inputRowBytes;
    const removedRowOffset = (x - mI) * inputRowBytes;
    for (let y = 0; y < polynomial.ySize; y += 1) {
      const elementOffset = y * elementBytes;
      let value = x > 0
        ? field.mul(
          intermediate.subarray(
            previousRowOffset + elementOffset,
            previousRowOffset + elementOffset + elementBytes,
          ),
          rootX,
        )
        : field.zero;
      if (x < polynomial.xSize) {
        value = field.add(
          value,
          polynomial.coefficients.subarray(
            inputRowOffset + elementOffset,
            inputRowOffset + elementOffset + elementBytes,
          ),
        );
      }
      if (x >= mI && x - mI < polynomial.xSize) {
        value = field.sub(
          value,
          polynomial.coefficients.subarray(
            removedRowOffset + elementOffset,
            removedRowOffset + elementOffset + elementBytes,
          ),
        );
      }
      intermediate.set(value, outputRowOffset + elementOffset);
    }
  }

  const unscaledOutput = new Uint8Array(xSize * ySize * elementBytes);
  const outputRowBytes = ySize * elementBytes;
  const rootY = field.rootOfUnity(sMax);
  for (let x = 0; x < xSize; x += 1) {
    const intermediateRowOffset = x * intermediateRowBytes;
    const outputRowOffset = x * outputRowBytes;
    for (let y = 0; y < ySize; y += 1) {
      const outputOffset = outputRowOffset + y * elementBytes;
      let value = y > 0
        ? field.mul(
          unscaledOutput.subarray(outputOffset - elementBytes, outputOffset),
          rootY,
        )
        : field.zero;
      if (y < polynomial.ySize) {
        value = field.add(
          value,
          intermediate.subarray(
            intermediateRowOffset + y * elementBytes,
            intermediateRowOffset + (y + 1) * elementBytes,
          ),
        );
      }
      if (y >= sMax && y - sMax < polynomial.ySize) {
        value = field.sub(
          value,
          intermediate.subarray(
            intermediateRowOffset + (y - sMax) * elementBytes,
            intermediateRowOffset + (y - sMax + 1) * elementBytes,
          ),
        );
      }
      unscaledOutput.set(value, outputOffset);
    }
  }

  const inverseDomain = field.inv(field.fromBigInt(BigInt(mI * sMax)));
  const output = await field.batchApplyKeyBuffer(unscaledOutput, inverseDomain, field.one);
  return BivariatePolynomialBuffer.fromOwnedBuffer(field, output, xSize, ySize);
}

async function runSmallParity(runtime: StructuredBenchmarkRuntimes): Promise<void> {
  const field = runtime.field;
  const shapes: readonly Shape[] = [
    { mI: 2, sMax: 2 },
    { mI: 4, sMax: 2 },
    { mI: 4, sMax: 4 },
  ];
  for (const shape of shapes) {
    const currentKl = await buildLagrangeKlLegacy(field, shape.mI, shape.sMax);
    const directKl = buildLagrangeKlDirect(field, shape.mI, shape.sMax);
    assertPolynomialEqual(directKl, currentKl, `small direct KL ${formatShape(shape)}`);
    assertPolynomialEqual(
      await buildLagrangeKl(field, shape.mI, shape.sMax),
      currentKl,
      `small production KL ${formatShape(shape)}`,
    );

    const input = deterministicPolynomial(field, shape, 0x4b4c504152495459n);
    const expectedProduct = await currentKl.mul(input);
    assertPolynomialEqual(
      await multiplyByLagrangeKlWeighted(input, shape.mI, shape.sMax),
      expectedProduct,
      `small weighted KL product ${formatShape(shape)}`,
    );
    assertPolynomialEqual(
      await multiplyByLagrangeKl(input, shape.mI, shape.sMax),
      expectedProduct,
      `small production KL product ${formatShape(shape)}`,
    );
    assertPolynomialEqual(
      await multiplyKlWasmSingle(runtime, input, shape.mI, shape.sMax),
      expectedProduct,
      `small single-task WASM KL product ${formatShape(shape)}`,
    );
    assertPolynomialEqual(
      await multiplyKlWasmOneWorker(runtime, input, shape.mI, shape.sMax),
      expectedProduct,
      `small one-worker WASM KL product ${formatShape(shape)}`,
    );
    assertPolynomialEqual(
      await multiplyKlWasmWorkers(runtime, input, shape.mI, shape.sMax),
      expectedProduct,
      `small worker WASM KL product ${formatShape(shape)}`,
    );
  }

  const zero = BivariatePolynomialBuffer.zero(field);
  assertPolynomialEqual(
    await multiplyByLagrangeKlWeighted(zero, 4, 4),
    await (await buildLagrangeKlLegacy(field, 4, 4)).mul(zero),
    "zero KL product",
  );
}

function deterministicPolynomial(
  field: FieldRuntime,
  shape: Shape,
  seed: bigint,
): BivariatePolynomialBuffer {
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

async function measureAsync(
  options: BenchmarkOptions,
  run: () => Promise<BivariatePolynomialBuffer>,
): Promise<TimingSummary> {
  for (let iteration = 0; iteration < options.warmup; iteration += 1) {
    consumeResult(await run());
  }
  const samples: number[] = [];
  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    const start = performance.now();
    consumeResult(await run());
    samples.push(performance.now() - start);
  }
  return summarize(samples);
}

async function measureAlternatingAsync(
  options: BenchmarkOptions,
  candidates: readonly {
    readonly name: string;
    readonly run: () => Promise<BivariatePolynomialBuffer>;
  }[],
): Promise<ReadonlyMap<string, TimingSummary>> {
  for (let iteration = 0; iteration < options.warmup; iteration += 1) {
    for (const candidate of candidates) {
      consumeResult(await candidate.run());
    }
  }
  const samples = new Map(candidates.map(({ name }) => [name, [] as number[]]));
  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    const ordered = iteration % 2 === 0 ? candidates : [...candidates].reverse();
    for (const candidate of ordered) {
      const start = performance.now();
      consumeResult(await candidate.run());
      samples.get(candidate.name)!.push(performance.now() - start);
    }
  }
  return new Map(
    [...samples].map(([name, values]) => [name, summarize(values)]),
  );
}

function measureSync(
  options: BenchmarkOptions,
  run: () => BivariatePolynomialBuffer,
): TimingSummary {
  for (let iteration = 0; iteration < options.warmup; iteration += 1) {
    consumeResult(run());
  }
  const samples: number[] = [];
  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    const start = performance.now();
    consumeResult(run());
    samples.push(performance.now() - start);
  }
  return summarize(samples);
}

function combineSummaries(left: TimingSummary, right: TimingSummary): TimingSummary {
  const samples = left.samplesMs.map((value, index) => value + right.samplesMs[index]);
  return summarize(samples);
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
    seed: parseSeed(values.get("seed") ?? "0x4b4c4d554c"),
    shapes: parseShapes(values.get("shapes") ?? "4096x256"),
    iterations: parsePositiveInteger(values.get("iterations") ?? "3", "iterations"),
    warmup: parseNonNegativeInteger(values.get("warmup") ?? "1", "warmup"),
    jsonPath: values.get("json") ?? "tmp/timing/lagrange-kl-multiplication.json",
  };
}

function parseShapes(value: string): Shape[] {
  const shapes = value.split(",").map((entry) => {
    const match = /^([0-9]+)x([0-9]+)$/.exec(entry.trim());
    if (match === null) {
      throw new Error(`Invalid shape '${entry}'. Expected <mI>x<sMax>.`);
    }
    return {
      mI: parsePowerOfTwo(match[1], "mI"),
      sMax: parsePowerOfTwo(match[2], "sMax"),
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
  return `${shape.mI}x${shape.sMax}`;
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
      shape: record.shape,
      "median ms": record.medianMs.toFixed(3),
      "min ms": record.minMs.toFixed(3),
      "max ms": record.maxMs.toFixed(3),
      "output MiB": (record.outputBytes / 1024 / 1024).toFixed(1),
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
