import { loadRuntimeArtifactBySpec, type LoadedRuntimeArtifactSpec } from "./format-spec-loader.js";
import { SIGMA_VERIFY_V1_SPEC } from "./specs/sigma-verify.v1.generated.js";
import type { RuntimeArtifactFile } from "./types.js";

export type SigmaVerifyArtifact = LoadedRuntimeArtifactSpec;

export function loadSigmaVerifyArtifact(artifactFile: RuntimeArtifactFile): SigmaVerifyArtifact {
  return loadRuntimeArtifactBySpec(artifactFile, SIGMA_VERIFY_V1_SPEC);
}
