import { RollingKeccakTranscript } from "../libs/crypto/transcript.js";
import type { FieldElement, FieldRuntime } from "../libs/runtime/field.js";
import type { G1Runtime } from "../libs/runtime/group.js";
import type { RandomScalarSource } from "../libs/runtime/random.js";
import type { VerifierProof } from "./verify-snark.js";

export interface VerifierChallenges {
  readonly thetas: readonly [FieldElement, FieldElement, FieldElement];
  readonly kappa0: FieldElement;
  readonly chi: FieldElement;
  readonly zeta: FieldElement;
  readonly kappa1: FieldElement;
  readonly kappa2: FieldElement;
}

export async function collectChallenges(
  field: FieldRuntime,
  g1: G1Runtime,
  randomScalar: RandomScalarSource,
  proof: VerifierProof,
): Promise<VerifierChallenges> {
  const transcript = new RollingKeccakTranscript(field);

  transcript
    .commitG1Point(proof.proof0.U, g1)
    .commitG1Point(proof.proof0.V, g1)
    .commitG1Point(proof.proof0.W, g1)
    .commitG1Point(proof.proof0.Q_AX, g1)
    .commitG1Point(proof.proof0.Q_AY, g1)
    .commitG1Point(proof.proof0.B, g1);

  const thetas = transcript.getChallenges(3);

  transcript.commitG1Point(proof.proof1.R, g1);
  const kappa0 = transcript.squeezeChallenge();

  transcript.commitG1Point(proof.proof2.Q_CX, g1).commitG1Point(proof.proof2.Q_CY, g1);
  const chi = transcript.squeezeChallenge();
  const zeta = transcript.squeezeChallenge();

  transcript
    .commitField(proof.proof3.V_eval)
    .commitField(proof.proof3.R_eval)
    .commitField(proof.proof3.R_omegaX_eval)
    .commitField(proof.proof3.R_omegaX_omegaY_eval);
  const kappa1 = transcript.squeezeChallenge();

  return {
    thetas: [thetas[0], thetas[1], thetas[2]],
    kappa0,
    chi,
    zeta,
    kappa1,
    kappa2: await randomScalar(),
  };
}
