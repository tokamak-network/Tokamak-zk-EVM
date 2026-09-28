import { align8, readFixedAscii } from './binary-table-utils.js';
import { decodeBinaryArtifactFile } from './binary-artifact-file.js';
import {
  BINARY_ARTIFACT_FORMAT_VERSION,
  BINARY_ARTIFACT_MAGIC,
  BINARY_DIGEST_ENTRY_BYTES,
  BINARY_FILE_KIND_TABLE_BYTES,
  BINARY_HEADER_BYTES,
  BINARY_SECTION_ENTRY_BYTES,
  BINARY_SECTION_LABEL_BYTES,
  BINARY_VERSION_TABLE_BYTES,
  expectedElementByteLength,
  type BinaryArtifactFileView,
} from './binary-format.js';
import type { RuntimeArtifactFormatSpec, RuntimeArtifactSectionSpec } from '../specs/types.js';

/**
 * Decodes the binary artifact container after enforcing its policy-free structural
 * invariants. This deliberately does not verify source-version policy, a self
 * digest, or CRS provenance.
 */
export function decodeStructurallyValidBinaryArtifact(bytes: Uint8Array): BinaryArtifactFileView {
  assertBinaryArtifactContainerLayout(bytes);
  return decodeBinaryArtifactFile(bytes);
}

/** Enforces one producer-owned artifact shape against a decoded container. */
export function assertBinaryArtifactShape(artifact: BinaryArtifactFileView, spec: RuntimeArtifactFormatSpec): void {
  for (const sectionSpec of spec.sections) {
    const matches = artifact.sections.filter(
      section =>
        section.type === sectionSpec.type &&
        section.encoding === sectionSpec.encoding &&
        section.label === sectionSpec.label,
    );
    if (matches.length === 0) {
      throw new Error(`${spec.name} is missing required section '${sectionSpec.label}'.`);
    }
    if (matches.length !== 1) {
      throw new Error(`Binary artifact '${spec.name}' must contain exactly one '${sectionSpec.label}' section.`);
    }
    assertSectionShape(matches[0], sectionSpec, spec.name);
  }
  if (artifact.sections.length !== spec.sections.length) {
    throw new Error(`Binary artifact '${spec.name}' section count mismatch.`);
  }
}

function assertBinaryArtifactContainerLayout(bytes: Uint8Array): void {
  if (bytes.byteLength < BINARY_HEADER_BYTES) {
    throw new Error('Binary artifact is shorter than the fixed header.');
  }
  if (readFixedAscii(bytes, 0, 8) !== BINARY_ARTIFACT_MAGIC) {
    throw new Error('Binary artifact magic mismatch.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(8, true) !== BINARY_ARTIFACT_FORMAT_VERSION) {
    throw new Error('Unsupported binary artifact format version.');
  }
  if (view.getUint16(10, true) !== 0 || view.getUint32(56, true) !== 0 || view.getUint32(60, true) !== 0) {
    throw new Error('Binary artifact contains unsupported reserved header fields.');
  }
  if (view.getUint32(12, true) !== bytes.byteLength) {
    throw new Error('Binary artifact declared byte length does not match the input.');
  }

  const sectionCount = view.getUint16(52, true);
  const sectionTableOffset = align8(
    BINARY_HEADER_BYTES + BINARY_FILE_KIND_TABLE_BYTES + BINARY_VERSION_TABLE_BYTES + BINARY_DIGEST_ENTRY_BYTES,
  );
  const sectionTableLength = sectionCount * BINARY_SECTION_ENTRY_BYTES;
  const dataOffset = align8(sectionTableOffset + sectionTableLength);
  assertTable(
    view.getUint32(16, true),
    view.getUint32(20, true),
    BINARY_HEADER_BYTES,
    BINARY_FILE_KIND_TABLE_BYTES,
    'file-kind',
  );
  assertTable(
    view.getUint32(24, true),
    view.getUint32(28, true),
    BINARY_HEADER_BYTES + BINARY_FILE_KIND_TABLE_BYTES,
    BINARY_VERSION_TABLE_BYTES,
    'version',
  );
  assertTable(
    view.getUint32(32, true),
    view.getUint32(36, true),
    BINARY_HEADER_BYTES + BINARY_FILE_KIND_TABLE_BYTES + BINARY_VERSION_TABLE_BYTES,
    BINARY_DIGEST_ENTRY_BYTES,
    'digest',
  );
  assertTable(view.getUint32(40, true), view.getUint32(44, true), sectionTableOffset, sectionTableLength, 'section');
  if (view.getUint32(48, true) !== dataOffset) {
    throw new Error('Binary artifact data offset does not match its table layout.');
  }

  const ranges: { readonly start: number; readonly end: number; readonly label: string }[] = [];
  for (let index = 0; index < sectionCount; index += 1) {
    const entryOffset = sectionTableOffset + index * BINARY_SECTION_ENTRY_BYTES;
    const offset = view.getUint32(entryOffset + 8, true);
    const byteLength = view.getUint32(entryOffset + 12, true);
    const label = readFixedAscii(bytes, entryOffset + 56, BINARY_SECTION_LABEL_BYTES);
    if (offset < dataOffset || offset + byteLength > bytes.byteLength) {
      throw new Error(`Binary artifact section '${label}' is outside the data region.`);
    }
    ranges.push({ start: offset, end: offset + byteLength, label });
  }
  ranges.sort((left, right) => left.start - right.start);
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index - 1].end > ranges[index].start) {
      throw new Error(`Binary artifact sections '${ranges[index - 1].label}' and '${ranges[index].label}' overlap.`);
    }
  }
}

function assertTable(actualOffset: number, actualLength: number, offset: number, length: number, label: string): void {
  if (actualOffset !== offset || actualLength !== length) {
    throw new Error(`Binary artifact ${label} table layout mismatch.`);
  }
}

function assertSectionShape(
  section: BinaryArtifactFileView['sections'][number],
  spec: RuntimeArtifactSectionSpec,
  artifactName: string,
): void {
  const intrinsicByteLength = expectedElementByteLength(section.encoding);
  const expectedByteLength = spec.elementByteLength ?? intrinsicByteLength;
  if (expectedByteLength !== undefined && section.elementByteLength !== expectedByteLength) {
    throw new Error(`Binary artifact '${artifactName}' section '${spec.label}' element width mismatch.`);
  }
  if (spec.elementCount !== null && section.elementCount !== spec.elementCount) {
    throw new Error(`Binary artifact '${artifactName}' section '${spec.label}' element count mismatch.`);
  }
  if (section.elementCount * section.elementByteLength !== section.byteLength) {
    throw new Error(`Binary artifact '${artifactName}' section '${spec.label}' byte length mismatch.`);
  }
}
