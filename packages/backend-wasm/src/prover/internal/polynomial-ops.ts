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

export async function multiplyByLagrangeK0(
  polynomial: BivariatePolynomialBuffer,
  mI: number,
): Promise<BivariatePolynomialBuffer> {
  if (!Number.isSafeInteger(mI) || mI <= 0) {
    throw new Error("Lagrange K0 domain size must be a positive safe integer.");
  }

  const degree = polynomial.findDegree();
  if (degree.xDegree < 0 || degree.yDegree < 0) {
    return BivariatePolynomialBuffer.zero(polynomial.field);
  }

  const field = polynomial.field;
  const xSize = nextPowerOfTwo(degree.xDegree + mI);
  const ySize = nextPowerOfTwo(degree.yDegree + 1);
  const elementBytes = field.byteLength;
  const window = field.createZeroBuffer(ySize);
  const unscaledOutput = field.createZeroBuffer(xSize * ySize);

  // K0(X) = mI^-1 * sum(X^i), so each output row is a scaled sliding sum.
  for (let x = 0; x < xSize; x += 1) {
    const inputRowOffset = x * polynomial.ySize * elementBytes;
    const removedX = x - mI;
    const removedRowOffset = removedX * polynomial.ySize * elementBytes;
    const outputRowOffset = x * ySize * elementBytes;
    for (let y = 0; y < ySize; y += 1) {
      const elementOffset = y * elementBytes;
      let sum = window.subarray(elementOffset, elementOffset + elementBytes);
      if (x < polynomial.xSize) {
        sum = field.add(
          sum,
          polynomial.coefficients.subarray(
            inputRowOffset + elementOffset,
            inputRowOffset + elementOffset + elementBytes,
          ),
        );
      }
      if (removedX >= 0 && removedX < polynomial.xSize) {
        sum = field.sub(
          sum,
          polynomial.coefficients.subarray(
            removedRowOffset + elementOffset,
            removedRowOffset + elementOffset + elementBytes,
          ),
        );
      }
      window.set(sum, elementOffset);
      unscaledOutput.set(sum, outputRowOffset + elementOffset);
    }
  }

  const inverseMI = field.inv(field.fromBigInt(BigInt(mI)));
  const output = await field.batchApplyKeyBuffer(unscaledOutput, inverseMI, field.one);
  return BivariatePolynomialBuffer.fromOwnedBuffer(field, output, xSize, ySize);
}

export async function buildLagrangeKl(
  field: CurveRuntime["Fr"],
  mI: number,
  sMax: number,
): Promise<BivariatePolynomialBuffer> {
  const domainSize = checkedDomainProduct(mI, sMax, "Lagrange KL");
  const inverseDomain = field.inv(field.fromBigInt(BigInt(domainSize)));
  const rootX = field.rootOfUnity(mI);
  const rootY = field.rootOfUnity(sMax);
  const output = new Uint8Array(domainSize * field.byteLength);
  let rowStart = inverseDomain;

  for (let x = 0; x < mI; x += 1) {
    let value = rowStart;
    const rowOffset = x * sMax * field.byteLength;
    for (let y = 0; y < sMax; y += 1) {
      output.set(value, rowOffset + y * field.byteLength);
      value = field.mul(value, rootY);
    }
    rowStart = field.mul(rowStart, rootX);
  }

  return BivariatePolynomialBuffer.fromOwnedBuffer(field, output, mI, sMax);
}

