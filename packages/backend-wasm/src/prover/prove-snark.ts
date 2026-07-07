import { RollingKeccakTranscript } from "../libs/crypto/transcript.js";
import type { CurveRuntime } from "../libs/runtime/curve.js";
import type { FieldElement } from "../libs/runtime/field.js";
import { buildProverBinding } from "./prove0.js";
import { prove0 } from "./prove0.js";
import { prove1 } from "./prove1.js";
import { prove2 } from "./prove2.js";
import { prove3 } from "./prove3.js";
import { prove4 } from "./prove4.js";
import { createVerifierProofArtifactFromProverOutput } from "./proof-output.js";
import { createProverState } from "./state.js";
import type { ProverRuntimeInput } from "./binary-input.js";
import { buildWitnessPolynomials } from "./witness.js";

export interface ProveSnarkOptions {
  readonly sourcePackageVersion?: string;
}

export interface ProveSnarkResult {
  readonly proof: Uint8Array;
}

export async function proveSnark(
  runtime: CurveRuntime,
  input: ProverRuntimeInput,
  options: ProveSnarkOptions = {},
): Promise<ProveSnarkResult> {
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
    state.instance,
    state.mixer,
  );
  const transcript = new RollingKeccakTranscript(runtime.Fr);
  const proof0 = await prove0(runtime, input.crs, state);
  const thetas = collectThetaChallenges(runtime, transcript, proof0.proof0);
  const prove1Output = await prove1(runtime, input.crs, state, thetas);
  const kappa0 = collectKappa0Challenge(runtime, transcript, prove1Output.proof1);
  const prove2Output = await prove2({
    runtime,
    crs: input.crs,
    state,
    rXY: prove1Output.rXY,
    thetas,
    kappa0,
  });
  const { chi, zeta } = collectEvaluationChallenges(runtime, transcript, prove2Output.proof2);
  const proof3 = prove3({
    runtime,
    state,
    rXY: prove1Output.rXY,
    chi,
    zeta,
  });
  const kappa1 = collectKappa1Challenge(transcript, proof3);
  const prove4Output = await prove4({
    runtime,
    crs: input.crs,
    state,
    rXY: prove1Output.rXY,
    prove0: proof0,
    prove2: prove2Output,
    proof3,
    thetas,
    kappa0,
    chi,
    zeta,
    kappa1,
  });

  return {
    proof: await createVerifierProofArtifactFromProverOutput({
      runtime,
      binding,
      prove0: proof0,
      prove1: prove1Output,
      prove2: prove2Output,
      proof3,
      prove4: prove4Output,
      sourcePackageVersion: options.sourcePackageVersion,
    }),
  };
}

function collectThetaChallenges(
  runtime: CurveRuntime,
  transcript: RollingKeccakTranscript,
  proof0: {
    readonly U: Uint8Array;
    readonly V: Uint8Array;
    readonly W: Uint8Array;
    readonly Q_AX: Uint8Array;
    readonly Q_AY: Uint8Array;
    readonly B: Uint8Array;
  },
): readonly [FieldElement, FieldElement, FieldElement] {
  transcript
    .commitG1Point(proof0.U, runtime.G1)
    .commitG1Point(proof0.V, runtime.G1)
    .commitG1Point(proof0.W, runtime.G1)
    .commitG1Point(proof0.Q_AX, runtime.G1)
    .commitG1Point(proof0.Q_AY, runtime.G1)
    .commitG1Point(proof0.B, runtime.G1);
  const thetas = transcript.getChallenges(3);

  return [thetas[0], thetas[1], thetas[2]];
}

function collectKappa0Challenge(
  runtime: CurveRuntime,
  transcript: RollingKeccakTranscript,
  proof1: { readonly R: Uint8Array },
): FieldElement {
  transcript.commitG1Point(proof1.R, runtime.G1);
  return transcript.squeezeChallenge();
}

function collectEvaluationChallenges(
  runtime: CurveRuntime,
  transcript: RollingKeccakTranscript,
  proof2: { readonly Q_CX: Uint8Array; readonly Q_CY: Uint8Array },
): { readonly chi: FieldElement; readonly zeta: FieldElement } {
  transcript.commitG1Point(proof2.Q_CX, runtime.G1).commitG1Point(proof2.Q_CY, runtime.G1);

  return {
    chi: transcript.squeezeChallenge(),
    zeta: transcript.squeezeChallenge(),
  };
}

function collectKappa1Challenge(
  transcript: RollingKeccakTranscript,
  proof3: {
    readonly V_eval: FieldElement;
    readonly R_eval: FieldElement;
    readonly R_omegaX_eval: FieldElement;
    readonly R_omegaX_omegaY_eval: FieldElement;
  },
): FieldElement {
  transcript
    .commitField(proof3.V_eval)
    .commitField(proof3.R_eval)
    .commitField(proof3.R_omegaX_eval)
    .commitField(proof3.R_omegaX_omegaY_eval);

  return transcript.squeezeChallenge();
}
