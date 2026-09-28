import type { BinaryArtifactFileView } from "../../artifacts/binary/binary-format.js";
import {
  computeBinarySelfDigest,
} from "../../artifacts/binary/binary-table-utils.js";

export async function validateSelfDigest(bytes: Uint8Array, artifactFile: BinaryArtifactFileView): Promise<void> {
  const digestTableOffset = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(32, true);
  const actualSelfDigest = await computeBinarySelfDigest(bytes, digestTableOffset);
  if (
    artifactFile.selfDigest.byteLength !== actualSelfDigest.byteLength
    || !artifactFile.selfDigest.every((value, index) => value === actualSelfDigest[index])
  ) {
    throw new Error("Binary artifact self digest mismatch.");
  }
}