export async function multiplyByLagrangeKl(
  polynomial: BivariatePolynomialBuffer,
  mI: number,
  sMax: number,
): Promise<BivariatePolynomialBuffer> {
  const domainSize = checkedDomainProduct(mI, sMax, "Lagrange KL multiplication");
  const degree = polynomial.findDegree();
  if (degree.xDegree < 0 || degree.yDegree < 0) {
    return BivariatePolynomialBuffer.zero(polynomial.field);
  }

  const field = polynomial.field;
  const xSize = nextPowerOfTwo(degree.xDegree + mI);
  const ySize = nextPowerOfTwo(degree.yDegree + sMax);
  const elementBytes = field.byteLength;
  const intermediate = new Uint8Array(xSize * polynomial.ySize * elementBytes);
  const intermediateRowBytes = polynomial.ySize * elementBytes;
  const inputRowBytes = polynomial.ySize * elementBytes;
  const rootX = field.rootOfUnity(mI);

  for (let x = 0; x < xSize; x += 1) {
    const outputRowOffset = x * intermediateRowBytes;
    const previousRowOffset = (x - 1) * intermediateRowBytes;
    const inputRowOffset = x * inputRowBytes;
    const removedRowOffset = (x - mI) * inputRowBytes;
    for (let y = 0; y < polynomial.ySize; y += 1) {
      const elementOffset = y * elementBytes;
      let value = x > 0
        ? field.mul(
          intermediate.subarray(
            previousRowOffset + elementOffset,
            previousRowOffset + elementOffset + elementBytes,
          ),
          rootX,
        )
        : field.zero;
      if (x < polynomial.xSize) {
        value = field.add(
          value,
          polynomial.coefficients.subarray(
            inputRowOffset + elementOffset,
            inputRowOffset + elementOffset + elementBytes,
          ),
        );
      }
      if (x >= mI && x - mI < polynomial.xSize) {
        value = field.sub(
          value,
          polynomial.coefficients.subarray(
            removedRowOffset + elementOffset,
            removedRowOffset + elementOffset + elementBytes,
          ),
        );
      }
      intermediate.set(value, outputRowOffset + elementOffset);
    }
  }

  const unscaledOutput = new Uint8Array(xSize * ySize * elementBytes);
  const outputRowBytes = ySize * elementBytes;
  const rootY = field.rootOfUnity(sMax);
  for (let x = 0; x < xSize; x += 1) {
    const intermediateRowOffset = x * intermediateRowBytes;
    const outputRowOffset = x * outputRowBytes;
    for (let y = 0; y < ySize; y += 1) {
      const outputOffset = outputRowOffset + y * elementBytes;
      let value = y > 0
        ? field.mul(
          unscaledOutput.subarray(outputOffset - elementBytes, outputOffset),
          rootY,
        )
        : field.zero;
      if (y < polynomial.ySize) {
        value = field.add(
          value,
          intermediate.subarray(
            intermediateRowOffset + y * elementBytes,
            intermediateRowOffset + (y + 1) * elementBytes,
          ),
        );
      }
      if (y >= sMax && y - sMax < polynomial.ySize) {
        value = field.sub(
          value,
          intermediate.subarray(
            intermediateRowOffset + (y - sMax) * elementBytes,
            intermediateRowOffset + (y - sMax + 1) * elementBytes,
          ),
        );
      }
      unscaledOutput.set(value, outputOffset);
    }
  }

  const inverseDomain = field.inv(field.fromBigInt(BigInt(domainSize)));
  const output = await field.batchApplyKeyBuffer(unscaledOutput, inverseDomain, field.one);
  return BivariatePolynomialBuffer.fromOwnedBuffer(field, output, xSize, ySize);
}

export function mulByXMinusOne(polynomial: BivariatePolynomialBuffer): BivariatePolynomialBuffer {
  return multiplyByXDifference(polynomial, false);
}

export function mulByOneMinusX(polynomial: BivariatePolynomialBuffer): BivariatePolynomialBuffer {
  return multiplyByXDifference(polynomial, true);
}

export function mulByLinearX(
  polynomial: BivariatePolynomialBuffer,
  coefficients: readonly FieldElement[],
): BivariatePolynomialBuffer {
  if (coefficients.length !== 2) {
    throw new Error("X-linear multiplier requires exactly two coefficients.");
  }

  return multiplyByLinearXFactor(polynomial, coefficients[0], coefficients[1]);
}

export function mulByLinearY(
  polynomial: BivariatePolynomialBuffer,
  coefficients: readonly FieldElement[],
): BivariatePolynomialBuffer {
  if (coefficients.length !== 2) {
    throw new Error("Y-linear multiplier requires exactly two coefficients.");
  }

  return multiplyByLinearYFactor(polynomial, coefficients[0], coefficients[1]);
}

