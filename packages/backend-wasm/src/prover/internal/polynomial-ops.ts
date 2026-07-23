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
  const accumulator = scaleTermIntoShape(field, firstPolynomial, firstScalar, xSize, ySize);
  for (let index = firstNonZeroTerm + 1; index < terms.length; index += 1) {
    const [scalar, polynomial] = terms[index];
    accumulator.addScaledPrefixAssign(polynomial, scalar);
  }

  return accumulator;
}

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

function scaleTermIntoShape(
  field: CurveRuntime["Fr"],
  polynomial: BivariatePolynomialBuffer,
  scalar: FieldElement,
  xSize: number,
  ySize: number,
): BivariatePolynomialBuffer {
  const output = field.createZeroBuffer(xSize * ySize);
  const elementBytes = field.byteLength;
  const targetRowBytes = ySize * elementBytes;
  const sourceRowBytes = polynomial.ySize * elementBytes;
  const isOne = field.eq(scalar, field.one);
  const isMinusOne = field.eq(scalar, field.neg(field.one));

  for (let x = 0; x < polynomial.xSize; x += 1) {
    const targetRowOffset = x * targetRowBytes;
    const sourceRowOffset = x * sourceRowBytes;
    for (let yOffset = 0; yOffset < sourceRowBytes; yOffset += elementBytes) {
      const targetOffset = targetRowOffset + yOffset;
      const source = polynomial.coefficients.subarray(sourceRowOffset + yOffset, sourceRowOffset + yOffset + elementBytes);
      if (isOne) {
        output.set(source, targetOffset);
      } else if (isMinusOne) {
        output.set(field.neg(source), targetOffset);
      } else {
        output.set(field.mul(source, scalar), targetOffset);
      }
    }
  }

  return BivariatePolynomialBuffer.fromOwnedBuffer(field, output, xSize, ySize);
}

export async function multiplyPairWithSharedRight(
  firstLeft: BivariatePolynomialBuffer,
  secondLeft: BivariatePolynomialBuffer,
  sharedRight: BivariatePolynomialBuffer,
): Promise<readonly [BivariatePolynomialBuffer, BivariatePolynomialBuffer]> {
  if (firstLeft.field !== secondLeft.field || firstLeft.field !== sharedRight.field) {
    throw new Error("Shared-right multiplication inputs must use the same field.");
  }

  const firstShape = multiplicationShape(firstLeft, sharedRight);
  const secondShape = multiplicationShape(secondLeft, sharedRight);
  if (firstShape === undefined && secondShape === undefined) {
    return [BivariatePolynomialBuffer.zero(firstLeft.field), BivariatePolynomialBuffer.zero(firstLeft.field)];
  }
  if (firstShape === undefined || secondShape === undefined) {
    throw new Error("Shared-right multiplication requires both products to be non-zero.");
  }
  if (firstShape.xSize !== secondShape.xSize || firstShape.ySize !== secondShape.ySize) {
    throw new Error("Shared-right multiplication requires matching output shapes.");
  }

  const { xSize, ySize } = firstShape;
  const sharedRightEvals = await sharedRight.resize(xSize, ySize).toRouEvals();
  return [
    await multiplyWithSharedRightEvals(firstLeft, sharedRightEvals, xSize, ySize),
    await multiplyWithSharedRightEvals(secondLeft, sharedRightEvals, xSize, ySize),
  ];
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

export async function computeRecursionEvalsBuffer(
  field: CurveRuntime["Fr"],
  gXYEvals: Uint8Array,
  fXYEvals: Uint8Array,
  mI: number,
  sMax: number,
): Promise<Uint8Array> {
  if (field.bufferElementCount(gXYEvals) !== mI * sMax || field.bufferElementCount(fXYEvals) !== mI * sMax) {
    throw new Error("computeRecursionCommitment recursion input eval length does not match the setup grid.");
  }

  const total = mI * sMax;
  if (total <= 0) {
    throw new Error("computeRecursionCommitment recursion domain must be non-empty.");
  }

  const elementByteLength = field.byteLength;
  const inverseF = await field.batchInverseBuffer(fXYEvals);
  const output = new Uint8Array(total * elementByteLength);
  output.set(field.one, (total - 1) * elementByteLength);

  for (let transposedIndex = total - 2; transposedIndex >= 0; transposedIndex -= 1) {
    const nextTransposedIndex = transposedIndex + 1;
    const nextOriginalIndex = (nextTransposedIndex % mI) * sMax + Math.floor(nextTransposedIndex / mI);
    const currentOriginalIndex = (transposedIndex % mI) * sMax + Math.floor(transposedIndex / mI);
    const nextOriginalOffset = nextOriginalIndex * elementByteLength;
    const currentOriginalOffset = currentOriginalIndex * elementByteLength;
    const ratio = field.mul(
      gXYEvals.subarray(nextOriginalOffset, nextOriginalOffset + elementByteLength),
      inverseF.subarray(nextOriginalOffset, nextOriginalOffset + elementByteLength),
    );
    output.set(
      field.mul(output.subarray(nextOriginalOffset, nextOriginalOffset + elementByteLength), ratio),
      currentOriginalOffset,
    );
  }

  return output;
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

async function multiplyWithSharedRightEvals(
  left: BivariatePolynomialBuffer,
  sharedRightEvals: Uint8Array,
  xSize: number,
  ySize: number,
): Promise<BivariatePolynomialBuffer> {
  const field = left.field;
  if (field.bufferElementCount(sharedRightEvals) !== xSize * ySize) {
    throw new Error("Shared-right ROU eval buffer length does not match the multiplication shape.");
  }

  const leftEvals = await left.resize(xSize, ySize).toRouEvals();
  const outputEvals = field.createZeroBuffer(xSize * ySize);
  for (let index = 0; index < xSize * ySize; index += 1) {
    field.writeBufferElement(
      outputEvals,
      index,
      field.mul(field.readBufferElement(leftEvals, index), field.readBufferElement(sharedRightEvals, index)),
    );
  }

  return BivariatePolynomialBuffer.fromRouEvals(field, outputEvals, xSize, ySize);
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
