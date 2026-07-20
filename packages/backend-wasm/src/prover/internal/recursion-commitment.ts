import { BivariatePolynomialBuffer } from "../../core/polynomial/bivariate-polynomial-buffer.js";
import type { CurveRuntime } from "../../core/curve/curve.js";
import type { FieldElement } from "../../core/field/field.js";
import type { ProverCrsRuntime } from "../api/binary-input.js";
import { encodePolynomialBufferWithSigma1, type ProverOperationOptions } from "./initial-relation.js";
import {
  computeRecursionEvalsBuffer,
  constantPolynomialBuffer,
  linearCombinationBuffer,
} from "./polynomial-ops.js";
import type { ProverState } from "./state.js";

export interface RecursionCommitment {
  readonly R: Uint8Array;
}

export interface RecursionComputation {
  readonly commitment: RecursionCommitment;
  readonly rXY: BivariatePolynomialBuffer;
}

export async function computeRecursionCommitment(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  state: ProverState,
  thetas: readonly FieldElement[],
  options: ProverOperationOptions = {},
): Promise<RecursionComputation> {
  if (thetas.length < 3) {
    throw new Error("computeRecursionCommitment requires at least three theta challenges.");
  }

  const field = runtime.Fr;
  const mI = state.setup.l_D - state.setup.l;
  const sMax = state.setup.s_max;
  const xMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 2, 1);
  const yMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 1, 2);
  const theta2 = constantPolynomialBuffer(field, thetas[2]);
  const fXY = linearCombinationBuffer(field, [
    [field.one, state.witnessBuffers.bXY],
    [thetas[0], state.instanceBuffers.s0XY],
    [thetas[1], state.instanceBuffers.s1XY],
    [field.one, theta2],
  ]);
  const gXY = linearCombinationBuffer(field, [
    [field.one, state.witnessBuffers.bXY],
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
    [state.mixer.rR_X, state.instanceBuffers.tMi],
    [state.mixer.rR_Y, state.instanceBuffers.tSMax],
  ]);

  return {
    commitment: {
      R: await (options.commitmentEncoder?.encodeSigma1PolynomialBuffer({
        label: "R",
        polynomial: RXY,
      }) ?? encodePolynomialBufferWithSigma1(runtime, crs, state.setup, RXY)),
    },
    rXY,
  };
}