export function combineLinearXWithScaled(
  polynomial: BivariatePolynomialBuffer,
  coefficients: readonly FieldElement[],
  addend: BivariatePolynomialBuffer,
  addendScale: FieldElement,
): BivariatePolynomialBuffer {
  return combineLinearWithScaled(polynomial, coefficients, addend, addendScale, "x");
}

export function combineLinearYWithScaled(
  polynomial: BivariatePolynomialBuffer,
  coefficients: readonly FieldElement[],
  addend: BivariatePolynomialBuffer,
  addendScale: FieldElement,
): BivariatePolynomialBuffer {
  return combineLinearWithScaled(polynomial, coefficients, addend, addendScale, "y");
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
  return multiplyByTerm9Factor(polynomial, constant, xCoeff, yCoeff);
}

function multiplyByXDifference(
  polynomial: BivariatePolynomialBuffer,
  negateShift: boolean,
): BivariatePolynomialBuffer {
  const degree = polynomial.findDegree();
  if (degree.xDegree < 0 || degree.yDegree < 0) {
    return BivariatePolynomialBuffer.zero(polynomial.field);
  }

  const field = polynomial.field;
  const xSize = Math.max(polynomial.xSize, nextPowerOfTwo(degree.xDegree + 2));
  const ySize = polynomial.ySize;
  const output = new Uint8Array(xSize * ySize * field.byteLength);
  const sourceRowBytes = polynomial.ySize * field.byteLength;
  const outputRowBytes = ySize * field.byteLength;

  for (let x = 0; x <= degree.xDegree + 1; x += 1) {
    const outputRowOffset = x * outputRowBytes;
    const currentRowOffset = x * sourceRowBytes;
    const previousRowOffset = (x - 1) * sourceRowBytes;
    for (let y = 0; y <= degree.yDegree; y += 1) {
      const elementOffset = y * field.byteLength;
      const current = x <= degree.xDegree
        ? polynomial.coefficients.subarray(
          currentRowOffset + elementOffset,
          currentRowOffset + elementOffset + field.byteLength,
        )
        : field.zero;
      const previous = x > 0
        ? polynomial.coefficients.subarray(
          previousRowOffset + elementOffset,
          previousRowOffset + elementOffset + field.byteLength,
        )
        : field.zero;
      output.set(
        negateShift ? field.sub(current, previous) : field.sub(previous, current),
        outputRowOffset + elementOffset,
      );
    }
  }

  return BivariatePolynomialBuffer.fromOwnedBuffer(field, output, xSize, ySize);
}

function multiplyByLinearXFactor(
  polynomial: BivariatePolynomialBuffer,
  constant: FieldElement,
  xCoefficient: FieldElement,
): BivariatePolynomialBuffer {
  const degree = polynomial.findDegree();
  if (degree.xDegree < 0 || degree.yDegree < 0) {
    return BivariatePolynomialBuffer.zero(polynomial.field);
  }

  const field = polynomial.field;
  const xSize = Math.max(polynomial.xSize, nextPowerOfTwo(degree.xDegree + 2));
  const ySize = polynomial.ySize;
  const output = new Uint8Array(xSize * ySize * field.byteLength);
  const sourceRowBytes = polynomial.ySize * field.byteLength;
  const outputRowBytes = ySize * field.byteLength;

  for (let x = 0; x <= degree.xDegree + 1; x += 1) {
    const outputRowOffset = x * outputRowBytes;
    const currentRowOffset = x * sourceRowBytes;
    const previousRowOffset = (x - 1) * sourceRowBytes;
    for (let y = 0; y <= degree.yDegree; y += 1) {
      const elementOffset = y * field.byteLength;
      let value = field.zero;
      if (x <= degree.xDegree) {
        value = field.mul(
          polynomial.coefficients.subarray(
            currentRowOffset + elementOffset,
            currentRowOffset + elementOffset + field.byteLength,
          ),
          constant,
        );
      }
      if (x > 0) {
        const shifted = field.mul(
          polynomial.coefficients.subarray(
            previousRowOffset + elementOffset,
            previousRowOffset + elementOffset + field.byteLength,
          ),
          xCoefficient,
        );
        value = x <= degree.xDegree ? field.add(value, shifted) : shifted;
      }
      output.set(value, outputRowOffset + elementOffset);
    }
  }

  return BivariatePolynomialBuffer.fromOwnedBuffer(field, output, xSize, ySize);
}

