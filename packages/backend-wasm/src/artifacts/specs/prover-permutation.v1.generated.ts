import { BinarySectionEncoding, BinarySectionType } from "../format/binary-format.js";
import type { RuntimeArtifactFormatSpec } from "./types.js";

export const PROVER_PERMUTATION_V1_SPEC = {
  schemaVersion: 1,
  name: "prover_permutation",
  sections: [
    {
      label: "permutation.entries",
      type: BinarySectionType.Permutation,
      encoding: BinarySectionEncoding.Bytes,
      elementCount: null,
      elementByteLength: 16,
      points: [
      ],
    },
  ],
} as const satisfies RuntimeArtifactFormatSpec;
