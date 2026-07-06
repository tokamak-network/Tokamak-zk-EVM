import { BinarySectionEncoding, BinarySectionType } from "../../serialization/binary-format.js";
import type { RuntimeArtifactFormatSpec } from "./types.js";

export const TEST_BINARY_V1_SPEC = {
  schemaVersion: 1,
  name: "test_binary",
  sections: [
    {
      label: "scalar.operands",
      type: BinarySectionType.TestScalars,
      encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
      elementCount: null,
      elementByteLength: 32,
      points: [
      ],
    },
    {
      label: "msm.bases",
      type: BinarySectionType.MsmBases,
      encoding: BinarySectionEncoding.FfjsG1Affine96,
      elementCount: null,
      elementByteLength: 96,
      points: [
      ],
    },
    {
      label: "msm.scalars",
      type: BinarySectionType.MsmScalars,
      encoding: BinarySectionEncoding.ScalarRawLe32,
      elementCount: null,
      elementByteLength: 32,
      points: [
      ],
    },
    {
      label: "pairing.true.left.g1",
      type: BinarySectionType.PairingG1Terms,
      encoding: BinarySectionEncoding.FfjsG1Affine96,
      elementCount: null,
      elementByteLength: 96,
      points: [
      ],
    },
    {
      label: "pairing.true.left.g2",
      type: BinarySectionType.PairingG2Terms,
      encoding: BinarySectionEncoding.FfjsG2Affine192,
      elementCount: null,
      elementByteLength: 192,
      points: [
      ],
    },
    {
      label: "pairing.true.right.g1",
      type: BinarySectionType.PairingG1Terms,
      encoding: BinarySectionEncoding.FfjsG1Affine96,
      elementCount: null,
      elementByteLength: 96,
      points: [
      ],
    },
    {
      label: "pairing.true.right.g2",
      type: BinarySectionType.PairingG2Terms,
      encoding: BinarySectionEncoding.FfjsG2Affine192,
      elementCount: null,
      elementByteLength: 192,
      points: [
      ],
    },
    {
      label: "pairing.false.left.g1",
      type: BinarySectionType.PairingG1Terms,
      encoding: BinarySectionEncoding.FfjsG1Affine96,
      elementCount: null,
      elementByteLength: 96,
      points: [
      ],
    },
    {
      label: "pairing.false.left.g2",
      type: BinarySectionType.PairingG2Terms,
      encoding: BinarySectionEncoding.FfjsG2Affine192,
      elementCount: null,
      elementByteLength: 192,
      points: [
      ],
    },
    {
      label: "pairing.false.right.g1",
      type: BinarySectionType.PairingG1Terms,
      encoding: BinarySectionEncoding.FfjsG1Affine96,
      elementCount: null,
      elementByteLength: 96,
      points: [
      ],
    },
    {
      label: "pairing.false.right.g2",
      type: BinarySectionType.PairingG2Terms,
      encoding: BinarySectionEncoding.FfjsG2Affine192,
      elementCount: null,
      elementByteLength: 192,
      points: [
      ],
    },
  ],
} as const satisfies RuntimeArtifactFormatSpec;
