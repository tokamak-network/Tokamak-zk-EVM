import { DensePolynomialExt } from "./dense-polynomial.js";
import type { FieldElement, FieldRuntime } from "../field/field.js";

export interface BivariatePolynomialBufferShape {
  readonly xSize: number;
  readonly ySize: number;
}

export interface BivariateBufferRuffiniDivisionResult {
  readonly quotientX: BivariatePolynomialBuffer;
  readonly quotientY: BivariatePolynomialBuffer;
  readonly remainder: FieldElement;
}

export interface BivariateBufferVanishingQuotientResult {
  readonly quotientX: BivariatePolynomialBuffer;
  readonly quotientY: BivariatePolynomialBuffer;
}

export class BivariatePolynomialBuffer {
  readonly xSize: number;
  readonly ySize: number;
  readonly coefficients: Uint8Array;

  private constructor(
    readonly field: FieldRuntime,
    coefficients: Uint8Array,
    shape: BivariatePolynomialBufferShape,
  ) {
    validateShape(shape.xSize, shape.ySize);
    const expectedByteLength = shape.xSize * shape.ySize * field.byteLength;
    if (coefficients.byteLength !== expectedByteLength) {
      throw new Error("Coefficient buffer byte length does not match the bivariate polynomial shape.");
    }

    this.xSize = shape.xSize;
    this.ySize = shape.ySize;
    this.coefficients = coefficients;
  }

  static zero(field: FieldRuntime): BivariatePolynomialBuffer {
    return new BivariatePolynomialBuffer(field, field.createZeroBuffer(1), { xSize: 1, ySize: 1 });
  }

  static fromCoeffs(
    field: FieldRuntime,
    coefficients: readonly FieldElement[],
    xSize: number,
    ySize: number,
  ): BivariatePolynomialBuffer {
    validateShape(xSize, ySize);
    if (coefficients.length !== xSize * ySize) {
      throw new Error("Coefficient count does not match the bivariate polynomial shape.");
    }

    return new BivariatePolynomialBuffer(field, field.concat(coefficients), { xSize, ySize });
  }

  static fromBuffer(
    field: FieldRuntime,
    coefficients: Uint8Array,
    xSize: number,
    ySize: number,
  ): BivariatePolynomialBuffer {
    return new BivariatePolynomialBuffer(field, field.cloneBuffer(coefficients), { xSize, ySize });
  }

  static fromOwnedBuffer(
    field: FieldRuntime,
    coefficients: Uint8Array,
    xSize: number,
    ySize: number,
  ): BivariatePolynomialBuffer {
    return new BivariatePolynomialBuffer(field, coefficients, { xSize, ySize });
  }

  static fromDense(polynomial: DensePolynomialExt): BivariatePolynomialBuffer {
    return BivariatePolynomialBuffer.fromCoeffs(
      polynomial.field,
      polynomial.coefficients,
      polynomial.xSize,
      polynomial.ySize,
    );
  }

  static async fromRouEvals(
    field: FieldRuntime,
    evals: Uint8Array,
    xSize: number,
    ySize: number,
    cosetX?: FieldElement,
    cosetY?: FieldElement,
  ): Promise<BivariatePolynomialBuffer> {
    const coefficients = await biNttBuffer(field, evals, xSize, ySize, "inverse");
    const polynomial = new BivariatePolynomialBuffer(field, coefficients, { xSize, ySize });

    if (cosetX !== undefined) {
      polynomial.scaleCoeffsXAssign(field.inv(cosetX));
    }
    if (cosetY !== undefined) {
      polynomial.scaleCoeffsYAssign(field.inv(cosetY));
    }

    return polynomial;
  }

  clone(): BivariatePolynomialBuffer {
    return new BivariatePolynomialBuffer(this.field, this.field.cloneBuffer(this.coefficients), {
      xSize: this.xSize,
      ySize: this.ySize,
    });
  }

