import { BinarySectionEncoding, BinarySectionType } from "../../serialization/binary-format.js";
import type { RuntimeArtifactFormatSpec } from "./types.js";

export const PROVER_CRS_V1_SPEC = {
  schemaVersion: 1,
  name: "prover_crs",
  sections: [
    {
      label: "sigma.g1",
      type: BinarySectionType.CrsG1,
      encoding: BinarySectionEncoding.FfjsG1Affine96,
      elementCount: 6,
      points: [
        { index: 0, name: "G" },
        { index: 1, name: "sigma1.x" },
        { index: 2, name: "sigma1.y" },
        { index: 3, name: "sigma1.delta" },
        { index: 4, name: "sigma1.eta" },
        { index: 5, name: "lagrangeKL" },
      ],
    },
    {
      label: "sigma1.xy-powers",
      type: BinarySectionType.CrsG1,
      encoding: BinarySectionEncoding.FfjsG1Affine96,
      elementCount: null,
      points: [
      ],
    },
    {
      label: "sigma1.gamma-inv-o-inst",
      type: BinarySectionType.CrsG1,
      encoding: BinarySectionEncoding.FfjsG1Affine96,
      elementCount: null,
      points: [
      ],
    },
    {
      label: "sigma1.eta-inv-li-o-inter-alpha4-kj",
      type: BinarySectionType.CrsG1,
      encoding: BinarySectionEncoding.FfjsG1Affine96,
      elementCount: null,
      points: [
      ],
    },
    {
      label: "sigma1.delta-inv-li-o-prv",
      type: BinarySectionType.CrsG1,
      encoding: BinarySectionEncoding.FfjsG1Affine96,
      elementCount: null,
      points: [
      ],
    },
    {
      label: "sigma1.delta-inv-alphak-xh-tx",
      type: BinarySectionType.CrsG1,
      encoding: BinarySectionEncoding.FfjsG1Affine96,
      elementCount: null,
      points: [
      ],
    },
    {
      label: "sigma1.delta-inv-alpha4-xj-tx",
      type: BinarySectionType.CrsG1,
      encoding: BinarySectionEncoding.FfjsG1Affine96,
      elementCount: null,
      points: [
      ],
    },
    {
      label: "sigma1.delta-inv-alphak-yi-ty",
      type: BinarySectionType.CrsG1,
      encoding: BinarySectionEncoding.FfjsG1Affine96,
      elementCount: null,
      points: [
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
