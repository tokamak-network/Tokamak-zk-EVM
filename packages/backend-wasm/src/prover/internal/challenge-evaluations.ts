import { BivariatePolynomialBuffer } from "../../core/polynomial/bivariate-polynomial-buffer.js";
import type { CurveRuntime } from "../../core/curve/curve.js";
import type { FieldElement } from "../../core/field/field.js";
import { linearCombinationBuffer } from "./polynomial-ops.js";
import type { ProverState } from "./state.js";

export interface ChallengeEvaluations {
  readonly V_eval: FieldElement;
  readonly R_eval: FieldElement;
  readonly R_omegaX_eval: FieldElement;
  readonly R_omegaX_omegaY_eval: FieldElement;
}

export function evaluateChallengePoints(input: {
  readonly runtime: CurveRuntime;
  readonly state: ProverState;
  readonly rXY: BivariatePolynomialBuffer;
  readonly chi: FieldElement;
  readonly zeta: FieldElement;
}): ChallengeEvaluations {
  const { runtime, state, rXY, chi, zeta } = input;
  const field = runtime.Fr;
  const mI = state.setup.l_D - state.setup.l;
  const omegaMI = field.rootOfUnity(mI);
  const omegaSMax = field.rootOfUnity(state.setup.s_max);
  const VXY = linearCombinationBuffer(field, [
    [field.one, state.witnessBuffers.vXY],
    [state.mixer.rV_X, state.instanceBuffers.tN],
    [state.mixer.rV_Y, state.instanceBuffers.tSMax],
  ]);
  const RXY = linearCombinationBuffer(field, [
    [field.one, rXY],
    [state.mixer.rR_X, state.instanceBuffers.tMi],
    [state.mixer.rR_Y, state.instanceBuffers.tSMax],
  ]);
  const scaledChi = field.mul(field.inv(omegaMI), chi);
  const scaledZeta = field.mul(field.inv(omegaSMax), zeta);

  return {
    V_eval: VXY.eval(chi, zeta),
    R_eval: RXY.eval(chi, zeta),
    R_omegaX_eval: RXY.eval(scaledChi, zeta),
    R_omegaX_omegaY_eval: RXY.eval(scaledChi, scaledZeta),
  };
}
