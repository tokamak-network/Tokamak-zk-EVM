import type { RuntimeArtifactBundleManifest } from "../../libs/serialization/artifact-bundle.js";

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
  readonly proofFile: Uint8Array;
}

export interface BinaryArtifactFileToDebugJsonInput {
  readonly artifactFile: Uint8Array;
  readonly includeSectionData?: boolean;
}

export interface BinaryArtifactFileDebugJson {
  readonly kind: number;
  readonly formatVersion: number;
  readonly sourcePackageVersion: string;
  readonly byteLength: number;
  readonly digests: readonly BinaryDigestDebugJson[];
  readonly sections: readonly BinarySectionDebugJson[];
}

export interface BinaryDigestDebugJson {
  readonly type: number;
  readonly sectionIndex?: number;
  readonly digestHex: string;
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

export interface RuntimeArtifactBundleOutput {
  readonly manifest: RuntimeArtifactBundleManifest;
  readonly files: readonly RuntimeArtifactBundleOutputFile[];
}

export interface RuntimeArtifactBundleOutputFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export type ArtifactConverterInput =
  | NativeVerifierJsonToBinaryInput
  | NativeProverArtifactsToBinaryInput
  | ProofBinaryToNativeJsonInput
  | BinaryArtifactFileToDebugJsonInput;

export interface ArtifactConverterRequest {
  readonly command: ArtifactConverterCommand;
  readonly input: ArtifactConverterInput;
}

export type ArtifactConverterOutput =
  | RuntimeArtifactBundleOutput
  | Uint8Array
  | ConverterArtifactJson
  | BinaryArtifactFileDebugJson;
