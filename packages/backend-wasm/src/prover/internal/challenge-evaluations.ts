import { BivariatePolynomialBuffer } from "../../core/polynomial/bivariate-polynomial-buffer.js";
import type { CurveRuntime } from "../../core/curve/curve.js";
import type { FieldElement } from "../../core/field/field.js";
import {
  evaluateAtScaledChallengeSetBatch,
  linearCombinationBufferBatch,
} from "./polynomial-ops.js";
import type { ProverState } from "./state.js";

export interface ChallengeEvaluations {
  readonly V_eval: FieldElement;
  readonly R_eval: FieldElement;
  readonly R_omegaX_eval: FieldElement;
  readonly R_omegaX_omegaY_eval: FieldElement;
}

export async function evaluateChallengePoints(input: {
  readonly runtime: CurveRuntime;
  readonly state: ProverState;
  readonly rXY: BivariatePolynomialBuffer;
  readonly chi: FieldElement;
  readonly zeta: FieldElement;
}): Promise<ChallengeEvaluations> {
  const { runtime, state, rXY, chi, zeta } = input;
  const field = runtime.Fr;
  const mI = state.setup.l_D - state.setup.l;
  const omegaMI = field.rootOfUnity(mI);
  const omegaSMax = field.rootOfUnity(state.setup.s_max);
  const VXY = await linearCombinationBufferBatch(field, [
    [field.one, state.witnessBuffers.vXY],
    [state.mixer.rV_X, state.instanceBuffers.tN],
    [state.mixer.rV_Y, state.instanceBuffers.tSMax],
  ]);
  const RXY = await linearCombinationBufferBatch(field, [
    [field.one, rXY],
    [state.mixer.rR_X, state.instanceBuffers.tMi],
    [state.mixer.rR_Y, state.instanceBuffers.tSMax],
  ]);
  const scaledChi = field.mul(field.inv(omegaMI), chi);
  const scaledZeta = field.mul(field.inv(omegaSMax), zeta);
  const [R_eval, R_omegaX_eval, R_omegaX_omegaY_eval] = await evaluateAtScaledChallengeSetBatch(
    field,
    RXY,
    chi,
    scaledChi,
    zeta,
    scaledZeta,
  );

  return {
    V_eval: await VXY.evalBatch(chi, zeta),
    R_eval,
    R_omegaX_eval,
    R_omegaX_omegaY_eval,
  };
}
