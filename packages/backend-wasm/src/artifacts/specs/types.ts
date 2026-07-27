import type { BinarySectionEncoding, BinarySectionType } from "../binary/binary-format.js";

export interface RuntimeArtifactFormatSpec {
  readonly schemaVersion: 1;
  readonly name: RuntimeArtifactFormatSpecName;
  readonly sections: readonly RuntimeArtifactSectionSpec[];
}

export type RuntimeArtifactFormatSpecName =
  | "sigma_verify"
  | "verifier_preprocess"
  | "verifier_proof"
  | "instance"
  | "prover_crs"
  | "prover_placement_variables"
  | "prover_permutation"
  | "prover_setup_params"
  | "test_binary";

export interface RuntimeArtifactSectionSpec {
  readonly label: string;
  readonly type: BinarySectionType;
  readonly encoding: BinarySectionEncoding;
  readonly elementCount: number | null;
  readonly elementByteLength: number | null;
  readonly points: readonly RuntimeArtifactPointSpec[];
}

export interface RuntimeArtifactPointSpec {
  readonly index: number;
  readonly name: string;
}
