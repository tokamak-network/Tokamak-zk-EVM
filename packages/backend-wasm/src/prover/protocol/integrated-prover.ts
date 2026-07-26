import { RollingKeccakTranscript } from "../../runtime/crypto/transcript.js";
import type { CurveRuntime } from "../../runtime/curve/curve.js";
import type { FieldElement } from "../../runtime/field/field-runtime.js";
import type { ProverRuntimeInput } from "../api/binary-input.js";
import type { ProverVerifierProofOutputInput } from "../api/proof-output.js";
import type { ProverCommitmentEncoder } from "../commitments/commitment-encoder.js";
import { createSigma1CommitmentEncoder } from "../commitments/sigma1-encoder.js";
import { createProverState } from "./state.js";
import { buildWitnessPolynomials } from "./witness.js";
import { buildProverBinding } from "../commitments/binding-commitments.js";
import { computeInitialRelationCommitments } from "./initial-relation.js";
import { computeRecursionCommitment } from "./recursion-commitment.js";
import { computeCopyQuotientCommitments } from "./copy-quotient.js";
import { evaluateChallengePoints } from "./challenge-evaluations.js";
import { computeOpeningCommitments } from "./opening-commitments.js";

export interface IntegratedProverOptions {
  readonly commitmentEncoder?: ProverCommitmentEncoder;
  readonly denseSigma1MsmChunkPoints?: number;
  readonly sourcePackageVersion?: string;
}

export async function runIntegratedProver(
  runtime: CurveRuntime,
  input: ProverRuntimeInput,
  options: IntegratedProverOptions = {},
): Promise<ProverVerifierProofOutputInput> {
  const commitmentEncoder = options.commitmentEncoder ?? createSigma1CommitmentEncoder(
    runtime,
    input.crs,
    input.witness.setup,
    options.denseSigma1MsmChunkPoints,
  );
  const witness = await buildWitnessPolynomials(runtime.Fr, input.witness);
  const state = await createProverState({
    runtime,
    setup: input.witness.setup,
    publicInstance: input.publicInstance,
    permutation: input.permutation,
    witness,
  });
  const binding = await buildProverBinding(
    runtime,
    input.crs,
    input.witness.setup,
    input.witness.placementVariables,
    input.witness.subcircuitInfos,
    state.instanceBuffers.aFreeX,
    state.mixer,
    commitmentEncoder,
  );
  const transcript = new RollingKeccakTranscript(runtime.Fr);
  const operationOptions = { commitmentEncoder };
  const initialRelation = await computeInitialRelationCommitments(runtime, input.crs, state, operationOptions);
  const thetas = collectThetaChallenges(runtime, transcript, initialRelation.commitments);
  const recursion = await computeRecursionCommitment(runtime, input.crs, state, thetas, operationOptions);
  const kappa0 = collectKappa0Challenge(runtime, transcript, recursion.commitment);
  const copyQuotient = await computeCopyQuotientCommitments({
    runtime,
    crs: input.crs,
    state,
    rXY: recursion.rXY,
    thetas,
    kappa0,
    options: operationOptions,
  });
  const { chi, zeta } = collectEvaluationChallenges(runtime, transcript, copyQuotient.commitments);
  const evaluations = await evaluateChallengePoints({
    runtime,
    state,
    rXY: recursion.rXY,
    chi,
    zeta,
  });
  const kappa1 = collectKappa1Challenge(transcript, evaluations);
  const openings = await computeOpeningCommitments({
    runtime,
    crs: input.crs,
    state,
    rXY: recursion.rXY,
    initialRelation,
    copyQuotient,
    evaluations,
    thetas,
    kappa0,
    chi,
    zeta,
    kappa1,
    options: operationOptions,
  });

  return {
    runtime,
    binding,
    initialRelation,
    recursion,
    copyQuotient,
    evaluations,
    openings,
    sourcePackageVersion: options.sourcePackageVersion,
  };
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

function collectKappa1Challenge(
  transcript: RollingKeccakTranscript,
  evaluations: {
    readonly V_eval: FieldElement;
    readonly R_eval: FieldElement;
    readonly R_omegaX_eval: FieldElement;
    readonly R_omegaX_omegaY_eval: FieldElement;
  },
): FieldElement {
  transcript
    .commitField(evaluations.V_eval)
    .commitField(evaluations.R_eval)
    .commitField(evaluations.R_omegaX_eval)
    .commitField(evaluations.R_omegaX_omegaY_eval);

  return transcript.squeezeChallenge();
}
