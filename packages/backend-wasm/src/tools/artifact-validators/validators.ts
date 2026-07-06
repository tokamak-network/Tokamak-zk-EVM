import {
  BINARY_ARTIFACT_FORMAT_VERSION,
  BINARY_ARTIFACT_MAGIC,
  BINARY_DIGEST_BYTES,
  BINARY_DIGEST_ENTRY_BYTES,
  BINARY_FILE_KIND_TABLE_BYTES,
  BINARY_HEADER_BYTES,
  BINARY_SOURCE_PACKAGE_VERSION_BYTES,
  BINARY_SECTION_ENTRY_BYTES,
  BINARY_VERSION_TABLE_BYTES,
  BinaryArtifactFileKind,
  BinaryDigestEntryType,
  type BinaryArtifactFileView,
  type BinaryDigestEntryView,
  type BinarySectionView,
  expectedElementByteLength,
} from "../../libs/serialization/binary-format.js";
import { decodeBinaryArtifactFile } from "../../libs/serialization/binary-artifact-file.js";
import {
  RuntimeArtifactBundleKind,
  RuntimeArtifactFileRole,
  type RuntimeArtifactBundleFile,
  type RuntimeArtifactBundleManifest,
} from "../../libs/serialization/artifact-bundle.js";
import type { RuntimeArtifactFormatSpec, RuntimeArtifactSectionSpec } from "../../libs/artifact-loaders/specs/types.js";
import { PROVER_CRS_V1_SPEC } from "../../libs/artifact-loaders/specs/prover-crs.v1.generated.js";
import { PROVER_INSTANCE_V1_SPEC } from "../../libs/artifact-loaders/specs/prover-instance.v1.generated.js";
import { PROVER_PLACEMENT_VARIABLES_V1_SPEC } from "../../libs/artifact-loaders/specs/prover-placement-variables.v1.generated.js";
import { PROVER_SETUP_PARAMS_V1_SPEC } from "../../libs/artifact-loaders/specs/prover-setup-params.v1.generated.js";
import { SIGMA_VERIFY_V1_SPEC } from "../../libs/artifact-loaders/specs/sigma-verify.v1.generated.js";
import { VERIFIER_INSTANCE_V1_SPEC } from "../../libs/artifact-loaders/specs/verifier-instance.v1.generated.js";
import { VERIFIER_PREPROCESS_V1_SPEC } from "../../libs/artifact-loaders/specs/verifier-preprocess.v1.generated.js";
import { VERIFIER_PROOF_V1_SPEC } from "../../libs/artifact-loaders/specs/verifier-proof.v1.generated.js";

export type RuntimeArtifactValidationFileResolver = (path: string) => Uint8Array | Promise<Uint8Array>;

export interface RuntimeArtifactFileValidationOptions {
  readonly expectedKind?: BinaryArtifactFileKind;
}

export interface RuntimeArtifactFileValidationResult {
  readonly artifactFile: BinaryArtifactFileView;
}

