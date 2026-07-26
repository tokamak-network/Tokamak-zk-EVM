import {
  BinaryArtifactFileKind,
  type BinaryArtifactFileView,
} from "../../artifacts/binary/binary-format.js";
import { decodeBinaryArtifactFile } from "../../artifacts/binary/binary-artifact-file.js";
import { validateSourcePackageVersion } from "../../artifacts/binary/binary-table-utils.js";
import { PROVER_PERMUTATION_V1_SPEC } from "../../artifacts/specs/prover-permutation.v1.generated.js";
import type { RuntimeArtifactFormatSpec } from "../../artifacts/specs/types.js";
import { specForKind, validateRuntimeArtifactBySpec } from "./artifact-spec-validation.js";
import { validateDigestTables } from "./digest-validation.js";
import { validateBinaryHeaderAndTables } from "./file-layout-validation.js";

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
