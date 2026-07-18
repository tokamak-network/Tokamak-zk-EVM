import type { CurveRuntime } from "../../core/curve/curve.js";
import { runIntegratedProver } from "../internal/integrated-prover.js";
import { createVerifierProofArtifactFromProverOutput } from "./proof-output.js";
import type { ProverRuntimeInput } from "./binary-input.js";

export interface ProveSnarkOptions {
  readonly sourcePackageVersion?: string;
}

export interface ProveSnarkResult {
  readonly proof: Uint8Array;
}

export async function proveSnark(
  runtime: CurveRuntime,
  input: ProverRuntimeInput,
  options: ProveSnarkOptions = {},
): Promise<ProveSnarkResult> {
  return {
    proof: await createVerifierProofArtifactFromProverOutput(await runIntegratedProver(runtime, input, options)),
  };
}
