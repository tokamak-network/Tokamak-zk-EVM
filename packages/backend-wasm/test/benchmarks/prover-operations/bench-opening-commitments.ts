import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BivariatePolynomialBuffer,
  createCurveRuntime,
  type CurveRuntime,
} from "../../../src/index.js";
import { encodePolynomialBufferWithSigma1 } from "../../../src/prover/protocol/initial-relation.js";
import {
  computeOpeningCommitments,
  type OpeningCommitmentsComputation,
} from "../../../src/prover/protocol/opening-commitments.js";
import { linearCombinationBufferBatch } from "../../../src/prover/polynomial/polynomial-ops.js";
import {
  buildOpeningBenchmarkInputs,
  type OpeningBenchmarkInputs,
} from "./opening-benchmark-inputs.js";
import {
  buildPreparedProverContext,
  type PreparedProverContext,
} from "../support/prepared-prover-context.js";

type Candidate = "current-all-openings" | "combined-pi-shared-mn";

interface PiResult {
  readonly piX: Uint8Array;
  readonly piY: Uint8Array;
  readonly quotientX: BivariatePolynomialBuffer;
  readonly quotientY: BivariatePolynomialBuffer;
  readonly temporaryBytes: number;
}

interface MnResult {
  readonly mX: BivariatePolynomialBuffer;
  readonly mY: BivariatePolynomialBuffer;
  readonly nX: BivariatePolynomialBuffer;
  readonly nY: BivariatePolynomialBuffer;
  readonly mXPoint: Uint8Array;
  readonly mYPoint: Uint8Array;
  readonly nXPoint: Uint8Array;
  readonly nYPoint: Uint8Array;
  readonly temporaryBytes: number;
}

interface RunResult {
  readonly candidate: Candidate;
  readonly pi: PiResult;
  readonly mn: MnResult;
  readonly piMs: number;
  readonly mnMs: number;
  readonly totalMs: number;
  readonly temporaryBytes: number;
}

