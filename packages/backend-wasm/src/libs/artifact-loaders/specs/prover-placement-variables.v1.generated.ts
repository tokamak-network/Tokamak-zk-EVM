import { BinarySectionEncoding, BinarySectionType } from "../../serialization/binary-format.js";
import type { RuntimeArtifactFormatSpec } from "./types.js";

export const PROVER_PLACEMENT_VARIABLES_V1_SPEC = {
  schemaVersion: 1,
  name: "prover_placement_variables",
  sections: [
    {
      label: "placement.subcircuit_ids",
      type: BinarySectionType.Placement,
      encoding: BinarySectionEncoding.Bytes,
      elementCount: null,
      elementByteLength: 4,
      points: [
      ],
    },
    {
      label: "placement.variable_offsets",
      type: BinarySectionType.Placement,
      encoding: BinarySectionEncoding.Bytes,
      elementCount: null,
      elementByteLength: 4,
      points: [
      ],
    },
    {
      label: "placement.variables",
      type: BinarySectionType.Placement,
      encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
      elementCount: null,
      elementByteLength: 32,
      points: [
      ],
    },
  ],
} as const satisfies RuntimeArtifactFormatSpec;
