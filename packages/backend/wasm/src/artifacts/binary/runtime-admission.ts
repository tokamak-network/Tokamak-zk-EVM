import { decodeStructurallyValidBinaryArtifact, assertBinaryArtifactShape } from './structural-validation.js';
import { type BinaryArtifactFileKind, type BinaryArtifactFileView } from './binary-format.js';
import type { RuntimeArtifactFormatSpec } from '../specs/types.js';

/**
 * Admits one runtime artifact against its producer-owned binary contract.
 * This deliberately does not verify the optional self digest or any CRS
 * provenance, ceremony, publication, or release-eligibility policy.
 */
export function admitRuntimeBinaryArtifact(
  bytes: Uint8Array,
  expectedKind: BinaryArtifactFileKind,
  spec: RuntimeArtifactFormatSpec,
): BinaryArtifactFileView {
  const artifact = decodeStructurallyValidBinaryArtifact(bytes);
  if (artifact.kind !== expectedKind) {
    throw new Error(`Binary artifact kind mismatch: expected ${expectedKind}, got ${artifact.kind}.`);
  }
  assertBinaryArtifactShape(artifact, spec);
  return artifact;
}
