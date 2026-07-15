import {
  BINARY_ARTIFACT_FORMAT_VERSION,
  BINARY_ARTIFACT_MAGIC,
  BINARY_DIGEST_BYTES,
  BINARY_DIGEST_ENTRY_BYTES,
  BINARY_FILE_KIND_TABLE_BYTES,
  BINARY_HEADER_BYTES,
  BINARY_SOURCE_PACKAGE_VERSION_BYTES,
  BINARY_SECTION_ENTRY_BYTES,
  BINARY_SECTION_LABEL_BYTES,
  BINARY_VERSION_TABLE_BYTES,
  BinaryDigestEntryType,
  BinarySectionEncoding,
  type BinaryArtifactFileInput,
  type BinaryArtifactFileView,
  type BinaryDigestEntryView,
  type BinaryDigestInput,
  type BinarySectionInput,
  type BinarySectionView,
  expectedElementByteLength,
  isRuntimeReadyEncoding,
} from "./binary-format.js";

const NO_SECTION_INDEX = 0xffff;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export async function createBinaryArtifactFile(input: BinaryArtifactFileInput): Promise<Uint8Array> {
  const { kind, sourcePackageVersion, sections } = input;

  validateSourcePackageVersion(sourcePackageVersion);
  validateSectionInputs(sections);
  validateDigestInputs(input.digests ?? [], sections.length);

  const fileKindTableOffset = BINARY_HEADER_BYTES;
  const versionTableOffset = fileKindTableOffset + BINARY_FILE_KIND_TABLE_BYTES;
  const digestEntries = await createDigestEntries(sections, input.digests ?? []);
  const digestTableOffset = versionTableOffset + BINARY_VERSION_TABLE_BYTES;
  const digestTableLength = digestEntries.length * BINARY_DIGEST_ENTRY_BYTES;
  const sectionTableLength = sections.length * BINARY_SECTION_ENTRY_BYTES;
  const sectionTableOffset = align8(digestTableOffset + digestTableLength);
  const dataOffset = align8(sectionTableOffset + sectionTableLength);
  const sectionOffsets = computeSectionOffsets(sections, dataOffset);
  const byteLength = align8(
    sections.reduce((max, section, index) => {
      return Math.max(max, sectionOffsets[index] + section.data.byteLength);
    }, dataOffset),
  );
  const output = new Uint8Array(byteLength);
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);

  writeFixedAscii(output, 0, BINARY_ARTIFACT_MAGIC, 8);
  view.setUint16(8, BINARY_ARTIFACT_FORMAT_VERSION, true);
  view.setUint16(14, 0, true);
  view.setUint32(12, byteLength, true);
  view.setUint32(16, fileKindTableOffset, true);
  view.setUint32(20, BINARY_FILE_KIND_TABLE_BYTES, true);
  view.setUint32(24, versionTableOffset, true);
  view.setUint32(28, BINARY_VERSION_TABLE_BYTES, true);
  view.setUint32(32, digestTableOffset, true);
  view.setUint32(36, digestTableLength, true);
  view.setUint32(40, sectionTableOffset, true);
  view.setUint32(44, sectionTableLength, true);
  view.setUint32(48, dataOffset, true);
  view.setUint16(52, sections.length, true);
  view.setUint16(54, digestEntries.length, true);
  view.setUint32(56, 0, true);
  view.setUint32(60, 0, true);

  view.setUint16(fileKindTableOffset, kind, true);
  view.setUint16(fileKindTableOffset + 2, 0, true);
  view.setUint32(fileKindTableOffset + 4, 0, true);

  writeVersionTable(output, versionTableOffset, sourcePackageVersion);

  for (let index = 0; index < digestEntries.length; index += 1) {
    const entry = digestEntries[index];
    const entryOffset = digestTableOffset + index * BINARY_DIGEST_ENTRY_BYTES;

    view.setUint16(entryOffset, entry.type, true);
    view.setUint16(entryOffset + 2, entry.sectionIndex ?? NO_SECTION_INDEX, true);
    view.setUint32(entryOffset + 4, 0, true);
    output.set(entry.digest, entryOffset + 8);
  }

  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    const entryOffset = sectionTableOffset + index * BINARY_SECTION_ENTRY_BYTES;

    view.setUint16(entryOffset, section.type, true);
    view.setUint16(entryOffset + 2, section.encoding, true);
    view.setUint32(entryOffset + 4, section.flags ?? 0, true);
    view.setUint32(entryOffset + 8, sectionOffsets[index], true);
    view.setUint32(entryOffset + 12, section.data.byteLength, true);
    view.setUint32(entryOffset + 16, section.elementCount, true);
    view.setUint16(entryOffset + 20, section.elementByteLength, true);
    view.setUint16(entryOffset + 22, 0, true);
    writeFixedAscii(output, entryOffset + 56, section.label, BINARY_SECTION_LABEL_BYTES);
    output.set(section.data, sectionOffsets[index]);
  }

  const selfDigest = await sha256(bytesWithSelfDigestsZeroed(output, digestTableOffset, digestEntries.length));
  for (let index = 0; index < digestEntries.length; index += 1) {
    if (digestEntries[index].type === BinaryDigestEntryType.SelfDigest) {
      output.set(selfDigest, digestTableOffset + index * BINARY_DIGEST_ENTRY_BYTES + 8);
    }
  }

  return output;
}

