import {
  BinaryArtifactFileKind,
  type BinaryArtifactFileView,
} from "../../artifacts/binary/binary-format.js";
import { decodeBinaryArtifactFile } from "../../artifacts/binary/binary-artifact-file.js";
import { validateSourcePackageVersion } from "../../artifacts/binary/binary-table-utils.js";
import type { RuntimeArtifactFormatSpec } from "../../artifacts/specs/types.js";
import { specForKind, validateRuntimeArtifactBySpec } from "./artifact-spec-validation.js";
import { validateSelfDigest } from "./self-digest-validation.js";
import { validateBinaryHeaderAndTables } from "./file-layout-validation.js";

export interface RuntimeArtifactFileValidationOptions {
  readonly expectedKind?: BinaryArtifactFileKind;
}

export interface RuntimeArtifactFileValidationResult {
  readonly artifactFile: BinaryArtifactFileView;
}

export async function validateBinary(bytes: Uint8Array): Promise<RuntimeArtifactFileValidationResult> {
  validateBinaryHeaderAndTables(bytes);
  const artifactFile = await decodeBinaryArtifactFile(bytes);
  const spec = specForKind(artifactFile.kind);
  return validateDecodedRuntimeArtifactFile(bytes, artifactFile, spec, {
    expectedKind: artifactFile.kind,
  });
}

export async function validateRuntimeArtifactFile(
  bytes: Uint8Array,
  spec?: RuntimeArtifactFormatSpec,
  options: RuntimeArtifactFileValidationOptions = {},
): Promise<RuntimeArtifactFileValidationResult> {
  validateBinaryHeaderAndTables(bytes);
  const artifactFile = await decodeBinaryArtifactFile(bytes);
  return validateDecodedRuntimeArtifactFile(bytes, artifactFile, spec, options);
}

async function validateDecodedRuntimeArtifactFile(
  bytes: Uint8Array,
  artifactFile: BinaryArtifactFileView,
  spec: RuntimeArtifactFormatSpec | undefined,
  options: RuntimeArtifactFileValidationOptions,
): Promise<RuntimeArtifactFileValidationResult> {
  if (options.expectedKind !== undefined && artifactFile.kind !== options.expectedKind) {
    throw new Error(`Binary artifact kind mismatch: expected ${options.expectedKind}, got ${artifactFile.kind}.`);
  }

  validateSourcePackageVersion(artifactFile.sourcePackageVersion);
  await validateSelfDigest(bytes, artifactFile);

  if (spec !== undefined) {
    validateRuntimeArtifactBySpec(artifactFile, spec);
  }

  return { artifactFile };
}
