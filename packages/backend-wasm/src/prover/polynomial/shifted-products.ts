import { BivariatePolynomialBuffer } from "../../runtime/polynomial/bivariate-polynomial-buffer.js";
import type { CurveRuntime } from "../../runtime/curve/curve.js";
import type { FieldElement } from "../../runtime/field/field-runtime.js";
import { checkedDomainProduct, nextPowerOfTwo } from "./polynomial-shapes.js";

export async function multiplyOmegaShiftedProducts(
  baseLeft: BivariatePolynomialBuffer,
  unshiftedRight: BivariatePolynomialBuffer,
  shiftedSharedRight: BivariatePolynomialBuffer,
  xDomainSize: number,
  yDomainSize: number,
): Promise<readonly [BivariatePolynomialBuffer, BivariatePolynomialBuffer, BivariatePolynomialBuffer]> {
  if (baseLeft.field !== unshiftedRight.field || baseLeft.field !== shiftedSharedRight.field) {
    throw new Error("Omega-shifted multiplication inputs must use the same field.");
  }
  checkedDomainProduct(xDomainSize, yDomainSize, "Omega-shifted multiplication");

  const unshiftedShape = multiplicationShape(baseLeft, unshiftedRight);
  const shiftedShape = multiplicationShape(baseLeft, shiftedSharedRight);
  if (unshiftedShape === undefined || shiftedShape === undefined) {
    throw new Error("Omega-shifted multiplication inputs must be non-zero.");
  }
  if (unshiftedShape.xSize !== shiftedShape.xSize || unshiftedShape.ySize !== shiftedShape.ySize) {
    throw new Error("Omega-shifted multiplication products must have matching output shapes.");
  }

  const { xSize, ySize } = unshiftedShape;
  if (xSize % xDomainSize !== 0 || ySize % yDomainSize !== 0) {
    throw new Error("Omega-shifted multiplication output shape must be divisible by the source domains.");
  }

  const field = baseLeft.field;
  const baseEvals = await baseLeft.resize(xSize, ySize).toRouEvals();
  const unshiftedRightEvals = await unshiftedRight.resize(xSize, ySize).toRouEvals();
  const unshiftedProduct = await multiplyShiftedEvals(
    field,
    baseEvals,
    unshiftedRightEvals,
    xSize,
    ySize,
    0,
    0,
  );
  const sharedRightEvals = await shiftedSharedRight.resize(xSize, ySize).toRouEvals();
  const xShift = -(xSize / xDomainSize);
  const yShift = -(ySize / yDomainSize);
  const xShiftedProduct = await multiplyShiftedEvals(
    field,
    baseEvals,
    sharedRightEvals,
    xSize,
    ySize,
    xShift,
    0,
  );
  const xyShiftedProduct = await multiplyShiftedEvals(
    field,
    baseEvals,
    sharedRightEvals,
    xSize,
    ySize,
    xShift,
    yShift,
  );

  return [unshiftedProduct, xShiftedProduct, xyShiftedProduct];
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

function multiplicationShape(
  left: BivariatePolynomialBuffer,
  right: BivariatePolynomialBuffer,
): { readonly xSize: number; readonly ySize: number } | undefined {
  const leftDegree = left.findDegree();
  const rightDegree = right.findDegree();
  if (
    leftDegree.xDegree < 0 ||
    leftDegree.yDegree < 0 ||
    rightDegree.xDegree < 0 ||
    rightDegree.yDegree < 0
  ) {
    return undefined;
  }

  return {
    xSize: nextPowerOfTwo(leftDegree.xDegree + rightDegree.xDegree + 1),
    ySize: nextPowerOfTwo(leftDegree.yDegree + rightDegree.yDegree + 1),
  };
}

async function multiplyShiftedEvals(
  field: CurveRuntime["Fr"],
  leftEvals: Uint8Array,
  rightEvals: Uint8Array,
  xSize: number,
  ySize: number,
  xShift: number,
  yShift: number,
): Promise<BivariatePolynomialBuffer> {
  if (
    field.bufferElementCount(leftEvals) !== xSize * ySize
    || field.bufferElementCount(rightEvals) !== xSize * ySize
  ) {
    throw new Error("Omega-shifted ROU eval buffer length does not match the multiplication shape.");
  }

  const outputEvals = await field.batchMulShiftedBuffer(
    leftEvals,
    rightEvals,
    xSize,
    ySize,
    xShift,
    yShift,
  );

  return BivariatePolynomialBuffer.fromRouEvals(field, outputEvals, xSize, ySize);
}
