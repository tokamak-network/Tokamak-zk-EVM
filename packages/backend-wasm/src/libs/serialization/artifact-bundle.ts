import { BinaryArtifactFileKind } from "./binary-format.js";

export const RUNTIME_ARTIFACT_BUNDLE_SCHEMA_VERSION = 1;

export enum RuntimeArtifactBundleKind {
  VerifierProofInput = "VerifierProofInput",
  VerifierSetupInput = "VerifierSetupInput",
}

export enum RuntimeArtifactFileRole {
  Instance = "instance",
  Proof = "proof",
  Crs = "crs",
  Preprocess = "preprocess",
}

export interface RuntimeArtifactBundleManifest {
  readonly schemaVersion: typeof RUNTIME_ARTIFACT_BUNDLE_SCHEMA_VERSION;
  readonly kind: RuntimeArtifactBundleKind;
  readonly files: readonly RuntimeArtifactBundleFile[];
}

export interface RuntimeArtifactBundleFile {
  readonly role: RuntimeArtifactFileRole;
  readonly path: string;
  readonly byteLength?: number;
  readonly artifactKind?: BinaryArtifactFileKind;
}

export function parseRuntimeArtifactBundleManifest(raw: unknown): RuntimeArtifactBundleManifest {
  if (!isRecord(raw)) {
    throw new Error("Runtime artifact bundle manifest must be a JSON object.");
  }

  if (raw.schemaVersion !== RUNTIME_ARTIFACT_BUNDLE_SCHEMA_VERSION) {
    throw new Error(
      `Runtime artifact bundle manifest schemaVersion must be ${RUNTIME_ARTIFACT_BUNDLE_SCHEMA_VERSION}.`,
    );
  }

  const kind = parseBundleKind(raw.kind);

  if (!Array.isArray(raw.files) || raw.files.length === 0) {
    throw new Error("Runtime artifact bundle manifest files must be a non-empty array.");
  }

  const manifest: RuntimeArtifactBundleManifest = {
    schemaVersion: RUNTIME_ARTIFACT_BUNDLE_SCHEMA_VERSION,
    kind,
    files: raw.files.map((file, index) => parseBundleFile(file, index)),
  };

  validateBundleRolePolicy(manifest);
  return manifest;
}

export function assertVerifierProofInputBundle(manifest: RuntimeArtifactBundleManifest): void {
  if (manifest.kind !== RuntimeArtifactBundleKind.VerifierProofInput) {
    throw new Error(`Expected VerifierProofInput bundle manifest, got ${manifest.kind}.`);
  }

  requireAtLeastOneRole(manifest, RuntimeArtifactFileRole.Instance);
  requireAtLeastOneRole(manifest, RuntimeArtifactFileRole.Proof);
  forbidRole(manifest, RuntimeArtifactFileRole.Crs);
  forbidRole(manifest, RuntimeArtifactFileRole.Preprocess);
}

export function assertVerifierSetupInputBundle(manifest: RuntimeArtifactBundleManifest): void {
  if (manifest.kind !== RuntimeArtifactBundleKind.VerifierSetupInput) {
    throw new Error(`Expected VerifierSetupInput bundle manifest, got ${manifest.kind}.`);
  }

  requireAtLeastOneRole(manifest, RuntimeArtifactFileRole.Crs);
  requireAtLeastOneRole(manifest, RuntimeArtifactFileRole.Preprocess);
  forbidRole(manifest, RuntimeArtifactFileRole.Instance);
  forbidRole(manifest, RuntimeArtifactFileRole.Proof);
}

function parseBundleFile(raw: unknown, index: number): RuntimeArtifactBundleFile {
  if (!isRecord(raw)) {
    throw new Error(`Runtime artifact bundle file at index ${index} must be an object.`);
  }

  const file: RuntimeArtifactBundleFile = {
    role: parseFileRole(raw.role, index),
    path: parseSafeRelativePath(raw.path, `Runtime artifact bundle file at index ${index} path`),
    byteLength: parseOptionalByteLength(raw.byteLength, index),
    artifactKind: parseOptionalArtifactKind(raw.artifactKind, index),
  };

  validateRoleMatchesArtifactKind(file, index);
  return file;
}

