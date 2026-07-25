import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BivariatePolynomialBuffer,
  buildWitnessPolynomials,
  createCurveRuntime,
  createProverState,
  type CurveRuntime,
  type FieldElement,
} from "../../../src/index.js";
import {
  constantPolynomialBuffer,
  linearCombinationBufferBatch,
} from "../../../src/prover/internal/polynomial-ops.js";
import type { ProverState } from "../../../src/prover/internal/state.js";
import { loadPreparedProverInput } from "./prepared-prover-context.js";

type Candidate = "current-same-shape-resize" | "shape-assert-direct";

interface RecursionInputs {
  readonly fXY: BivariatePolynomialBuffer;
  readonly gXY: BivariatePolynomialBuffer;
  readonly xSize: number;
  readonly ySize: number;
}

interface RunResult {
  readonly candidate: Candidate;
  readonly fEvals: Uint8Array;
  readonly gEvals: Uint8Array;
  readonly resizeMs: number;
  readonly fNttMs: number;
  readonly gNttMs: number;
  readonly totalMs: number;
  readonly explicitCopiedBytes: number;
  readonly heapDeltaBytes: number;
  readonly rssDeltaBytes: number;
}

async function main(): Promise<void> {
  const runtime = await createCurveRuntime();
  try {
    const input = await loadPreparedProverInput(runtime, (message) => console.log(message));
    console.log("Building representative recursion inputs");
    const witness = await buildWitnessPolynomials(runtime.Fr, input.witness);
    const state = await createProverState({
      runtime,
      setup: input.witness.setup,
      publicInstance: input.publicInstance,
      permutation: input.permutation,
      witness,
    });
    const recursionInputs = await buildRecursionInputs(runtime, state, [
      runtime.Fr.fromBigInt(2n),
      runtime.Fr.fromBigInt(3n),
      runtime.Fr.fromBigInt(5n),
    ]);
    assertRequiredShape(recursionInputs.fXY, recursionInputs.xSize, recursionInputs.ySize);
    assertRequiredShape(recursionInputs.gXY, recursionInputs.xSize, recursionInputs.ySize);
    await assertSmallCases(runtime);

    const sourceF = recursionInputs.fXY.coefficients.slice();
    const sourceG = recursionInputs.gXY.coefficients.slice();
    const currentOracle = await runCandidate(recursionInputs, "current-same-shape-resize");
    const directOracle = await runCandidate(recursionInputs, "shape-assert-direct");
    assertBytesEqual(currentOracle.fEvals, directOracle.fEvals, "fXY ROU evaluations");
    assertBytesEqual(currentOracle.gEvals, directOracle.gEvals, "gXY ROU evaluations");
    assertBytesEqual(sourceF, recursionInputs.fXY.coefficients, "fXY source mutation");
    assertBytesEqual(sourceG, recursionInputs.gXY.coefficients, "gXY source mutation");

    const candidates: readonly Candidate[] = ["current-same-shape-resize", "shape-assert-direct"];
    for (let warmup = 0; warmup < 2; warmup += 1) {
      for (const candidate of candidates) {
        await runCandidate(recursionInputs, candidate);
      }
    }
    const samples = new Map<Candidate, RunResult[]>(candidates.map((candidate) => [candidate, []]));
    for (let iteration = 0; iteration < 7; iteration += 1) {
      const order = iteration % 2 === 0 ? candidates : [...candidates].reverse();
      for (const candidate of order) {
        samples.get(candidate)?.push(await runCandidate(recursionInputs, candidate));
      }
    }
    const summaries = candidates.map((candidate) => summarize(candidate, samples.get(candidate) ?? []));
    console.table(summaries.map((summary) => ({
      candidate: summary.candidate,
      "median ms": summary.medianMs.toFixed(3),
      "resize ms": summary.medianPhases.resizeMs.toFixed(3),
      "f NTT ms": summary.medianPhases.fNttMs.toFixed(3),
      "g NTT ms": summary.medianPhases.gNttMs.toFixed(3),
      "copied MiB": (summary.explicitCopiedBytes / 2 ** 20).toFixed(3),
      "heap delta MiB": (summary.heapDeltaBytes / 2 ** 20).toFixed(3),
      "RSS delta MiB": (summary.rssDeltaBytes / 2 ** 20).toFixed(3),
    })));
    const report = {
      generatedAt: new Date().toISOString(),
      fixture: "fixtures/small/runtime",
      shape: `${recursionInputs.xSize}x${recursionInputs.ySize}`,
      iterations: 7,
      warmup: 2,
      parity: {
        evaluations: "pass",
        sourceMutation: "pass",
        smallShape: "pass",
        wrongShapeRejection: "pass",
      },
      summaries,
    };
    const outputPath = path.resolve("tmp/timing/recursion-clone-removal.json");
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);
  } finally {
    await runtime.terminate();
  }
}

