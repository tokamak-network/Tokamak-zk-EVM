import { createBinaryArtifactFile } from "../libs/serialization/binary-artifact-file.js";
import {
  BinaryArtifactFileKind,
  BinarySectionEncoding,
  BinarySectionType,
} from "../libs/serialization/binary-format.js";
import type { CurveRuntime } from "../libs/runtime/curve.js";
import type { ProverBinding, Prove0Computation } from "./prove0.js";
import type { Prove1Computation } from "./prove1.js";
import type { Prove2Computation } from "./prove2.js";
import type { Prove3Output } from "./prove3.js";
import type { Prove4Computation } from "./prove4.js";
import { BACKEND_WASM_PACKAGE_VERSION } from "./version.js";

export interface ProverVerifierProofOutputInput {
  readonly runtime: CurveRuntime;
  readonly binding: ProverBinding;
  readonly prove0: Prove0Computation;
  readonly prove1: Prove1Computation;
  readonly prove2: Prove2Computation;
  readonly proof3: Prove3Output;
  readonly prove4: Prove4Computation;
  readonly sourcePackageVersion?: string;
}

export async function createVerifierProofArtifactFromProverOutput(
  input: ProverVerifierProofOutputInput,
): Promise<Uint8Array> {
  const { runtime, binding, prove0, prove1, prove2, proof3, prove4 } = input;
  const proof0 = prove0.proof0;
  const proof1 = prove1.proof1;
  const proof2 = prove2.proof2;
  const proof4 = prove4.proof4;

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
            proof0.U,
            proof0.V,
            proof0.W,
            binding.O_mid,
            binding.O_prv,
            proof0.Q_AX,
            proof0.Q_AY,
            proof2.Q_CX,
            proof2.Q_CY,
            proof4.Pi_X,
            proof4.Pi_Y,
            proof0.B,
            proof1.R,
            proof4.M_Y,
            proof4.M_X,
            proof4.N_Y,
            proof4.N_X,
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
          proof3.R_eval,
          proof3.R_omegaX_eval,
          proof3.R_omegaX_omegaY_eval,
          proof3.V_eval,
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
