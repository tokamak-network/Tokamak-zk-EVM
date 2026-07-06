import type { CurveRuntime } from "../libs/runtime/curve.js";
import type { RuntimeArtifactBundleManifest } from "../libs/serialization/artifact-bundle.js";
import {
  loadVerifierInputFromRuntimeBundles,
  type RuntimeArtifactFileResolver,
} from "./binary-input.js";
import { verifySnark, type VerifySnarkOptions } from "./verify-snark.js";

export const VERIFIER_BINARY_RESULT_INVALID = 0;
export const VERIFIER_BINARY_RESULT_VALID = 1;
export const VERIFIER_BINARY_RESULT_BYTES = 1;

export async function verifyBinary(
  runtime: CurveRuntime,
  proofInput: RuntimeArtifactBundleManifest,
  setupInput: RuntimeArtifactBundleManifest,
  resolveFile: RuntimeArtifactFileResolver,
  options: VerifySnarkOptions = {},
): Promise<Uint8Array> {
  const input = await loadVerifierInputFromRuntimeBundles(runtime, proofInput, setupInput, resolveFile);
  const result = await verifySnark(runtime, input, options);

  return encodeVerifierBinaryResult(result.valid);
}

export function encodeVerifierBinaryResult(valid: boolean): Uint8Array {
  return Uint8Array.of(valid ? VERIFIER_BINARY_RESULT_VALID : VERIFIER_BINARY_RESULT_INVALID);
}

export function decodeVerifierBinaryResult(result: Uint8Array): boolean {
  if (result.byteLength !== VERIFIER_BINARY_RESULT_BYTES) {
    throw new Error(`Verifier binary result must be ${VERIFIER_BINARY_RESULT_BYTES} byte.`);
  }

  const value = result[0];
  if (value === VERIFIER_BINARY_RESULT_VALID) {
    return true;
  }

  if (value === VERIFIER_BINARY_RESULT_INVALID) {
    return false;
  }

  throw new Error(`Unsupported verifier binary result byte: ${value}.`);
}
