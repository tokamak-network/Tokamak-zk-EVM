import { decodeBinaryArtifactFile } from "../../libs/serialization/binary-artifact-file.js";
import type {
  ArtifactConverterCommand,
  ArtifactConverterOutput,
  ArtifactConverterRequest,
  BinaryArtifactFileDebugJson,
  BinaryArtifactFileToDebugJsonInput,
  ConverterArtifactJson,
  NativeProverArtifactsToBinaryInput,
  NativeVerifierJsonToBinaryInput,
  ProofBinaryToNativeJsonInput,
  RuntimeArtifactBundleOutput,
} from "./types.js";
import { ARTIFACT_CONVERTER_COMMANDS } from "./types.js";

export { ARTIFACT_CONVERTER_COMMANDS };
export type {
  ArtifactConverterCommand,
  ArtifactConverterInput,
  ArtifactConverterOutput,
  ArtifactConverterRequest,
  BinaryArtifactFileDebugJson,
  BinaryArtifactFileToDebugJsonInput,
  BinarySectionDebugJson,
  ConverterArtifactJson,
  NativeProverArtifactsToBinaryInput,
  NativeVerifierJsonToBinaryInput,
  ProofBinaryToNativeJsonInput,
  RuntimeArtifactBundleOutput,
  RuntimeArtifactBundleOutputFile,
} from "./types.js";

export function isArtifactConverterCommand(value: string): value is ArtifactConverterCommand {
  return ARTIFACT_CONVERTER_COMMANDS.includes(value as ArtifactConverterCommand);
}

export async function convertNativeVerifierJsonToBinary(
  _input: NativeVerifierJsonToBinaryInput,
): Promise<RuntimeArtifactBundleOutput> {
  throw converterNotImplemented("json-to-verifier-binary");
}

export async function convertNativeProverArtifactsToBinary(
  _input: NativeProverArtifactsToBinaryInput,
): Promise<RuntimeArtifactBundleOutput> {
  throw converterNotImplemented("json-rkyv-to-prover-binary");
}

export async function convertProofBinaryToNativeJson(
  _input: ProofBinaryToNativeJsonInput,
): Promise<ConverterArtifactJson> {
  throw converterNotImplemented("proof-binary-to-json");
}

export async function convertBinaryArtifactFileToDebugJson(
  input: BinaryArtifactFileToDebugJsonInput,
): Promise<BinaryArtifactFileDebugJson> {
  const artifactFile = await decodeBinaryArtifactFile(input.artifactFile);

  return {
    kind: artifactFile.kind,
    schemaVersion: artifactFile.schemaVersion,
    ffjavascriptVersion: artifactFile.ffjavascriptVersion,
    wasmcurvesVersion: artifactFile.wasmcurvesVersion,
    byteLength: artifactFile.byteLength,
    sections: artifactFile.sections.map((section) => ({
      type: section.type,
      encoding: section.encoding,
      label: section.label,
      elementCount: section.elementCount,
      elementByteLength: section.elementByteLength,
      byteOffset: section.byteOffset,
      byteLength: section.byteLength,
      flags: section.flags,
      digestHex: bytesToHex(section.digest),
      dataHex: input.includeSectionData === true ? bytesToHex(section.data) : undefined,
    })),
  };
}

export async function executeArtifactConverter(
  request: ArtifactConverterRequest,
): Promise<ArtifactConverterOutput> {
  switch (request.command) {
    case "json-to-verifier-binary":
      return convertNativeVerifierJsonToBinary(request.input as NativeVerifierJsonToBinaryInput);
    case "json-rkyv-to-prover-binary":
      return convertNativeProverArtifactsToBinary(request.input as NativeProverArtifactsToBinaryInput);
    case "proof-binary-to-json":
      return convertProofBinaryToNativeJson(request.input as ProofBinaryToNativeJsonInput);
    case "binary-to-debug-json":
      return convertBinaryArtifactFileToDebugJson(request.input as BinaryArtifactFileToDebugJsonInput);
  }
}

function converterNotImplemented(command: ArtifactConverterCommand): Error {
  return new Error(`Artifact converter '${command}' is defined but not implemented in this milestone.`);
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}
