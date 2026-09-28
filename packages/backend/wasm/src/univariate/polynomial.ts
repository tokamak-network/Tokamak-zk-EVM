import type { FieldElement, FieldRuntime } from "../runtime/field/field-types.js";

/** Direct FieldRuntime coefficient operations required by U24--U30. */
export class DenseUnivariatePolynomial {
  private constructor(
    readonly coefficients: Uint8Array,
    private readonly field: FieldRuntime,
  ) {}

  static fromCoefficients(field: FieldRuntime, coefficients: Uint8Array): DenseUnivariatePolynomial {
    if (field.bufferElementCount(coefficients) === 0) {
      throw new Error("Polynomial coefficient vector must not be empty.");
    }
    return new DenseUnivariatePolynomial(trim(field, coefficients), field);
  }

  static zero(field: FieldRuntime): DenseUnivariatePolynomial {
    return new DenseUnivariatePolynomial(field.createZeroBuffer(1), field);
  }

  static async linearCombination(field: FieldRuntime, terms: readonly (readonly [DenseUnivariatePolynomial, FieldElement])[]): Promise<DenseUnivariatePolynomial> {
    return DenseUnivariatePolynomial.fromCoefficients(field,
      await field.linearCombinationBuffer(terms.map(([p, factor]) => [p.coefficients, factor])));
  }

  async divideVanishingExactBatched(domainSize: number): Promise<DenseUnivariatePolynomial> {
    if (!Number.isSafeInteger(domainSize) || domainSize < 1) throw new Error("Vanishing domain must be positive.");
    if (this.degree < domainSize) {
      if (this.coefficients.some(byte => byte !== 0)) throw new Error("Polynomial is not divisible by the vanishing polynomial.");
      return DenseUnivariatePolynomial.zero(this.field);
    }
    const { quotient, remainder } = await this.field.divideUnivariateVanishingBuffer(this.coefficients, domainSize);
    if (remainder.some(byte => byte !== 0)) throw new Error("Polynomial is not divisible by the vanishing polynomial.");
    return DenseUnivariatePolynomial.fromCoefficients(this.field, quotient);
  }

  get degree(): number {
    return this.field.bufferElementCount(this.coefficients) - 1;
  }

  evaluate(point: FieldElement): FieldElement {
    let accumulator = this.field.zero;
    for (let index = this.degree; index >= 0; index -= 1) {
      accumulator = this.field.add(
        this.field.mul(accumulator, point),
        this.field.readBufferElement(this.coefficients, index),
      );
    }
    return accumulator;
  }

  add(rhs: DenseUnivariatePolynomial): DenseUnivariatePolynomial {
    const count = Math.max(this.degree, rhs.degree) + 1;
    const coefficients = this.field.createZeroBuffer(count);
    for (let index = 0; index < count; index += 1) {
      const left = index <= this.degree ? this.field.readBufferElement(this.coefficients, index) : this.field.zero;
      const right = index <= rhs.degree ? this.field.readBufferElement(rhs.coefficients, index) : this.field.zero;
      this.field.writeBufferElement(coefficients, index, this.field.add(left, right));
    }
    return DenseUnivariatePolynomial.fromCoefficients(this.field, coefficients);
  }

  sub(rhs: DenseUnivariatePolynomial): DenseUnivariatePolynomial {
    const count = Math.max(this.degree, rhs.degree) + 1;
    const coefficients = this.field.createZeroBuffer(count);
    for (let index = 0; index < count; index += 1) {
      const left = index <= this.degree ? this.field.readBufferElement(this.coefficients, index) : this.field.zero;
      const right = index <= rhs.degree ? this.field.readBufferElement(rhs.coefficients, index) : this.field.zero;
      this.field.writeBufferElement(coefficients, index, this.field.sub(left, right));
    }
    return DenseUnivariatePolynomial.fromCoefficients(this.field, coefficients);
  }

  scale(factor: FieldElement): DenseUnivariatePolynomial {
    const coefficients = this.field.createZeroBuffer(this.degree + 1);
    for (let index = 0; index <= this.degree; index += 1) {
      this.field.writeBufferElement(
        coefficients,
        index,
        this.field.mul(this.field.readBufferElement(this.coefficients, index), factor),
      );
    }
    return DenseUnivariatePolynomial.fromCoefficients(this.field, coefficients);
  }

  scaleArgument(factor: FieldElement): DenseUnivariatePolynomial {
    const coefficients = this.field.createZeroBuffer(this.degree + 1);
    let power = this.field.one;
    for (let index = 0; index <= this.degree; index += 1) {
      this.field.writeBufferElement(
        coefficients,
        index,
        this.field.mul(this.field.readBufferElement(this.coefficients, index), power),
      );
      power = this.field.mul(power, factor);
    }
    return DenseUnivariatePolynomial.fromCoefficients(this.field, coefficients);
  }

  shift(exponent: number): DenseUnivariatePolynomial {
    if (!Number.isSafeInteger(exponent) || exponent < 0) {
      throw new Error("Polynomial shift must be a non-negative safe integer.");
    }
    const coefficients = this.field.createZeroBuffer(this.degree + exponent + 1);
    coefficients.set(this.coefficients, exponent * this.field.byteLength);
    return DenseUnivariatePolynomial.fromCoefficients(this.field, coefficients);
  }

