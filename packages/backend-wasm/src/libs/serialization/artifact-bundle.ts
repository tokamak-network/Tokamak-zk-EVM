export const RUNTIME_ARTIFACT_BUNDLE_SCHEMA_VERSION = 1;

export enum RuntimeArtifactBundleKind {
  VerifierProofInput = "VerifierProofInput",
  VerifierSetupInput = "VerifierSetupInput",
  ProverProofWitnessInput = "ProverProofWitnessInput",
  ProverCrsPreparedData = "ProverCrsPreparedData",
}

export enum RuntimeArtifactFileRole {
  Instance = "instance",
  Proof = "proof",
  PlacementVariables = "placement_variables",
  Crs = "crs",
  Preprocess = "preprocess",
  SetupParams = "setup_params",
}

export interface RuntimeArtifactBundleManifest {
  readonly schemaVersion: typeof RUNTIME_ARTIFACT_BUNDLE_SCHEMA_VERSION;
  readonly kind: RuntimeArtifactBundleKind;
  readonly files: readonly RuntimeArtifactBundleFile[];
}

export interface RuntimeArtifactBundleFile {
  readonly role: RuntimeArtifactFileRole;
  readonly path: string;
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

  return manifest;
}

function parseBundleFile(raw: unknown, index: number): RuntimeArtifactBundleFile {
  if (!isRecord(raw)) {
    throw new Error(`Runtime artifact bundle file at index ${index} must be an object.`);
  }

  const file: RuntimeArtifactBundleFile = {
    role: parseFileRole(raw.role, index),
    path: parseBundlePath(raw.path, `Runtime artifact bundle file at index ${index} path`),
  };

  return file;
}

function parseBundleKind(value: unknown): RuntimeArtifactBundleKind {
  if (value === RuntimeArtifactBundleKind.VerifierProofInput) {
    return RuntimeArtifactBundleKind.VerifierProofInput;
  }

  if (value === RuntimeArtifactBundleKind.VerifierSetupInput) {
    return RuntimeArtifactBundleKind.VerifierSetupInput;
  }

  if (value === RuntimeArtifactBundleKind.ProverProofWitnessInput) {
    return RuntimeArtifactBundleKind.ProverProofWitnessInput;
  }

  if (value === RuntimeArtifactBundleKind.ProverCrsPreparedData) {
    return RuntimeArtifactBundleKind.ProverCrsPreparedData;
  }

  throw new Error(`Unsupported runtime artifact bundle kind: ${String(value)}.`);
}

function parseFileRole(value: unknown, index: number): RuntimeArtifactFileRole {
  if (
    value === RuntimeArtifactFileRole.Instance ||
    value === RuntimeArtifactFileRole.Proof ||
    value === RuntimeArtifactFileRole.PlacementVariables ||
    value === RuntimeArtifactFileRole.Crs ||
    value === RuntimeArtifactFileRole.Preprocess ||
    value === RuntimeArtifactFileRole.SetupParams
  ) {
    return value;
  }

  throw new Error(`Unsupported runtime artifact bundle file role at index ${index}: ${String(value)}.`);
}

function parseBundlePath(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