  add(other: BivariatePolynomialBuffer): BivariatePolynomialBuffer {
    const accumulator = resizedAccumulator(this, other);
    accumulator.addScaledPrefixAssign(this, this.field.one);
    accumulator.addScaledPrefixAssign(other, this.field.one);
    return accumulator;
  }

  sub(other: BivariatePolynomialBuffer): BivariatePolynomialBuffer {
    const accumulator = resizedAccumulator(this, other);
    accumulator.addScaledPrefixAssign(this, this.field.one);
    accumulator.addScaledPrefixAssign(other, this.field.neg(this.field.one));
    return accumulator;
  }

  scale(factor: FieldElement): BivariatePolynomialBuffer {
    return this.clone().scaleAssign(factor);
  }

  scaleCoeffsX(factor: FieldElement): BivariatePolynomialBuffer {
    return this.clone().scaleCoeffsXAssign(factor);
  }

  scaleCoeffsY(factor: FieldElement): BivariatePolynomialBuffer {
    return this.clone().scaleCoeffsYAssign(factor);
  }

  toDense(): DensePolynomialExt {
    return DensePolynomialExt.fromCoeffs(this.field, this.toCoeffs(), this.xSize, this.ySize);
  }

  toCoeffs(): FieldElement[] {
    return this.field.split(this.coefficients);
  }

  toHexCoeffs(): string[] {
    return this.toCoeffs().map((coefficient) => this.field.toHex(coefficient));
  }

  getCoeff(xIndex: number, yIndex: number): FieldElement {
    return this.field.readBufferElement(this.coefficients, this.coefficientIndex(xIndex, yIndex));
  }

  setCoeff(xIndex: number, yIndex: number, value: FieldElement): void {
    this.field.writeBufferElement(this.coefficients, this.coefficientIndex(xIndex, yIndex), value);
  }

  findDegree(): { readonly xDegree: number; readonly yDegree: number } {
    let xDegree = -1;
    let yDegree = -1;

    for (let x = this.xSize - 1; x >= 0; x -= 1) {
      for (let y = 0; y < this.ySize; y += 1) {
        if (!this.field.isZero(this.getCoeff(x, y))) {
          xDegree = x;
          break;
        }
      }
      if (xDegree !== -1) {
        break;
      }
    }

    for (let y = this.ySize - 1; y >= 0; y -= 1) {
      for (let x = 0; x < this.xSize; x += 1) {
        if (!this.field.isZero(this.getCoeff(x, y))) {
          yDegree = y;
          break;
        }
      }
      if (yDegree !== -1) {
        break;
      }
    }

    return { xDegree, yDegree };
  }

  optimizeSize(): BivariatePolynomialBuffer {
    const { xDegree, yDegree } = this.findDegree();
    if (xDegree < 0 || yDegree < 0) {
      return BivariatePolynomialBuffer.zero(this.field);
    }

    return this.resize(xDegree + 1, yDegree + 1);
  }

  resize(targetXSize: number, targetYSize: number): BivariatePolynomialBuffer {
    const xSize = nextPowerOfTwo(targetXSize);
    const ySize = nextPowerOfTwo(targetYSize);
    if (xSize === this.xSize && ySize === this.ySize) {
      return this.clone();
    }

    const output = new BivariatePolynomialBuffer(this.field, this.field.createZeroBuffer(xSize * ySize), {
      xSize,
      ySize,
    });
    for (let x = 0; x < Math.min(this.xSize, xSize); x += 1) {
      for (let y = 0; y < Math.min(this.ySize, ySize); y += 1) {
        output.setCoeff(x, y, this.getCoeff(x, y));
      }
    }

    return output;
  }