export async function decodeBinaryArtifactFile(bytes: Uint8Array): Promise<BinaryArtifactFileView> {
  const input = normalizeBytes(bytes);
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);

  if (input.byteLength < BINARY_HEADER_BYTES) {
    throw new Error("Binary artifact is shorter than the fixed header.");
  }

  const formatVersion = view.getUint16(8, true);
  const fileKindTableOffset = view.getUint32(16, true);
  const versionTableOffset = view.getUint32(24, true);
  const versionTableLength = view.getUint32(28, true);
  const digestTableOffset = view.getUint32(32, true);
  const sectionTableOffset = view.getUint32(40, true);
  const sectionCount = view.getUint16(52, true);
  const digestEntryCount = view.getUint16(54, true);

  const kind = readUint16(input, fileKindTableOffset, "binary artifact file-kind table");
  const sourcePackageVersion = readVersionTable(input, versionTableOffset, versionTableLength);
  const digests = readDigestTable(input, digestTableOffset, digestEntryCount);

  const sections: BinarySectionView[] = [];

  for (let index = 0; index < sectionCount; index += 1) {
    const entryOffset = sectionTableOffset + index * BINARY_SECTION_ENTRY_BYTES;
    assertByteRange(input.byteLength, entryOffset, BINARY_SECTION_ENTRY_BYTES, `binary artifact section table entry ${index}`);
    const type = view.getUint16(entryOffset, true);
    const encoding = view.getUint16(entryOffset + 2, true) as BinarySectionEncoding;
    const flags = view.getUint32(entryOffset + 4, true);
    const byteOffset = view.getUint32(entryOffset + 8, true);
    const byteLength = view.getUint32(entryOffset + 12, true);
    const elementCount = view.getUint32(entryOffset + 16, true);
    const elementByteLength = view.getUint16(entryOffset + 20, true);
    const label = readFixedAscii(input, entryOffset + 56, BINARY_SECTION_LABEL_BYTES);
    const digest = findSectionDigest(digests, index);

    assertByteRange(input.byteLength, byteOffset, byteLength, `binary artifact section '${label}'`);
    const data = input.subarray(byteOffset, byteOffset + byteLength);

    sections.push({
      type,
      encoding,
      label,
      elementCount,
      elementByteLength,
      byteOffset,
      byteLength,
      flags,
      digest,
      data,
    });
  }

  return {
    kind,
    formatVersion,
    sourcePackageVersion,
    byteLength: input.byteLength,
    digests,
    sections,
  };
}

