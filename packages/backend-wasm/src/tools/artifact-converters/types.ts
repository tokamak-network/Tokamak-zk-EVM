export const ARTIFACT_CONVERTER_COMMANDS = [
  "json-to-verifier-binary",
  "json-rkyv-to-prover-binary",
  "proof-binary-to-json",
  "binary-to-debug-json",
] as const;

export type ArtifactConverterCommand = (typeof ARTIFACT_CONVERTER_COMMANDS)[number];
export type ConverterArtifactJson = Record<string, unknown>;

export interface NativeVerifierJsonToBinaryInput {
  readonly proof?: unknown;
  readonly preprocess?: unknown;
  readonly instance?: unknown;
  readonly instanceDescription?: unknown;
  readonly sigmaVerify?: unknown;
}

export interface NativeProverArtifactsToBinaryInput {
  readonly setupParams?: unknown;
  readonly subcircuitMetadata?: unknown;
  readonly placement?: unknown;
  readonly permutation?: unknown;
  readonly witnessInputs?: unknown;
  readonly nativeJson?: unknown;
  readonly rkyvArtifacts?: readonly Uint8Array[];
}

export interface ProofBinaryToNativeJsonInput {
  readonly proofBundle: Uint8Array;
}

export interface BinaryBundleToDebugJsonInput {
  readonly bundle: Uint8Array;
  readonly includeSectionData?: boolean;
}

export interface BinaryBundleDebugJson {
  readonly kind: number;
  readonly schemaVersion: number;
  readonly ffjavascriptVersion: string;
  readonly wasmcurvesVersion: string;
  readonly byteLength: number;
  readonly sections: readonly BinarySectionDebugJson[];
}

export interface BinarySectionDebugJson {
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

export type ArtifactConverterInput =
  | NativeVerifierJsonToBinaryInput
  | NativeProverArtifactsToBinaryInput
  | ProofBinaryToNativeJsonInput
  | BinaryBundleToDebugJsonInput;

export interface ArtifactConverterRequest {
  readonly command: ArtifactConverterCommand;
  readonly input: ArtifactConverterInput;
}

export type ArtifactConverterOutput = Uint8Array | ConverterArtifactJson | BinaryBundleDebugJson;