  eval(xPoint: FieldElement, yPoint: FieldElement): FieldElement {
    let result = this.field.zero;

    for (let x = this.xSize - 1; x >= 0; x -= 1) {
      let rowValue = this.field.zero;
      for (let y = this.ySize - 1; y >= 0; y -= 1) {
        rowValue = this.field.add(this.getCoeff(x, y), this.field.mul(rowValue, yPoint));
      }
      result = this.field.add(rowValue, this.field.mul(result, xPoint));
    }

    return result;
  }

  addAssign(other: BivariatePolynomialBuffer): this {
    this.assertSameShape(other);
    this.addSameShapeAssign(other);
    return this;
  }

  subAssign(other: BivariatePolynomialBuffer): this {
    this.assertSameShape(other);
    this.subSameShapeAssign(other);
    return this;
  }

  async mul(other: BivariatePolynomialBuffer): Promise<BivariatePolynomialBuffer> {
    if (this.field !== other.field) {
      throw new Error("Bivariate polynomial buffers must have the same field.");
    }

    const leftDegree = this.findDegree();
    const rightDegree = other.findDegree();
    if (
      leftDegree.xDegree < 0 ||
      leftDegree.yDegree < 0 ||
      rightDegree.xDegree < 0 ||
      rightDegree.yDegree < 0
    ) {
      return BivariatePolynomialBuffer.zero(this.field);
    }

    const xSize = nextPowerOfTwo(leftDegree.xDegree + rightDegree.xDegree + 1);
    const ySize = nextPowerOfTwo(leftDegree.yDegree + rightDegree.yDegree + 1);
    if (leftDegree.yDegree === 0 || rightDegree.yDegree === 0) {
      return await multiplyByXUnivariateFactor(this, other, xSize, ySize);
    }
    if (leftDegree.xDegree === 0 || rightDegree.xDegree === 0) {
      return await multiplyByYUnivariateFactor(this, other, xSize, ySize);
    }

    const leftEvals = await this.resize(xSize, ySize).toRouEvals();
    const rightEvals = await other.resize(xSize, ySize).toRouEvals();
    const outputEvals = this.field.createZeroBuffer(xSize * ySize);

    for (let index = 0; index < xSize * ySize; index += 1) {
      this.field.writeBufferElement(
        outputEvals,
        index,
        this.field.mul(
          this.field.readBufferElement(leftEvals, index),
          this.field.readBufferElement(rightEvals, index),
        ),
      );
    }

    return await BivariatePolynomialBuffer.fromRouEvals(this.field, outputEvals, xSize, ySize);
  }

  mulMonomial(xExponent: number, yExponent: number): BivariatePolynomialBuffer {
    if (!Number.isSafeInteger(xExponent) || xExponent < 0 || !Number.isSafeInteger(yExponent) || yExponent < 0) {
      throw new Error("Monomial exponents must be non-negative safe integers.");
    }

    const { xDegree, yDegree } = this.findDegree();
    if (xDegree < 0 || yDegree < 0) {
      return BivariatePolynomialBuffer.zero(this.field);
    }

    const xSize = nextPowerOfTwo(Math.max(1, xDegree + 1 + xExponent));
    const ySize = nextPowerOfTwo(Math.max(1, yDegree + 1 + yExponent));
    const output = new BivariatePolynomialBuffer(this.field, this.field.createZeroBuffer(xSize * ySize), {
      xSize,
      ySize,
    });

    for (let x = 0; x <= xDegree; x += 1) {
      for (let y = 0; y <= yDegree; y += 1) {
        const coefficient = this.getCoeff(x, y);
        if (!this.field.isZero(coefficient)) {
          output.setCoeff(x + xExponent, y + yExponent, coefficient);
        }
      }
    }

    return output;
  }

  scaleAssign(factor: FieldElement): this {
    for (let index = 0; index < this.xSize * this.ySize; index += 1) {
      this.field.writeBufferElement(
        this.coefficients,
        index,
        this.field.mul(this.field.readBufferElement(this.coefficients, index), factor),
      );
    }
    return this;
  }

