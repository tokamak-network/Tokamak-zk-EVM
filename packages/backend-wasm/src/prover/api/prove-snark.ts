import type { CurveRuntime } from "../../runtime/curve/curve.js";
import { runIntegratedProver } from "../protocol/integrated-prover.js";
import { createVerifierProofArtifactFromProverOutput } from "./proof-output.js";
import type { ProverRuntimeInput } from "./binary-input.js";

export interface ProveSnarkOptions {
  readonly denseSigma1MsmChunkPoints?: number;
  readonly sourcePackageVersion?: string;
}

export async function proveSnark(
  runtime: CurveRuntime,
  input: ProverRuntimeInput,
  options: ProveSnarkOptions = {},
): Promise<Uint8Array> {
  return createVerifierProofArtifactFromProverOutput(await runIntegratedProver(runtime, input, options));
}
