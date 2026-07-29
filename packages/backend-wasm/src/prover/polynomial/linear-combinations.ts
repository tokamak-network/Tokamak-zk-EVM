import { BivariatePolynomialBuffer } from "../../runtime/polynomial/bivariate-polynomial-buffer.js";
import type { CurveRuntime } from "../../runtime/curve/curve.js";
import type { FieldElement } from "../../runtime/field/field-runtime.js";

export function constantPolynomialBuffer(field: CurveRuntime["Fr"], value: FieldElement): BivariatePolynomialBuffer {
  return BivariatePolynomialBuffer.fromCoeffs(field, [value], 1, 1);
}

export async function linearCombinationBufferBatch(
  field: CurveRuntime["Fr"],
  terms: readonly (readonly [FieldElement, BivariatePolynomialBuffer])[],
): Promise<BivariatePolynomialBuffer> {
  let xSize = 1;
  let ySize = 1;
  let firstNonZeroTerm: number | undefined;
  for (let index = 0; index < terms.length; index += 1) {
    const [scalar, polynomial] = terms[index];
    if (polynomial.field !== field) {
      throw new Error("Linear combination terms must use the requested field.");
    }
    xSize = Math.max(xSize, polynomial.xSize);
    ySize = Math.max(ySize, polynomial.ySize);
    if (firstNonZeroTerm === undefined && !field.isZero(scalar)) {
      firstNonZeroTerm = index;
    }
  }

  if (firstNonZeroTerm === undefined) {
    return BivariatePolynomialBuffer.zero(field).resize(xSize, ySize);
  }

  const [firstScalar, firstPolynomial] = terms[firstNonZeroTerm];
  let accumulator = await scaleTermIntoShapeBatch(field, firstPolynomial, firstScalar, xSize, ySize);
  for (let index = firstNonZeroTerm + 1; index < terms.length; index += 1) {
    const [scalar, polynomial] = terms[index];
    if (field.isZero(scalar)) {
      continue;
    }
    if (accumulator.xSize === polynomial.xSize && accumulator.ySize === polynomial.ySize) {
      if (field.eq(scalar, field.one)) {
        accumulator = await accumulator.addBatch(polynomial);
      } else if (field.eq(scalar, field.neg(field.one))) {
        accumulator = await accumulator.subBatch(polynomial);
      } else {
        accumulator = BivariatePolynomialBuffer.fromOwnedBuffer(
          field,
          await field.batchAddScaledBuffer(accumulator.coefficients, polynomial.coefficients, scalar),
          xSize,
          ySize,
        );
      }
    } else {
      accumulator = await accumulator.addScaledPrefixBatch(polynomial, scalar);
    }
  }

  return accumulator;
}

async function scaleTermIntoShapeBatch(
  field: CurveRuntime["Fr"],
  polynomial: BivariatePolynomialBuffer,
  scalar: FieldElement,
  xSize: number,
  ySize: number,
): Promise<BivariatePolynomialBuffer> {
  if (polynomial.xSize === xSize && polynomial.ySize === ySize) {
    if (field.eq(scalar, field.one)) {
      return polynomial.clone();
    }
    return await polynomial.scaleBatch(scalar);
  }

  if (!field.eq(scalar, field.one)) {
    const target = BivariatePolynomialBuffer.fromOwnedBuffer(
      field,
      field.createZeroBuffer(xSize * ySize),
      xSize,
      ySize,
    );
    return await target.addScaledPrefixBatch(polynomial, scalar);
  }

  const output = field.createZeroBuffer(xSize * ySize);
  const elementBytes = field.byteLength;
  const targetRowBytes = ySize * elementBytes;
  const sourceRowBytes = polynomial.ySize * elementBytes;

  for (let x = 0; x < polynomial.xSize; x += 1) {
    const targetRowOffset = x * targetRowBytes;
    const sourceRowOffset = x * sourceRowBytes;
    output.set(polynomial.coefficients.subarray(sourceRowOffset, sourceRowOffset + sourceRowBytes), targetRowOffset);
  }

  return BivariatePolynomialBuffer.fromOwnedBuffer(field, output, xSize, ySize);
}
