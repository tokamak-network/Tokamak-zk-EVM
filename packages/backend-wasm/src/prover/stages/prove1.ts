import { BivariatePolynomialBuffer } from "../../core/polynomial/bivariate-polynomial-buffer.js";
import type { CurveRuntime } from "../../core/curve/curve.js";
import type { FieldElement } from "../../core/field/field.js";
import type { ProverCrsRuntime } from "../api/binary-input.js";
import { encodePolynomialBufferWithSigma1 } from "./prove0.js";
import {
  computeRecursionEvalsBuffer,
  constantPolynomialBuffer,
  linearCombinationBuffer,
} from "./polynomial-ops.js";
import type { ProverState } from "../internal/state.js";

export interface Prove1Output {
  readonly R: Uint8Array;
}

export interface Prove1Computation {
  readonly proof1: Prove1Output;
  readonly rXY: BivariatePolynomialBuffer;
}

export async function prove1(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  state: ProverState,
  thetas: readonly FieldElement[],
): Promise<Prove1Computation> {
  if (thetas.length < 3) {
    throw new Error("prove1 requires at least three theta challenges.");
  }

  const field = runtime.Fr;
  const mI = state.setup.l_D - state.setup.l;
  const sMax = state.setup.s_max;
  const xMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 2, 1);
  const yMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 1, 2);
  const theta2 = constantPolynomialBuffer(field, thetas[2]);
  const fXY = linearCombinationBuffer(field, [
    [field.one, BivariatePolynomialBuffer.fromDense(state.witness.bXY)],
    [thetas[0], BivariatePolynomialBuffer.fromDense(state.instance.s0XY)],
    [thetas[1], BivariatePolynomialBuffer.fromDense(state.instance.s1XY)],
    [field.one, theta2],
  ]);
  const gXY = linearCombinationBuffer(field, [
    [field.one, BivariatePolynomialBuffer.fromDense(state.witness.bXY)],
    [thetas[0], xMonomial],
    [thetas[1], yMonomial],
    [field.one, theta2],
  ]);
  const fXYEvals = await fXY.resize(mI, sMax).toRouEvals();
  const gXYEvals = await gXY.resize(mI, sMax).toRouEvals();
  const rXYEvals = computeRecursionEvalsBuffer(field, gXYEvals, fXYEvals, mI, sMax);
  const rXY = await BivariatePolynomialBuffer.fromRouEvals(field, rXYEvals, mI, sMax);
  const RXY = linearCombinationBuffer(field, [
    [field.one, rXY],
    [state.mixer.rR_X, BivariatePolynomialBuffer.fromDense(state.instance.tMi)],
    [state.mixer.rR_Y, BivariatePolynomialBuffer.fromDense(state.instance.tSMax)],
  ]);

  return {
    proof1: {
      R: await encodePolynomialBufferWithSigma1(runtime, crs, state.setup, RXY),
    },
    rXY,
  };
}
