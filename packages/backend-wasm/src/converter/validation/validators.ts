import type { BinaryArtifactFileView } from "../../artifacts/binary/binary-format.js";
import { decodeBinaryArtifactFile } from "../../artifacts/binary/binary-artifact-file.js";
import { validateSourcePackageVersion } from "../../artifacts/binary/binary-table-utils.js";
import { specForKind, validateRuntimeArtifactBySpec } from "./artifact-spec-validation.js";
import { validateSelfDigest } from "./self-digest-validation.js";
import { validateBinaryHeaderAndTables } from "./file-layout-validation.js";

export interface RuntimeArtifactFileValidationResult {
  readonly artifactFile: BinaryArtifactFileView;
}

export async function validateBinary(bytes: Uint8Array): Promise<RuntimeArtifactFileValidationResult> {
  validateBinaryHeaderAndTables(bytes);
  const artifactFile = decodeBinaryArtifactFile(bytes);
  const spec = specForKind(artifactFile.kind);
  validateSourcePackageVersion(artifactFile.sourcePackageVersion);
  await validateSelfDigest(bytes, artifactFile);
  validateRuntimeArtifactBySpec(artifactFile, spec);
  return { artifactFile };
}
