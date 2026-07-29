export const BINARY_ARTIFACT_MAGIC = "TZBWASM1";
export const BINARY_ARTIFACT_FORMAT_VERSION = 1;
export const BINARY_HEADER_BYTES = 64;
export const BINARY_FILE_KIND_TABLE_BYTES = 8;
export const BINARY_VERSION_TABLE_BYTES = 72;
export const BINARY_SOURCE_PACKAGE_VERSION_BYTES = 64;
export const BINARY_DIGEST_ENTRY_BYTES = 40;
export const BINARY_SECTION_ENTRY_BYTES = 96;
export const BINARY_SECTION_LABEL_BYTES = 40;
export const BINARY_DIGEST_BYTES = 32;

export enum BinaryArtifactFileKind {
  Instance = 1,
  VerifierProof = 2,
  VerifierCrs = 3,
  VerifierPreprocess = 4,
  ProverPlacementVariables = 5,
  ProverCrs = 6,
  PreprocessCrs = 7,
  ProverPermutation = 9,
}

export const BINARY_SELF_DIGEST_ENTRY_TYPE = 1;

export enum BinarySectionEncoding {
  FfjsFrMontgomeryLe32 = 1,
  FfjsG1Affine96 = 3,
  FfjsG2Affine192 = 4,
  Bytes = 255,
}

export enum BinarySectionType {
  Proof = 1,
  Preprocess = 2,
  Instance = 3,
  Placement = 8,
  Permutation = 9,
  CrsG1 = 11,
  CrsG2 = 12,
}

export interface BinarySectionInput {
  readonly type: BinarySectionType;
  readonly encoding: BinarySectionEncoding;
  readonly label: string;
  readonly elementCount: number;
  readonly elementByteLength: number;
  readonly data: Uint8Array;
  readonly flags?: number;
}

export interface BinaryArtifactFileInput {
  readonly kind: BinaryArtifactFileKind;
  readonly sourcePackageVersion: string;
  readonly sections: readonly BinarySectionInput[];
}

export interface BinarySectionView {
  readonly type: BinarySectionType;
  readonly encoding: BinarySectionEncoding;
  readonly label: string;
  readonly elementCount: number;
  readonly elementByteLength: number;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly flags: number;
  readonly data: Uint8Array;
}

export interface BinaryArtifactFileView {
  readonly kind: BinaryArtifactFileKind;
  readonly formatVersion: number;
  readonly sourcePackageVersion: string;
  readonly byteLength: number;
  readonly selfDigest: Uint8Array;
  readonly sections: readonly BinarySectionView[];
}

export function expectedElementByteLength(encoding: BinarySectionEncoding): number | undefined {
  switch (encoding) {
    case BinarySectionEncoding.FfjsFrMontgomeryLe32:
      return 32;
    case BinarySectionEncoding.FfjsG1Affine96:
      return 96;
    case BinarySectionEncoding.FfjsG2Affine192:
      return 192;
    case BinarySectionEncoding.Bytes:
      return undefined;
  }
}

export function isRuntimeReadyEncoding(encoding: BinarySectionEncoding): boolean {
  return (
    encoding === BinarySectionEncoding.FfjsFrMontgomeryLe32 ||
    encoding === BinarySectionEncoding.FfjsG1Affine96 ||
    encoding === BinarySectionEncoding.FfjsG2Affine192
  );
}
