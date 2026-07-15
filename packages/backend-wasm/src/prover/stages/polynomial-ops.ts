import { BivariatePolynomialBuffer } from "../../core/polynomial/bivariate-polynomial-buffer.js";
import type { CurveRuntime } from "../../core/curve/curve.js";
import type { FieldElement } from "../../core/field/field.js";

export function constantPolynomialBuffer(field: CurveRuntime["Fr"], value: FieldElement): BivariatePolynomialBuffer {
  return BivariatePolynomialBuffer.fromCoeffs(field, [value], 1, 1);
}

export function linearCombinationBuffer(
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

export function lowDegreeXTimesVanishingBuffer(
  field: CurveRuntime["Fr"],
  coefficients: readonly FieldElement[],
  exponent: number,
): BivariatePolynomialBuffer {
  if (exponent <= 0) {
    throw new Error("X vanishing exponent must be positive.");
  }

  const xSize = nextPowerOfTwo(exponent + coefficients.length);
  const output = BivariatePolynomialBuffer.zero(field).resize(xSize, 1);
  for (let index = 0; index < coefficients.length; index += 1) {
    output.setCoeff(index, 0, field.sub(output.getCoeff(index, 0), coefficients[index]));
    output.setCoeff(index + exponent, 0, field.add(output.getCoeff(index + exponent, 0), coefficients[index]));
  }

  return output;
}

export function lowDegreeYTimesVanishingBuffer(
  field: CurveRuntime["Fr"],
  coefficients: readonly FieldElement[],
  exponent: number,
): BivariatePolynomialBuffer {
  if (exponent <= 0) {
    throw new Error("Y vanishing exponent must be positive.");
  }

  const ySize = nextPowerOfTwo(exponent + coefficients.length);
  const output = BivariatePolynomialBuffer.zero(field).resize(1, ySize);
  for (let index = 0; index < coefficients.length; index += 1) {
    output.setCoeff(0, index, field.sub(output.getCoeff(0, index), coefficients[index]));
    output.setCoeff(0, index + exponent, field.add(output.getCoeff(0, index + exponent), coefficients[index]));
  }

  return output;
}

export function computeRecursionEvalsBuffer(
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

export function transposeRowMajorBuffer(
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

export async function buildLagrangeK0(
  field: CurveRuntime["Fr"],
  mI: number,
): Promise<BivariatePolynomialBuffer> {
  const k0Evals = field.createZeroBuffer(mI);
  field.writeBufferElement(k0Evals, 0, field.one);
  return BivariatePolynomialBuffer.fromRouEvals(field, k0Evals, mI, 1);
}

export async function buildLagrangeKl(
  field: CurveRuntime["Fr"],
  mI: number,
  sMax: number,
): Promise<BivariatePolynomialBuffer> {
  const kEvals = field.createZeroBuffer(mI);
  field.writeBufferElement(kEvals, mI - 1, field.one);
  const lagrangeKXY = await BivariatePolynomialBuffer.fromRouEvals(field, kEvals, mI, 1);
  const lEvals = field.createZeroBuffer(sMax);
  field.writeBufferElement(lEvals, sMax - 1, field.one);
  const lagrangeLXY = await BivariatePolynomialBuffer.fromRouEvals(field, lEvals, 1, sMax);
  return await lagrangeKXY.mul(lagrangeLXY);
}

export function mulByXMinusOne(polynomial: BivariatePolynomialBuffer): BivariatePolynomialBuffer {
  return polynomial.mulMonomial(1, 0).sub(polynomial);
}

export function mulByOneMinusX(polynomial: BivariatePolynomialBuffer): BivariatePolynomialBuffer {
  return polynomial.sub(polynomial.mulMonomial(1, 0));
}

export function mulByLinearX(
  polynomial: BivariatePolynomialBuffer,
  coefficients: readonly FieldElement[],
): BivariatePolynomialBuffer {
  if (coefficients.length !== 2) {
    throw new Error("X-linear multiplier requires exactly two coefficients.");
  }

  return polynomial.scale(coefficients[0]).add(polynomial.mulMonomial(1, 0).scale(coefficients[1]));
}

export function mulByLinearY(
  polynomial: BivariatePolynomialBuffer,
  coefficients: readonly FieldElement[],
): BivariatePolynomialBuffer {
  if (coefficients.length !== 2) {
    throw new Error("Y-linear multiplier requires exactly two coefficients.");
  }

  return polynomial.scale(coefficients[0]).add(polynomial.mulMonomial(0, 1).scale(coefficients[1]));
}

export function mulByTerm9(
  polynomial: BivariatePolynomialBuffer,
  rB_X: readonly FieldElement[],
  rB_Y: readonly FieldElement[],
  tMiEval: FieldElement,
  tSMaxEval: FieldElement,
): BivariatePolynomialBuffer {
  if (rB_X.length !== 2 || rB_Y.length !== 2) {
    throw new Error("term9 requires two X blinding coefficients and two Y blinding coefficients.");
  }

  const field = polynomial.field;
  const constant = field.add(field.mul(tMiEval, rB_X[0]), field.mul(tSMaxEval, rB_Y[0]));
  const xCoeff = field.mul(tMiEval, rB_X[1]);
  const yCoeff = field.mul(tSMaxEval, rB_Y[1]);
  return polynomial
    .scale(constant)
    .add(polynomial.mulMonomial(1, 0).scale(xCoeff))
    .add(polynomial.mulMonomial(0, 1).scale(yCoeff));
}

function nextPowerOfTwo(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Cannot compute power-of-two size for a non-positive value.");
  }

  let size = 1;
  while (size < value) {
    size *= 2;
  }
  return size;
}