function multiplyByLinearYFactor(
  polynomial: BivariatePolynomialBuffer,
  constant: FieldElement,
  yCoefficient: FieldElement,
): BivariatePolynomialBuffer {
  const degree = polynomial.findDegree();
  if (degree.xDegree < 0 || degree.yDegree < 0) {
    return BivariatePolynomialBuffer.zero(polynomial.field);
  }

  const field = polynomial.field;
  const xSize = polynomial.xSize;
  const ySize = Math.max(polynomial.ySize, nextPowerOfTwo(degree.yDegree + 2));
  const output = new Uint8Array(xSize * ySize * field.byteLength);
  const sourceRowBytes = polynomial.ySize * field.byteLength;
  const outputRowBytes = ySize * field.byteLength;

  for (let x = 0; x <= degree.xDegree; x += 1) {
    const sourceRowOffset = x * sourceRowBytes;
    const outputRowOffset = x * outputRowBytes;
    for (let y = 0; y <= degree.yDegree + 1; y += 1) {
      let value = field.zero;
      if (y <= degree.yDegree) {
        value = field.mul(
          polynomial.coefficients.subarray(
            sourceRowOffset + y * field.byteLength,
            sourceRowOffset + (y + 1) * field.byteLength,
          ),
          constant,
        );
      }
      if (y > 0) {
        const shifted = field.mul(
          polynomial.coefficients.subarray(
            sourceRowOffset + (y - 1) * field.byteLength,
            sourceRowOffset + y * field.byteLength,
          ),
          yCoefficient,
        );
        value = y <= degree.yDegree ? field.add(value, shifted) : shifted;
      }
      output.set(value, outputRowOffset + y * field.byteLength);
    }
  }

  return BivariatePolynomialBuffer.fromOwnedBuffer(field, output, xSize, ySize);
}

