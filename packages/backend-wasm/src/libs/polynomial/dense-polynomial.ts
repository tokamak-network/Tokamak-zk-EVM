import type { FieldElement, FieldRuntime } from "../runtime/field.js";

export interface DensePolynomialShape {
  readonly xSize: number;
  readonly ySize: number;
}

export interface DensePolynomialJson extends DensePolynomialShape {
  readonly coefficients: readonly string[];
}

export interface PolynomialDivisionResult {
  readonly quotient: DensePolynomialExt;
  readonly remainder: DensePolynomialExt;
}

export interface BivariateRuffiniDivisionResult {
  readonly quotientX: DensePolynomialExt;
  readonly quotientY: DensePolynomialExt;
  readonly remainder: FieldElement;
}

export interface VanishingDivisionResult {
  readonly quotientX: DensePolynomialExt;
  readonly quotientY: DensePolynomialExt;
  readonly remainder: DensePolynomialExt;
}

export class DensePolynomialExt {
  readonly xSize: number;
  readonly ySize: number;
  readonly coefficients: readonly FieldElement[];

  private constructor(
    readonly field: FieldRuntime,
    coefficients: readonly FieldElement[],
    shape: DensePolynomialShape,
  ) {
    validateShape(shape.xSize, shape.ySize);

    if (coefficients.length !== shape.xSize * shape.ySize) {
      throw new Error("Coefficient count does not match the bivariate polynomial shape.");
    }

    this.xSize = shape.xSize;
    this.ySize = shape.ySize;
    this.coefficients = coefficients.map((coefficient) => coefficient.slice());
  }

  static zero(field: FieldRuntime): DensePolynomialExt {
    return new DensePolynomialExt(field, [field.zero], { xSize: 1, ySize: 1 });
  }

  static fromCoeffs(
    field: FieldRuntime,
    coefficients: readonly FieldElement[],
    xSize: number,
    ySize: number,
  ): DensePolynomialExt {
    return new DensePolynomialExt(field, coefficients, { xSize, ySize });
  }

  static fromHexCoeffs(
    field: FieldRuntime,
    coefficients: readonly string[],
    xSize: number,
    ySize: number,
  ): DensePolynomialExt {
    return DensePolynomialExt.fromCoeffs(
      field,
      coefficients.map((coefficient) => field.fromHex(coefficient)),
      xSize,
      ySize,
    );
  }

  static async fromRouEvals(
    field: FieldRuntime,
    evals: readonly FieldElement[],
    xSize: number,
    ySize: number,
    cosetX?: FieldElement,
    cosetY?: FieldElement,
  ): Promise<DensePolynomialExt> {
    const coefficients = await biNtt(field, evals, xSize, ySize, "inverse");
    const poly = DensePolynomialExt.fromCoeffs(field, coefficients, xSize, ySize);

    if (cosetX === undefined && cosetY === undefined) {
      return poly;
    }

    return poly
      .scaleCoeffsX(cosetX === undefined ? field.one : field.inv(cosetX))
      .scaleCoeffsY(cosetY === undefined ? field.one : field.inv(cosetY));
  }

  async toRouEvals(cosetX?: FieldElement, cosetY?: FieldElement): Promise<FieldElement[]> {
    const scaled =
      cosetX === undefined && cosetY === undefined
        ? this
        : this
            .scaleCoeffsX(cosetX === undefined ? this.field.one : cosetX)
            .scaleCoeffsY(cosetY === undefined ? this.field.one : cosetY);

    return biNtt(this.field, scaled.coefficients, this.xSize, this.ySize, "forward");
  }

  toHexCoeffs(): string[] {
    return this.coefficients.map((coefficient) => this.field.toHex(coefficient));
  }

  getCoeff(xIndex: number, yIndex: number): FieldElement {
    validateIndex(xIndex, this.xSize, "x");
    validateIndex(yIndex, this.ySize, "y");
    return this.coefficients[xIndex * this.ySize + yIndex].slice();
  }

  resize(targetXSize: number, targetYSize: number): DensePolynomialExt {
    const xSize = nextPowerOfTwo(targetXSize);
    const ySize = nextPowerOfTwo(targetYSize);
    if (xSize === this.xSize && ySize === this.ySize) {
      return this;
    }

    const output = Array.from({ length: xSize * ySize }, () => this.field.zero);
    for (let x = 0; x < Math.min(this.xSize, xSize); x += 1) {
      for (let y = 0; y < Math.min(this.ySize, ySize); y += 1) {
        output[x * ySize + y] = this.getCoeff(x, y);
      }
    }

    return DensePolynomialExt.fromCoeffs(this.field, output, xSize, ySize);
  }