async function createDigestEntries(
  sections: readonly BinarySectionInput[],
  inputDigests: readonly BinaryDigestInput[],
): Promise<BinaryDigestEntryView[]> {
  const entries: BinaryDigestEntryView[] = [
    {
      type: BinaryDigestEntryType.SelfDigest,
      digest: new Uint8Array(BINARY_DIGEST_BYTES),
    },
  ];

  for (let index = 0; index < sections.length; index += 1) {
    entries.push({
      type: BinaryDigestEntryType.SectionDigest,
      sectionIndex: index,
      digest: await sha256(sections[index].data),
    });
  }

  for (const entry of inputDigests) {
    entries.push({
      type: entry.type,
      sectionIndex: entry.sectionIndex,
      digest: normalizeDigest(entry.digest, `Digest entry ${entry.type}`),
    });
  }

  return entries;
}

function validateDigestInputs(digests: readonly BinaryDigestInput[], sectionCount: number): void {
  for (const entry of digests) {
    if (entry.type === BinaryDigestEntryType.SelfDigest || entry.type === BinaryDigestEntryType.SectionDigest) {
      throw new Error("Self and section digests are generated by the binary artifact writer.");
    }

    normalizeDigest(entry.digest, `Digest entry ${entry.type}`);

    if (entry.sectionIndex !== undefined && (entry.sectionIndex < 0 || entry.sectionIndex >= sectionCount)) {
      throw new Error(`Digest entry ${entry.type} references an invalid section index.`);
    }
  }
}

function normalizeDigest(digest: Uint8Array, label: string): Uint8Array {
  if (digest.byteLength !== BINARY_DIGEST_BYTES) {
    throw new Error(`${label} must be a ${BINARY_DIGEST_BYTES}-byte SHA-256 digest.`);
  }

  return digest.byteOffset === 0 && digest.byteLength === digest.buffer.byteLength ? digest : digest.slice();
}

function validateSectionInputs(sections: readonly BinarySectionInput[]): void {
  if (sections.length > 0xffff) {
    throw new Error("Binary artifact cannot contain more than 65535 sections.");
  }

  for (const section of sections) {
    if (!isRuntimeReadyEncoding(section.encoding) && section.encoding !== BinarySectionEncoding.Bytes) {
      throw new Error(`Unsupported binary section encoding: ${section.encoding}.`);
    }

    validateLabel(section.label);

    const expected = expectedElementByteLength(section.encoding);
    if (expected !== undefined && section.elementByteLength !== expected) {
      throw new Error(`Section '${section.label}' element width must be ${expected} bytes.`);
    }

    if (section.elementCount * section.elementByteLength !== section.data.byteLength) {
      throw new Error(`Section '${section.label}' byte length does not match its element count.`);
    }
  }
}

function validateSourcePackageVersion(sourcePackageVersion: string): void {
  if (sourcePackageVersion.trim() !== sourcePackageVersion || sourcePackageVersion === "") {
    throw new Error("Binary artifact sourcePackageVersion must be a non-empty trimmed string.");
  }

  if (textEncoder.encode(sourcePackageVersion).byteLength > BINARY_SOURCE_PACKAGE_VERSION_BYTES) {
    throw new Error(
      `Binary artifact sourcePackageVersion must fit in ${BINARY_SOURCE_PACKAGE_VERSION_BYTES} UTF-8 bytes.`,
    );
  }
}

function writeVersionTable(output: Uint8Array, offset: number, sourcePackageVersion: string): void {
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
  const encoded = textEncoder.encode(sourcePackageVersion);

  view.setUint16(offset, BINARY_ARTIFACT_FORMAT_VERSION, true);
  view.setUint16(offset + 2, encoded.byteLength, true);
  view.setUint32(offset + 4, 0, true);
  output.set(encoded, offset + 8);
}

