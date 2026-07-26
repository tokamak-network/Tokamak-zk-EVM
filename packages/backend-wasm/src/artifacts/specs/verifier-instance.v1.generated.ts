import { BinarySectionEncoding, BinarySectionType } from "../binary/binary-format.js";
import type { RuntimeArtifactFormatSpec } from "./types.js";

export const VERIFIER_INSTANCE_V1_SPEC = {
  schemaVersion: 1,
  name: "verifier_instance",
  sections: [
    {
      label: "instance.public",
      type: BinarySectionType.Instance,
      encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
      elementCount: null,
      elementByteLength: null,
      points: [
      ],
    },
  ],
} as const satisfies RuntimeArtifactFormatSpec;
