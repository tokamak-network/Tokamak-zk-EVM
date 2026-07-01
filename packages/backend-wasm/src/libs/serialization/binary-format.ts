export const BINARY_ARTIFACT_MAGIC = "TZBWASM1";
export const BINARY_ARTIFACT_SCHEMA_VERSION = 1;
export const BINARY_HEADER_BYTES = 64;
export const BINARY_SECTION_ENTRY_BYTES = 96;
export const BINARY_SECTION_LABEL_BYTES = 40;
export const FFJAVASCRIPT_VERSION = "0.3.1";
export const WASMCURVES_VERSION = "0.2.2";

export enum BinaryBundleKind {
  VerifierInput = 1,
  ProverInput = 2,
  ProofOutput = 3,
  VerifierOutput = 4,
  Test = 255,
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

export interface BinaryBundleView {
  readonly kind: BinaryBundleKind;
  readonly schemaVersion: number;
  readonly ffjavascriptVersion: typeof FFJAVASCRIPT_VERSION;
  readonly wasmcurvesVersion: typeof WASMCURVES_VERSION;
  readonly byteLength: number;
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
