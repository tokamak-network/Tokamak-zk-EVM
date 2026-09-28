import { encodePreprocessBytes } from "../../generated/artifact-bytes.generated.js";
import { encodePoint } from "../../univariate/artifact-points.js";
import type { CurveRuntime } from "../../runtime/curve/curve.js";
import type { PreprocessComputation } from "../protocol/runtime-input.js";
export async function createPreprocessOutput(runtime: CurveRuntime, output: PreprocessComputation): Promise<Uint8Array> {
  return encodePreprocessBytes({ s_c: encodePoint(runtime, output.sC), c_fix: encodePoint(runtime, output.cFix), e_kappa: encodePoint(runtime, output.eKappa, true) });
}
