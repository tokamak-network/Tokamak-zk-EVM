import type { CurveRuntime } from "../../core/curve/curve.js";
import type { RuntimeArtifactBundleManifest } from "../../artifacts/bundles/artifact-bundle.js";
import {
  loadProverInputFromRuntimeBundles,
  type ProverRuntimeArtifactFileResolver,
} from "./binary-input.js";
import { proveSnark, type ProveSnarkOptions } from "./prove-snark.js";

export async function proveBinary(
  runtime: CurveRuntime,
  proofWitnessInput: RuntimeArtifactBundleManifest,
  crsPreparedDataInput: RuntimeArtifactBundleManifest,
  resolveFile: ProverRuntimeArtifactFileResolver,
  options: ProveSnarkOptions = {},
): Promise<Uint8Array> {
  const input = await loadProverInputFromRuntimeBundles(runtime, proofWitnessInput, crsPreparedDataInput, resolveFile);
  const result = await proveSnark(runtime, input, options);

  return result.proof;
}
