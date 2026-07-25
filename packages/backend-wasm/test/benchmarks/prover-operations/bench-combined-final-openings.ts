import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BivariatePolynomialBuffer,
  createCurveRuntime,
  type CurveRuntime,
} from "../../../src/index.js";
import { encodePolynomialBufferWithSigma1 } from "../../../src/prover/internal/initial-relation.js";
import { linearCombinationBufferBatch } from "../../../src/prover/internal/polynomial-ops.js";
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
  readonly combineMs: number;
  readonly divisionMs: number;
  readonly encodeMs: number;
  readonly pointFinalizeMs: number;
  readonly totalMs: number;
}

interface RunResult {
  readonly piX: Uint8Array;
  readonly piY: Uint8Array;
  readonly quotientX: BivariatePolynomialBuffer;
  readonly quotientY: BivariatePolynomialBuffer;
  readonly timings: PhaseTimings;
  readonly temporaryBytes: number;
}

interface Summary {
  readonly candidate: string;
  readonly iterations: number;
  readonly medianMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly medianPhases: PhaseTimings;
  readonly temporaryBytes: number;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const runtime = await createCurveRuntime();

  try {
    const context = await buildPreparedProverContext(runtime, (message) => console.log(message));
    console.log("Building prepared opening numerators");
    const inputs = await buildOpeningBenchmarkInputs(runtime, context);
    const currentOracle = await runCurrent(runtime, context, inputs);
    const combinedOracle = await runCombined(runtime, context, inputs);
    assertEquivalent(runtime, currentOracle, combinedOracle);

    const currentRuns: RunResult[] = [];
    const combinedRuns: RunResult[] = [];
    for (let iteration = 0; iteration < options.iterations; iteration += 1) {
      console.log(`Benchmark iteration ${iteration + 1}/${options.iterations}: current`);
      currentRuns.push(await runCurrent(runtime, context, inputs));
      console.log(`Benchmark iteration ${iteration + 1}/${options.iterations}: combined`);
      combinedRuns.push(await runCombined(runtime, context, inputs));
      assertEquivalent(runtime, currentRuns[iteration], combinedRuns[iteration]);
    }

    const summaries = [
      summarize("current-split-pi-openings", currentRuns),
      summarize("combined-final-pi-openings", combinedRuns),
    ];
    console.table(summaries.map((summary) => ({
      candidate: summary.candidate,
      "median ms": summary.medianMs.toFixed(3),
      "min ms": summary.minMs.toFixed(3),
      "max ms": summary.maxMs.toFixed(3),
      "combine ms": summary.medianPhases.combineMs.toFixed(3),
      "division ms": summary.medianPhases.divisionMs.toFixed(3),
      "encode ms": summary.medianPhases.encodeMs.toFixed(3),
      "temporary MiB": (summary.temporaryBytes / 2 ** 20).toFixed(3),
    })));

    const report = {
      generatedAt: new Date().toISOString(),
      fixture: "fixtures/small/runtime",
      parity: "pass",
      summaries,
    };
    const outputPath = path.resolve(options.jsonPath);
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
  const divisionStarted = performance.now();
  const piA = await inputs.piANumerator.divByRuffiniBatch(inputs.chi, inputs.zeta);
  const piC = await inputs.piCNumerator.divByRuffiniBatch(inputs.chi, inputs.zeta);
  const piB = await inputs.piBNumerator.divByRuffiniBatch(inputs.chi, inputs.zeta);
  const divisionMs = performance.now() - divisionStarted;
  const encodeStarted = performance.now();
  const [piAX, piAY, piCX, piCY, piBX] = await encodeAll(runtime, context, [
    piA.quotientX,
    piA.quotientY,
    piC.quotientX,
    piC.quotientY,
    piB.quotientX,
  ]);
  const encodeMs = performance.now() - encodeStarted;
  const finalizeStarted = performance.now();
  const piX = runtime.G1.add(
    runtime.G1.add(piAX, piCX),
    runtime.G1.mulScalar(piBX, inputs.kappa1Fourth),
  );
  const piY = runtime.G1.add(piAY, piCY);
  const pointFinalizeMs = performance.now() - finalizeStarted;
  const combineStarted = performance.now();
  const quotientX = await linearCombinationBufferBatch(runtime.Fr, [
    [runtime.Fr.one, piA.quotientX],
    [runtime.Fr.one, piC.quotientX],
    [inputs.kappa1Fourth, piB.quotientX],
  ]);
  const quotientY = await linearCombinationBufferBatch(runtime.Fr, [
    [runtime.Fr.one, piA.quotientY],
    [runtime.Fr.one, piC.quotientY],
  ]);
  const combineMs = performance.now() - combineStarted;

  return {
    piX,
    piY,
    quotientX,
    quotientY,
    timings: {
      combineMs,
      divisionMs,
      encodeMs,
      pointFinalizeMs,
      totalMs: performance.now() - started,
    },
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

async function runCombined(
  runtime: CurveRuntime,
  context: PreparedProverContext,
  inputs: OpeningBenchmarkInputs,
): Promise<RunResult> {
  const started = performance.now();
  const combineStarted = performance.now();
  const numerator = await linearCombinationBufferBatch(runtime.Fr, [
    [runtime.Fr.one, inputs.piANumerator],
    [runtime.Fr.one, inputs.piCNumerator],
    [inputs.kappa1Fourth, inputs.piBNumerator],
  ]);
  const combineMs = performance.now() - combineStarted;
  const divisionStarted = performance.now();
  const division = await numerator.divByRuffiniBatch(inputs.chi, inputs.zeta);
  const divisionMs = performance.now() - divisionStarted;
  const encodeStarted = performance.now();
  const [piX, piY] = await encodeAll(runtime, context, [
    division.quotientX,
    division.quotientY,
  ]);
  const encodeMs = performance.now() - encodeStarted;

  return {
    piX,
    piY,
    quotientX: division.quotientX,
    quotientY: division.quotientY,
    timings: {
      combineMs,
      divisionMs,
      encodeMs,
      pointFinalizeMs: 0,
      totalMs: performance.now() - started,
    },
    temporaryBytes: polynomialBytes([
      numerator,
      division.quotientX,
      division.quotientY,
    ]),
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

function assertEquivalent(runtime: CurveRuntime, current: RunResult, combined: RunResult): void {
  assertBytesEqual(current.quotientX.coefficients, combined.quotientX.coefficients, "Pi_X quotient");
  assertBytesEqual(current.quotientY.coefficients, combined.quotientY.coefficients, "Pi_Y quotient");
  if (!runtime.G1.eq(current.piX, combined.piX)) {
    throw new Error("Combined Pi_X commitment does not match the split current path.");
  }
  if (!runtime.G1.eq(current.piY, combined.piY)) {
    throw new Error("Combined Pi_Y commitment does not match the split current path.");
  }
}

function assertBytesEqual(left: Uint8Array, right: Uint8Array, label: string): void {
  if (left.length !== right.length) {
    throw new Error(`${label} length mismatch: ${left.length} !== ${right.length}.`);
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      throw new Error(`${label} mismatch at byte ${index}.`);
    }
  }
}

function summarize(candidate: string, runs: readonly RunResult[]): Summary {
  const sorted = [...runs].sort((left, right) => left.timings.totalMs - right.timings.totalMs);
  const middle = sorted[Math.floor(sorted.length / 2)];
  return {
    candidate,
    iterations: runs.length,
    medianMs: middle.timings.totalMs,
    minMs: sorted[0].timings.totalMs,
    maxMs: sorted[sorted.length - 1].timings.totalMs,
    medianPhases: middle.timings,
    temporaryBytes: middle.temporaryBytes,
  };
}

function polynomialBytes(polynomials: readonly BivariatePolynomialBuffer[]): number {
  return polynomials.reduce((total, polynomial) => total + polynomial.coefficients.byteLength, 0);
}

function parseOptions(args: readonly string[]): Options {
  let iterations = 2;
  let jsonPath = "tmp/timing/combined-final-openings.json";
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