function validateBundleRolePolicy(manifest: RuntimeArtifactBundleManifest): void {
  switch (manifest.kind) {
    case RuntimeArtifactBundleKind.VerifierProofInput:
      assertVerifierProofInputBundle(manifest);
      return;
    case RuntimeArtifactBundleKind.VerifierSetupInput:
      assertVerifierSetupInputBundle(manifest);
      return;
  }
}

function validateRoleMatchesArtifactKind(file: RuntimeArtifactBundleFile, index: number): void {
  if (file.artifactKind === undefined) {
    return;
  }

  const expected = expectedArtifactKindForRole(file.role);
  if (file.artifactKind !== expected) {
    throw new Error(
      `Runtime artifact bundle file at index ${index} role '${file.role}' requires artifactKind ${expected}.`,
    );
  }
}

function expectedArtifactKindForRole(role: RuntimeArtifactFileRole): BinaryArtifactFileKind {
  switch (role) {
    case RuntimeArtifactFileRole.Instance:
      return BinaryArtifactFileKind.VerifierInstance;
    case RuntimeArtifactFileRole.Proof:
      return BinaryArtifactFileKind.VerifierProof;
    case RuntimeArtifactFileRole.Crs:
      return BinaryArtifactFileKind.VerifierCrs;
    case RuntimeArtifactFileRole.Preprocess:
      return BinaryArtifactFileKind.VerifierPreprocess;
  }
}

function requireAtLeastOneRole(manifest: RuntimeArtifactBundleManifest, role: RuntimeArtifactFileRole): void {
  if (!manifest.files.some((file) => file.role === role)) {
    throw new Error(`${manifest.kind} bundle manifest is missing required '${role}' artifact file.`);
  }
}

function forbidRole(manifest: RuntimeArtifactBundleManifest, role: RuntimeArtifactFileRole): void {
  if (manifest.files.some((file) => file.role === role)) {
    throw new Error(`${manifest.kind} bundle manifest must not include '${role}' artifact files.`);
  }
}

function parseBundleKind(value: unknown): RuntimeArtifactBundleKind {
  if (value === RuntimeArtifactBundleKind.VerifierProofInput) {
    return RuntimeArtifactBundleKind.VerifierProofInput;
  }

  if (value === RuntimeArtifactBundleKind.VerifierSetupInput) {
    return RuntimeArtifactBundleKind.VerifierSetupInput;
  }

  throw new Error(`Unsupported runtime artifact bundle kind: ${String(value)}.`);
}

function parseFileRole(value: unknown, index: number): RuntimeArtifactFileRole {
  if (
    value === RuntimeArtifactFileRole.Instance ||
    value === RuntimeArtifactFileRole.Proof ||
    value === RuntimeArtifactFileRole.Crs ||
    value === RuntimeArtifactFileRole.Preprocess
  ) {
    return value;
  }

  throw new Error(`Unsupported runtime artifact bundle file role at index ${index}: ${String(value)}.`);
}

function parseOptionalArtifactKind(value: unknown, index: number): BinaryArtifactFileKind | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Runtime artifact bundle file at index ${index} artifactKind must be an integer.`);
  }

  return value as BinaryArtifactFileKind;
}

function parseOptionalByteLength(value: unknown, index: number): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Runtime artifact bundle file at index ${index} byteLength must be a safe non-negative integer.`);
  }

  return value;
}

function parseSafeRelativePath(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }

  if (value.startsWith("/") || value.includes("\\") || value.split("/").includes("..")) {
    throw new Error(`${label} must be a safe relative POSIX path.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
