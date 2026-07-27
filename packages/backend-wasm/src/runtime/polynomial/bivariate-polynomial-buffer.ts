import type { FieldElement, FieldRuntime } from "../field/field-runtime.js";

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

  static fromOwnedBuffer(
    field: FieldRuntime,
    coefficients: Uint8Array,
    xSize: number,
    ySize: number,
  ): BivariatePolynomialBuffer {
    return new BivariatePolynomialBuffer(field, coefficients, { xSize, ySize });
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
    let polynomial = new BivariatePolynomialBuffer(field, coefficients, { xSize, ySize });

    if (cosetX !== undefined) {
      polynomial = await polynomial.scaleCoeffsXBatch(field.inv(cosetX));
    }
    if (cosetY !== undefined) {
      polynomial = await polynomial.scaleCoeffsYBatch(field.inv(cosetY));
    }

    return polynomial;
  }

  clone(): BivariatePolynomialBuffer {
    return new BivariatePolynomialBuffer(this.field, this.field.cloneBuffer(this.coefficients), {
      xSize: this.xSize,
      ySize: this.ySize,
    });
  }

  async addBatch(other: BivariatePolynomialBuffer): Promise<BivariatePolynomialBuffer> {
    this.assertSameShape(other);
    return BivariatePolynomialBuffer.fromOwnedBuffer(
      this.field,
      await this.field.batchAddBuffer(this.coefficients, other.coefficients),
      this.xSize,
      this.ySize,
    );
  }

  async subBatch(other: BivariatePolynomialBuffer): Promise<BivariatePolynomialBuffer> {
    this.assertSameShape(other);
    return BivariatePolynomialBuffer.fromOwnedBuffer(
      this.field,
      await this.field.batchSubBuffer(this.coefficients, other.coefficients),
      this.xSize,
      this.ySize,
    );
  }

  async scaleBatch(factor: FieldElement): Promise<BivariatePolynomialBuffer> {
    return BivariatePolynomialBuffer.fromOwnedBuffer(
      this.field,
      await this.field.batchScaleBuffer(this.coefficients, factor),
      this.xSize,
      this.ySize,
    );
  }

  async addScaledPrefixBatch(
    other: BivariatePolynomialBuffer,
    factor: FieldElement,
  ): Promise<BivariatePolynomialBuffer> {
    if (this.field !== other.field) {
      throw new Error("Bivariate polynomial buffers must have the same field.");
    }
    return BivariatePolynomialBuffer.fromOwnedBuffer(
      this.field,
      await this.field.batchAddScaledPrefixBuffer(
        this.coefficients,
        this.xSize,
        this.ySize,
        other.coefficients,
        other.xSize,
        other.ySize,
        factor,
      ),
      this.xSize,
      this.ySize,
    );
  }

  async scaleCoeffsXBatch(factor: FieldElement): Promise<BivariatePolynomialBuffer> {
    return BivariatePolynomialBuffer.fromOwnedBuffer(
      this.field,
      await this.field.batchScaleCoeffsXBuffer(this.coefficients, this.xSize, this.ySize, factor),
      this.xSize,
      this.ySize,
    );
  }

  async scaleCoeffsYBatch(factor: FieldElement): Promise<BivariatePolynomialBuffer> {
    return BivariatePolynomialBuffer.fromOwnedBuffer(
      this.field,
      await this.field.batchScaleCoeffsYBuffer(this.coefficients, this.xSize, this.ySize, factor),
      this.xSize,
      this.ySize,
    );
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

    const output = this.field.createZeroBuffer(xSize * ySize);
    const copyXSize = Math.min(this.xSize, xSize);
    const copyYBytes = Math.min(this.ySize, ySize) * this.field.byteLength;
    const sourceRowBytes = this.ySize * this.field.byteLength;
    const targetRowBytes = ySize * this.field.byteLength;
    for (let x = 0; x < copyXSize; x += 1) {
      output.set(
        this.coefficients.subarray(
          x * sourceRowBytes,
          x * sourceRowBytes + copyYBytes,
        ),
        x * targetRowBytes,
      );
    }

    return BivariatePolynomialBuffer.fromOwnedBuffer(this.field, output, xSize, ySize);
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

  async evalBatch(xPoint: FieldElement, yPoint: FieldElement): Promise<FieldElement> {
    return await this.field.evaluatePolynomialBuffer(
      this.coefficients,
      this.xSize,
      this.ySize,
      xPoint,
      yPoint,
    );
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

    const leftEvals = await resizeForMultiplication(this, xSize, ySize).toRouEvals();
    const rightEvals = await resizeForMultiplication(other, xSize, ySize).toRouEvals();
    const outputEvals = await this.field.batchMulBuffer(leftEvals, rightEvals);

    return await BivariatePolynomialBuffer.fromRouEvals(this.field, outputEvals, xSize, ySize);
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

  async toRouEvals(cosetX?: FieldElement, cosetY?: FieldElement): Promise<Uint8Array> {
    if (cosetX === undefined && cosetY === undefined && this.xSize > 1 && this.ySize > 1) {
      return await biNttBuffer(this.field, this.coefficients, this.xSize, this.ySize, "forward");
    }

    let scaled = this.clone();
    if (cosetX !== undefined) {
      scaled = await scaled.scaleCoeffsXBatch(cosetX);
    }
    if (cosetY !== undefined) {
      scaled = await scaled.scaleCoeffsYBatch(cosetY);
    }

    return await biNttBuffer(this.field, scaled.coefficients, this.xSize, this.ySize, "forward");
  }

  async divByRuffiniBatch(
    xPoint: FieldElement,
    yPoint: FieldElement,
  ): Promise<BivariateBufferRuffiniDivisionResult> {
    const xDivision = await this.field.ruffiniXBuffer(
      this.coefficients,
      this.xSize,
      this.ySize,
      xPoint,
    );
    const yDivision = await this.field.ruffiniYBuffer(xDivision.remainder, this.ySize, yPoint);
    return {
      quotientX: BivariatePolynomialBuffer.fromOwnedBuffer(
        this.field,
        xDivision.quotient,
        this.xSize,
        this.ySize,
      ),
      quotientY: BivariatePolynomialBuffer.fromOwnedBuffer(
        this.field,
        yDivision.quotient,
        1,
        this.ySize,
      ),
      remainder: yDivision.remainder,
    };
  }

  async divByVanishingOptBatch(
    xDegree: number,
    yDegree: number,
  ): Promise<BivariateBufferVanishingQuotientResult> {
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
    if (optimized.xSize % xDegree !== 0 || optimized.ySize % yDegree !== 0) {
      throw new Error("Optimized numerator shape must be divisible by the vanishing degrees.");
    }
    const result = await this.field.divideByVanishingBuffer(
      optimized.coefficients,
      optimized.xSize,
      optimized.ySize,
      xDegree,
      yDegree,
    );
    return {
      quotientX: BivariatePolynomialBuffer.fromOwnedBuffer(
        this.field,
        result.quotientX,
        optimized.xSize,
        optimized.ySize,
      ),
      quotientY: BivariatePolynomialBuffer.fromOwnedBuffer(
        this.field,
        result.quotientY,
        xDegree,
        optimized.ySize,
      ),
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

  return BivariatePolynomialBuffer.fromOwnedBuffer(field, output, xSize, ySize);
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

  return BivariatePolynomialBuffer.fromOwnedBuffer(field, output, xSize, ySize);
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

function resizeForMultiplication(
  polynomial: BivariatePolynomialBuffer,
  targetXSize: number,
  targetYSize: number,
): BivariatePolynomialBuffer {
  const xSize = nextPowerOfTwo(targetXSize);
  const ySize = nextPowerOfTwo(targetYSize);
  const output = new Uint8Array(xSize * ySize * polynomial.field.byteLength);
  const copiedXSize = Math.min(polynomial.xSize, xSize);
  const copiedYBytes = Math.min(polynomial.ySize, ySize) * polynomial.field.byteLength;
  const sourceRowBytes = polynomial.ySize * polynomial.field.byteLength;
  const targetRowBytes = ySize * polynomial.field.byteLength;

  for (let x = 0; x < copiedXSize; x += 1) {
    output.set(
      polynomial.coefficients.subarray(x * sourceRowBytes, x * sourceRowBytes + copiedYBytes),
      x * targetRowBytes,
    );
  }

  return BivariatePolynomialBuffer.fromOwnedBuffer(polynomial.field, output, xSize, ySize);
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
