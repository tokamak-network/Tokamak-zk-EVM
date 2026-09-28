import type { BinaryArtifactFileKind, BinarySectionEncoding, BinarySectionType } from "../binary/binary-format.js";

export interface RuntimeArtifactFormatSpec {
  readonly schemaVersion: 1;
  readonly name: RuntimeArtifactFormatSpecName;
  readonly kind: BinaryArtifactFileKind;
  readonly sections: readonly RuntimeArtifactSectionSpec[];
}

export type RuntimeArtifactFormatSpecName =
  | "instance"
  | "prover_placement_variables"
  | "prover_selector"
  | "prover_permutation"
  | "univariate_verifier_preprocess"
  | "univariate_proof";

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
