import { BivariatePolynomialBuffer } from "../libs/polynomial/bivariate-polynomial-buffer.js";
import type { CurveRuntime } from "../libs/runtime/curve.js";
import type { FieldElement } from "../libs/runtime/field.js";
import type { ProverCrsRuntime } from "./binary-input.js";
import { encodePolynomialBufferWithSigma1 } from "./prove0.js";
import type { ProverState } from "./state.js";

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

function computeRecursionEvalsBuffer(
  field: CurveRuntime["Fr"],
  gXYEvals: Uint8Array,
  fXYEvals: Uint8Array,
  mI: number,
  sMax: number,
): Uint8Array {
  if (field.bufferElementCount(gXYEvals) !== mI * sMax || field.bufferElementCount(fXYEvals) !== mI * sMax) {
    throw new Error("prove1 recursion input eval length does not match the setup grid.");
  }

  const transposed = field.createZeroBuffer(mI * sMax);
  field.writeBufferElement(transposed, mI * sMax - 1, field.one);

  for (let index = mI * sMax - 2; index >= 0; index -= 1) {
    const nextIndex = index + 1;
    const originalX = nextIndex % mI;
    const originalY = Math.floor(nextIndex / mI);
    const originalIndex = originalX * sMax + originalY;
    field.writeBufferElement(
      transposed,
      index,
      field.mul(
        field.readBufferElement(transposed, nextIndex),
        field.div(
          field.readBufferElement(gXYEvals, originalIndex),
          field.readBufferElement(fXYEvals, originalIndex),
        ),
      ),
    );
  }

  return transposeRowMajorBuffer(field, transposed, sMax, mI);
}

function transposeRowMajorBuffer(
  field: CurveRuntime["Fr"],
  values: Uint8Array,
  rowCount: number,
  columnCount: number,
): Uint8Array {
  if (field.bufferElementCount(values) !== rowCount * columnCount) {
    throw new Error("Cannot transpose a buffer whose length does not match its shape.");
  }

  const output = field.createZeroBuffer(rowCount * columnCount);
  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      field.writeBufferElement(
        output,
        column * rowCount + row,
        field.readBufferElement(values, row * columnCount + column),
      );
    }
  }

  return output;
}

function constantPolynomialBuffer(field: CurveRuntime["Fr"], value: FieldElement): BivariatePolynomialBuffer {
  return BivariatePolynomialBuffer.fromCoeffs(field, [value], 1, 1);
}

function linearCombinationBuffer(
  field: CurveRuntime["Fr"],
  terms: readonly (readonly [FieldElement, BivariatePolynomialBuffer])[],
): BivariatePolynomialBuffer {
  let xSize = 1;
  let ySize = 1;
  for (const [, polynomial] of terms) {
    xSize = Math.max(xSize, polynomial.xSize);
    ySize = Math.max(ySize, polynomial.ySize);
  }

  const accumulator = BivariatePolynomialBuffer.zero(field).resize(xSize, ySize);
  for (const [scalar, polynomial] of terms) {
    accumulator.addScaledPrefixAssign(polynomial, scalar);
  }

  return accumulator;
}
