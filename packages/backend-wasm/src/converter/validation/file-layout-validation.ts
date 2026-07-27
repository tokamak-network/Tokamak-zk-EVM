import {
  BINARY_ARTIFACT_FORMAT_VERSION,
  BINARY_ARTIFACT_MAGIC,
  BINARY_DIGEST_ENTRY_BYTES,
  BINARY_FILE_KIND_TABLE_BYTES,
  BINARY_HEADER_BYTES,
  BINARY_SECTION_ENTRY_BYTES,
  BINARY_VERSION_TABLE_BYTES,
} from "../../artifacts/binary/binary-format.js";
import { align8, readFixedAscii } from "../../artifacts/binary/binary-table-utils.js";

export function validateBinaryHeaderAndTables(bytes: Uint8Array): void {
  if (bytes.byteLength < BINARY_HEADER_BYTES) {
    throw new Error("Binary artifact is shorter than the fixed header.");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = readFixedAscii(bytes, 0, 8);
  if (magic !== BINARY_ARTIFACT_MAGIC) {
    throw new Error(`Invalid binary artifact magic: ${magic}.`);
  }

  const formatVersion = view.getUint16(8, true);
  if (formatVersion !== BINARY_ARTIFACT_FORMAT_VERSION) {
    throw new Error(`Unsupported binary artifact format version: ${formatVersion}.`);
  }

  const declaredByteLength = view.getUint32(12, true);
  if (declaredByteLength !== bytes.byteLength) {
    throw new Error("Binary artifact declared byte length does not match the input length.");
  }

  const fileKindTableOffset = view.getUint32(16, true);
  const fileKindTableLength = view.getUint32(20, true);
  const versionTableOffset = view.getUint32(24, true);
  const versionTableLength = view.getUint32(28, true);
  const digestTableOffset = view.getUint32(32, true);
  const digestTableLength = view.getUint32(36, true);
  const sectionTableOffset = view.getUint32(40, true);
  const sectionTableLength = view.getUint32(44, true);
  const dataOffset = view.getUint32(48, true);
  const sectionCount = view.getUint16(52, true);
  const digestEntryCount = view.getUint16(54, true);

  if (fileKindTableOffset !== BINARY_HEADER_BYTES || fileKindTableLength !== BINARY_FILE_KIND_TABLE_BYTES) {
    throw new Error("Binary artifact file-kind table bounds are invalid.");
  }

  if (
    versionTableOffset !== fileKindTableOffset + fileKindTableLength ||
    versionTableLength !== BINARY_VERSION_TABLE_BYTES
  ) {
    throw new Error("Binary artifact version table bounds are invalid.");
  }

  if (
    digestTableOffset !== versionTableOffset + versionTableLength ||
    digestEntryCount !== 1 ||
    digestTableLength !== BINARY_DIGEST_ENTRY_BYTES
  ) {
    throw new Error("Binary artifact must contain exactly one self digest entry.");
  }

  if (
    sectionTableOffset !== align8(digestTableOffset + digestTableLength) ||
    sectionTableLength !== sectionCount * BINARY_SECTION_ENTRY_BYTES
  ) {
    throw new Error("Binary artifact section table bounds are invalid.");
  }

  if (dataOffset < sectionTableOffset + sectionTableLength || dataOffset > bytes.byteLength) {
    throw new Error("Binary artifact data offset is outside the valid range.");
  }
}
