import { BivariatePolynomialBuffer } from "../../runtime/polynomial/bivariate-polynomial-buffer.js";
import type { FieldElement } from "../../runtime/field/field-runtime.js";
import { nextPowerOfTwo } from "./polynomial-shapes.js";

export async function mulByXMinusOne(
  polynomial: BivariatePolynomialBuffer,
): Promise<BivariatePolynomialBuffer> {
  return await multiplyBySpecialForm(
    polynomial,
    "x-minus-one",
    polynomial.field.zero,
    polynomial.field.zero,
    polynomial.field.zero,
  );
}

export async function mulByOneMinusX(
  polynomial: BivariatePolynomialBuffer,
): Promise<BivariatePolynomialBuffer> {
  return await multiplyBySpecialForm(
    polynomial,
    "one-minus-x",
    polynomial.field.zero,
    polynomial.field.zero,
    polynomial.field.zero,
  );
}

export async function mulByLinearX(
  polynomial: BivariatePolynomialBuffer,
  coefficients: readonly FieldElement[],
): Promise<BivariatePolynomialBuffer> {
  if (coefficients.length !== 2) {
    throw new Error("X-linear multiplier requires exactly two coefficients.");
  }

  return await multiplyBySpecialForm(
    polynomial,
    "linear-x",
    coefficients[0],
    coefficients[1],
    polynomial.field.zero,
  );
}

export async function mulByLinearY(
  polynomial: BivariatePolynomialBuffer,
  coefficients: readonly FieldElement[],
): Promise<BivariatePolynomialBuffer> {
  if (coefficients.length !== 2) {
    throw new Error("Y-linear multiplier requires exactly two coefficients.");
  }

  return await multiplyBySpecialForm(
    polynomial,
    "linear-y",
    coefficients[0],
    polynomial.field.zero,
    coefficients[1],
  );
}

export async function combineLinearXWithScaled(
  polynomial: BivariatePolynomialBuffer,
  coefficients: readonly FieldElement[],
  addend: BivariatePolynomialBuffer,
  addendScale: FieldElement,
): Promise<BivariatePolynomialBuffer> {
  return await combineLinearWithScaled(polynomial, coefficients, addend, addendScale, "x");
}

export async function combineLinearYWithScaled(
  polynomial: BivariatePolynomialBuffer,
  coefficients: readonly FieldElement[],
  addend: BivariatePolynomialBuffer,
  addendScale: FieldElement,
): Promise<BivariatePolynomialBuffer> {
  return await combineLinearWithScaled(polynomial, coefficients, addend, addendScale, "y");
}

export async function mulByTerm9(
  polynomial: BivariatePolynomialBuffer,
  rB_X: readonly FieldElement[],
  rB_Y: readonly FieldElement[],
  tMiEval: FieldElement,
  tSMaxEval: FieldElement,
): Promise<BivariatePolynomialBuffer> {
  if (rB_X.length !== 2 || rB_Y.length !== 2) {
    throw new Error("term9 requires two X blinding coefficients and two Y blinding coefficients.");
  }

  const field = polynomial.field;
  const constant = field.add(field.mul(tMiEval, rB_X[0]), field.mul(tSMaxEval, rB_Y[0]));
  const xCoeff = field.mul(tMiEval, rB_X[1]);
  const yCoeff = field.mul(tSMaxEval, rB_Y[1]);
  return await multiplyBySpecialForm(polynomial, "term9", constant, xCoeff, yCoeff);
}

async function multiplyBySpecialForm(
  polynomial: BivariatePolynomialBuffer,
  operation: "x-minus-one" | "one-minus-x" | "linear-x" | "linear-y" | "term9",
  constant: FieldElement,
  xCoefficient: FieldElement,
  yCoefficient: FieldElement,
): Promise<BivariatePolynomialBuffer> {
  const degree = polynomial.findDegree();
  if (degree.xDegree < 0 || degree.yDegree < 0) {
    return BivariatePolynomialBuffer.zero(polynomial.field);
  }

  const field = polynomial.field;
  const extendsX = operation !== "linear-y";
  const extendsY = operation === "linear-y" || operation === "term9";
  const xSize = extendsX
    ? Math.max(polynomial.xSize, nextPowerOfTwo(degree.xDegree + 2))
    : polynomial.xSize;
  const ySize = extendsY
    ? Math.max(polynomial.ySize, nextPowerOfTwo(degree.yDegree + 2))
    : polynomial.ySize;
  const output = await field.specialPolynomialBuffer(
    polynomial.coefficients,
    polynomial.xSize,
    polynomial.ySize,
    degree.xDegree + 1,
    degree.yDegree + 1,
    xSize,
    ySize,
    operation,
    constant,
    xCoefficient,
    yCoefficient,
  );
  return BivariatePolynomialBuffer.fromOwnedBuffer(field, output, xSize, ySize);
}

async function combineLinearWithScaled(
  polynomial: BivariatePolynomialBuffer,
  coefficients: readonly FieldElement[],
  addend: BivariatePolynomialBuffer,
  addendScale: FieldElement,
  axis: "x" | "y",
): Promise<BivariatePolynomialBuffer> {
  if (polynomial.field !== addend.field || coefficients.length !== 2) {
    throw new Error("Fused linear inputs must use one field and two linear coefficients.");
  }
  const degree = polynomial.findDegree();
  if (degree.xDegree < 0 || degree.yDegree < 0) {
    return BivariatePolynomialBuffer.fromOwnedBuffer(
      addend.field,
      await addend.field.batchApplyKeyBuffer(addend.coefficients, addendScale, addend.field.one),
      addend.xSize,
      addend.ySize,
    );
  }

  const field = polynomial.field;
  const xSize = axis === "x"
    ? Math.max(polynomial.xSize, nextPowerOfTwo(degree.xDegree + 2))
    : polynomial.xSize;
  const ySize = axis === "y"
    ? Math.max(polynomial.ySize, nextPowerOfTwo(degree.yDegree + 2))
    : polynomial.ySize;
  if (addend.xSize > xSize || addend.ySize > ySize) {
    throw new Error("Fused linear addend shape must fit inside the output shape.");
  }

  const output = await field.fusedLinearPolynomialBuffer(
    polynomial.coefficients,
    polynomial.xSize,
    polynomial.ySize,
    degree.xDegree + 1,
    degree.yDegree + 1,
    addend.coefficients,
    addend.xSize,
    addend.ySize,
    xSize,
    ySize,
    axis,
    coefficients[0],
    coefficients[1],
    addendScale,
  );
  return BivariatePolynomialBuffer.fromOwnedBuffer(field, output, xSize, ySize);
}
