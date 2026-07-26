import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BivariatePolynomialBuffer,
  RollingKeccakTranscript,
  buildWitnessPolynomials,
  createCurveRuntime,
  createProverState,
  type CurveRuntime,
  type FieldElement,
  type ProverCrsRuntime,
  type ProverState,
} from "../../../src/index.js";
import { readProverRuntimeInput } from "../../support/runtime-inputs.js";
import {
  computeInitialRelationCommitments,
} from "../../../src/prover/protocol/initial-relation.js";
import { buildProverBinding } from "../../../src/prover/commitments/binding-commitments.js";
import { encodePolynomialBufferWithSigma1 } from "../../../src/prover/commitments/sigma1-encoder.js";
import { computeCopyQuotientCommitments } from "../../../src/prover/protocol/copy-quotient.js";
import {
  constantPolynomialBuffer,
  linearCombinationBuffer,
} from "../../../src/prover/polynomial/linear-combinations.js";
import { computeRecursionEvalsBuffer } from "../../../src/prover/polynomial/recursion.js";

interface DetailTiming {
  readonly section: string;
  readonly label: string;
  readonly durationMs: number;
  readonly shape?: string;
}

interface DiagnosticReport {
  readonly generatedAt: string;
  readonly timings: readonly DetailTiming[];
}

const timings: DetailTiming[] = [];

async function main(): Promise<void> {
  const runtimeDir = path.resolve("fixtures/small/runtime");
  const runtime = await createCurveRuntime();

  try {
    const input = await timeAsync("setup", "load prover runtime input", () =>
      readProverRuntimeInput(runtime, runtimeDir),
    );

    const witness = await timeAsync("setup", "build witness polynomials", () =>
      buildWitnessPolynomials(runtime.Fr, input.witness),
    );
    const state = await timeAsync("setup", "create prover state", () =>
      createProverState({
        runtime,
        setup: input.witness.setup,
        publicInstance: input.publicInstance,
        permutation: input.permutation,
        witness,
      }),
    );
    await timeAsync("setup", "build prover binding", () =>
      buildProverBinding(
        runtime,
        input.crs,
        input.witness.setup,
        input.witness.placementVariables,
        input.witness.subcircuitInfos,
        state.instanceBuffers.aFreeX,
        state.mixer,
      ),
    );

    const transcript = new RollingKeccakTranscript(runtime.Fr);
    const initialRelation = await timeAsync("setup", "compute initial relation commitments", () =>
      computeInitialRelationCommitments(runtime, input.crs, state),
    );
    const thetas = collectThetaChallenges(runtime, transcript, initialRelation.commitments);
    const recursion = await diagnoseRecursion(runtime, input.crs, state, thetas);
    const kappa0 = collectKappa0Challenge(runtime, transcript, recursion.commitment);
    const copyQuotient = await timeAsync("setup", "compute copy quotient commitments", () =>
      computeCopyQuotientCommitments({
        runtime,
        crs: input.crs,
        state,
        rXY: recursion.rXY,
        thetas,
        kappa0,
      }),
    );
    const { chi, zeta } = collectEvaluationChallenges(runtime, transcript, copyQuotient.commitments);
    diagnoseEvaluation(runtime, state, recursion.rXY, chi, zeta);

    const report: DiagnosticReport = {
      generatedAt: new Date().toISOString(),
      timings,
    };
    await writeReport(report);
    printReport(report);
  } finally {
    await runtime.terminate();
  }
}

async function diagnoseRecursion(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  state: ProverState,
  thetas: readonly FieldElement[],
): Promise<{
  readonly commitment: { readonly R: Uint8Array };
  readonly rXY: BivariatePolynomialBuffer;
}> {
  const field = runtime.Fr;
  const mI = state.setup.l_D - state.setup.l;
  const sMax = state.setup.s_max;
  const xMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 2, 1);
  const yMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 1, 2);
  const theta2 = constantPolynomialBuffer(field, thetas[2]);
  const fXY = timeSync("recursion", "build fXY linear combination", () =>
    linearCombinationBuffer(field, [
      [field.one, state.witnessBuffers.bXY],
      [thetas[0], state.instanceBuffers.s0XY],
      [thetas[1], state.instanceBuffers.s1XY],
      [field.one, theta2],
    ]),
    shape(state.witnessBuffers.bXY),
  );
  const gXY = timeSync("recursion", "build gXY linear combination", () =>
    linearCombinationBuffer(field, [
      [field.one, state.witnessBuffers.bXY],
      [thetas[0], xMonomial],
      [thetas[1], yMonomial],
      [field.one, theta2],
    ]),
    shape(state.witnessBuffers.bXY),
  );
  const resizedF = timeSync("recursion", "resize fXY to recursion domain", () => fXY.resize(mI, sMax), `${mI}x${sMax}`);
  const fXYEvals = await timeAsync("recursion", "forward 2D NTT fXY.toRouEvals", () =>
    resizedF.toRouEvals(),
    `${mI}x${sMax}`,
  );
  const resizedG = timeSync("recursion", "resize gXY to recursion domain", () => gXY.resize(mI, sMax), `${mI}x${sMax}`);
  const gXYEvals = await timeAsync("recursion", "forward 2D NTT gXY.toRouEvals", () =>
    resizedG.toRouEvals(),
    `${mI}x${sMax}`,
  );
  const rXYEvals = await timeAsync("recursion", "recursion recurrence buffer", () =>
    computeRecursionEvalsBuffer(field, gXYEvals, fXYEvals, mI, sMax),
    `${mI}x${sMax}`,
  );
  const rXY = await timeAsync("recursion", "inverse 2D NTT rXY.fromRouEvals", () =>
    BivariatePolynomialBuffer.fromRouEvals(field, rXYEvals, mI, sMax),
    `${mI}x${sMax}`,
  );
  const RXY = timeSync("recursion", "build RXY linear combination", () =>
    linearCombinationBuffer(field, [
      [field.one, rXY],
      [state.mixer.rR_X, state.instanceBuffers.tMi],
      [state.mixer.rR_Y, state.instanceBuffers.tSMax],
    ]),
    shape(rXY),
  );
  const R = await timeAsync("recursion", "commit RXY encode", () =>
    encodePolynomialBufferWithSigma1(runtime, crs, state.setup, RXY),
    shape(RXY),
  );

  return {
    commitment: { R },
    rXY,
  };
}

