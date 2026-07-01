import { decodeBinaryBundle } from "../../libs/serialization/binary-bundle.js";
import type {
  ArtifactConverterCommand,
  ArtifactConverterOutput,
  ArtifactConverterRequest,
  BinaryBundleDebugJson,
  BinaryBundleToDebugJsonInput,
  ConverterArtifactJson,
  NativeProverArtifactsToBinaryInput,
  NativeVerifierJsonToBinaryInput,
  ProofBinaryToNativeJsonInput,
} from "./types.js";
import { ARTIFACT_CONVERTER_COMMANDS } from "./types.js";

export { ARTIFACT_CONVERTER_COMMANDS };
export type {
  ArtifactConverterCommand,
  ArtifactConverterInput,
  ArtifactConverterOutput,
  ArtifactConverterRequest,
  BinaryBundleDebugJson,
  BinaryBundleToDebugJsonInput,
  BinarySectionDebugJson,
  ConverterArtifactJson,
  NativeProverArtifactsToBinaryInput,
  NativeVerifierJsonToBinaryInput,
  ProofBinaryToNativeJsonInput,
} from "./types.js";

export function isArtifactConverterCommand(value: string): value is ArtifactConverterCommand {
  return ARTIFACT_CONVERTER_COMMANDS.includes(value as ArtifactConverterCommand);
}

export async function convertNativeVerifierJsonToBinary(
  _input: NativeVerifierJsonToBinaryInput,
): Promise<Uint8Array> {
  throw converterNotImplemented("json-to-verifier-binary");
}

export async function convertNativeProverArtifactsToBinary(
  _input: NativeProverArtifactsToBinaryInput,
): Promise<Uint8Array> {
  throw converterNotImplemented("json-rkyv-to-prover-binary");
}

export async function convertProofBinaryToNativeJson(
  _input: ProofBinaryToNativeJsonInput,
): Promise<ConverterArtifactJson> {
  throw converterNotImplemented("proof-binary-to-json");
}

export async function convertBinaryBundleToDebugJson(
  input: BinaryBundleToDebugJsonInput,
): Promise<BinaryBundleDebugJson> {
  const bundle = await decodeBinaryBundle(input.bundle);

  return {
    kind: bundle.kind,
    schemaVersion: bundle.schemaVersion,
    ffjavascriptVersion: bundle.ffjavascriptVersion,
    wasmcurvesVersion: bundle.wasmcurvesVersion,
    byteLength: bundle.byteLength,
    sections: bundle.sections.map((section) => ({
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
      return convertBinaryBundleToDebugJson(request.input as BinaryBundleToDebugJsonInput);
  }
}

function converterNotImplemented(command: ArtifactConverterCommand): Error {
  return new Error(`Artifact converter '${command}' is defined but not implemented in this milestone.`);
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}
