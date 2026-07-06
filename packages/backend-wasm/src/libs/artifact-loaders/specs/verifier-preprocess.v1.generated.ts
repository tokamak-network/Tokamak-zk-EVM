import { BinarySectionEncoding, BinarySectionType } from "../../serialization/binary-format.js";
import type { RuntimeArtifactFormatSpec } from "./types.js";

export const VERIFIER_PREPROCESS_V1_SPEC = {
  schemaVersion: 1,
  name: "verifier_preprocess",
  sections: [
    {
      label: "setup.params",
      type: BinarySectionType.SetupParams,
      encoding: BinarySectionEncoding.Bytes,
      elementCount: 1,
      elementByteLength: null,
      points: [
      ],
    },
    {
      label: "preprocess.g1",
      type: BinarySectionType.Preprocess,
      encoding: BinarySectionEncoding.FfjsG1Affine96,
      elementCount: 3,
      elementByteLength: null,
      points: [
        { index: 0, name: "s0" },
        { index: 1, name: "s1" },
        { index: 2, name: "O_pub_fix" },
      ],
    },
  ],
} as const satisfies RuntimeArtifactFormatSpec;
