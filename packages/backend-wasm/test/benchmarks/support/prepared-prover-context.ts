import path from "node:path";

import {
  RollingKeccakTranscript,
  buildWitnessPolynomials,
  createProverState,
  type CurveRuntime,
  type FieldElement,
  type ProverRuntimeInput,
} from "../../../src/index.js";
import { readProverRuntimeInput } from "../../support/runtime-inputs.js";
import {
  computeInitialRelationCommitments,
  type InitialRelationComputation,
} from "../../../src/prover/internal/initial-relation.js";
import {
  computeRecursionCommitment,
  type RecursionComputation,
} from "../../../src/prover/internal/recursion-commitment.js";
import {
  computeCopyQuotientCommitments,
  type CopyQuotientComputation,
} from "../../../src/prover/internal/copy-quotient.js";
import {
  evaluateChallengePoints,
  type ChallengeEvaluations,
} from "../../../src/prover/internal/challenge-evaluations.js";
import type { ProverState } from "../../../src/prover/internal/state.js";

export interface PreparedProverContext {
  readonly input: ProverRuntimeInput;
  readonly state: ProverState;
  readonly initialRelation: InitialRelationComputation;
  readonly recursion: RecursionComputation;
  readonly copyQuotient: CopyQuotientComputation;
  readonly evaluations: ChallengeEvaluations;
  readonly thetas: readonly [FieldElement, FieldElement, FieldElement];
  readonly kappa0: FieldElement;
  readonly chi: FieldElement;
  readonly zeta: FieldElement;
  readonly kappa1: FieldElement;
}

export interface PreparedProverInputOptions {
  readonly runtimeDir?: string;
  readonly onProgress?: (message: string) => void;
}

export async function buildPreparedProverContext(
  runtime: CurveRuntime,
  onProgress: (message: string) => void = () => undefined,
): Promise<PreparedProverContext> {
  const input = await loadPreparedProverInput(runtime, { onProgress });
  onProgress("Building witness polynomials");
  const witness = await buildWitnessPolynomials(runtime.Fr, input.witness);
  onProgress("Creating prover state");
  const state = await createProverState({
    runtime,
    setup: input.witness.setup,
    publicInstance: input.publicInstance,
    permutation: input.permutation,
    witness,
  });
  const transcript = new RollingKeccakTranscript(runtime.Fr);
  onProgress("Computing initial relation");
  const initialRelation = await computeInitialRelationCommitments(runtime, input.crs, state);
  const thetas = collectThetaChallenges(runtime, transcript, initialRelation.commitments);
  onProgress("Computing recursion commitment");
  const recursion = await computeRecursionCommitment(runtime, input.crs, state, thetas);
  const kappa0 = collectKappa0Challenge(runtime, transcript, recursion.commitment);
  onProgress("Computing copy quotient commitments");
  const copyQuotient = await computeCopyQuotientCommitments({
    runtime,
    crs: input.crs,
    state,
    rXY: recursion.rXY,
    thetas,
    kappa0,
  });
  const { chi, zeta } = collectEvaluationChallenges(runtime, transcript, copyQuotient.commitments);
  onProgress("Evaluating challenge points");
  const evaluations = await evaluateChallengePoints({
    runtime,
    state,
    rXY: recursion.rXY,
    chi,
    zeta,
  });
  const kappa1 = collectKappa1Challenge(transcript, evaluations);

  return {
    input,
    state,
    initialRelation,
    recursion,
    copyQuotient,
    evaluations,
    thetas,
    kappa0,
    chi,
    zeta,
    kappa1,
  };
}

export async function loadPreparedProverInput(
  runtime: CurveRuntime,
  options: PreparedProverInputOptions = {},
): Promise<ProverRuntimeInput> {
  const runtimeDir = path.resolve(options.runtimeDir ?? "fixtures/small/runtime");
  options.onProgress?.("Loading prepared prover runtime input");
  return readProverRuntimeInput(runtime, runtimeDir);
}

function collectThetaChallenges(
  runtime: CurveRuntime,
  transcript: RollingKeccakTranscript,
  commitments: InitialRelationComputation["commitments"],
): readonly [FieldElement, FieldElement, FieldElement] {
  transcript
    .commitG1Point(commitments.U, runtime.G1)
    .commitG1Point(commitments.V, runtime.G1)
    .commitG1Point(commitments.W, runtime.G1)
    .commitG1Point(commitments.Q_AX, runtime.G1)
    .commitG1Point(commitments.Q_AY, runtime.G1)
    .commitG1Point(commitments.B, runtime.G1);
  const challenges = transcript.getChallenges(3);

  return [challenges[0], challenges[1], challenges[2]];
}

function collectKappa0Challenge(
  runtime: CurveRuntime,
  transcript: RollingKeccakTranscript,
  commitment: RecursionComputation["commitment"],
): FieldElement {
  transcript.commitG1Point(commitment.R, runtime.G1);
  return transcript.squeezeChallenge();
}

function collectEvaluationChallenges(
  runtime: CurveRuntime,
  transcript: RollingKeccakTranscript,
  commitments: CopyQuotientComputation["commitments"],
): { readonly chi: FieldElement; readonly zeta: FieldElement } {
  transcript
    .commitG1Point(commitments.Q_CX, runtime.G1)
    .commitG1Point(commitments.Q_CY, runtime.G1);

  return {
    chi: transcript.squeezeChallenge(),
    zeta: transcript.squeezeChallenge(),
  };
}

function collectKappa1Challenge(
  transcript: RollingKeccakTranscript,
  evaluations: ChallengeEvaluations,
): FieldElement {
  transcript
    .commitField(evaluations.V_eval)
    .commitField(evaluations.R_eval)
    .commitField(evaluations.R_omegaX_eval)
    .commitField(evaluations.R_omegaX_omegaY_eval);

  return transcript.squeezeChallenge();
}
