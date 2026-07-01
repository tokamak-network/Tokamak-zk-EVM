import type { BinarySectionEncoding, BinarySectionType } from "../../serialization/binary-format.js";

export interface RuntimeArtifactFormatSpec {
  readonly schemaVersion: 1;
  readonly name: RuntimeArtifactFormatSpecName;
  readonly sections: readonly RuntimeArtifactSectionSpec[];
}

export type RuntimeArtifactFormatSpecName = "sigma_verify" | "verifier_preprocess" | "prover_crs";

export interface RuntimeArtifactSectionSpec {
  readonly label: string;
  readonly type: BinarySectionType;
  readonly encoding: BinarySectionEncoding;
  readonly elementCount: number | null;
  readonly points: readonly RuntimeArtifactPointSpec[];
}

export interface RuntimeArtifactPointSpec {
  readonly index: number;
  readonly name: string;
}
