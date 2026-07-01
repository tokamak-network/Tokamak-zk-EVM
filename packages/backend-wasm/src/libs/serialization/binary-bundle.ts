import {
  BINARY_ARTIFACT_MAGIC,
  BINARY_ARTIFACT_SCHEMA_VERSION,
  BINARY_HEADER_BYTES,
  BINARY_SECTION_ENTRY_BYTES,
  BINARY_SECTION_LABEL_BYTES,
  BinaryBundleKind,
  BinarySectionEncoding,
  type BinaryBundleView,
  type BinarySectionInput,
  type BinarySectionView,
  FFJAVASCRIPT_VERSION,
  WASMCURVES_VERSION,
  expectedElementByteLength,
  isRuntimeReadyEncoding,
} from "./binary-format.js";

const DIGEST_BYTES = 32;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export async function createBinaryBundle(
  kind: BinaryBundleKind,
  sections: readonly BinarySectionInput[],
): Promise<Uint8Array> {
  validateSectionInputs(sections);

  const sectionTableLength = sections.length * BINARY_SECTION_ENTRY_BYTES;
  const dataOffset = align8(BINARY_HEADER_BYTES + sectionTableLength);
  const sectionOffsets = computeSectionOffsets(sections, dataOffset);
  const byteLength = align8(
    sections.reduce((max, section, index) => {
      return Math.max(max, sectionOffsets[index] + section.data.byteLength);
    }, dataOffset),
  );
  const output = new Uint8Array(byteLength);
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);

  writeFixedAscii(output, 0, BINARY_ARTIFACT_MAGIC, 8);
  view.setUint16(8, BINARY_ARTIFACT_SCHEMA_VERSION, true);
  view.setUint16(10, kind, true);
  view.setUint16(12, sections.length, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, BINARY_HEADER_BYTES, true);
  view.setUint32(20, sectionTableLength, true);
  view.setUint32(24, dataOffset, true);
  view.setUint32(28, byteLength, true);
  writeVersionTriplet(output, 32, FFJAVASCRIPT_VERSION);
  writeVersionTriplet(output, 35, WASMCURVES_VERSION);

  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    const entryOffset = BINARY_HEADER_BYTES + index * BINARY_SECTION_ENTRY_BYTES;
    const digest = await sha256(section.data);

    view.setUint16(entryOffset, section.type, true);
    view.setUint16(entryOffset + 2, section.encoding, true);
    view.setUint32(entryOffset + 4, section.flags ?? 0, true);
    view.setUint32(entryOffset + 8, sectionOffsets[index], true);
    view.setUint32(entryOffset + 12, section.data.byteLength, true);
    view.setUint32(entryOffset + 16, section.elementCount, true);
    view.setUint16(entryOffset + 20, section.elementByteLength, true);
    view.setUint16(entryOffset + 22, 0, true);
    output.set(digest, entryOffset + 24);
    writeFixedAscii(output, entryOffset + 56, section.label, BINARY_SECTION_LABEL_BYTES);
    output.set(section.data, sectionOffsets[index]);
  }

  return output;
}

