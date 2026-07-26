export type ConverterArtifactJson = Record<string, unknown>;

export interface ConvertProofJsonInput {
  readonly sourceFormat: "json";
  readonly proof: unknown;
}

export interface ConvertProofBinaryInput {
  readonly sourceFormat: "binary";
  readonly proof: Uint8Array;
}

export type ConvertProofInput = ConvertProofJsonInput | ConvertProofBinaryInput;

export interface BinaryInspectionOptions {
  readonly includeSectionData?: boolean;
}

export interface BinaryArtifactInspection {
  readonly kind: number;
  readonly formatVersion: number;
  readonly sourcePackageVersion: string;
  readonly byteLength: number;
  readonly digests: readonly BinaryDigestInspection[];
  readonly sections: readonly BinarySectionInspection[];
}

export interface BinaryDigestInspection {
  readonly type: number;
  readonly sectionIndex?: number;
  readonly digestHex: string;
}

export interface BinarySectionInspection {
  readonly type: number;
  readonly encoding: number;
  readonly label: string;
  readonly elementCount: number;
  readonly elementByteLength: number;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly flags: number;
  readonly digestHex: string;
  readonly dataHex?: string;
}
