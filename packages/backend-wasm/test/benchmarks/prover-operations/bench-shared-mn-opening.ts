import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BivariatePolynomialBuffer,
  createCurveRuntime,
  type CurveRuntime,
} from "../../../src/index.js";
import { encodePolynomialBufferWithSigma1 } from "../../../src/prover/internal/initial-relation.js";
import {
  buildPreparedProverContext,
  type PreparedProverContext,
} from "./prepared-prover-context.js";
import {
  buildOpeningBenchmarkInputs,
  type OpeningBenchmarkInputs,
} from "./opening-benchmark-inputs.js";

interface Options {
  readonly iterations: number;
  readonly jsonPath: string;
}

interface PhaseTimings {
  readonly xDivisionMs: number;
  readonly yDivisionMs: number;
  readonly encodeMs: number;
  readonly totalMs: number;
}

interface RunResult {
  readonly mX: BivariatePolynomialBuffer;
  readonly mY: BivariatePolynomialBuffer;
  readonly nX: BivariatePolynomialBuffer;
  readonly nY: BivariatePolynomialBuffer;
  readonly mXPoint: Uint8Array;
  readonly mYPoint: Uint8Array;
  readonly nXPoint: Uint8Array;
  readonly nYPoint: Uint8Array;
  readonly timings: PhaseTimings;
  readonly temporaryBytes: number;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const runtime = await createCurveRuntime();