async function main(): Promise<void> {
  const runtime = await createCurveRuntime();
  try {
    const context = await buildPreparedProverContext(runtime, (message) => console.log(message));
    console.log("Building prepared opening inputs");
    const inputs = await buildOpeningBenchmarkInputs(runtime, context);
    const samples = new Map<Candidate, Omit<RunResult, "pi" | "mn">[]>([
      ["current-all-openings", []],
      ["combined-pi-shared-mn", []],
    ]);

    for (let iteration = 0; iteration < 2; iteration += 1) {
      console.log(`Combined opening benchmark iteration ${iteration + 1}/2`);
      const currentFirst = iteration % 2 === 0;
      const first = currentFirst
        ? await runCurrent(runtime, context, inputs)
        : await runOptimized(runtime, context, inputs);
      const second = currentFirst
        ? await runOptimized(runtime, context, inputs)
        : await runCurrent(runtime, context, inputs);
      const current = currentFirst ? first : second;
      const optimized = currentFirst ? second : first;
      assertEquivalent(runtime, current, optimized);
      if (iteration === 0) {
        console.log("Checking production opening parity");
        const production = await computeOpeningCommitments({
          runtime,
          crs: context.input.crs,
          state: context.state,
          rXY: context.recursion.rXY,
          initialRelation: context.initialRelation,
          copyQuotient: context.copyQuotient,
          evaluations: context.evaluations,
          thetas: context.thetas,
          kappa0: context.kappa0,
          chi: context.chi,
          zeta: context.zeta,
          kappa1: context.kappa1,
        });
        assertProductionEquivalent(runtime, current, production);
      }
      addSample(samples, first);
      addSample(samples, second);
    }

    const summaries = [
      summarize("current-all-openings", samples.get("current-all-openings") ?? []),
      summarize("combined-pi-shared-mn", samples.get("combined-pi-shared-mn") ?? []),
    ];
    console.table(summaries.map((summary) => ({
      candidate: summary.candidate,
      "median ms": summary.medianMs.toFixed(3),
      "min ms": summary.minMs.toFixed(3),
      "max ms": summary.maxMs.toFixed(3),
      "Pi ms": summary.medianPiMs.toFixed(3),
      "M/N ms": summary.medianMnMs.toFixed(3),
      "temporary MiB": (summary.temporaryBytes / 2 ** 20).toFixed(3),
    })));
    const report = {
      generatedAt: new Date().toISOString(),
      fixture: "fixtures/small/runtime",
      iterations: 2,
      parity: "pass",
      summaries,
    };
    const outputPath = path.resolve("tmp/benchmarks/prover-operations/opening-commitments.json");
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
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
  const piStarted = performance.now();
  const pi = await runCurrentPi(runtime, context, inputs);
  const piMs = performance.now() - piStarted;
  const mnStarted = performance.now();
  const mn = await runCurrentMn(runtime, context, inputs);
  const mnMs = performance.now() - mnStarted;
  return {
    candidate: "current-all-openings",
    pi,
    mn,
    piMs,
    mnMs,
    totalMs: performance.now() - started,
    temporaryBytes: pi.temporaryBytes + mn.temporaryBytes,
  };
}

async function runOptimized(
  runtime: CurveRuntime,
  context: PreparedProverContext,
  inputs: OpeningBenchmarkInputs,
): Promise<RunResult> {
  const started = performance.now();
  const piStarted = performance.now();
  const pi = await runCombinedPi(runtime, context, inputs);
  const piMs = performance.now() - piStarted;
  const mnStarted = performance.now();
  const mn = await runSharedMn(runtime, context, inputs);
  const mnMs = performance.now() - mnStarted;
  return {
    candidate: "combined-pi-shared-mn",
    pi,
    mn,
    piMs,
    mnMs,
    totalMs: performance.now() - started,
    temporaryBytes: pi.temporaryBytes + mn.temporaryBytes,
  };
}

async function runCurrentPi(
  runtime: CurveRuntime,
  context: PreparedProverContext,
  inputs: OpeningBenchmarkInputs,
): Promise<PiResult> {
  const piA = await inputs.piANumerator.divByRuffiniBatch(inputs.chi, inputs.zeta);
  const piC = await inputs.piCNumerator.divByRuffiniBatch(inputs.chi, inputs.zeta);
  const piB = await inputs.piBNumerator.divByRuffiniBatch(inputs.chi, inputs.zeta);
  const [piAX, piAY, piCX, piCY, piBX] = await encodeAll(runtime, context, [
    piA.quotientX,
    piA.quotientY,
    piC.quotientX,
    piC.quotientY,
    piB.quotientX,
  ]);
  const quotientX = await linearCombinationBufferBatch(runtime.Fr, [
    [runtime.Fr.one, piA.quotientX],
    [runtime.Fr.one, piC.quotientX],
    [inputs.kappa1Fourth, piB.quotientX],
  ]);
  const quotientY = await linearCombinationBufferBatch(runtime.Fr, [
    [runtime.Fr.one, piA.quotientY],
    [runtime.Fr.one, piC.quotientY],
  ]);
  return {
    piX: runtime.G1.add(
      runtime.G1.add(piAX, piCX),
      runtime.G1.mulScalar(piBX, inputs.kappa1Fourth),
    ),
    piY: runtime.G1.add(piAY, piCY),
    quotientX,
    quotientY,
    temporaryBytes: polynomialBytes([
      piA.quotientX,
      piA.quotientY,
      piC.quotientX,
      piC.quotientY,
      piB.quotientX,
      quotientX,
      quotientY,
    ]),
  };
}

async function runCombinedPi(
  runtime: CurveRuntime,
  context: PreparedProverContext,
  inputs: OpeningBenchmarkInputs,
): Promise<PiResult> {
  const numerator = await linearCombinationBufferBatch(runtime.Fr, [
    [runtime.Fr.one, inputs.piANumerator],
    [runtime.Fr.one, inputs.piCNumerator],
    [inputs.kappa1Fourth, inputs.piBNumerator],
  ]);
  const division = await numerator.divByRuffiniBatch(inputs.chi, inputs.zeta);
  const [piX, piY] = await encodeAll(runtime, context, [
    division.quotientX,
    division.quotientY,
  ]);
  return {
    piX,
    piY,
    quotientX: division.quotientX,
    quotientY: division.quotientY,
    temporaryBytes: polynomialBytes([numerator, division.quotientX, division.quotientY]),
  };
}

async function runCurrentMn(
  runtime: CurveRuntime,
  context: PreparedProverContext,
  inputs: OpeningBenchmarkInputs,
): Promise<MnResult> {
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
  return finishMn(runtime, context, inputs, mXDivision, nXDivision);
}

async function runSharedMn(
  runtime: CurveRuntime,
  context: PreparedProverContext,
  inputs: OpeningBenchmarkInputs,
): Promise<MnResult> {
  const xDivision = await runtime.Fr.ruffiniXBuffer(
    inputs.rXYWithBlinding.coefficients,
    inputs.rXYWithBlinding.xSize,
    inputs.rXYWithBlinding.ySize,
    inputs.mXPoint,
  );
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
  const [mXPoint, mYPoint, nYPoint] = await encodeAll(runtime, context, [mX, mY, nY]);
  return {
    mX,
    mY,
    nX: mX,
    nY,
    mXPoint,
    mYPoint,
    nXPoint: mXPoint,
    nYPoint,
    temporaryBytes: polynomialBytes([mX, mY, nY]),
  };
}

async function finishMn(
  runtime: CurveRuntime,
  context: PreparedProverContext,
  inputs: OpeningBenchmarkInputs,
  mXDivision: { readonly quotient: Uint8Array; readonly remainder: Uint8Array },
  nXDivision: { readonly quotient: Uint8Array; readonly remainder: Uint8Array },
): Promise<MnResult> {
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
  const mX = BivariatePolynomialBuffer.fromOwnedBuffer(
    runtime.Fr,
    mXDivision.quotient,
    inputs.rXYWithBlinding.xSize,
    inputs.rXYWithBlinding.ySize,
  );
  const mY = BivariatePolynomialBuffer.fromOwnedBuffer(
    runtime.Fr,
    mYDivision.quotient,
    1,
    inputs.rXYWithBlinding.ySize,
  );
  const nX = BivariatePolynomialBuffer.fromOwnedBuffer(
    runtime.Fr,
    nXDivision.quotient,
    inputs.rXYWithBlinding.xSize,
    inputs.rXYWithBlinding.ySize,
  );
  const nY = BivariatePolynomialBuffer.fromOwnedBuffer(
    runtime.Fr,
    nYDivision.quotient,
    1,
    inputs.rXYWithBlinding.ySize,
  );
  const [mXPoint, mYPoint, nXPoint, nYPoint] = await encodeAll(runtime, context, [
    mX,
    mY,
    nX,
    nY,
  ]);
  return {
    mX,
    mY,
    nX,
    nY,
    mXPoint,
    mYPoint,
    nXPoint,
    nYPoint,
    temporaryBytes: polynomialBytes([mX, mY, nX, nY]),
  };
}

async function encodeAll(
  runtime: CurveRuntime,
  context: PreparedProverContext,
  polynomials: readonly BivariatePolynomialBuffer[],
): Promise<Uint8Array[]> {
  const points = [];
  for (const polynomial of polynomials) {
    points.push(await encodePolynomialBufferWithSigma1(
      runtime,
      context.input.crs,
      context.state.setup,
      polynomial,
    ));
  }
  return points;
}

function assertEquivalent(runtime: CurveRuntime, current: RunResult, optimized: RunResult): void {
  assertBytesEqual(current.pi.quotientX.coefficients, optimized.pi.quotientX.coefficients, "Pi_X");
  assertBytesEqual(current.pi.quotientY.coefficients, optimized.pi.quotientY.coefficients, "Pi_Y");
  assertPointEqual(runtime, current.pi.piX, optimized.pi.piX, "Pi_X commitment");
  assertPointEqual(runtime, current.pi.piY, optimized.pi.piY, "Pi_Y commitment");
  for (const key of ["mX", "mY", "nX", "nY"] as const) {
    assertBytesEqual(current.mn[key].coefficients, optimized.mn[key].coefficients, key);
  }
  for (const key of ["mXPoint", "mYPoint", "nXPoint", "nYPoint"] as const) {
    assertPointEqual(runtime, current.mn[key], optimized.mn[key], key);
  }
}

function assertProductionEquivalent(
  runtime: CurveRuntime,
  current: RunResult,
  production: OpeningCommitmentsComputation,
): void {
  assertPointEqual(runtime, current.pi.piX, production.commitments.Pi_X, "production Pi_X");
  assertPointEqual(runtime, current.pi.piY, production.commitments.Pi_Y, "production Pi_Y");
  assertPointEqual(runtime, current.mn.mXPoint, production.commitments.M_X, "production M_X");
  assertPointEqual(runtime, current.mn.mYPoint, production.commitments.M_Y, "production M_Y");
  assertPointEqual(runtime, current.mn.nXPoint, production.commitments.N_X, "production N_X");
  assertPointEqual(runtime, current.mn.nYPoint, production.commitments.N_Y, "production N_Y");
}

function assertPointEqual(
  runtime: CurveRuntime,
  left: Uint8Array,
  right: Uint8Array,
  label: string,
): void {
  if (!runtime.G1.eq(left, right)) {
    throw new Error(`${label} mismatch.`);
  }
}

function assertBytesEqual(left: Uint8Array, right: Uint8Array, label: string): void {
  if (left.byteLength !== right.byteLength) {
    throw new Error(`${label}: byte length mismatch.`);
  }
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      throw new Error(`${label}: mismatch at byte ${index}.`);
    }
  }
}

function addSample(
  samples: Map<Candidate, Omit<RunResult, "pi" | "mn">[]>,
  run: RunResult,
): void {
  samples.get(run.candidate)?.push({
    candidate: run.candidate,
    piMs: run.piMs,
    mnMs: run.mnMs,
    totalMs: run.totalMs,
    temporaryBytes: run.temporaryBytes,
  });
}

function summarize(
  candidate: Candidate,
  runs: readonly Omit<RunResult, "pi" | "mn">[],
) {
  if (runs.length === 0) {
    throw new Error(`Missing ${candidate} samples.`);
  }
  const sorted = [...runs].sort((left, right) => left.totalMs - right.totalMs);
  const median = sorted[Math.floor(sorted.length / 2)];
  return {
    candidate,
    medianMs: median.totalMs,
    minMs: sorted[0].totalMs,
    maxMs: sorted[sorted.length - 1].totalMs,
    medianPiMs: median.piMs,
    medianMnMs: median.mnMs,
    temporaryBytes: median.temporaryBytes,
  };
}

function polynomialBytes(polynomials: readonly BivariatePolynomialBuffer[]): number {
  return polynomials.reduce((total, polynomial) => total + polynomial.coefficients.byteLength, 0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