async function buildRecursionInputs(
  runtime: CurveRuntime,
  state: ProverState,
  thetas: readonly [FieldElement, FieldElement, FieldElement],
): Promise<RecursionInputs> {
  const field = runtime.Fr;
  const xSize = state.setup.l_D - state.setup.l;
  const ySize = state.setup.s_max;
  const xMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 2, 1);
  const yMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 1, 2);
  const theta2 = constantPolynomialBuffer(field, thetas[2]);
  const fXY = await linearCombinationBufferBatch(field, [
    [field.one, state.witnessBuffers.bXY],
    [thetas[0], state.instanceBuffers.s0XY],
    [thetas[1], state.instanceBuffers.s1XY],
    [field.one, theta2],
  ]);
  const gXY = await linearCombinationBufferBatch(field, [
    [field.one, state.witnessBuffers.bXY],
    [thetas[0], xMonomial],
    [thetas[1], yMonomial],
    [field.one, theta2],
  ]);
  return { fXY, gXY, xSize, ySize };
}

async function runCandidate(
  inputs: RecursionInputs,
  candidate: Candidate,
): Promise<RunResult> {
  globalThis.gc?.();
  const memoryBefore = process.memoryUsage();
  const started = performance.now();
  let resizeMs = 0;

  const fResizeStarted = performance.now();
  const fInput = candidate === "current-same-shape-resize"
    ? inputs.fXY.resize(inputs.xSize, inputs.ySize)
    : requireShape(inputs.fXY, inputs.xSize, inputs.ySize);
  resizeMs += performance.now() - fResizeStarted;
  const fNttStarted = performance.now();
  const fEvals = await fInput.toRouEvals();
  const fNttMs = performance.now() - fNttStarted;

  const gResizeStarted = performance.now();
  const gInput = candidate === "current-same-shape-resize"
    ? inputs.gXY.resize(inputs.xSize, inputs.ySize)
    : requireShape(inputs.gXY, inputs.xSize, inputs.ySize);
  resizeMs += performance.now() - gResizeStarted;
  const gNttStarted = performance.now();
  const gEvals = await gInput.toRouEvals();
  const gNttMs = performance.now() - gNttStarted;
  const memoryAfter = process.memoryUsage();

  return {
    candidate,
    fEvals,
    gEvals,
    resizeMs,
    fNttMs,
    gNttMs,
    totalMs: performance.now() - started,
    explicitCopiedBytes: candidate === "current-same-shape-resize"
      ? inputs.fXY.coefficients.byteLength + inputs.gXY.coefficients.byteLength
      : 0,
    heapDeltaBytes: Math.max(0, memoryAfter.heapUsed - memoryBefore.heapUsed),
    rssDeltaBytes: Math.max(0, memoryAfter.rss - memoryBefore.rss),
  };
}

async function assertSmallCases(runtime: CurveRuntime): Promise<void> {
  const field = runtime.Fr;
  const coefficients = Array.from({ length: 16 }, (_unused, index) =>
    field.fromBigInt(BigInt(index + 1)));
  const polynomial = BivariatePolynomialBuffer.fromCoeffs(field, coefficients, 4, 4);
  const source = polynomial.coefficients.slice();
  const current = await polynomial.resize(4, 4).toRouEvals();
  const direct = await requireShape(polynomial, 4, 4).toRouEvals();
  assertBytesEqual(current, direct, "small ROU evaluations");
  assertBytesEqual(source, polynomial.coefficients, "small source mutation");
  let rejected = false;
  try {
    requireShape(polynomial, 8, 4);
  } catch {
    rejected = true;
  }
  if (!rejected) {
    throw new Error("Wrong-shape recursion input was not rejected.");
  }
}

function requireShape(
  polynomial: BivariatePolynomialBuffer,
  xSize: number,
  ySize: number,
): BivariatePolynomialBuffer {
  assertRequiredShape(polynomial, xSize, ySize);
  return polynomial;
}

function assertRequiredShape(
  polynomial: BivariatePolynomialBuffer,
  xSize: number,
  ySize: number,
): void {
  if (polynomial.xSize !== xSize || polynomial.ySize !== ySize) {
    throw new Error(
      `Recursion polynomial shape mismatch: expected ${xSize}x${ySize}, `
        + `got ${polynomial.xSize}x${polynomial.ySize}.`,
    );
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

function summarize(candidate: Candidate, runs: readonly RunResult[]) {
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
    medianPhases: {
      resizeMs: median.resizeMs,
      fNttMs: median.fNttMs,
      gNttMs: median.gNttMs,
    },
    explicitCopiedBytes: median.explicitCopiedBytes,
    heapDeltaBytes: median.heapDeltaBytes,
    rssDeltaBytes: median.rssDeltaBytes,
  };
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