function combineLinearWithScaled(
  polynomial: BivariatePolynomialBuffer,
  coefficients: readonly FieldElement[],
  addend: BivariatePolynomialBuffer,
  addendScale: FieldElement,
  axis: "x" | "y",
): BivariatePolynomialBuffer {
  if (polynomial.field !== addend.field || coefficients.length !== 2) {
    throw new Error("Fused linear inputs must use one field and two linear coefficients.");
  }
  const degree = polynomial.findDegree();
  if (degree.xDegree < 0 || degree.yDegree < 0) {
    return addend.scale(addendScale);
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

  const output = new Uint8Array(xSize * ySize * field.byteLength);
  const outputRowBytes = ySize * field.byteLength;
  const sourceRowBytes = polynomial.ySize * field.byteLength;
  const addendRowBytes = addend.ySize * field.byteLength;
  const addendIsZero = field.isZero(addendScale);

  for (let x = 0; x < xSize; x += 1) {
    const outputRowOffset = x * outputRowBytes;
    for (let y = 0; y < ySize; y += 1) {
      let value = field.zero;
      if (x <= degree.xDegree && y <= degree.yDegree) {
        const offset = x * sourceRowBytes + y * field.byteLength;
        value = field.mul(
          polynomial.coefficients.subarray(offset, offset + field.byteLength),
          coefficients[0],
        );
      }
      const shiftedX = axis === "x" ? x - 1 : x;
      const shiftedY = axis === "y" ? y - 1 : y;
      if (
        shiftedX >= 0 &&
        shiftedX <= degree.xDegree &&
        shiftedY >= 0 &&
        shiftedY <= degree.yDegree
      ) {
        const offset = shiftedX * sourceRowBytes + shiftedY * field.byteLength;
        value = field.add(
          value,
          field.mul(
            polynomial.coefficients.subarray(offset, offset + field.byteLength),
            coefficients[1],
          ),
        );
      }
      if (!addendIsZero && x < addend.xSize && y < addend.ySize) {
        const offset = x * addendRowBytes + y * field.byteLength;
        value = field.add(
          value,
          field.mul(addend.coefficients.subarray(offset, offset + field.byteLength), addendScale),
        );
      }
      output.set(value, outputRowOffset + y * field.byteLength);
    }
  }

  return BivariatePolynomialBuffer.fromOwnedBuffer(field, output, xSize, ySize);
}

function multiplyByTerm9Factor(
  polynomial: BivariatePolynomialBuffer,
  constant: FieldElement,
  xCoefficient: FieldElement,
  yCoefficient: FieldElement,
): BivariatePolynomialBuffer {
  const degree = polynomial.findDegree();
  if (degree.xDegree < 0 || degree.yDegree < 0) {
    return BivariatePolynomialBuffer.zero(polynomial.field);
  }

  const field = polynomial.field;
  const xSize = Math.max(polynomial.xSize, nextPowerOfTwo(degree.xDegree + 2));
  const ySize = Math.max(polynomial.ySize, nextPowerOfTwo(degree.yDegree + 2));
  const output = new Uint8Array(xSize * ySize * field.byteLength);
  const sourceRowBytes = polynomial.ySize * field.byteLength;
  const outputRowBytes = ySize * field.byteLength;

  for (let x = 0; x <= degree.xDegree + 1; x += 1) {
    const outputRowOffset = x * outputRowBytes;
    const currentRowOffset = x * sourceRowBytes;
    const previousRowOffset = (x - 1) * sourceRowBytes;
    for (let y = 0; y <= degree.yDegree + 1; y += 1) {
      const outputOffset = outputRowOffset + y * field.byteLength;
      let value = field.zero;
      let hasValue = false;
      if (x <= degree.xDegree && y <= degree.yDegree) {
        value = field.mul(
          polynomial.coefficients.subarray(
            currentRowOffset + y * field.byteLength,
            currentRowOffset + (y + 1) * field.byteLength,
          ),
          constant,
        );
        hasValue = true;
      }
      if (x > 0 && y <= degree.yDegree) {
        const xTerm = field.mul(
          polynomial.coefficients.subarray(
            previousRowOffset + y * field.byteLength,
            previousRowOffset + (y + 1) * field.byteLength,
          ),
          xCoefficient,
        );
        value = hasValue ? field.add(value, xTerm) : xTerm;
        hasValue = true;
      }
      if (x <= degree.xDegree && y > 0) {
        const yTerm = field.mul(
          polynomial.coefficients.subarray(
            currentRowOffset + (y - 1) * field.byteLength,
            currentRowOffset + y * field.byteLength,
          ),
          yCoefficient,
        );
        value = hasValue ? field.add(value, yTerm) : yTerm;
      }
      output.set(value, outputOffset);
    }
  }

  return BivariatePolynomialBuffer.fromOwnedBuffer(field, output, xSize, ySize);
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

  const outputEvals = new Uint8Array(leftEvals.byteLength);
  const elementBytes = field.byteLength;
  for (let x = 0; x < xSize; x += 1) {
    const sourceX = modulo(x + xShift, xSize);
    for (let y = 0; y < ySize; y += 1) {
      const sourceY = modulo(y + yShift, ySize);
      const sourceOffset = (sourceX * ySize + sourceY) * elementBytes;
      const rightOffset = (x * ySize + y) * elementBytes;
      outputEvals.set(
        field.mul(
          leftEvals.subarray(sourceOffset, sourceOffset + elementBytes),
          rightEvals.subarray(rightOffset, rightOffset + elementBytes),
        ),
        rightOffset,
      );
    }
  }

  return BivariatePolynomialBuffer.fromRouEvals(field, outputEvals, xSize, ySize);
}

function modulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
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

function checkedDomainProduct(left: number, right: number, label: string): number {
  if (!Number.isSafeInteger(left) || left <= 0 || !Number.isSafeInteger(right) || right <= 0) {
    throw new Error(`${label} domain dimensions must be positive safe integers.`);
  }
  const product = left * right;
  if (!Number.isSafeInteger(product)) {
    throw new Error(`${label} domain size must be a safe integer.`);
  }
  return product;
}