  addScaledAssign(other: BivariatePolynomialBuffer, factor: FieldElement): this {
    this.assertSameShape(other);
    return this.addScaledPrefixAssign(other, factor);
  }

  addScaledPrefixAssign(other: BivariatePolynomialBuffer, factor: FieldElement): this {
    if (this.field !== other.field) {
      throw new Error("Bivariate polynomial buffers must have the same field.");
    }
    if (other.xSize > this.xSize || other.ySize > this.ySize) {
      throw new Error("Source polynomial shape must fit inside the target polynomial shape.");
    }
    if (this.field.isZero(factor)) {
      return this;
    }
    const isOne = this.field.eq(factor, this.field.one);
    const isMinusOne = this.field.eq(factor, this.field.neg(this.field.one));
    if (this.xSize === other.xSize && this.ySize === other.ySize) {
      if (isOne) {
        this.addSameShapeAssign(other);
      } else if (isMinusOne) {
        this.subSameShapeAssign(other);
      } else {
        this.addScaledSameShapeAssign(other, factor);
      }
      return this;
    }

    const elementBytes = this.field.byteLength;
    const targetRowBytes = this.ySize * elementBytes;
    const sourceRowBytes = other.ySize * elementBytes;
    for (let x = 0; x < other.xSize; x += 1) {
      const targetRowOffset = x * targetRowBytes;
      const sourceRowOffset = x * sourceRowBytes;
      for (let yOffset = 0; yOffset < sourceRowBytes; yOffset += elementBytes) {
        const targetOffset = targetRowOffset + yOffset;
        const sourceOffset = sourceRowOffset + yOffset;
        const target = this.coefficients.subarray(targetOffset, targetOffset + elementBytes);
        const source = other.coefficients.subarray(sourceOffset, sourceOffset + elementBytes);
        if (isOne) {
          this.coefficients.set(this.field.add(target, source), targetOffset);
        } else if (isMinusOne) {
          this.coefficients.set(this.field.sub(target, source), targetOffset);
        } else {
          this.coefficients.set(this.field.add(target, this.field.mul(source, factor)), targetOffset);
        }
      }
    }
    return this;
  }

  scaleCoeffsXAssign(factor: FieldElement): this {
    let power = this.field.one;
    for (let x = 0; x < this.xSize; x += 1) {
      for (let y = 0; y < this.ySize; y += 1) {
        const index = this.coefficientIndex(x, y);
        this.field.writeBufferElement(
          this.coefficients,
          index,
          this.field.mul(this.field.readBufferElement(this.coefficients, index), power),
        );
      }
      power = this.field.mul(power, factor);
    }
    return this;
  }

  scaleCoeffsYAssign(factor: FieldElement): this {
    const powers: FieldElement[] = [];
    let power = this.field.one;
    for (let y = 0; y < this.ySize; y += 1) {
      powers.push(power);
      power = this.field.mul(power, factor);
    }

    for (let x = 0; x < this.xSize; x += 1) {
      for (let y = 0; y < this.ySize; y += 1) {
        const index = this.coefficientIndex(x, y);
        this.field.writeBufferElement(
          this.coefficients,
          index,
          this.field.mul(this.field.readBufferElement(this.coefficients, index), powers[y]),
        );
      }
    }
    return this;
  }

  async toRouEvals(cosetX?: FieldElement, cosetY?: FieldElement): Promise<Uint8Array> {
    if (cosetX === undefined && cosetY === undefined && this.xSize > 1 && this.ySize > 1) {
      return await biNttBuffer(this.field, this.coefficients, this.xSize, this.ySize, "forward");
    }

    const scaled = this.clone();
    if (cosetX !== undefined) {
      scaled.scaleCoeffsXAssign(cosetX);
    }
    if (cosetY !== undefined) {
      scaled.scaleCoeffsYAssign(cosetY);
    }

    return await biNttBuffer(this.field, scaled.coefficients, this.xSize, this.ySize, "forward");
  }

