import type { CurveRuntime } from "../../runtime/curve/curve.js";
import { buildPermutationPolynomials } from "../../runtime/polynomial/permutation-polynomials.js";
import type { PreprocessRuntimeInput } from "../api/binary-input.js";
import { createPreprocessOutput } from "../api/output.js";
import {
  commitDensePreprocessPolynomial,
  commitFunctionInstance,
} from "../commitments/preprocess-commitments.js";

export interface PreprocessSnarkOptions {
  readonly denseMsmChunkPoints?: number;
}

const DEFAULT_DENSE_MSM_CHUNK_POINTS = 1 << 18;

export async function preprocessSnark(
  runtime: CurveRuntime,
  input: PreprocessRuntimeInput,
  options: PreprocessSnarkOptions = {},
): Promise<Uint8Array> {
  const mI = input.setup.l_D - input.setup.l;
  const chunkPoints = options.denseMsmChunkPoints ?? DEFAULT_DENSE_MSM_CHUNK_POINTS;
  const [s0XY, s1XY] = await buildPermutationPolynomials(
    runtime.Fr,
    mI,
    input.setup.s_max,
    input.permutation,
  );
  const s0 = await commitDensePreprocessPolynomial(
    runtime,
    input.crs.xyPowers,
    s0XY,
    chunkPoints,
  );
  const s1 = await commitDensePreprocessPolynomial(
    runtime,
    input.crs.xyPowers,
    s1XY,
    chunkPoints,
  );
  const oPubFix = await commitFunctionInstance(
    runtime,
    input.crs.gammaInvOInst,
    input.functionInstance,
  );

  return createPreprocessOutput(runtime, s0, s1, oPubFix);
}
