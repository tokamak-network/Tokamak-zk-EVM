import { createBinaryArtifactFile, decodeBinaryArtifactFile } from "../../libs/serialization/binary-artifact-file.js";
import {
  BinaryArtifactFileKind,
  BinarySectionEncoding,
  BinarySectionType,
} from "../../libs/serialization/binary-format.js";
import type {
  ArtifactConverterCommand,
  ArtifactConverterOutput,
  ArtifactConverterRequest,
  BinaryArtifactFileDebugJson,
  BinaryArtifactFileToDebugJsonInput,
  BinaryDigestDebugJson,
  ConverterArtifactJson,
  NativeProverArtifactsToBinaryInput,
  NativePermutationJsonToBinaryInput,
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
  BinaryDigestDebugJson,
  BinarySectionDebugJson,
  ConverterArtifactJson,
  NativeProverArtifactsToBinaryInput,
  NativePermutationJsonToBinaryInput,
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

export async function convertNativePermutationJsonToBinary(
  input: NativePermutationJsonToBinaryInput,
): Promise<Uint8Array> {
  const entries = parseNativePermutationJson(input.permutation);

  return createBinaryArtifactFile({
    kind: BinaryArtifactFileKind.ProverPermutation,
    sourcePackageVersion: input.sourcePackageVersion,
    sections: [
      {
        type: BinarySectionType.Permutation,
        encoding: BinarySectionEncoding.Bytes,
        label: "permutation.entries",
        elementCount: entries.length,
        elementByteLength: 16,
        data: encodePermutationEntries(entries),
      },
    ],
  });
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
    formatVersion: artifactFile.formatVersion,
    sourcePackageVersion: artifactFile.sourcePackageVersion,
    byteLength: artifactFile.byteLength,
    digests: artifactFile.digests.map((entry): BinaryDigestDebugJson => ({
      type: entry.type,
      sectionIndex: entry.sectionIndex,
      digestHex: bytesToHex(entry.digest),
    })),
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
    case "permutation-json-to-binary":
      return convertNativePermutationJsonToBinary(request.input as NativePermutationJsonToBinaryInput);
    case "proof-binary-to-json":
      return convertProofBinaryToNativeJson(request.input as ProofBinaryToNativeJsonInput);
    case "binary-to-debug-json":
      return convertBinaryArtifactFileToDebugJson(request.input as BinaryArtifactFileToDebugJsonInput);
  }
}

function converterNotImplemented(command: ArtifactConverterCommand): Error {
  return new Error(`Artifact converter '${command}' is defined but not implemented in this milestone.`);
}

interface NativePermutationEntry {
  readonly row: number;
  readonly col: number;
  readonly X: number;
  readonly Y: number;
}

function parseNativePermutationJson(raw: unknown): readonly NativePermutationEntry[] {
  if (!Array.isArray(raw)) {
    throw new Error("Native permutation JSON must be an array.");
  }

  return raw.map((entry, index): NativePermutationEntry => {
    if (!isRecord(entry)) {
      throw new Error(`Native permutation entry ${index} must be an object.`);
    }

    return {
      row: parseU32(entry.row, `permutation[${index}].row`),
      col: parseU32(entry.col, `permutation[${index}].col`),
      X: parseU32(entry.X, `permutation[${index}].X`),
      Y: parseU32(entry.Y, `permutation[${index}].Y`),
    };
  });
}

function encodePermutationEntries(entries: readonly NativePermutationEntry[]): Uint8Array {
  const output = new Uint8Array(entries.length * 16);
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);

  for (let index = 0; index < entries.length; index += 1) {
    const offset = index * 16;
    const entry = entries[index];
    view.setUint32(offset, entry.row, true);
    view.setUint32(offset + 4, entry.col, true);
    view.setUint32(offset + 8, entry.X, true);
    view.setUint32(offset + 12, entry.Y, true);
  }

  return output;
}

function parseU32(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`${label} must be an unsigned 32-bit integer.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}
