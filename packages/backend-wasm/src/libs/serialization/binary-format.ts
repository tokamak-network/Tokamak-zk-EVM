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
  VerifierInstance = 1,
  VerifierProof = 2,
  VerifierCrs = 3,
  VerifierPreprocess = 4,
  ProverPlacementVariables = 5,
  ProverCrs = 6,
  ProverInstance = 7,
  ProverSetupParams = 8,
  Test = 255,
}

export enum BinaryDigestEntryType {
  SelfDigest = 1,
  SourceArtifactDigest = 2,
  SectionDigest = 3,
  SetupParamsDigest = 4,
  SubcircuitLibraryDigest = 5,
  CombinedSigmaDigest = 6,
  SigmaVerifyDigest = 7,
  SigmaPreprocessDigest = 8,
  InstanceDigest = 9,
  PublicFunctionDigest = 10,
  PermutationDigest = 11,
  PlacementVariablesDigest = 12,
  ProofDigest = 13,
  PreprocessDigest = 14,
}

export enum BinarySectionEncoding {
  FfjsFrMontgomeryLe32 = 1,
  FfjsFqMontgomeryLe48 = 2,
  FfjsG1Affine96 = 3,
  FfjsG2Affine192 = 4,
  ScalarRawLe32 = 5,
  Bytes = 255,
}

export enum BinarySectionType {
  Proof = 1,
  Preprocess = 2,
  Instance = 3,
  InstanceDescription = 4,
  SigmaVerify = 5,
  SetupParams = 6,
  SubcircuitMetadata = 7,
  Placement = 8,
  Permutation = 9,
  WitnessInputs = 10,
  CrsG1 = 11,
  CrsG2 = 12,
  MsmBases = 13,
  MsmScalars = 14,
  PairingG1Terms = 15,
  PairingG2Terms = 16,
  ProofOutput = 17,
  VerifierResult = 18,
  TestScalars = 240,
  TestG1Points = 241,
  TestG2Points = 242,
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

export interface BinaryDigestInput {
  readonly type: BinaryDigestEntryType;
  readonly digest: Uint8Array;
  readonly sectionIndex?: number;
}

export interface BinaryArtifactFileInput {
  readonly kind: BinaryArtifactFileKind;
  readonly sourcePackageVersion: string;
  readonly sections: readonly BinarySectionInput[];
  readonly digests?: readonly BinaryDigestInput[];
}

export interface BinaryDigestEntryView {
  readonly type: BinaryDigestEntryType;
  readonly sectionIndex?: number;
  readonly digest: Uint8Array;
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
  readonly digest: Uint8Array;
  readonly data: Uint8Array;
}

export interface BinaryArtifactFileView {
  readonly kind: BinaryArtifactFileKind;
  readonly formatVersion: number;
  readonly sourcePackageVersion: string;
  readonly byteLength: number;
  readonly digests: readonly BinaryDigestEntryView[];
  readonly sections: readonly BinarySectionView[];
}

export function expectedElementByteLength(encoding: BinarySectionEncoding): number | undefined {
  switch (encoding) {
    case BinarySectionEncoding.FfjsFrMontgomeryLe32:
    case BinarySectionEncoding.ScalarRawLe32:
      return 32;
    case BinarySectionEncoding.FfjsFqMontgomeryLe48:
      return 48;
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
    encoding === BinarySectionEncoding.FfjsFqMontgomeryLe48 ||
    encoding === BinarySectionEncoding.FfjsG1Affine96 ||
    encoding === BinarySectionEncoding.FfjsG2Affine192 ||
    encoding === BinarySectionEncoding.ScalarRawLe32
  );
}