  divByRuffini(xPoint: FieldElement, yPoint: FieldElement): BivariateBufferRuffiniDivisionResult {
    const elementBytes = this.field.byteLength;
    if (xPoint.byteLength !== elementBytes || yPoint.byteLength !== elementBytes) {
      throw new Error("Ruffini division points must be field elements.");
    }

    const quotientXBuffer = this.field.createZeroBuffer(this.xSize * this.ySize);
    const xRemainderBuffer = this.field.createZeroBuffer(this.ySize);

    if (this.xSize === 1) {
      xRemainderBuffer.set(this.coefficients);
    } else {
      const highestInputOffset = (this.xSize - 1) * this.ySize * elementBytes;
      const highestQuotientOffset = (this.xSize - 2) * this.ySize * elementBytes;
      quotientXBuffer.set(
        this.coefficients.subarray(highestInputOffset, highestInputOffset + this.ySize * elementBytes),
        highestQuotientOffset,
      );

      for (let x = this.xSize - 3; x >= 0; x -= 1) {
        const inputRowOffset = (x + 1) * this.ySize * elementBytes;
        const nextQuotientRowOffset = (x + 1) * this.ySize * elementBytes;
        const quotientRowOffset = x * this.ySize * elementBytes;
        for (let y = 0; y < this.ySize; y += 1) {
          const elementOffset = y * elementBytes;
          quotientXBuffer.set(
            this.field.add(
              this.coefficients.subarray(
                inputRowOffset + elementOffset,
                inputRowOffset + elementOffset + elementBytes,
              ),
              this.field.mul(
                xPoint,
                quotientXBuffer.subarray(
                  nextQuotientRowOffset + elementOffset,
                  nextQuotientRowOffset + elementOffset + elementBytes,
                ),
              ),
            ),
            quotientRowOffset + elementOffset,
          );
        }
      }

      for (let y = 0; y < this.ySize; y += 1) {
        const elementOffset = y * elementBytes;
        xRemainderBuffer.set(
          this.field.add(
            this.coefficients.subarray(elementOffset, elementOffset + elementBytes),
            this.field.mul(xPoint, quotientXBuffer.subarray(elementOffset, elementOffset + elementBytes)),
          ),
          elementOffset,
        );
      }
    }

    const quotientYBuffer = this.field.createZeroBuffer(this.ySize);
    let remainder: FieldElement;
    if (this.ySize === 1) {
      remainder = xRemainderBuffer.slice(0, elementBytes);
    } else {
      quotientYBuffer.set(
        xRemainderBuffer.subarray((this.ySize - 1) * elementBytes, this.ySize * elementBytes),
        (this.ySize - 2) * elementBytes,
      );
      for (let y = this.ySize - 3; y >= 0; y -= 1) {
        const sourceOffset = (y + 1) * elementBytes;
        quotientYBuffer.set(
          this.field.add(
            xRemainderBuffer.subarray(sourceOffset, sourceOffset + elementBytes),
            this.field.mul(yPoint, quotientYBuffer.subarray(sourceOffset, sourceOffset + elementBytes)),
          ),
          y * elementBytes,
        );
      }
      remainder = this.field.add(
        xRemainderBuffer.subarray(0, elementBytes),
        this.field.mul(yPoint, quotientYBuffer.subarray(0, elementBytes)),
      );
    }

    return {
      quotientX: BivariatePolynomialBuffer.fromOwnedBuffer(this.field, quotientXBuffer, this.xSize, this.ySize),
      quotientY: BivariatePolynomialBuffer.fromOwnedBuffer(this.field, quotientYBuffer, 1, this.ySize),
      remainder,
    };
  }

