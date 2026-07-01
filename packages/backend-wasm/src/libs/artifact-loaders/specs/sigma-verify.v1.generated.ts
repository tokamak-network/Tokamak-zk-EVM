import { BinarySectionEncoding, BinarySectionType } from "../../serialization/binary-format.js";
import type { RuntimeArtifactFormatSpec } from "./types.js";

export const SIGMA_VERIFY_V1_SPEC = {
  schemaVersion: 1,
  name: "sigma_verify",
  sections: [
    {
      label: "sigma.g1",
      type: BinarySectionType.CrsG1,
      encoding: BinarySectionEncoding.FfjsG1Affine96,
      elementCount: 4,
      points: [
        { index: 0, name: "G" },
        { index: 1, name: "sigma1.x" },
        { index: 2, name: "sigma1.y" },
        { index: 3, name: "lagrangeKL" },
      ],
    },
    {
      label: "sigma.g2",
      type: BinarySectionType.CrsG2,
      encoding: BinarySectionEncoding.FfjsG2Affine192,
      elementCount: 10,
      points: [
        { index: 0, name: "H" },
        { index: 1, name: "sigma2.alpha" },
        { index: 2, name: "sigma2.alpha2" },
        { index: 3, name: "sigma2.alpha3" },
        { index: 4, name: "sigma2.alpha4" },
        { index: 5, name: "sigma2.gamma" },
        { index: 6, name: "sigma2.delta" },
        { index: 7, name: "sigma2.eta" },
        { index: 8, name: "sigma2.x" },
        { index: 9, name: "sigma2.y" },
      ],
    },
  ],
} as const satisfies RuntimeArtifactFormatSpec;
