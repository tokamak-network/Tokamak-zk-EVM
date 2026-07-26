import {
  BINARY_DIGEST_BYTES,
  BINARY_DIGEST_ENTRY_BYTES,
  BINARY_SOURCE_PACKAGE_VERSION_BYTES,
  BinaryDigestEntryType,
} from "./binary-format.js";

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export function align8(value: number): number {
  return (value + 7) & ~7;
}

export function readFixedAscii(input: Uint8Array, offset: number, byteLength: number): string {
  const end = input.indexOf(0, offset);
  const actualEnd = end === -1 || end > offset + byteLength ? offset + byteLength : end;
  return textDecoder.decode(input.subarray(offset, actualEnd));
}

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  if (globalThis.crypto?.subtle === undefined) {
    throw new Error("SHA-256 digest support is required for binary artifact validation.");
  }

  const digestInput = data.slice().buffer as ArrayBuffer;
  return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", digestInput));
}

export function bytesWithSelfDigestsZeroed(
  input: Uint8Array,
  digestTableOffset: number,
  digestEntryCount: number,
): Uint8Array {
  const copy = input.slice();
  const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);

  for (let index = 0; index < digestEntryCount; index += 1) {
    const entryOffset = digestTableOffset + index * BINARY_DIGEST_ENTRY_BYTES;
    if (view.getUint16(entryOffset, true) === BinaryDigestEntryType.SelfDigest) {
      copy.fill(0, entryOffset + 8, entryOffset + 8 + BINARY_DIGEST_BYTES);
    }
  }

  return copy;
}

export function validateSourcePackageVersion(sourcePackageVersion: string): void {
  if (sourcePackageVersion.trim() !== sourcePackageVersion || sourcePackageVersion === "") {
    throw new Error("Binary artifact sourcePackageVersion must be a non-empty trimmed string.");
  }

  if (textEncoder.encode(sourcePackageVersion).byteLength > BINARY_SOURCE_PACKAGE_VERSION_BYTES) {
    throw new Error(
      `Binary artifact sourcePackageVersion must fit in ${BINARY_SOURCE_PACKAGE_VERSION_BYTES} UTF-8 bytes.`,
    );
  }
}
