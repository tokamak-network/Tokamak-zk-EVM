import { DensePolynomialExt } from "../libs/polynomial/dense-polynomial.js";
import type { CurveRuntime } from "../libs/runtime/curve.js";
import type { FieldElement } from "../libs/runtime/field.js";
import type { ProverState } from "./state.js";

export interface Prove3Output {
  readonly V_eval: FieldElement;
  readonly R_eval: FieldElement;
  readonly R_omegaX_eval: FieldElement;
  readonly R_omegaX_omegaY_eval: FieldElement;
}

export function prove3(input: {
  readonly runtime: CurveRuntime;
  readonly state: ProverState;
  readonly rXY: DensePolynomialExt;
  readonly chi: FieldElement;
  readonly zeta: FieldElement;
}): Prove3Output {
  const { runtime, state, rXY, chi, zeta } = input;
  const field = runtime.Fr;
  const mI = state.setup.l_D - state.setup.l;
  const omegaMI = field.rootOfUnity(mI);
  const omegaSMax = field.rootOfUnity(state.setup.s_max);
  const VXY = linearCombination(field, [
    [field.one, state.witness.vXY],
    [state.mixer.rV_X, state.instance.tN],
    [state.mixer.rV_Y, state.instance.tSMax],
  ]);
  const RXY = rXY
    .add(state.instance.tMi.scale(state.mixer.rR_X))
    .add(state.instance.tSMax.scale(state.mixer.rR_Y));
  const rOmegaX = RXY.scaleCoeffsX(field.inv(omegaMI));
  const rOmegaXOmegaY = rOmegaX.scaleCoeffsY(field.inv(omegaSMax));

  return {
    V_eval: VXY.eval(chi, zeta),
    R_eval: RXY.eval(chi, zeta),
    R_omegaX_eval: rOmegaX.eval(chi, zeta),
    R_omegaX_omegaY_eval: rOmegaXOmegaY.eval(chi, zeta),
  };
}

function linearCombination(
  field: CurveRuntime["Fr"],
  terms: readonly (readonly [FieldElement, DensePolynomialExt])[],
): DensePolynomialExt {
  let accumulator = DensePolynomialExt.zero(field);
  for (const [scalar, polynomial] of terms) {
    accumulator = accumulator.add(polynomial.scale(scalar));
  }

  return accumulator;
}
