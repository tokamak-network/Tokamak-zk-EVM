import { BinarySectionEncoding, BinarySectionType } from "../binary/binary-format.js";
import type { RuntimeArtifactFormatSpec } from "./types.js";

export const PREPROCESS_CRS_V1_SPEC = {
  schemaVersion: 1,
  name: "preprocess_crs",
  sections: [
    {
      label: "sigma1.xy-powers",
      type: BinarySectionType.CrsG1,
      encoding: BinarySectionEncoding.FfjsG1Affine96,
      elementCount: 1048576,
      elementByteLength: 96,
      points: [
      ],
    },
    {
      label: "sigma1.gamma-inv-o-inst",
      type: BinarySectionType.CrsG1,
      encoding: BinarySectionEncoding.FfjsG1Affine96,
      elementCount: 600,
      elementByteLength: 96,
      points: [
      ],
    },
  ],
} as const satisfies RuntimeArtifactFormatSpec;
