import type { BinaryArtifactFileView } from "../../artifacts/binary/binary-format.js";
import {
  computeBinarySelfDigest,
} from "../../artifacts/binary/binary-table-utils.js";

export async function validateSelfDigest(bytes: Uint8Array, artifactFile: BinaryArtifactFileView): Promise<void> {
  const digestTableOffset = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(32, true);
  const actualSelfDigest = await computeBinarySelfDigest(bytes, digestTableOffset);
  if (!bytesEqual(artifactFile.selfDigest, actualSelfDigest)) {
    throw new Error("Binary artifact self digest mismatch.");
  }
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    diff |= left[index] ^ right[index];
  }

  return diff === 0;
}
