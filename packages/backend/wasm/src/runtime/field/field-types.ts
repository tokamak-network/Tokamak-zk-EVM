export type FieldElement = Uint8Array;

export interface FieldRuntime {
  readonly byteLength: number;
  readonly modulus: bigint;
  readonly zero: FieldElement;
  readonly one: FieldElement;
  bufferElementCount(buffer: Uint8Array): number;
  createZeroBuffer(elementCount: number): Uint8Array;
  cloneBuffer(buffer: Uint8Array): Uint8Array;
  concat(elements: readonly FieldElement[]): Uint8Array;
  split(buffer: Uint8Array): FieldElement[];
  readBufferElement(buffer: Uint8Array, index: number): FieldElement;
  writeBufferElement(buffer: Uint8Array, index: number, value: FieldElement): void;
  fromBigInt(value: bigint): FieldElement;
  fromHex(value: string): FieldElement;
  toBigInt(value: FieldElement): bigint;
  toHex(value: FieldElement): string;
  toRawLittleEndian(value: FieldElement): Uint8Array;
  rootOfUnity(size: number): FieldElement;
  fftBuffer(buffer: Uint8Array): Promise<Uint8Array>;
  ifftBuffer(buffer: Uint8Array): Promise<Uint8Array>;
  batchFftBuffer(
    buffer: Uint8Array,
    segmentSize: number,
    direction: "forward" | "inverse",
  ): Promise<Uint8Array>;
  batchApplyKeyBuffer(buffer: Uint8Array, first: FieldElement, increment: FieldElement): Promise<Uint8Array>;
  batchAddBuffer(left: Uint8Array, right: Uint8Array): Promise<Uint8Array>;
  batchSubBuffer(left: Uint8Array, right: Uint8Array): Promise<Uint8Array>;
  batchMulBuffer(left: Uint8Array, right: Uint8Array): Promise<Uint8Array>;
  batchProductDifferenceBuffer(a: Uint8Array, b: Uint8Array, c: Uint8Array, d: Uint8Array): Promise<Uint8Array>;
  batchScaleBuffer(buffer: Uint8Array, factor: FieldElement): Promise<Uint8Array>;
  batchAddScaledBuffer(target: Uint8Array, source: Uint8Array, factor: FieldElement): Promise<Uint8Array>;
  shortConvolutionBuffer(long: Uint8Array, short: Uint8Array): Promise<Uint8Array>;
  linearCombinationBuffer(terms: readonly (readonly [Uint8Array, FieldElement])[]): Promise<Uint8Array>;
  selectionAccumulateBuffer(values: Uint8Array, cofactors: Uint8Array, width: number): Promise<Uint8Array>;
  selectionCofactorsBuffer(polynomial: Uint8Array, roots: Uint8Array, inverse: FieldElement): Promise<Uint8Array>;
  orderedRecurrenceBuffer(numerators: Uint8Array, inverseDenominators: Uint8Array): Promise<Uint8Array>;
  copyOperandsBuffer(b: Uint8Array, sc: Uint8Array, root: FieldElement, beta: FieldElement, gamma: FieldElement): Promise<{ readonly numerators: Uint8Array; readonly denominators: Uint8Array }>;
  divideUnivariateVanishingBuffer(coefficients: Uint8Array, domainSize: number): Promise<{ readonly quotient: Uint8Array; readonly remainder: Uint8Array }>;
  batchFromMontgomeryBuffer(buffer: Uint8Array): Promise<Uint8Array>;
  batchInverseBuffer(buffer: Uint8Array): Promise<Uint8Array>;
  ruffiniYBuffer(
    buffer: Uint8Array,
    ySize: number,
    point: FieldElement,
  ): Promise<{ readonly quotient: Uint8Array; readonly remainder: FieldElement }>;
  evaluatePolynomialBuffer(
    buffer: Uint8Array,
    xSize: number,
    ySize: number,
    xPoint: FieldElement,
    yPoint: FieldElement,
  ): Promise<FieldElement>;
  sparseRowDotBuffer(
    rowOffsets: Uint8Array,
    columns: Uint8Array,
    coefficients: Uint8Array,
    variables: Uint8Array,
    rowCount: number,
  ): Promise<Uint8Array>;
  fft(values: readonly FieldElement[]): Promise<FieldElement[]>;
  ifft(values: readonly FieldElement[]): Promise<FieldElement[]>;
  add(left: FieldElement, right: FieldElement): FieldElement;
  sub(left: FieldElement, right: FieldElement): FieldElement;
  neg(value: FieldElement): FieldElement;
  mul(left: FieldElement, right: FieldElement): FieldElement;
  div(left: FieldElement, right: FieldElement): FieldElement;
  inv(value: FieldElement): FieldElement;
  square(value: FieldElement): FieldElement;
  pow(value: FieldElement, exponent: bigint | number | string): FieldElement;
  eq(left: FieldElement, right: FieldElement): boolean;
  isZero(value: FieldElement): boolean;
  random(): FieldElement;
}