  async multiply(rhs: DenseUnivariatePolynomial): Promise<DenseUnivariatePolynomial> {
    const count = this.degree + rhs.degree + 1;
    if (!Number.isSafeInteger(count)) {
      throw new Error("Polynomial product length overflow.");
    }
    if (count <= 64) {
      return this.multiplySmall(rhs, count);
    }
    if (Math.min(this.degree, rhs.degree) <= 3) {
      const [long, short] = this.degree >= rhs.degree ? [this, rhs] : [rhs, this];
      return DenseUnivariatePolynomial.fromCoefficients(this.field,
        await this.field.shortConvolutionBuffer(long.coefficients, short.coefficients));
    }
    const transformSize = nextPowerOfTwo(count);
    const left = this.field.createZeroBuffer(transformSize);
    const right = this.field.createZeroBuffer(transformSize);
    left.set(this.coefficients);
    right.set(rhs.coefficients);
    const product = await this.field.ifftBuffer(
      await this.field.batchMulBuffer(
        await this.field.fftBuffer(left),
        await this.field.fftBuffer(right),
      ),
    );
    return DenseUnivariatePolynomial.fromCoefficients(this.field, product.subarray(0, count * this.field.byteLength));
  }

  multiplyVanishing(domainSize: number): DenseUnivariatePolynomial {
    if (!Number.isSafeInteger(domainSize) || domainSize < 0) throw new Error("Vanishing degree must be non-negative.");
    const coefficients = this.field.createZeroBuffer(this.degree + domainSize + 1);
    coefficients.set(this.coefficients, domainSize * this.field.byteLength);
    for (let i = 0; i <= this.degree; i++) {
      this.field.writeBufferElement(coefficients, i, this.field.sub(this.field.readBufferElement(coefficients, i), this.field.readBufferElement(this.coefficients, i)));
    }
    return DenseUnivariatePolynomial.fromCoefficients(this.field, coefficients);
  }

  divideVanishingExact(domainSize: number): DenseUnivariatePolynomial {
    if (!Number.isSafeInteger(domainSize) || domainSize <= 0) {
      throw new Error("Vanishing domain size must be a positive safe integer.");
    }
    if (this.degree < domainSize) {
      if (!isZeroBuffer(this.field, this.coefficients)) {
        throw new Error("Polynomial is not divisible by Z^domainSize - 1.");
      }
      return DenseUnivariatePolynomial.zero(this.field);
    }
    const remainder = this.field.cloneBuffer(this.coefficients);
    const quotient = this.field.createZeroBuffer(this.degree - domainSize + 1);
    for (let degree = this.degree; degree >= domainSize; degree -= 1) {
      const factor = this.field.readBufferElement(remainder, degree);
      const quotientIndex = degree - domainSize;
      this.field.writeBufferElement(
        quotient,
        quotientIndex,
        this.field.add(this.field.readBufferElement(quotient, quotientIndex), factor),
      );
      this.field.writeBufferElement(remainder, degree, this.field.sub(this.field.readBufferElement(remainder, degree), factor));
      this.field.writeBufferElement(
        remainder,
        quotientIndex,
        this.field.add(this.field.readBufferElement(remainder, quotientIndex), factor),
      );
    }
    if (!isZeroBuffer(this.field, remainder.subarray(0, domainSize * this.field.byteLength))) {
      throw new Error("Polynomial is not divisible by Z^domainSize - 1.");
    }
    return DenseUnivariatePolynomial.fromCoefficients(this.field, quotient);
  }

  ruffini(point: FieldElement): { readonly quotient: DenseUnivariatePolynomial; readonly value: FieldElement } {
    if (this.degree === 0) {
      return { quotient: DenseUnivariatePolynomial.zero(this.field), value: this.coefficients };
    }
    const quotient = this.field.createZeroBuffer(this.degree);
    let accumulator = this.field.readBufferElement(this.coefficients, this.degree);
    for (let index = this.degree - 1; index >= 0; index -= 1) {
      this.field.writeBufferElement(quotient, index, accumulator);
      accumulator = this.field.add(this.field.readBufferElement(this.coefficients, index), this.field.mul(accumulator, point));
    }
    return { quotient: DenseUnivariatePolynomial.fromCoefficients(this.field, quotient), value: accumulator };
  }

  private multiplySmall(rhs: DenseUnivariatePolynomial, count: number): DenseUnivariatePolynomial {
    const result = this.field.createZeroBuffer(count);
    for (let left = 0; left <= this.degree; left += 1) {
      for (let right = 0; right <= rhs.degree; right += 1) {
        const index = left + right;
        const value = this.field.add(
          this.field.readBufferElement(result, index),
          this.field.mul(
            this.field.readBufferElement(this.coefficients, left),
            this.field.readBufferElement(rhs.coefficients, right),
          ),
        );
        this.field.writeBufferElement(result, index, value);
      }
    }
    return DenseUnivariatePolynomial.fromCoefficients(this.field, result);
  }
}

function trim(field: FieldRuntime, coefficients: Uint8Array): Uint8Array {
  let count = field.bufferElementCount(coefficients);
  while (count > 1 && field.eq(field.readBufferElement(coefficients, count - 1), field.zero)) {
    count -= 1;
  }
  return coefficients.slice(0, count * field.byteLength);
}

function isZeroBuffer(field: FieldRuntime, coefficients: Uint8Array): boolean {
  return Array.from({ length: field.bufferElementCount(coefficients) }, (_, index) =>
    field.eq(field.readBufferElement(coefficients, index), field.zero),
  ).every(Boolean);
}

function nextPowerOfTwo(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Polynomial length must be a positive safe integer.");
  }
  let result = 1;
  while (result < value) {
    result *= 2;
  }
  return result;
}
