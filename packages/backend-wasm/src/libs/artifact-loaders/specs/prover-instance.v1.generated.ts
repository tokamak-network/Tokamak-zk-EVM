import { BinarySectionEncoding, BinarySectionType } from "../../serialization/binary-format.js";
import type { RuntimeArtifactFormatSpec } from "./types.js";

export const PROVER_INSTANCE_V1_SPEC = {
  schemaVersion: 1,
  name: "prover_instance",
  sections: [
    {
      label: "instance.public",
      type: BinarySectionType.Instance,
      encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
      elementCount: null,
      elementByteLength: 32,
      points: [
      ],
    },
  ],
} as const satisfies RuntimeArtifactFormatSpec;