export interface RuntimeBundleValidationOptions {
  readonly expectedFiles: readonly RuntimeArtifactBundleExpectedFile[];
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

export async function validateRuntimeBundle(
  manifest: RuntimeArtifactBundleManifest,
  resolveFile: RuntimeArtifactValidationFileResolver,
  expectedBundleKind: RuntimeArtifactBundleKind,
  options: RuntimeBundleValidationOptions,
): Promise<void> {
  if (manifest.kind !== expectedBundleKind) {
    throw new Error(`Runtime artifact bundle kind mismatch: expected ${expectedBundleKind}, got ${manifest.kind}.`);
  }

  for (const file of manifest.files) {
    validateBundleFilePath(file);
  }

  for (const expected of options.expectedFiles) {
    const file = requireSingleRoleFile(manifest, expected.role);
    await validateRuntimeArtifactFile(await resolveFile(file.path), expected.spec, {
      expectedKind: expected.kind,
    });
  }

  for (const file of manifest.files) {
    if (!options.expectedFiles.some((expected) => expected.role === file.role)) {
      throw new Error(`${manifest.kind} bundle must not include '${file.role}' artifact files.`);
    }
  }
}

export async function validateVerifierProofInputBundle(
  manifest: RuntimeArtifactBundleManifest,
  resolveFile: RuntimeArtifactValidationFileResolver,
): Promise<void> {
  await validateRuntimeBundle(manifest, resolveFile, RuntimeArtifactBundleKind.VerifierProofInput, {
    expectedFiles: [
      {
        role: RuntimeArtifactFileRole.Instance,
        kind: BinaryArtifactFileKind.VerifierInstance,
        spec: VERIFIER_INSTANCE_V1_SPEC,
      },
      {
        role: RuntimeArtifactFileRole.Proof,
        kind: BinaryArtifactFileKind.VerifierProof,
        spec: VERIFIER_PROOF_V1_SPEC,
      },
    ],
  });
}

export async function validateVerifierSetupInputBundle(
  manifest: RuntimeArtifactBundleManifest,
  resolveFile: RuntimeArtifactValidationFileResolver,
): Promise<void> {
  await validateRuntimeBundle(manifest, resolveFile, RuntimeArtifactBundleKind.VerifierSetupInput, {
    expectedFiles: [
      {
        role: RuntimeArtifactFileRole.Crs,
        kind: BinaryArtifactFileKind.VerifierCrs,
        spec: SIGMA_VERIFY_V1_SPEC,
      },
      {
        role: RuntimeArtifactFileRole.Preprocess,
        kind: BinaryArtifactFileKind.VerifierPreprocess,
        spec: VERIFIER_PREPROCESS_V1_SPEC,
      },
    ],
  });
}

export async function validateProverProofWitnessInputBundle(
  manifest: RuntimeArtifactBundleManifest,
  resolveFile: RuntimeArtifactValidationFileResolver,
): Promise<void> {
  await validateRuntimeBundle(manifest, resolveFile, RuntimeArtifactBundleKind.ProverProofWitnessInput, {
    expectedFiles: [
      {
        role: RuntimeArtifactFileRole.PlacementVariables,
        kind: BinaryArtifactFileKind.ProverPlacementVariables,
        spec: PROVER_PLACEMENT_VARIABLES_V1_SPEC,
      },
      {
        role: RuntimeArtifactFileRole.Instance,
        kind: BinaryArtifactFileKind.ProverInstance,
        spec: PROVER_INSTANCE_V1_SPEC,
      },
    ],
  });
}

export async function validateProverCrsPreparedDataBundle(
  manifest: RuntimeArtifactBundleManifest,
  resolveFile: RuntimeArtifactValidationFileResolver,
): Promise<void> {
  await validateRuntimeBundle(manifest, resolveFile, RuntimeArtifactBundleKind.ProverCrsPreparedData, {
    expectedFiles: [
      {
        role: RuntimeArtifactFileRole.SetupParams,
        kind: BinaryArtifactFileKind.ProverSetupParams,
        spec: PROVER_SETUP_PARAMS_V1_SPEC,
      },
      {
        role: RuntimeArtifactFileRole.Crs,
        kind: BinaryArtifactFileKind.ProverCrs,
        spec: PROVER_CRS_V1_SPEC,
      },
    ],
  });
}

export interface RuntimeArtifactBundleExpectedFile {
  readonly role: RuntimeArtifactFileRole;
  readonly kind: BinaryArtifactFileKind;
  readonly spec: RuntimeArtifactFormatSpec;
}

function validateBundleFilePath(file: RuntimeArtifactBundleFile): void {
  if (file.path.startsWith("/") || file.path.includes("\\") || file.path.split("/").includes("..")) {
    throw new Error(
      `${file.role} runtime artifact bundle file path must be a safe relative POSIX path: ${file.path}`,
    );
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

function requireSingleRoleFile(
  manifest: RuntimeArtifactBundleManifest,
  role: RuntimeArtifactFileRole,
): RuntimeArtifactBundleFile {
  const matches = manifest.files.filter((file) => file.role === role);
  if (matches.length !== 1) {
    throw new Error(`${manifest.kind} bundle must contain exactly one '${role}' artifact file.`);
  }

  return matches[0];
}

function validateSourcePackageVersion(sourcePackageVersion: string): void {
  if (sourcePackageVersion.trim() !== sourcePackageVersion || sourcePackageVersion === "") {
    throw new Error("Binary artifact sourcePackageVersion must be a non-empty trimmed string.");
  }

  if (new TextEncoder().encode(sourcePackageVersion).byteLength > BINARY_SOURCE_PACKAGE_VERSION_BYTES) {
    throw new Error(
      `Binary artifact sourcePackageVersion must fit in ${BINARY_SOURCE_PACKAGE_VERSION_BYTES} UTF-8 bytes.`,
    );
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

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  if (globalThis.crypto?.subtle === undefined) {
    throw new Error("SHA-256 digest support is required for binary artifact validation.");
  }

  const digestInput = data.slice().buffer as ArrayBuffer;
  return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", digestInput));
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

function readFixedAscii(input: Uint8Array, offset: number, byteLength: number): string {
  const end = input.indexOf(0, offset);
  const actualEnd = end === -1 || end > offset + byteLength ? offset + byteLength : end;
  return new TextDecoder().decode(input.subarray(offset, actualEnd));
}

function align8(value: number): number {
  return (value + 7) & ~7;
}
