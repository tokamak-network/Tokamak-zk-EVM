import { DensePolynomialExt } from "../libs/polynomial/dense-polynomial.js";
import type { CurveRuntime } from "../libs/runtime/curve.js";
import type { FieldElement } from "../libs/runtime/field.js";
import type { ProverCrsRuntime } from "./binary-input.js";
import { encodePolynomialWithSigma1 } from "./prove0.js";
import type { ProverState } from "./state.js";

export interface Prove1Output {
  readonly R: Uint8Array;
}

export interface Prove1Computation {
  readonly proof1: Prove1Output;
  readonly rXY: DensePolynomialExt;
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
  const xMonomial = DensePolynomialExt.fromCoeffs(field, [field.zero, field.one], 2, 1);
  const yMonomial = DensePolynomialExt.fromCoeffs(field, [field.zero, field.one], 1, 2);
  const theta2 = DensePolynomialExt.fromCoeffs(field, [thetas[2]], 1, 1);
  const fXY = linearCombination(field, [
    [field.one, state.witness.bXY],
    [thetas[0], state.instance.s0XY],
    [thetas[1], state.instance.s1XY],
  ]).add(theta2);
  const gXY = linearCombination(field, [
    [field.one, state.witness.bXY],
    [thetas[0], xMonomial],
    [thetas[1], yMonomial],
  ]).add(theta2);
  const fXYEvals = await fXY.resize(mI, sMax).toRouEvals();
  const gXYEvals = await gXY.resize(mI, sMax).toRouEvals();
  const rXYEvals = computeRecursionEvals(field, gXYEvals, fXYEvals, mI, sMax);
  const rXY = await DensePolynomialExt.fromRouEvals(field, rXYEvals, mI, sMax);
  const RXY = rXY
    .add(state.instance.tMi.scale(state.mixer.rR_X))
    .add(state.instance.tSMax.scale(state.mixer.rR_Y));

  return {
    proof1: {
      R: await encodePolynomialWithSigma1(runtime, crs, state.setup, RXY),
    },
    rXY,
  };
}

function computeRecursionEvals(
  field: CurveRuntime["Fr"],
  gXYEvals: readonly FieldElement[],
  fXYEvals: readonly FieldElement[],
  mI: number,
  sMax: number,
): FieldElement[] {
  if (gXYEvals.length !== mI * sMax || fXYEvals.length !== mI * sMax) {
    throw new Error("prove1 recursion input eval length does not match the setup grid.");
  }

  const scalers = gXYEvals.map((value, index) => field.div(value, fXYEvals[index]));
  const scalersTransposed = transposeRowMajor(scalers, mI, sMax);
  const rXYEvals = Array.from({ length: mI * sMax }, () => field.zero);
  rXYEvals[mI * sMax - 1] = field.one;

  for (let index = mI * sMax - 2; index >= 0; index -= 1) {
    rXYEvals[index] = field.mul(rXYEvals[index + 1], scalersTransposed[index + 1]);
  }

  return transposeRowMajor(rXYEvals, sMax, mI);
}

function transposeRowMajor(
  values: readonly FieldElement[],
  rowCount: number,
  columnCount: number,
): FieldElement[] {
  if (values.length !== rowCount * columnCount) {
    throw new Error("Cannot transpose a buffer whose length does not match its shape.");
  }

  const output = Array.from({ length: values.length }, () => values[0]);
  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      output[column * rowCount + row] = values[row * columnCount + column];
    }
  }

  return output;
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
