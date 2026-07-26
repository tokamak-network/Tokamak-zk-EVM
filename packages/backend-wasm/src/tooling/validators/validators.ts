import {
  BINARY_ARTIFACT_FORMAT_VERSION,
  BINARY_ARTIFACT_MAGIC,
  BINARY_DIGEST_ENTRY_BYTES,
  BINARY_FILE_KIND_TABLE_BYTES,
  BINARY_HEADER_BYTES,
  BINARY_SECTION_ENTRY_BYTES,
  BINARY_VERSION_TABLE_BYTES,
  BinaryArtifactFileKind,
  BinaryDigestEntryType,
  type BinaryArtifactFileView,
  type BinaryDigestEntryView,
  type BinarySectionView,
  expectedElementByteLength,
} from "../../artifacts/binary/binary-format.js";
import { decodeBinaryArtifactFile } from "../../artifacts/binary/binary-artifact-file.js";
import {
  align8,
  bytesWithSelfDigestsZeroed,
  readFixedAscii,
  sha256,
  validateSourcePackageVersion,
} from "../../artifacts/binary/binary-table-utils.js";
import type { RuntimeArtifactFormatSpec, RuntimeArtifactSectionSpec } from "../../artifacts/specs/types.js";
import { PROVER_CRS_V1_SPEC } from "../../artifacts/specs/prover-crs.v1.generated.js";
import { PROVER_INSTANCE_V1_SPEC } from "../../artifacts/specs/prover-instance.v1.generated.js";
import { PROVER_PERMUTATION_V1_SPEC } from "../../artifacts/specs/prover-permutation.v1.generated.js";
import { PROVER_PLACEMENT_VARIABLES_V1_SPEC } from "../../artifacts/specs/prover-placement-variables.v1.generated.js";
import { VERIFIER_INSTANCE_V1_SPEC } from "../../artifacts/specs/verifier-instance.v1.generated.js";
import { VERIFIER_PREPROCESS_V1_SPEC } from "../../artifacts/specs/verifier-preprocess.v1.generated.js";
import { VERIFIER_PROOF_V1_SPEC } from "../../artifacts/specs/verifier-proof.v1.generated.js";

export interface RuntimeArtifactFileValidationOptions {
  readonly expectedKind?: BinaryArtifactFileKind;
}

export interface RuntimeArtifactFileValidationResult {
  readonly artifactFile: BinaryArtifactFileView;
}

export async function validateBinary(bytes: Uint8Array): Promise<RuntimeArtifactFileValidationResult> {
  const artifactFile = await decodeBinaryArtifactFile(bytes);
  const spec = specForKind(artifactFile.kind);
  return validateRuntimeArtifactFile(bytes, spec, { expectedKind: artifactFile.kind });
}

export async function validateRuntimeArtifactFile(
  bytes: Uint8Array,
  spec?: RuntimeArtifactFormatSpec,
  options: RuntimeArtifactFileValidationOptions = {},
): Promise<RuntimeArtifactFileValidationResult> {
  validateBinaryHeaderAndTables(bytes);
  const artifactFile = await decodeBinaryArtifactFile(bytes);

  if (options.expectedKind !== undefined && artifactFile.kind !== options.expectedKind) {
    throw new Error(`Binary artifact kind mismatch: expected ${options.expectedKind}, got ${artifactFile.kind}.`);
  }

  validateSourcePackageVersion(artifactFile.sourcePackageVersion);
  await validateDigestTables(bytes, artifactFile);

  if (spec !== undefined) {
    validateRuntimeArtifactBySpec(artifactFile, spec);
  }

  return { artifactFile };
}

export async function validateProverPermutationArtifactFile(
  bytes: Uint8Array,
): Promise<RuntimeArtifactFileValidationResult> {
  return validateRuntimeArtifactFile(bytes, PROVER_PERMUTATION_V1_SPEC, {
    expectedKind: BinaryArtifactFileKind.ProverPermutation,
  });
}

