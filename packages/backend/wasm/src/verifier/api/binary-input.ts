import { requireBinaryArtifactSection } from "../../artifacts/binary/binary-artifact-file.js";
import { assertBinaryArtifactCompatibility } from "../../artifacts/binary/compatibility.js";
import { admitRuntimeBinaryArtifact } from "../../artifacts/binary/runtime-admission.js";
import { INSTANCE_V1_SPEC } from "../../generated/browser-artifact-contracts.generated.js";
import { decodePreprocessBytes } from "../../generated/artifact-bytes.generated.js";
import { FIXED_VERIFIER } from "../generated/active/verifier.generated.js";
import type { CurveRuntime } from "../../runtime/curve/curve.js";
import { decodeUnivariateProof } from "../../univariate/proof.js";
import { decodePoint } from "../../univariate/artifact-points.js";
import type { UnivariateReferenceVerifierInput } from "../../univariate/reference-verifier.js";
export interface VerifierBinaryInput {
  readonly proof: Uint8Array;
  readonly instance: Uint8Array;
  readonly verifierPreprocess: Uint8Array;
}
export async function loadVerifierInputFromBinaryInput(runtime: CurveRuntime, input: VerifierBinaryInput): Promise<UnivariateReferenceVerifierInput> {
  const instance = admitRuntimeBinaryArtifact(input.instance, INSTANCE_V1_SPEC.kind, INSTANCE_V1_SPEC);
  assertBinaryArtifactCompatibility(instance);
  const [publicSpec] = INSTANCE_V1_SPEC.sections;
  const publicInputs = runtime.Fr.split(requireBinaryArtifactSection(instance, publicSpec).data);
  const p = decodePreprocessBytes(input.verifierPreprocess);
  return {
    publicInputs, fixed: FIXED_VERIFIER, proof: decodeUnivariateProof(runtime, input.proof),
    preprocess: { sC: decodePoint(runtime, p.s_c), cFix: decodePoint(runtime, p.c_fix), eKappa: decodePoint(runtime, p.e_kappa, true) },
  };
}