  optimizeSize(): DensePolynomialExt {
    const { xDegree, yDegree } = this.findDegree();
    if (xDegree < 0 || yDegree < 0) {
      return DensePolynomialExt.zero(this.field);
    }

    return this.resize(xDegree + 1, yDegree + 1);
  }

  findDegree(): { readonly xDegree: number; readonly yDegree: number } {
    let xDegree = -1;
    let yDegree = -1;

    for (let x = this.xSize - 1; x >= 0; x -= 1) {
      for (let y = 0; y < this.ySize; y += 1) {
        if (!this.field.isZero(this.coefficients[x * this.ySize + y])) {
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
        if (!this.field.isZero(this.coefficients[x * this.ySize + y])) {
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

  scaleCoeffsX(factor: FieldElement): DensePolynomialExt {
    const output: FieldElement[] = [];
    let power = this.field.one;

    for (let x = 0; x < this.xSize; x += 1) {
      for (let y = 0; y < this.ySize; y += 1) {
        output.push(this.field.mul(this.getCoeff(x, y), power));
      }
      power = this.field.mul(power, factor);
    }

    return DensePolynomialExt.fromCoeffs(this.field, output, this.xSize, this.ySize);
  }

  scaleCoeffsY(factor: FieldElement): DensePolynomialExt {
    const powers: FieldElement[] = [];
    let power = this.field.one;
    for (let y = 0; y < this.ySize; y += 1) {
      powers.push(power);
      power = this.field.mul(power, factor);
    }

    const output = this.coefficients.map((coefficient, index) =>
      this.field.mul(coefficient, powers[index % this.ySize]),
    );

    return DensePolynomialExt.fromCoeffs(this.field, output, this.xSize, this.ySize);
  }

  add(other: DensePolynomialExt): DensePolynomialExt {
    const [left, right] = resizePair(this, other);
    return DensePolynomialExt.fromCoeffs(
      this.field,
      left.coefficients.map((coefficient, index) => this.field.add(coefficient, right.coefficients[index])),
      left.xSize,
      left.ySize,
    );
  }

  sub(other: DensePolynomialExt): DensePolynomialExt {
    const [left, right] = resizePair(this, other);
    return DensePolynomialExt.fromCoeffs(
      this.field,
      left.coefficients.map((coefficient, index) => this.field.sub(coefficient, right.coefficients[index])),
      left.xSize,
      left.ySize,
    );
  }

  scale(factor: FieldElement): DensePolynomialExt {
    return DensePolynomialExt.fromCoeffs(
      this.field,
      this.coefficients.map((coefficient) => this.field.mul(coefficient, factor)),
      this.xSize,
      this.ySize,
    );
  }

  mul(other: DensePolynomialExt): DensePolynomialExt {
    const leftDegree = this.findDegree();
    const rightDegree = other.findDegree();

    if (leftDegree.xDegree < 0 || leftDegree.yDegree < 0 || rightDegree.xDegree < 0 || rightDegree.yDegree < 0) {
      return DensePolynomialExt.zero(this.field);
    }

    const xSize = nextPowerOfTwo(leftDegree.xDegree + rightDegree.xDegree + 1);
    const ySize = nextPowerOfTwo(leftDegree.yDegree + rightDegree.yDegree + 1);
    const output = Array.from({ length: xSize * ySize }, () => this.field.zero);

    for (let lx = 0; lx <= leftDegree.xDegree; lx += 1) {
      for (let ly = 0; ly <= leftDegree.yDegree; ly += 1) {
        const left = this.getCoeff(lx, ly);
        if (this.field.isZero(left)) {
          continue;
        }

        for (let rx = 0; rx <= rightDegree.xDegree; rx += 1) {
          for (let ry = 0; ry <= rightDegree.yDegree; ry += 1) {
            const right = other.getCoeff(rx, ry);
            if (this.field.isZero(right)) {
              continue;
            }

            const index = (lx + rx) * ySize + ly + ry;
            output[index] = this.field.add(output[index], this.field.mul(left, right));
          }
        }
      }
    }

    return DensePolynomialExt.fromCoeffs(this.field, output, xSize, ySize);
  }

  mulMonomial(xExponent: number, yExponent: number): DensePolynomialExt {
    if (!Number.isSafeInteger(xExponent) || xExponent < 0 || !Number.isSafeInteger(yExponent) || yExponent < 0) {
      throw new Error("Monomial exponents must be non-negative safe integers.");
    }

    const { xDegree, yDegree } = this.findDegree();
    const xSize = nextPowerOfTwo(Math.max(1, xDegree + 1 + xExponent));
    const ySize = nextPowerOfTwo(Math.max(1, yDegree + 1 + yExponent));
    const output = Array.from({ length: xSize * ySize }, () => this.field.zero);

    for (let x = 0; x < this.xSize; x += 1) {
      for (let y = 0; y < this.ySize; y += 1) {
        const coefficient = this.getCoeff(x, y);
        if (!this.field.isZero(coefficient)) {
          output[(x + xExponent) * ySize + y + yExponent] = coefficient;
        }
      }
    }

    return DensePolynomialExt.fromCoeffs(this.field, output, xSize, ySize);
  }

  divideX(denominator: DensePolynomialExt): PolynomialDivisionResult {
    return divideUnivariateAxis(this, denominator, "x");
  }

  divideY(denominator: DensePolynomialExt): PolynomialDivisionResult {
    return divideUnivariateAxis(this, denominator, "y");
  }

  divByRuffini(xPoint: FieldElement, yPoint: FieldElement): BivariateRuffiniDivisionResult {
    const xDenominator = DensePolynomialExt.fromCoeffs(
      this.field,
      [this.field.neg(xPoint), this.field.one],
      2,
      1,
    );
    const yDenominator = DensePolynomialExt.fromCoeffs(
      this.field,
      [this.field.neg(yPoint), this.field.one],
      1,
      2,
    );
    const xDivision = this.divideX(xDenominator);
    const yDivision = xDivision.remainder.divideY(yDenominator);

    return {
      quotientX: xDivision.quotient,
      quotientY: yDivision.quotient,
      remainder: yDivision.remainder.getCoeff(0, 0),
    };
  }

  divByVanishing(xDegree: number, yDegree: number): VanishingDivisionResult {
    if (!isPowerOfTwo(xDegree) || !isPowerOfTwo(yDegree)) {
      throw new Error("Vanishing polynomial degrees must be powers of two.");
    }

    const xDenominatorSize = nextPowerOfTwo(xDegree + 1);
    const xDenominatorCoeffs = Array.from({ length: xDenominatorSize }, () => this.field.zero);
    xDenominatorCoeffs[0] = this.field.neg(this.field.one);
    xDenominatorCoeffs[xDegree] = this.field.one;
    const yDenominatorSize = nextPowerOfTwo(yDegree + 1);
    const yDenominatorCoeffs = Array.from({ length: yDenominatorSize }, () => this.field.zero);
    yDenominatorCoeffs[0] = this.field.neg(this.field.one);
    yDenominatorCoeffs[yDegree] = this.field.one;

    const xDivision = this.divideX(
      DensePolynomialExt.fromCoeffs(this.field, xDenominatorCoeffs, xDenominatorSize, 1),
    );
    const yDivision = xDivision.remainder.divideY(
      DensePolynomialExt.fromCoeffs(this.field, yDenominatorCoeffs, 1, yDenominatorSize),
    );

    return {
      quotientX: xDivision.quotient,
      quotientY: yDivision.quotient,
      remainder: yDivision.remainder,
    };
  }
}

export async function biNtt(
  field: FieldRuntime,
  values: readonly FieldElement[],
  xSize: number,
  ySize: number,
  direction: "forward" | "inverse",
): Promise<FieldElement[]> {
  validateShape(xSize, ySize);
  if (values.length !== xSize * ySize) {
    throw new Error("NTT input count does not match the bivariate shape.");
  }

  const transform = direction === "forward" ? field.fft.bind(field) : field.ifft.bind(field);

  if (xSize === 1 || ySize === 1) {
    return transform(values);
  }

  const yTransformed: FieldElement[] = Array.from({ length: values.length }, () => field.zero);
  for (let x = 0; x < xSize; x += 1) {
    const row = values.slice(x * ySize, (x + 1) * ySize);
    const rowTransformed = await transform(row);
    for (let y = 0; y < ySize; y += 1) {
      yTransformed[x * ySize + y] = rowTransformed[y];
    }
  }

  const output: FieldElement[] = Array.from({ length: values.length }, () => field.zero);
  for (let y = 0; y < ySize; y += 1) {
    const column: FieldElement[] = [];
    for (let x = 0; x < xSize; x += 1) {
      column.push(yTransformed[x * ySize + y]);
    }

    const columnTransformed = await transform(column);
    for (let x = 0; x < xSize; x += 1) {
      output[x * ySize + y] = columnTransformed[x];
    }
  }

  return output;
}

function resizePair(
  left: DensePolynomialExt,
  right: DensePolynomialExt,
): readonly [DensePolynomialExt, DensePolynomialExt] {
  const xSize = Math.max(left.xSize, right.xSize);
  const ySize = Math.max(left.ySize, right.ySize);
  return [left.resize(xSize, ySize), right.resize(xSize, ySize)];
}

function divideUnivariateAxis(
  numerator: DensePolynomialExt,
  denominator: DensePolynomialExt,
  axis: "x" | "y",
): PolynomialDivisionResult {
  validateUnivariateDenominator(denominator, axis);

  const denominatorCoeffs = axis === "x" ? collectXPolynomial(denominator, 0) : collectYPolynomial(denominator, 0);
  const denominatorDegree = univariateDegree(numerator.field, denominatorCoeffs);
  if (denominatorDegree < 0) {
    throw new Error("Cannot divide by the zero polynomial.");
  }

  const quotientCoeffs = Array.from({ length: numerator.xSize * numerator.ySize }, () => numerator.field.zero);
  const remainderCoeffs = Array.from({ length: numerator.xSize * numerator.ySize }, () => numerator.field.zero);
  const sweepSize = axis === "x" ? numerator.ySize : numerator.xSize;

  for (let offset = 0; offset < sweepSize; offset += 1) {
    const values = axis === "x" ? collectXPolynomial(numerator, offset) : collectYPolynomial(numerator, offset);
    const { quotient, remainder } = divideUnivariate(numerator.field, values, denominatorCoeffs);

    for (let index = 0; index < quotient.length; index += 1) {
      if (axis === "x") {
        quotientCoeffs[index * numerator.ySize + offset] = quotient[index];
      } else {
        quotientCoeffs[offset * numerator.ySize + index] = quotient[index];
      }
    }

    for (let index = 0; index < remainder.length; index += 1) {
      if (axis === "x") {
        remainderCoeffs[index * numerator.ySize + offset] = remainder[index];
      } else {
        remainderCoeffs[offset * numerator.ySize + index] = remainder[index];
      }
    }
  }

  return {
    quotient: DensePolynomialExt.fromCoeffs(numerator.field, quotientCoeffs, numerator.xSize, numerator.ySize).optimizeSize(),
    remainder: DensePolynomialExt.fromCoeffs(numerator.field, remainderCoeffs, numerator.xSize, numerator.ySize).optimizeSize(),
  };
}

function validateUnivariateDenominator(denominator: DensePolynomialExt, axis: "x" | "y"): void {
  const degree = denominator.findDegree();
  if (axis === "x" && degree.yDegree > 0) {
    throw new Error("X-axis division denominator must be X-univariate.");
  }

  if (axis === "y" && degree.xDegree > 0) {
    throw new Error("Y-axis division denominator must be Y-univariate.");
  }
}

function collectXPolynomial(polynomial: DensePolynomialExt, yIndex: number): FieldElement[] {
  const values: FieldElement[] = [];
  for (let x = 0; x < polynomial.xSize; x += 1) {
    values.push(polynomial.getCoeff(x, yIndex));
  }

  return values;
}

function collectYPolynomial(polynomial: DensePolynomialExt, xIndex: number): FieldElement[] {
  const values: FieldElement[] = [];
  for (let y = 0; y < polynomial.ySize; y += 1) {
    values.push(polynomial.getCoeff(xIndex, y));
  }

  return values;
}

function divideUnivariate(
  field: FieldRuntime,
  numerator: readonly FieldElement[],
  denominator: readonly FieldElement[],
): { readonly quotient: readonly FieldElement[]; readonly remainder: readonly FieldElement[] } {
  const numeratorDegree = univariateDegree(field, numerator);
  const denominatorDegree = univariateDegree(field, denominator);
  if (denominatorDegree < 0) {
    throw new Error("Cannot divide by the zero polynomial.");
  }

  if (numeratorDegree < denominatorDegree) {
    return {
      quotient: [field.zero],
      remainder: numerator.map((value) => value.slice()),
    };
  }

  const remainder: FieldElement[] = numerator.map((value) => value.slice());
  const quotient: FieldElement[] = Array.from({ length: numeratorDegree - denominatorDegree + 1 }, () => field.zero);
  const denominatorLeadInv = field.inv(denominator[denominatorDegree]);

  for (let degree = numeratorDegree - denominatorDegree; degree >= 0; degree -= 1) {
    const coefficient = field.mul(remainder[degree + denominatorDegree], denominatorLeadInv);
    quotient[degree] = coefficient;

    for (let index = 0; index <= denominatorDegree; index += 1) {
      const target = degree + index;
      remainder[target] = field.sub(remainder[target], field.mul(coefficient, denominator[index]));
    }
  }

  return {
    quotient,
    remainder: remainder.slice(0, denominatorDegree),
  };
}

function univariateDegree(field: FieldRuntime, values: readonly FieldElement[]): number {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (!field.isZero(values[index])) {
      return index;
    }
  }

  return -1;
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