function specForKind(kind: BinaryArtifactFileKind): RuntimeArtifactFormatSpec {
  switch (kind) {
    case BinaryArtifactFileKind.VerifierInstance:
      return VERIFIER_INSTANCE_V1_SPEC;
    case BinaryArtifactFileKind.VerifierProof:
      return VERIFIER_PROOF_V1_SPEC;
    case BinaryArtifactFileKind.VerifierPreprocess:
      return VERIFIER_PREPROCESS_V1_SPEC;
    case BinaryArtifactFileKind.ProverPlacementVariables:
      return PROVER_PLACEMENT_VARIABLES_V1_SPEC;
    case BinaryArtifactFileKind.ProverCrs:
      return PROVER_CRS_V1_SPEC;
    case BinaryArtifactFileKind.ProverInstance:
      return PROVER_INSTANCE_V1_SPEC;
    case BinaryArtifactFileKind.ProverPermutation:
      return PROVER_PERMUTATION_V1_SPEC;
    case BinaryArtifactFileKind.VerifierCrs:
      throw new Error("Verifier CRS is build-time generated and has no runtime binary artifact spec.");
  }
}

function validateBinaryHeaderAndTables(bytes: Uint8Array): void {
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
    digestTableLength !== digestEntryCount * BINARY_DIGEST_ENTRY_BYTES
  ) {
    throw new Error("Binary artifact digest table bounds are invalid.");
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

async function validateDigestTables(bytes: Uint8Array, artifactFile: BinaryArtifactFileView): Promise<void> {
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

function validateRuntimeArtifactBySpec(artifactFile: BinaryArtifactFileView, spec: RuntimeArtifactFormatSpec): void {
  const pointNames = new Set<string>();

  for (const sectionSpec of spec.sections) {
    const section = requireSectionBySpec(artifactFile, spec.name, sectionSpec);

    if (sectionSpec.elementCount !== null && section.elementCount !== sectionSpec.elementCount) {
      throw new Error(
        `${spec.name} section '${sectionSpec.label}' element count mismatch: expected ${sectionSpec.elementCount}, got ${section.elementCount}.`,
      );
    }

    if (sectionSpec.elementByteLength !== null && section.elementByteLength !== sectionSpec.elementByteLength) {
      throw new Error(
        `${spec.name} section '${sectionSpec.label}' element byte length mismatch: expected ${sectionSpec.elementByteLength}, got ${section.elementByteLength}.`,
      );
    }

    validateSectionLayout(section);
    validateSpecPoints(spec.name, sectionSpec, section, pointNames);
  }

  assertNoSectionOverlap(artifactFile.sections);
}

function requireSectionBySpec(
  artifactFile: BinaryArtifactFileView,
  specName: string,
  spec: RuntimeArtifactSectionSpec,
): BinarySectionView {
  const section = artifactFile.sections.find(
    (candidate) =>
      candidate.type === spec.type && candidate.encoding === spec.encoding && candidate.label === spec.label,
  );

  if (section === undefined) {
    throw new Error(`${specName} is missing required section '${spec.label}'.`);
  }

  return section;
}

function validateSectionLayout(section: BinarySectionView): void {
  const expected = expectedElementByteLength(section.encoding);
  if (expected !== undefined && section.elementByteLength !== expected) {
    throw new Error(`Binary artifact section '${section.label}' element width does not match its encoding.`);
  }

  if (section.elementCount * section.elementByteLength !== section.byteLength) {
    throw new Error(`Binary artifact section '${section.label}' byte length does not match its element count.`);
  }
}

function validateSpecPoints(
  specName: string,
  sectionSpec: RuntimeArtifactSectionSpec,
  section: BinarySectionView,
  pointNames: Set<string>,
): void {
  const seenIndexes = new Set<number>();

  for (const point of sectionSpec.points) {
    if (pointNames.has(point.name)) {
      throw new Error(`Duplicate point name in ${specName} generated spec: ${point.name}.`);
    }

    if (seenIndexes.has(point.index)) {
      throw new Error(`Duplicate ${specName} point index ${point.index} in section '${sectionSpec.label}'.`);
    }

    if (point.index >= section.elementCount) {
      throw new Error(`${specName} point '${point.name}' index is outside section '${sectionSpec.label}'.`);
    }

    const start = point.index * section.elementByteLength;
    const end = start + section.elementByteLength;
    if (end > section.data.byteLength) {
      throw new Error(`${specName} point '${point.name}' extends outside section '${sectionSpec.label}'.`);
    }

    pointNames.add(point.name);
    seenIndexes.add(point.index);
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
