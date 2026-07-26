import {
  decodeBinaryArtifactFile,
} from "../../../src/artifacts/binary/binary-artifact-file.js";
import {
  BinaryDigestEntryType,
} from "../../../src/artifacts/binary/binary-format.js";
import {
  bytesWithSelfDigestsZeroed,
  sha256,
} from "../../../src/artifacts/binary/binary-table-utils.js";
import {
  sha256Incremental,
  sha256WithSegmentedSelfDigests,
} from "./digest-candidates.js";

export type DigestPolicy = "speed-first" | "hybrid" | "memory-first";

export interface DigestPolicyResult {
  readonly sourceDigestCount: number;
  readonly sectionDigestCount: number;
  readonly selfDigestCount: number;
  readonly parity: true;
}

export async function runDigestPolicy(
  policy: DigestPolicy,
  source: Uint8Array,
  artifact: Uint8Array,
): Promise<DigestPolicyResult> {
  const artifactFile = await decodeBinaryArtifactFile(artifact);
  const digestTableOffset = readU32(artifact, 32);
  const digestEntryCount = readU16(artifact, 54);
  const sourceDigests = artifactFile.digests.filter(
    (entry) =>
      entry.type === BinaryDigestEntryType.SourceArtifactDigest
      || entry.type === BinaryDigestEntryType.CombinedSigmaDigest,
  );
  const selfDigests = artifactFile.digests.filter(
    (entry) => entry.type === BinaryDigestEntryType.SelfDigest,
  );

  const sourceDigest = policy === "memory-first"
    ? sha256Incremental([source])
    : await sha256(source);
  for (const expected of sourceDigests) {
    assertBytesEqual(sourceDigest, expected.digest, `source digest ${expected.type}`);
  }

  for (let index = 0; index < artifactFile.sections.length; index += 1) {
    const section = artifactFile.sections[index];
    const digest = policy === "memory-first"
      ? sha256Incremental([section.data])
      : await sha256(section.data);
    assertBytesEqual(digest, section.digest, `section digest ${section.label}`);
  }

  const selfDigest = policy === "speed-first"
    ? await sha256(
      bytesWithSelfDigestsZeroed(artifact, digestTableOffset, digestEntryCount),
    )
    : sha256WithSegmentedSelfDigests(
      artifact,
      digestTableOffset,
      digestEntryCount,
    );
  for (const expected of selfDigests) {
    assertBytesEqual(selfDigest, expected.digest, "self digest");
  }

  return {
    sourceDigestCount: sourceDigests.length,
    sectionDigestCount: artifactFile.sections.length,
    selfDigestCount: selfDigests.length,
    parity: true,
  };
}

export function parseDigestPolicy(value: string | undefined): DigestPolicy {
  if (value === "speed-first" || value === "hybrid" || value === "memory-first") {
    return value;
  }
  throw new Error(`Unsupported digest policy: ${value ?? "missing"}.`);
}

function readU16(input: Uint8Array, offset: number): number {
  return new DataView(input.buffer, input.byteOffset, input.byteLength)
    .getUint16(offset, true);
}

function readU32(input: Uint8Array, offset: number): number {
  return new DataView(input.buffer, input.byteOffset, input.byteLength)
    .getUint32(offset, true);
}

function assertBytesEqual(actual: Uint8Array, expected: Uint8Array, label: string): void {
  if (
    actual.byteLength !== expected.byteLength
    || actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error(`${label} mismatch.`);
  }
}