  divByVanishingOpt(xDegree: number, yDegree: number): BivariateBufferVanishingQuotientResult {
    if (!isPowerOfTwo(xDegree) || !isPowerOfTwo(yDegree)) {
      throw new Error("Vanishing polynomial degrees must be powers of two.");
    }

    const optimized = this.optimizeSize();
    const { xDegree: numeratorXDegree, yDegree: numeratorYDegree } = optimized.findDegree();
    if (numeratorXDegree < 0 || numeratorYDegree < 0) {
      return {
        quotientX: BivariatePolynomialBuffer.zero(this.field),
        quotientY: BivariatePolynomialBuffer.zero(this.field),
      };
    }

    if (numeratorXDegree < xDegree || numeratorYDegree < yDegree) {
      throw new Error("The numerator degrees must be at least the vanishing polynomial degrees.");
    }

    const xSize = optimized.xSize;
    const ySize = optimized.ySize;
    const xBlockCount = xSize / xDegree;
    const yBlockCount = ySize / yDegree;
    if (!Number.isInteger(xBlockCount) || !Number.isInteger(yBlockCount)) {
      throw new Error("Optimized numerator shape must be divisible by the vanishing degrees.");
    }

    const pCoefficients = this.field.cloneBuffer(optimized.coefficients);
    const accumulatedBlock = this.field.createZeroBuffer(xDegree * ySize);

    for (let blockX = 0; blockX < xBlockCount; blockX += 1) {
      const xOffset = blockX * xDegree;
      for (let localX = 0; localX < xDegree; localX += 1) {
        for (let y = 0; y < ySize; y += 1) {
          const sourceIndex = (xOffset + localX) * ySize + y;
          const targetIndex = localX * ySize + y;
          this.field.writeBufferElement(
            accumulatedBlock,
            targetIndex,
            this.field.add(
              this.field.readBufferElement(accumulatedBlock, targetIndex),
              this.field.readBufferElement(pCoefficients, sourceIndex),
            ),
          );
        }
      }
    }

    const quotientYCoefficients = this.field.createZeroBuffer(xDegree * ySize);
    if (ySize > yDegree) {
      for (let x = 0; x < xDegree; x += 1) {
        const rowStart = x * ySize;
        for (let y = 0; y < ySize - yDegree; y += 1) {
          const previous =
            y >= yDegree ? this.field.readBufferElement(quotientYCoefficients, rowStart + y - yDegree) : this.field.zero;
          this.field.writeBufferElement(
            quotientYCoefficients,
            rowStart + y,
            this.field.sub(previous, this.field.readBufferElement(accumulatedBlock, rowStart + y)),
          );
        }
      }
    }

    const bCoefficients = this.field.cloneBuffer(pCoefficients);
    if (ySize > yDegree) {
      for (let x = 0; x < xDegree; x += 1) {
        const rowStart = x * ySize;
        for (let y = 0; y < ySize - yDegree; y += 1) {
          const coefficient = this.field.readBufferElement(quotientYCoefficients, rowStart + y);
          this.field.writeBufferElement(
            bCoefficients,
            rowStart + y,
            this.field.add(this.field.readBufferElement(bCoefficients, rowStart + y), coefficient),
          );
          this.field.writeBufferElement(
            bCoefficients,
            rowStart + y + yDegree,
            this.field.sub(this.field.readBufferElement(bCoefficients, rowStart + y + yDegree), coefficient),
          );
        }
      }
    }

    const quotientXCoefficients = this.field.createZeroBuffer(xSize * ySize);
    if (xSize > xDegree) {
      for (let x = 0; x < xSize - xDegree; x += 1) {
        for (let y = 0; y < ySize; y += 1) {
          const targetIndex = x * ySize + y;
          const previous =
            x >= xDegree ? this.field.readBufferElement(quotientXCoefficients, (x - xDegree) * ySize + y) : this.field.zero;
          this.field.writeBufferElement(
            quotientXCoefficients,
            targetIndex,
            this.field.sub(previous, this.field.readBufferElement(bCoefficients, targetIndex)),
          );
        }
      }
    }

    return {
      quotientX: new BivariatePolynomialBuffer(this.field, quotientXCoefficients, { xSize, ySize }),
      quotientY: new BivariatePolynomialBuffer(this.field, quotientYCoefficients, { xSize: xDegree, ySize }),
    };
  }

