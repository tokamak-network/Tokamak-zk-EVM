import type { PreprocessRuntimeInput } from "../../../src/preprocess/api/binary-input.js";
import { createPreprocessOutput } from "../../../src/preprocess/api/output.js";
import { commitDensePreprocessPolynomial } from "../../../src/preprocess/commitments/preprocess-commitments.js";
import type { CurveRuntime } from "../../../src/runtime/curve/curve.js";
import { buildPermutationPolynomials } from "../../../src/runtime/polynomial/permutation-polynomials.js";

const chunkPoints = 2 ** 18;

export async function preprocessLegacyBaseline(
  runtime: CurveRuntime,
  input: PreprocessRuntimeInput,
): Promise<Uint8Array> {
  const [s0XY, s1XY] = await buildPermutationPolynomials(
    runtime.Fr,
    input.setup.l_D - input.setup.l,
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
  const rawScalars = await runtime.Fr.batchFromMontgomeryBuffer(
    input.functionInstance,
  );
  const oPubFix = await runtime.G1.msmAffineRaw(
    input.crs.gammaInvOInst,
    rawScalars,
  );
  return createPreprocessOutput(runtime, s0, s1, oPubFix);
}
