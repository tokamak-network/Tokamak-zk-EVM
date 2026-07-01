import { BinarySectionEncoding, BinarySectionType } from "../../serialization/binary-format.js";
import type { RuntimeArtifactFormatSpec } from "./types.js";

export const VERIFIER_PROOF_V1_SPEC = {
  schemaVersion: 1,
  name: "verifier_proof",
  sections: [
    {
      label: "proof.g1",
      type: BinarySectionType.Proof,
      encoding: BinarySectionEncoding.FfjsG1Affine96,
      elementCount: 19,
      points: [
        { index: 0, name: "proof0.U" },
        { index: 1, name: "proof0.V" },
        { index: 2, name: "proof0.W" },
        { index: 3, name: "binding.O_mid" },
        { index: 4, name: "binding.O_prv" },
        { index: 5, name: "proof0.Q_AX" },
        { index: 6, name: "proof0.Q_AY" },
        { index: 7, name: "proof2.Q_CX" },
        { index: 8, name: "proof2.Q_CY" },
        { index: 9, name: "proof4.Pi_X" },
        { index: 10, name: "proof4.Pi_Y" },
        { index: 11, name: "proof0.B" },
        { index: 12, name: "proof1.R" },
        { index: 13, name: "proof4.M_Y" },
        { index: 14, name: "proof4.M_X" },
        { index: 15, name: "proof4.N_Y" },
        { index: 16, name: "proof4.N_X" },
        { index: 17, name: "binding.O_pub_free" },
        { index: 18, name: "binding.A_free" },
      ],
    },
    {
      label: "proof.evals",
      type: BinarySectionType.Proof,
      encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
      elementCount: 4,
      points: [
        { index: 0, name: "proof3.R_eval" },
        { index: 1, name: "proof3.R_omegaX_eval" },
        { index: 2, name: "proof3.R_omegaX_omegaY_eval" },
        { index: 3, name: "proof3.V_eval" },
      ],
    },
  ],
} as const satisfies RuntimeArtifactFormatSpec;
