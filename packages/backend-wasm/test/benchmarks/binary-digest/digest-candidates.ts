import { sha256 as nobleSha256 } from "@noble/hashes/sha2";

import {
  BINARY_DIGEST_BYTES,
  BINARY_DIGEST_ENTRY_BYTES,
  BinaryDigestEntryType,
} from "../../../src/artifacts/binary/binary-format.js";

const ZERO_DIGEST = new Uint8Array(BINARY_DIGEST_BYTES);

export function createSelfDigestSegments(
  input: Uint8Array,
  digestTableOffset: number,
  digestEntryCount: number,
): readonly Uint8Array[] {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const segments: Uint8Array[] = [];
  let cursor = 0;

  for (let index = 0; index < digestEntryCount; index += 1) {
    const entryOffset = digestTableOffset + index * BINARY_DIGEST_ENTRY_BYTES;
    if (view.getUint16(entryOffset, true) !== BinaryDigestEntryType.SelfDigest) {
      continue;
    }

    const digestOffset = entryOffset + 8;
    const zeroStart = Math.min(input.byteLength, digestOffset);
    const zeroEnd = Math.min(input.byteLength, digestOffset + BINARY_DIGEST_BYTES);
    segments.push(
      input.subarray(cursor, zeroStart),
      ZERO_DIGEST.subarray(0, zeroEnd - zeroStart),
    );
    cursor = zeroEnd;
  }

  segments.push(input.subarray(cursor));
  return segments;
}

export function sha256Incremental(chunks: readonly Uint8Array[]): Uint8Array {
  const hash = nobleSha256.create();
  for (const chunk of chunks) {
    hash.update(chunk);
  }
  return hash.digest();
}

export function sha256WithSegmentedSelfDigests(
  input: Uint8Array,
  digestTableOffset: number,
  digestEntryCount: number,
): Uint8Array {
  return sha256Incremental(
    createSelfDigestSegments(input, digestTableOffset, digestEntryCount),
  );
}
