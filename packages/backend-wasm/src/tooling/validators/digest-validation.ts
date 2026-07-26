import {
  BinaryDigestEntryType,
  type BinaryArtifactFileView,
  type BinaryDigestEntryView,
} from "../../artifacts/binary/binary-format.js";
import {
  bytesWithSelfDigestsZeroed,
  sha256,
} from "../../artifacts/binary/binary-table-utils.js";

export async function validateDigestTables(bytes: Uint8Array, artifactFile: BinaryArtifactFileView): Promise<void> {
  const digestTableOffset = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(32, true);
  const digestEntryCount = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(54, true);
  const selfDigests = artifactFile.digests.filter((entry) => entry.type === BinaryDigestEntryType.SelfDigest);

  if (selfDigests.length !== 1) {
    throw new Error("Binary artifact must contain exactly one self digest entry.");
  }

  const actualSelfDigest = await sha256(bytesWithSelfDigestsZeroed(bytes, digestTableOffset, digestEntryCount));
  if (!bytesEqual(selfDigests[0].digest, actualSelfDigest)) {
    throw new Error("Binary artifact self digest mismatch.");
  }

  for (let index = 0; index < artifactFile.sections.length; index += 1) {
    const section = artifactFile.sections[index];
    const digest = requireSectionDigest(artifactFile.digests, index, section.label);
    const actualSectionDigest = await sha256(section.data);

    if (!bytesEqual(digest, actualSectionDigest)) {
      throw new Error(`Binary artifact section '${section.label}' digest mismatch.`);
    }
  }
}

function requireSectionDigest(
  digests: readonly BinaryDigestEntryView[],
  sectionIndex: number,
  label: string,
): Uint8Array {
  const matches = digests.filter(
    (entry) => entry.type === BinaryDigestEntryType.SectionDigest && entry.sectionIndex === sectionIndex,
  );

  if (matches.length !== 1) {
    throw new Error(`Binary artifact section '${label}' must have exactly one section digest entry.`);
  }

  return matches[0].digest;
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
