import { BivariatePolynomialBuffer } from "../../runtime/polynomial/bivariate-polynomial-buffer.js";
import type { CurveRuntime } from "../../runtime/curve/curve.js";
import type { FieldElement } from "../../runtime/field/field-runtime.js";

export function evaluateAtScaledChallengeSet(
  field: CurveRuntime["Fr"],
  polynomial: BivariatePolynomialBuffer,
  xPoint: FieldElement,
  scaledXPoint: FieldElement,
  yPoint: FieldElement,
  scaledYPoint: FieldElement,
): readonly [FieldElement, FieldElement, FieldElement] {
  let baseResult = field.zero;
  let scaledXResult = field.zero;
  let scaledXYResult = field.zero;
  const elementBytes = field.byteLength;
  const rowBytes = polynomial.ySize * elementBytes;

  for (let x = polynomial.xSize - 1; x >= 0; x -= 1) {
    let baseRowValue = field.zero;
    let scaledYRowValue = field.zero;
    const rowOffset = x * rowBytes;
    for (let y = polynomial.ySize - 1; y >= 0; y -= 1) {
      const offset = rowOffset + y * elementBytes;
      const coefficient = polynomial.coefficients.subarray(offset, offset + elementBytes);
      baseRowValue = field.add(coefficient, field.mul(baseRowValue, yPoint));
      scaledYRowValue = field.add(coefficient, field.mul(scaledYRowValue, scaledYPoint));
    }
    baseResult = field.add(baseRowValue, field.mul(baseResult, xPoint));
    scaledXResult = field.add(baseRowValue, field.mul(scaledXResult, scaledXPoint));
    scaledXYResult = field.add(scaledYRowValue, field.mul(scaledXYResult, scaledXPoint));
  }

  return [baseResult, scaledXResult, scaledXYResult];
}

export async function evaluateAtScaledChallengeSetBatch(
  field: CurveRuntime["Fr"],
  polynomial: BivariatePolynomialBuffer,
  xPoint: FieldElement,
  scaledXPoint: FieldElement,
  yPoint: FieldElement,
  scaledYPoint: FieldElement,
): Promise<readonly [FieldElement, FieldElement, FieldElement]> {
  if (polynomial.field !== field) {
    throw new Error("Scaled evaluation polynomial belongs to a different field runtime.");
  }
  return await field.evaluateScaledChallengeSetBuffer(
    polynomial.coefficients,
    polynomial.xSize,
    polynomial.ySize,
    xPoint,
    scaledXPoint,
    yPoint,
    scaledYPoint,
  );
}

export function evaluateLagrangeK0At(
  field: CurveRuntime["Fr"],
  domainSize: number,
  xPoint: FieldElement,
  vanishingEval: FieldElement,
): FieldElement {
  if (domainSize <= 0) {
    throw new Error("Lagrange K0 domain size must be positive.");
  }
  if (field.eq(xPoint, field.one)) {
    return field.one;
  }

  return field.div(vanishingEval, field.mul(field.fromBigInt(BigInt(domainSize)), field.sub(xPoint, field.one)));
}