function diagnoseEvaluation(
  runtime: CurveRuntime,
  state: ProverState,
  rXY: BivariatePolynomialBuffer,
  chi: FieldElement,
  zeta: FieldElement,
): void {
  const field = runtime.Fr;
  const mI = state.setup.l_D - state.setup.l;
  const omegaMIInv = field.inv(field.rootOfUnity(mI));
  const omegaSMaxInv = field.inv(field.rootOfUnity(state.setup.s_max));
  const VXY = timeSync("evaluation", "build VXY linear combination", () =>
    linearCombinationBuffer(field, [
      [field.one, state.witnessBuffers.vXY],
      [state.mixer.rV_X, state.instanceBuffers.tN],
      [state.mixer.rV_Y, state.instanceBuffers.tSMax],
    ]),
    shape(state.witnessBuffers.vXY),
  );
  const RXY = timeSync("evaluation", "build RXY linear combination", () =>
    linearCombinationBuffer(field, [
      [field.one, rXY],
      [state.mixer.rR_X, state.instanceBuffers.tMi],
      [state.mixer.rR_Y, state.instanceBuffers.tSMax],
    ]),
    shape(rXY),
  );
  const scaledChi = timeSync("evaluation", "compute scaled chi", () => field.mul(omegaMIInv, chi));
  const scaledZeta = timeSync("evaluation", "compute scaled zeta", () => field.mul(omegaSMaxInv, zeta));

  timeSync("evaluation", "Horner eval VXY(chi,zeta)", () => VXY.eval(chi, zeta), shape(VXY));
  timeSync("evaluation", "Horner eval RXY(chi,zeta)", () => RXY.eval(chi, zeta), shape(RXY));
  timeSync("evaluation", "Horner eval RXY(omega^-1 chi,zeta)", () => RXY.eval(scaledChi, zeta), shape(RXY));
  timeSync("evaluation", "Horner eval RXY(omega^-1 chi,omega^-1 zeta)", () =>
    RXY.eval(scaledChi, scaledZeta),
    shape(RXY),
  );
}

async function timeAsync<T>(
  section: string,
  label: string,
  callback: () => Promise<T>,
  shapeInfo?: string,
): Promise<T> {
  const start = performance.now();
  const result = await callback();
  timings.push({ section, label, durationMs: performance.now() - start, shape: shapeInfo });
  return result;
}

function timeSync<T>(section: string, label: string, callback: () => T, shapeInfo?: string): T {
  const start = performance.now();
  const result = callback();
  timings.push({ section, label, durationMs: performance.now() - start, shape: shapeInfo });
  return result;
}

function collectThetaChallenges(
  runtime: CurveRuntime,
  transcript: RollingKeccakTranscript,
  commitments: {
    readonly U: Uint8Array;
    readonly V: Uint8Array;
    readonly W: Uint8Array;
    readonly Q_AX: Uint8Array;
    readonly Q_AY: Uint8Array;
    readonly B: Uint8Array;
  },
): readonly [FieldElement, FieldElement, FieldElement] {
  transcript
    .commitG1Point(commitments.U, runtime.G1)
    .commitG1Point(commitments.V, runtime.G1)
    .commitG1Point(commitments.W, runtime.G1)
    .commitG1Point(commitments.Q_AX, runtime.G1)
    .commitG1Point(commitments.Q_AY, runtime.G1)
    .commitG1Point(commitments.B, runtime.G1);
  const thetas = transcript.getChallenges(3);

  return [thetas[0], thetas[1], thetas[2]];
}

function collectKappa0Challenge(
  runtime: CurveRuntime,
  transcript: RollingKeccakTranscript,
  commitment: { readonly R: Uint8Array },
): FieldElement {
  transcript.commitG1Point(commitment.R, runtime.G1);
  return transcript.squeezeChallenge();
}

function collectEvaluationChallenges(
  runtime: CurveRuntime,
  transcript: RollingKeccakTranscript,
  commitments: { readonly Q_CX: Uint8Array; readonly Q_CY: Uint8Array },
): { readonly chi: FieldElement; readonly zeta: FieldElement } {
  transcript.commitG1Point(commitments.Q_CX, runtime.G1).commitG1Point(commitments.Q_CY, runtime.G1);

  return {
    chi: transcript.squeezeChallenge(),
    zeta: transcript.squeezeChallenge(),
  };
}

async function writeReport(report: DiagnosticReport): Promise<void> {
  const outputPath = path.resolve("tmp/timing/prover-recursion-evaluation-breakdown.json");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}

function printReport(report: DiagnosticReport): void {
  console.table(
    report.timings.map((timing) => ({
      section: timing.section,
      label: timing.label,
      shape: timing.shape ?? "",
      ms: timing.durationMs.toFixed(3),
    })),
  );
  console.log("Wrote tmp/timing/prover-recursion-evaluation-breakdown.json");
}

function shape(polynomial: BivariatePolynomialBuffer): string {
  return `${polynomial.xSize}x${polynomial.ySize}`;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