  private coefficientIndex(xIndex: number, yIndex: number): number {
    validateIndex(xIndex, this.xSize, "x");
    validateIndex(yIndex, this.ySize, "y");
    return xIndex * this.ySize + yIndex;
  }

  private assertSameShape(other: BivariatePolynomialBuffer): void {
    if (this.field !== other.field || this.xSize !== other.xSize || this.ySize !== other.ySize) {
      throw new Error("Bivariate polynomial buffers must have the same field and shape.");
    }
  }

  private addSameShapeAssign(other: BivariatePolynomialBuffer): void {
    const elementBytes = this.field.byteLength;
    for (let offset = 0; offset < this.coefficients.byteLength; offset += elementBytes) {
      this.coefficients.set(
        this.field.add(
          this.coefficients.subarray(offset, offset + elementBytes),
          other.coefficients.subarray(offset, offset + elementBytes),
        ),
        offset,
      );
    }
  }

  private subSameShapeAssign(other: BivariatePolynomialBuffer): void {
    const elementBytes = this.field.byteLength;
    for (let offset = 0; offset < this.coefficients.byteLength; offset += elementBytes) {
      this.coefficients.set(
        this.field.sub(
          this.coefficients.subarray(offset, offset + elementBytes),
          other.coefficients.subarray(offset, offset + elementBytes),
        ),
        offset,
      );
    }
  }

  private addScaledSameShapeAssign(other: BivariatePolynomialBuffer, factor: FieldElement): void {
    const elementBytes = this.field.byteLength;
    for (let offset = 0; offset < this.coefficients.byteLength; offset += elementBytes) {
      const target = this.coefficients.subarray(offset, offset + elementBytes);
      const source = other.coefficients.subarray(offset, offset + elementBytes);
      this.coefficients.set(this.field.add(target, this.field.mul(source, factor)), offset);
    }
  }

}

async function multiplyByXUnivariateFactor(
  left: BivariatePolynomialBuffer,
  right: BivariatePolynomialBuffer,
  xSize: number,
  ySize: number,
): Promise<BivariatePolynomialBuffer> {
  const xFactor = left.findDegree().yDegree === 0 ? left : right;
  const other = xFactor === left ? right : left;
  const field = left.field;
  const xFactorEvals = await xFactor.resize(xSize, 1).toRouEvals();
  const output = field.createZeroBuffer(xSize * ySize);

  for (let y = 0; y < ySize; y += 1) {
    const column = field.createZeroBuffer(xSize);
    if (y < other.ySize) {
      for (let x = 0; x < Math.min(other.xSize, xSize); x += 1) {
        field.writeBufferElement(column, x, other.getCoeff(x, y));
      }
    }

    const columnEvals = await field.fftBuffer(column);
    for (let x = 0; x < xSize; x += 1) {
      field.writeBufferElement(
        columnEvals,
        x,
        field.mul(field.readBufferElement(columnEvals, x), field.readBufferElement(xFactorEvals, x)),
      );
    }
    const columnCoeffs = await field.ifftBuffer(columnEvals);
    for (let x = 0; x < xSize; x += 1) {
      field.writeBufferElement(output, x * ySize + y, field.readBufferElement(columnCoeffs, x));
    }
  }

  return BivariatePolynomialBuffer.fromBuffer(field, output, xSize, ySize);
}

