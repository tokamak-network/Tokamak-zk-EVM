import { BinarySectionEncoding, BinarySectionType } from "../../serialization/binary-format.js";
import type { RuntimeArtifactFormatSpec } from "./types.js";

export const PROVER_SETUP_PARAMS_V1_SPEC = {
  schemaVersion: 1,
  name: "prover_setup_params",
  sections: [
    {
      label: "setup.params",
      type: BinarySectionType.SetupParams,
      encoding: BinarySectionEncoding.Bytes,
      elementCount: 1,
      elementByteLength: 36,
      points: [
      ],
    },
  ],
} as const satisfies RuntimeArtifactFormatSpec;
