import type { BinaryArtifactFileView } from '../../artifacts/binary/binary-format.js';
import {
  assertBinaryArtifactShape,
  decodeStructurallyValidBinaryArtifact,
} from '../../artifacts/binary/structural-validation.js';
import { validateSourcePackageVersion } from '../../artifacts/binary/binary-table-utils.js';
import { requireRuntimeArtifactSpecForKind } from '../../generated/browser-artifact-contracts.generated.js';
import { validateSelfDigest } from './self-digest-validation.js';

export interface RuntimeArtifactFileValidationResult {
  readonly artifactFile: BinaryArtifactFileView;
}

export async function validateBinary(bytes: Uint8Array): Promise<RuntimeArtifactFileValidationResult> {
  const artifactFile = decodeStructurallyValidBinaryArtifact(bytes);
  const spec = requireRuntimeArtifactSpecForKind(artifactFile.kind);
  assertBinaryArtifactShape(artifactFile, spec);
  validateSourcePackageVersion(artifactFile.sourcePackageVersion);
  await validateSelfDigest(bytes, artifactFile);
  return { artifactFile };
}