async function multiplyByYUnivariateFactor(
  left: BivariatePolynomialBuffer,
  right: BivariatePolynomialBuffer,
  xSize: number,
  ySize: number,
): Promise<BivariatePolynomialBuffer> {
  const yFactor = left.findDegree().xDegree === 0 ? left : right;
  const other = yFactor === left ? right : left;
  const field = left.field;
  const yFactorEvals = await yFactor.resize(1, ySize).toRouEvals();
  const output = field.createZeroBuffer(xSize * ySize);

  for (let x = 0; x < xSize; x += 1) {
    const row = field.createZeroBuffer(ySize);
    if (x < other.xSize) {
      for (let y = 0; y < Math.min(other.ySize, ySize); y += 1) {
        field.writeBufferElement(row, y, other.getCoeff(x, y));
      }
    }

    const rowEvals = await field.fftBuffer(row);
    for (let y = 0; y < ySize; y += 1) {
      field.writeBufferElement(
        rowEvals,
        y,
        field.mul(field.readBufferElement(rowEvals, y), field.readBufferElement(yFactorEvals, y)),
      );
    }
    const rowCoeffs = await field.ifftBuffer(rowEvals);
    output.set(rowCoeffs, x * ySize * field.byteLength);
  }

  return BivariatePolynomialBuffer.fromBuffer(field, output, xSize, ySize);
}

export async function biNttBuffer(
  field: FieldRuntime,
  values: Uint8Array,
  xSize: number,
  ySize: number,
  direction: "forward" | "inverse",
): Promise<Uint8Array> {
  validateShape(xSize, ySize);
  if (field.bufferElementCount(values) !== xSize * ySize) {
    throw new Error("NTT input count does not match the bivariate shape.");
  }

  if (xSize === 1 || ySize === 1) {
    return await field.batchFftBuffer(values, xSize * ySize, direction);
  }

  const yTransformed = await field.batchFftBuffer(values, ySize, direction);
  const transposed = transposeRowMajorFieldBuffer(field, yTransformed, xSize, ySize);
  const xTransformedTransposed = await field.batchFftBuffer(transposed, xSize, direction);
  return transposeRowMajorFieldBuffer(field, xTransformedTransposed, ySize, xSize);
}

function transposeRowMajorFieldBuffer(
  field: FieldRuntime,
  values: Uint8Array,
  rowCount: number,
  columnCount: number,
): Uint8Array {
  if (field.bufferElementCount(values) !== rowCount * columnCount) {
    throw new Error("Cannot transpose a field buffer whose length does not match its shape.");
  }

  const output = new Uint8Array(values.byteLength);
  const elementByteLength = field.byteLength;
  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      output.set(
        values.subarray(
          (row * columnCount + column) * elementByteLength,
          (row * columnCount + column + 1) * elementByteLength,
        ),
        (column * rowCount + row) * elementByteLength,
      );
    }
  }

  return output;
}

function validateShape(xSize: number, ySize: number): void {
  if (!Number.isSafeInteger(xSize) || xSize <= 0 || !Number.isSafeInteger(ySize) || ySize <= 0) {
    throw new Error("Bivariate polynomial sizes must be positive safe integers.");
  }
  if (!isPowerOfTwo(xSize) || !isPowerOfTwo(ySize)) {
    throw new Error("Bivariate polynomial sizes must be powers of two.");
  }
}

function validateIndex(index: number, size: number, axis: string): void {
  if (!Number.isSafeInteger(index) || index < 0 || index >= size) {
    throw new Error(`Bivariate polynomial ${axis} index is out of bounds.`);
  }
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

function resizedAccumulator(
  left: BivariatePolynomialBuffer,
  right: BivariatePolynomialBuffer,
): BivariatePolynomialBuffer {
  if (left.field !== right.field) {
    throw new Error("Bivariate polynomial buffers must have the same field.");
  }

  return BivariatePolynomialBuffer.zero(left.field).resize(
    Math.max(left.xSize, right.xSize),
    Math.max(left.ySize, right.ySize),
  );
}

function isPowerOfTwo(value: number): boolean {
  if (!Number.isSafeInteger(value) || value <= 0) {
    return false;
  }

  let size = 1;
  while (size < value) {
    size *= 2;
  }
  return size === value;
}
