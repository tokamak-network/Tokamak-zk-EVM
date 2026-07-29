import { BivariatePolynomialBuffer } from "../../runtime/polynomial/bivariate-polynomial-buffer.js";
import type { CurveRuntime } from "../../runtime/curve/curve.js";
import type { FieldElement } from "../../runtime/field/field-runtime.js";

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