export async function decodeBinaryBundle(bytes: Uint8Array): Promise<BinaryBundleView> {
  const input = normalizeBytes(bytes);
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);

  if (input.byteLength < BINARY_HEADER_BYTES) {
    throw new Error("Binary artifact is shorter than the fixed header.");
  }

  const magic = readFixedAscii(input, 0, 8);
  if (magic !== BINARY_ARTIFACT_MAGIC) {
    throw new Error(`Invalid binary artifact magic: ${magic}.`);
  }

  const schemaVersion = view.getUint16(8, true);
  if (schemaVersion !== BINARY_ARTIFACT_SCHEMA_VERSION) {
    throw new Error(`Unsupported binary artifact schema version: ${schemaVersion}.`);
  }

  const kind = view.getUint16(10, true) as BinaryBundleKind;
  const sectionCount = view.getUint16(12, true);
  const sectionTableOffset = view.getUint32(16, true);
  const sectionTableLength = view.getUint32(20, true);
  const dataOffset = view.getUint32(24, true);
  const declaredByteLength = view.getUint32(28, true);
  const ffjavascriptVersion = readVersionTriplet(input, 32);
  const wasmcurvesVersion = readVersionTriplet(input, 35);

  if (ffjavascriptVersion !== FFJAVASCRIPT_VERSION || wasmcurvesVersion !== WASMCURVES_VERSION) {
    throw new Error(
      `Unsupported runtime engine versions: ffjavascript ${ffjavascriptVersion}, wasmcurves ${wasmcurvesVersion}.`,
    );
  }

  if (declaredByteLength !== input.byteLength) {
    throw new Error("Binary artifact declared byte length does not match the input length.");
  }

  if (sectionTableOffset !== BINARY_HEADER_BYTES) {
    throw new Error("Binary artifact section table offset is invalid.");
  }

  if (sectionTableLength !== sectionCount * BINARY_SECTION_ENTRY_BYTES) {
    throw new Error("Binary artifact section table length does not match the section count.");
  }

  if (dataOffset < sectionTableOffset + sectionTableLength || dataOffset > input.byteLength) {
    throw new Error("Binary artifact data offset is outside the valid range.");
  }

  const sections: BinarySectionView[] = [];

  for (let index = 0; index < sectionCount; index += 1) {
    const entryOffset = sectionTableOffset + index * BINARY_SECTION_ENTRY_BYTES;
    const type = view.getUint16(entryOffset, true);
    const encoding = view.getUint16(entryOffset + 2, true) as BinarySectionEncoding;
    const flags = view.getUint32(entryOffset + 4, true);
    const byteOffset = view.getUint32(entryOffset + 8, true);
    const byteLength = view.getUint32(entryOffset + 12, true);
    const elementCount = view.getUint32(entryOffset + 16, true);
    const elementByteLength = view.getUint16(entryOffset + 20, true);
    const digest = input.slice(entryOffset + 24, entryOffset + 24 + DIGEST_BYTES);
    const label = readFixedAscii(input, entryOffset + 56, BINARY_SECTION_LABEL_BYTES);

    validateSectionLayout({
      encoding,
      elementByteLength,
      elementCount,
      byteLength,
      byteOffset,
      bundleByteLength: input.byteLength,
    });

    const data = input.subarray(byteOffset, byteOffset + byteLength);
    const actualDigest = await sha256(data);
    if (!bytesEqual(digest, actualDigest)) {
      throw new Error(`Binary artifact section '${label}' digest mismatch.`);
    }

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

  assertNoSectionOverlap(sections);

  return {
    kind,
    schemaVersion,
    ffjavascriptVersion: FFJAVASCRIPT_VERSION,
    wasmcurvesVersion: WASMCURVES_VERSION,
    byteLength: input.byteLength,
    sections,
  };
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

function validateSectionLayout(section: {
  readonly encoding: BinarySectionEncoding;
  readonly elementByteLength: number;
  readonly elementCount: number;
  readonly byteLength: number;
  readonly byteOffset: number;
  readonly bundleByteLength: number;
}): void {
  const expected = expectedElementByteLength(section.encoding);
  if (expected !== undefined && section.elementByteLength !== expected) {
    throw new Error("Binary artifact section element width does not match its encoding.");
  }

  if (section.elementCount * section.elementByteLength !== section.byteLength) {
    throw new Error("Binary artifact section byte length does not match its element count.");
  }

  if (section.byteOffset + section.byteLength > section.bundleByteLength) {
    throw new Error("Binary artifact section points outside the bundle.");
  }
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

function assertNoSectionOverlap(sections: readonly BinarySectionView[]): void {
  const sorted = [...sections].sort((left, right) => left.byteOffset - right.byteOffset);

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];

    if (previous.byteOffset + previous.byteLength > current.byteOffset) {
      throw new Error(`Binary artifact sections '${previous.label}' and '${current.label}' overlap.`);
    }
  }
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

function writeVersionTriplet(output: Uint8Array, offset: number, version: string): void {
  const parts = parseVersionTriplet(version);
  output.set(parts, offset);
}

function readVersionTriplet(input: Uint8Array, offset: number): typeof FFJAVASCRIPT_VERSION | typeof WASMCURVES_VERSION {
  return `${input[offset]}.${input[offset + 1]}.${input[offset + 2]}` as
    | typeof FFJAVASCRIPT_VERSION
    | typeof WASMCURVES_VERSION;
}

function parseVersionTriplet(version: string): Uint8Array {
  const parts = version.split(".").map((part) => Number.parseInt(part, 10));

  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    throw new Error(`Invalid runtime engine version: ${version}.`);
  }

  return new Uint8Array(parts);
}

function normalizeBytes(bytes: Uint8Array): Uint8Array {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes;
  }

  return bytes.slice();
}

function align8(value: number): number {
  return (value + 7) & ~7;
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
