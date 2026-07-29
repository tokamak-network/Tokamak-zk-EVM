import { decodeBinaryArtifactFile } from "../../artifacts/binary/binary-artifact-file.js";
import type { BinaryArtifactInspection } from "./types.js";

export async function inspectBinary(
  artifact: Uint8Array,
): Promise<BinaryArtifactInspection> {
  const artifactFile = await decodeBinaryArtifactFile(artifact);

  return {
    kind: artifactFile.kind,
    formatVersion: artifactFile.formatVersion,
    sourcePackageVersion: artifactFile.sourcePackageVersion,
    byteLength: artifactFile.byteLength,
    selfDigestHex: bytesToHex(artifactFile.selfDigest),
    sections: artifactFile.sections.map((section) => ({
      type: section.type,
      encoding: section.encoding,
      label: section.label,
      elementCount: section.elementCount,
      elementByteLength: section.elementByteLength,
      byteOffset: section.byteOffset,
      byteLength: section.byteLength,
      flags: section.flags,
    })),
  };
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}
