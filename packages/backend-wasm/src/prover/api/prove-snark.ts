import type { CurveRuntime } from "../../runtime/curve/curve.js";
import { createProverProtocolSession } from "../protocol/integrated-prover.js";
import { createVerifierProofArtifactFromProverOutput } from "./proof-output.js";
import type { ProverRuntimeInput } from "./binary-input.js";

export interface ProveSnarkOptions {
  readonly denseSigma1MsmChunkPoints?: number;
}

export async function proveSnark(
  runtime: CurveRuntime,
  input: ProverRuntimeInput,
  options: ProveSnarkOptions = {},
): Promise<Uint8Array> {
  const session = createProverProtocolSession(runtime, input, options);
  try {
    await session.proveArithmetic();
    await session.proveCopy();
    await session.proveBinding();
    return await createVerifierProofArtifactFromProverOutput(await session.finalize());
  } finally {
    session.dispose();
  }
}
