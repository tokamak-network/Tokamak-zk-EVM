import { BivariatePolynomialBuffer } from "../../runtime/polynomial/bivariate-polynomial-buffer.js";
import type { CurveRuntime } from "../../runtime/curve/curve.js";
import type { FieldElement } from "../../runtime/field/field-runtime.js";
import type { ProverCrsRuntime } from "../api/binary-input.js";
import type { ProverOperationOptions } from "./initial-relation.js";
import { encodePolynomialBufferWithSigma1 } from "../commitments/sigma1-encoder.js";
import {
  constantPolynomialBuffer,
  linearCombinationBufferBatch,
} from "../polynomial/linear-combinations.js";
import {
  computeRecursionEvalsBuffer,
} from "../polynomial/recursion.js";
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
  const fXY = await linearCombinationBufferBatch(field, [
    [field.one, state.witness.bXY],
    [thetas[0], state.instance.s0XY],
    [thetas[1], state.instance.s1XY],
    [field.one, theta2],
  ]);
  const gXY = await linearCombinationBufferBatch(field, [
    [field.one, state.witness.bXY],
    [thetas[0], xMonomial],
    [thetas[1], yMonomial],
    [field.one, theta2],
  ]);
  assertRecursionPolynomialShape(fXY, mI, sMax);
  assertRecursionPolynomialShape(gXY, mI, sMax);
  const fXYEvals = await fXY.toRouEvals();
  const gXYEvals = await gXY.toRouEvals();
  const rXYEvals = await computeRecursionEvalsBuffer(field, gXYEvals, fXYEvals, mI, sMax);
  const rXY = await BivariatePolynomialBuffer.fromRouEvals(field, rXYEvals, mI, sMax);
  const RXY = await linearCombinationBufferBatch(field, [
    [field.one, rXY],
    [state.mixer.rR_X, state.instance.tMi],
    [state.mixer.rR_Y, state.instance.tSMax],
  ]);

  return {
    commitment: {
      R: await (
        options.commitmentEncoder?.(RXY)
        ?? encodePolynomialBufferWithSigma1(runtime, crs, state.setup, RXY)
      ),
    },
    rXY,
  };
}

function assertRecursionPolynomialShape(
  polynomial: BivariatePolynomialBuffer,
  xSize: number,
  ySize: number,
): void {
  if (polynomial.xSize !== xSize || polynomial.ySize !== ySize) {
    throw new Error(
      `Recursion polynomial shape mismatch: expected ${xSize}x${ySize}, `
        + `got ${polynomial.xSize}x${polynomial.ySize}.`,
    );
  }
}