function readVersionTable(input: Uint8Array, offset: number, length: number): string {
  assertByteRange(input.byteLength, offset, length, "binary artifact version table");
  if (length < 8) {
    throw new Error("Binary artifact version table is too short to read.");
  }

  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const sourcePackageVersionLength = view.getUint16(offset + 2, true);
  assertByteRange(length, 8, sourcePackageVersionLength, "binary artifact sourcePackageVersion");

  return textDecoder.decode(input.subarray(offset + 8, offset + 8 + sourcePackageVersionLength));
}

function readDigestTable(input: Uint8Array, offset: number, count: number): BinaryDigestEntryView[] {
  assertByteRange(input.byteLength, offset, count * BINARY_DIGEST_ENTRY_BYTES, "binary artifact digest table");
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const digests: BinaryDigestEntryView[] = [];

  for (let index = 0; index < count; index += 1) {
    const entryOffset = offset + index * BINARY_DIGEST_ENTRY_BYTES;
    const type = view.getUint16(entryOffset, true) as BinaryDigestEntryType;
    const rawSectionIndex = view.getUint16(entryOffset + 2, true);
    const sectionIndex = rawSectionIndex === NO_SECTION_INDEX ? undefined : rawSectionIndex;
    const digest = input.slice(entryOffset + 8, entryOffset + 8 + BINARY_DIGEST_BYTES);

    digests.push({ type, sectionIndex, digest });
  }

  return digests;
}

function findSectionDigest(digests: readonly BinaryDigestEntryView[], sectionIndex: number): Uint8Array {
  return (
    digests.find((entry) => entry.type === BinaryDigestEntryType.SectionDigest && entry.sectionIndex === sectionIndex)
      ?.digest ?? new Uint8Array(0)
  );
}

function computeSectionOffsets(sections: readonly BinarySectionInput[], startOffset: number): number[] {
  const offsets: number[] = [];
  let offset = startOffset;

  for (const section of sections) {
    offset = align8(offset);
    offsets.push(offset);
    offset += section.data.byteLength;
  }

  return offsets;
}

function validateLabel(label: string): void {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(label)) {
    throw new Error(`Invalid binary section label: ${label}.`);
  }

  if (textEncoder.encode(label).byteLength > BINARY_SECTION_LABEL_BYTES) {
    throw new Error(`Binary section label is longer than ${BINARY_SECTION_LABEL_BYTES} bytes: ${label}.`);
  }
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  if (globalThis.crypto?.subtle === undefined) {
    throw new Error("SHA-256 digest support is required for binary artifact validation.");
  }

  const digestInput = data.slice().buffer as ArrayBuffer;
  return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", digestInput));
}

function writeFixedAscii(output: Uint8Array, offset: number, value: string, byteLength: number): void {
  const encoded = textEncoder.encode(value);
  if (encoded.byteLength > byteLength) {
    throw new Error(`ASCII field '${value}' does not fit in ${byteLength} bytes.`);
  }

  output.set(encoded, offset);
}

function readFixedAscii(input: Uint8Array, offset: number, byteLength: number): string {
  const end = input.indexOf(0, offset);
  const actualEnd = end === -1 || end > offset + byteLength ? offset + byteLength : end;
  return textDecoder.decode(input.subarray(offset, actualEnd));
}

function normalizeBytes(bytes: Uint8Array): Uint8Array {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes;
  }

  return bytes.slice();
}

function bytesWithSelfDigestsZeroed(input: Uint8Array, digestTableOffset: number, digestEntryCount: number): Uint8Array {
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

function readUint16(input: Uint8Array, offset: number, label: string): number {
  assertByteRange(input.byteLength, offset, 2, label);
  return new DataView(input.buffer, input.byteOffset, input.byteLength).getUint16(offset, true);
}

function assertByteRange(byteLength: number, offset: number, length: number, label: string): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset > byteLength) {
    throw new Error(`${label} points outside the binary artifact input.`);
  }

  if (length > byteLength - offset) {
    throw new Error(`${label} extends outside the binary artifact input.`);
  }
}

function align8(value: number): number {
  return (value + 7) & ~7;
}