  try {
    const context = await buildPreparedProverContext(runtime, (message) => console.log(message));
    console.log("Building prepared R opening input");
    const inputs = await buildOpeningBenchmarkInputs(runtime, context);
    const currentOracle = await runCurrent(runtime, context, inputs);
    const sharedOracle = await runShared(runtime, context, inputs);
    assertEquivalent(runtime, currentOracle, sharedOracle);

    const currentRuns: RunResult[] = [];
    const sharedRuns: RunResult[] = [];
    for (let iteration = 0; iteration < options.iterations; iteration += 1) {
      console.log(`Benchmark iteration ${iteration + 1}/${options.iterations}: current`);
      currentRuns.push(await runCurrent(runtime, context, inputs));
      console.log(`Benchmark iteration ${iteration + 1}/${options.iterations}: shared`);
      sharedRuns.push(await runShared(runtime, context, inputs));
      assertEquivalent(runtime, currentRuns[iteration], sharedRuns[iteration]);
    }

    const summaries = [
      summarize("current-independent-m-n", currentRuns),
      summarize("shared-x-quotient-and-commitment", sharedRuns),
    ];
    console.table(summaries.map((summary) => ({
      candidate: summary.candidate,
      "median ms": summary.medianMs.toFixed(3),
      "min ms": summary.minMs.toFixed(3),
      "max ms": summary.maxMs.toFixed(3),
      "X division ms": summary.phases.xDivisionMs.toFixed(3),
      "Y division ms": summary.phases.yDivisionMs.toFixed(3),
      "encode ms": summary.phases.encodeMs.toFixed(3),
      "temporary MiB": (summary.temporaryBytes / 2 ** 20).toFixed(3),
    })));

    const outputPath = path.resolve(options.jsonPath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        fixture: "fixtures/small/runtime",
        parity: "pass",
        summaries,
      }, null, 2)}\n`,
    );
    console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);
  } finally {
    await runtime.terminate();
  }
}

async function runCurrent(
  runtime: CurveRuntime,
  context: PreparedProverContext,
  inputs: OpeningBenchmarkInputs,
): Promise<RunResult> {
  const started = performance.now();
  const xStarted = performance.now();
  const mXDivision = await runtime.Fr.ruffiniXBuffer(
    inputs.rXYWithBlinding.coefficients,
    inputs.rXYWithBlinding.xSize,
    inputs.rXYWithBlinding.ySize,
    inputs.mXPoint,
  );
  const nXDivision = await runtime.Fr.ruffiniXBuffer(
    inputs.rXYWithBlinding.coefficients,
    inputs.rXYWithBlinding.xSize,
    inputs.rXYWithBlinding.ySize,
    inputs.mXPoint,
  );
  const xDivisionMs = performance.now() - xStarted;
  const yStarted = performance.now();
  const mYDivision = await runtime.Fr.ruffiniYBuffer(
    mXDivision.remainder,
    inputs.rXYWithBlinding.ySize,
    inputs.zeta,
  );
  const nYDivision = await runtime.Fr.ruffiniYBuffer(
    nXDivision.remainder,
    inputs.rXYWithBlinding.ySize,
    inputs.nYPoint,
  );
  const yDivisionMs = performance.now() - yStarted;
  const m = {
    quotientX: BivariatePolynomialBuffer.fromOwnedBuffer(
      runtime.Fr,
      mXDivision.quotient,
      inputs.rXYWithBlinding.xSize,
      inputs.rXYWithBlinding.ySize,
    ),
    quotientY: BivariatePolynomialBuffer.fromOwnedBuffer(
      runtime.Fr,
      mYDivision.quotient,
      1,
      inputs.rXYWithBlinding.ySize,
    ),
  };
  const n = {
    quotientX: BivariatePolynomialBuffer.fromOwnedBuffer(
      runtime.Fr,
      nXDivision.quotient,
      inputs.rXYWithBlinding.xSize,
      inputs.rXYWithBlinding.ySize,
    ),
    quotientY: BivariatePolynomialBuffer.fromOwnedBuffer(
      runtime.Fr,
      nYDivision.quotient,
      1,
      inputs.rXYWithBlinding.ySize,
    ),
  };
  const encodeStarted = performance.now();
  const [mXPoint, mYPoint, nXPoint, nYPoint] = await encodeAll(runtime, context, [
    m.quotientX,
    m.quotientY,
    n.quotientX,
    n.quotientY,
  ]);
  const encodeMs = performance.now() - encodeStarted;

  return {
    mX: m.quotientX,
    mY: m.quotientY,
    nX: n.quotientX,
    nY: n.quotientY,
    mXPoint,
    mYPoint,
    nXPoint,
    nYPoint,
    timings: {
      xDivisionMs,
      yDivisionMs,
      encodeMs,
      totalMs: performance.now() - started,
    },
    temporaryBytes: polynomialBytes([m.quotientX, m.quotientY, n.quotientX, n.quotientY]),
  };
}

async function runShared(
  runtime: CurveRuntime,
  context: PreparedProverContext,
  inputs: OpeningBenchmarkInputs,
): Promise<RunResult> {
  const started = performance.now();
  const xStarted = performance.now();
  const xDivision = await runtime.Fr.ruffiniXBuffer(
    inputs.rXYWithBlinding.coefficients,
    inputs.rXYWithBlinding.xSize,
    inputs.rXYWithBlinding.ySize,
    inputs.mXPoint,
  );
  const xDivisionMs = performance.now() - xStarted;
  const yStarted = performance.now();
  const mYDivision = await runtime.Fr.ruffiniYBuffer(
    xDivision.remainder,
    inputs.rXYWithBlinding.ySize,
    inputs.zeta,
  );
  const nYDivision = await runtime.Fr.ruffiniYBuffer(
    xDivision.remainder,
    inputs.rXYWithBlinding.ySize,
    inputs.nYPoint,
  );
  const yDivisionMs = performance.now() - yStarted;
  const mX = BivariatePolynomialBuffer.fromOwnedBuffer(
    runtime.Fr,
    xDivision.quotient,
    inputs.rXYWithBlinding.xSize,
    inputs.rXYWithBlinding.ySize,
  );
  const mY = BivariatePolynomialBuffer.fromOwnedBuffer(
    runtime.Fr,
    mYDivision.quotient,
    1,
    inputs.rXYWithBlinding.ySize,
  );
  const nY = BivariatePolynomialBuffer.fromOwnedBuffer(
    runtime.Fr,
    nYDivision.quotient,
    1,
    inputs.rXYWithBlinding.ySize,
  );
  const encodeStarted = performance.now();
  const [mXPoint, mYPoint, nYPoint] = await encodeAll(runtime, context, [mX, mY, nY]);
  const encodeMs = performance.now() - encodeStarted;

  return {
    mX,
    mY,
    nX: mX,
    nY,
    mXPoint,
    mYPoint,
    nXPoint: mXPoint,
    nYPoint,
    timings: {
      xDivisionMs,
      yDivisionMs,
      encodeMs,
      totalMs: performance.now() - started,
    },
    temporaryBytes: polynomialBytes([mX, mY, nY]),
  };
}

async function encodeAll(
  runtime: CurveRuntime,
  context: PreparedProverContext,
  polynomials: readonly BivariatePolynomialBuffer[],
): Promise<Uint8Array[]> {
  const points: Uint8Array[] = [];
  for (const polynomial of polynomials) {
    points.push(
      await encodePolynomialBufferWithSigma1(
        runtime,
        context.input.crs,
        context.state.setup,
        polynomial,
      ),
    );
  }
  return points;
}

function assertEquivalent(runtime: CurveRuntime, current: RunResult, shared: RunResult): void {
  assertBytesEqual(current.mX.coefficients, current.nX.coefficients, "current M_X/N_X");
  assertBytesEqual(current.mX.coefficients, shared.mX.coefficients, "shared M_X");
  assertBytesEqual(current.nX.coefficients, shared.nX.coefficients, "shared N_X");
  assertBytesEqual(current.mY.coefficients, shared.mY.coefficients, "shared M_Y");
  assertBytesEqual(current.nY.coefficients, shared.nY.coefficients, "shared N_Y");
  for (const [label, left, right] of [
    ["M_X", current.mXPoint, shared.mXPoint],
    ["M_Y", current.mYPoint, shared.mYPoint],
    ["N_X", current.nXPoint, shared.nXPoint],
    ["N_Y", current.nYPoint, shared.nYPoint],
  ] as const) {
    if (!runtime.G1.eq(left, right)) {
      throw new Error(`${label} commitment mismatch.`);
    }
  }
}

function assertBytesEqual(left: Uint8Array, right: Uint8Array, label: string): void {
  if (left.length !== right.length) {
    throw new Error(`${label} length mismatch.`);
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      throw new Error(`${label} mismatch at byte ${index}.`);
    }
  }
}

function summarize(candidate: string, runs: readonly RunResult[]) {
  const sorted = [...runs].sort((left, right) => left.timings.totalMs - right.timings.totalMs);
  const median = sorted[Math.floor(sorted.length / 2)];
  return {
    candidate,
    iterations: runs.length,
    medianMs: median.timings.totalMs,
    minMs: sorted[0].timings.totalMs,
    maxMs: sorted[sorted.length - 1].timings.totalMs,
    phases: median.timings,
    temporaryBytes: median.temporaryBytes,
  };
}

function polynomialBytes(polynomials: readonly BivariatePolynomialBuffer[]): number {
  return polynomials.reduce((total, polynomial) => total + polynomial.coefficients.byteLength, 0);
}

function parseOptions(args: readonly string[]): Options {
  let iterations = 2;
  let jsonPath = "tmp/timing/shared-mn-opening.json";
  for (const arg of args) {
    const match = /^--([a-z-]+)=(.+)$/.exec(arg);
    if (match === null) {
      throw new Error(`Unknown argument '${arg}'.`);
    }
    if (match[1] === "iterations") {
      iterations = Number(match[2]);
    } else if (match[1] === "json") {
      jsonPath = match[2];
    } else {
      throw new Error(`Unknown option '--${match[1]}'.`);
    }
  }
  if (!Number.isSafeInteger(iterations) || iterations < 1) {
    throw new Error("iterations must be a positive integer.");
  }
  return { iterations, jsonPath };
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
