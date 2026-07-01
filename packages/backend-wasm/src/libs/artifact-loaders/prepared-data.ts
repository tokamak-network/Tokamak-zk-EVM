import { loadRuntimeArtifactBySpec, type LoadedRuntimeArtifactSpec } from "./format-spec-loader.js";
import { PROVER_CRS_V1_SPEC } from "./specs/prover-crs.v1.generated.js";
import { VERIFIER_INSTANCE_V1_SPEC } from "./specs/verifier-instance.v1.generated.js";
import { VERIFIER_PREPROCESS_V1_SPEC } from "./specs/verifier-preprocess.v1.generated.js";
import { VERIFIER_PROOF_V1_SPEC } from "./specs/verifier-proof.v1.generated.js";
import type { RuntimeArtifactFile } from "./types.js";

export type VerifierPreprocessArtifact = LoadedRuntimeArtifactSpec;
export type VerifierProofArtifact = LoadedRuntimeArtifactSpec;
export type VerifierInstanceArtifact = LoadedRuntimeArtifactSpec;
export type ProverCrsArtifact = LoadedRuntimeArtifactSpec;

export function loadVerifierPreprocessArtifact(artifactFile: RuntimeArtifactFile): VerifierPreprocessArtifact {
  return loadRuntimeArtifactBySpec(artifactFile, VERIFIER_PREPROCESS_V1_SPEC);
}

export function loadVerifierProofArtifact(artifactFile: RuntimeArtifactFile): VerifierProofArtifact {
  return loadRuntimeArtifactBySpec(artifactFile, VERIFIER_PROOF_V1_SPEC);
}

export function loadVerifierInstanceArtifact(artifactFile: RuntimeArtifactFile): VerifierInstanceArtifact {
  return loadRuntimeArtifactBySpec(artifactFile, VERIFIER_INSTANCE_V1_SPEC);
}

export function loadProverCrsArtifact(artifactFile: RuntimeArtifactFile): ProverCrsArtifact {
  return loadRuntimeArtifactBySpec(artifactFile, PROVER_CRS_V1_SPEC);
}
