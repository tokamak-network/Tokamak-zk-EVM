import { createBinaryArtifactFile } from "../../artifacts/binary/binary-artifact-file.js";
import {
  BinaryArtifactFileKind,
  BinarySectionEncoding,
  BinarySectionType,
} from "../../artifacts/binary/binary-format.js";
import type { CurveRuntime } from "../../runtime/curve/curve.js";
import type { ProverBinding } from "../commitments/binding-commitments.js";
import type { InitialRelationComputation } from "../protocol/initial-relation.js";
import type { RecursionComputation } from "../protocol/recursion-commitment.js";
import type { CopyQuotientComputation } from "../protocol/copy-quotient.js";
import type { ChallengeEvaluations } from "../protocol/challenge-evaluations.js";
import type { OpeningCommitmentsComputation } from "../protocol/opening-commitments.js";
import { BACKEND_WASM_PACKAGE_VERSION } from "../../version.js";

export interface ProverVerifierProofOutputInput {
  readonly runtime: CurveRuntime;
  readonly binding: ProverBinding;
  readonly initialRelation: InitialRelationComputation;
  readonly recursion: RecursionComputation;
  readonly copyQuotient: CopyQuotientComputation;
  readonly evaluations: ChallengeEvaluations;
  readonly openings: OpeningCommitmentsComputation;
  readonly sourcePackageVersion?: string;
}

export async function createVerifierProofArtifactFromProverOutput(
  input: ProverVerifierProofOutputInput,
): Promise<Uint8Array> {
  const { runtime, binding, initialRelation, recursion, copyQuotient, evaluations, openings } = input;
  const initialCommitments = initialRelation.commitments;
  const recursionCommitment = recursion.commitment;
  const copyCommitments = copyQuotient.commitments;
  const openingCommitments = openings.commitments;

  return createBinaryArtifactFile({
    kind: BinaryArtifactFileKind.VerifierProof,
    sourcePackageVersion: input.sourcePackageVersion ?? BACKEND_WASM_PACKAGE_VERSION,
    sections: [
      {
        type: BinarySectionType.Proof,
        encoding: BinarySectionEncoding.FfjsG1Affine96,
        label: "proof.g1",
        elementCount: 19,
        elementByteLength: 96,
        data: concatBytes(
          [
            initialCommitments.U,
            initialCommitments.V,
            initialCommitments.W,
            binding.O_mid,
            binding.O_prv,
            initialCommitments.Q_AX,
            initialCommitments.Q_AY,
            copyCommitments.Q_CX,
            copyCommitments.Q_CY,
            openingCommitments.Pi_X,
            openingCommitments.Pi_Y,
            initialCommitments.B,
            recursionCommitment.R,
            openingCommitments.M_Y,
            openingCommitments.M_X,
            openingCommitments.N_Y,
            openingCommitments.N_X,
            binding.O_pub_free,
            binding.A_free,
          ].map((point) => runtime.G1.toAffine(point)),
        ),
      },
      {
        type: BinarySectionType.Proof,
        encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
        label: "proof.evals",
        elementCount: 4,
        elementByteLength: 32,
        data: concatBytes([
          evaluations.R_eval,
          evaluations.R_omegaX_eval,
          evaluations.R_omegaX_omegaY_eval,
          evaluations.V_eval,
        ]),
      },
    ],
  });
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}
