import { loadRuntimeArtifactBySpec, type LoadedRuntimeArtifactSpec } from "../specs/format-spec-loader.js";
import { PROVER_CRS_V1_SPEC } from "../specs/prover-crs.v1.generated.js";
import { INSTANCE_V1_SPEC } from "../specs/instance.v1.generated.js";
import { PROVER_PLACEMENT_VARIABLES_V1_SPEC } from "../specs/prover-placement-variables.v1.generated.js";
import { VERIFIER_PREPROCESS_V1_SPEC } from "../specs/verifier-preprocess.v1.generated.js";
import { VERIFIER_PROOF_V1_SPEC } from "../specs/verifier-proof.v1.generated.js";
import type { RuntimeArtifactFile } from "./types.js";

export type VerifierPreprocessArtifact = LoadedRuntimeArtifactSpec;
export type VerifierProofArtifact = LoadedRuntimeArtifactSpec;
export type InstanceArtifact = LoadedRuntimeArtifactSpec;
export type ProverCrsArtifact = LoadedRuntimeArtifactSpec;
export type ProverPlacementVariablesArtifact = LoadedRuntimeArtifactSpec;

export function loadVerifierPreprocessArtifact(artifactFile: RuntimeArtifactFile): VerifierPreprocessArtifact {
  return loadRuntimeArtifactBySpec(artifactFile, VERIFIER_PREPROCESS_V1_SPEC);
}

export function loadVerifierProofArtifact(artifactFile: RuntimeArtifactFile): VerifierProofArtifact {
  return loadRuntimeArtifactBySpec(artifactFile, VERIFIER_PROOF_V1_SPEC);
}

export function loadInstanceArtifact(artifactFile: RuntimeArtifactFile): InstanceArtifact {
  return loadRuntimeArtifactBySpec(artifactFile, INSTANCE_V1_SPEC);
}

export function loadProverCrsArtifact(artifactFile: RuntimeArtifactFile): ProverCrsArtifact {
  return loadRuntimeArtifactBySpec(artifactFile, PROVER_CRS_V1_SPEC);
}

export function loadProverPlacementVariablesArtifact(
  artifactFile: RuntimeArtifactFile,
): ProverPlacementVariablesArtifact {
  return loadRuntimeArtifactBySpec(artifactFile, PROVER_PLACEMENT_VARIABLES_V1_SPEC);
}
