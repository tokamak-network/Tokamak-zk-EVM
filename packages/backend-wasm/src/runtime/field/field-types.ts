export type FieldElement = Uint8Array;

export type SpecialPolynomialOperation =
  | "x-minus-one"
  | "one-minus-x"
  | "linear-x"
  | "linear-y"
  | "term9";

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
  batchMulShiftedBuffer(
    left: Uint8Array,
    right: Uint8Array,
    xSize: number,
    ySize: number,
    xShift: number,
    yShift: number,
  ): Promise<Uint8Array>;
  batchScaleBuffer(buffer: Uint8Array, factor: FieldElement): Promise<Uint8Array>;
  batchAddScaledBuffer(target: Uint8Array, source: Uint8Array, factor: FieldElement): Promise<Uint8Array>;
  batchAddScaledPrefixBuffer(
    target: Uint8Array,
    targetXSize: number,
    targetYSize: number,
    source: Uint8Array,
    sourceXSize: number,
    sourceYSize: number,
    factor: FieldElement,
  ): Promise<Uint8Array>;
  batchScaleCoeffsXBuffer(
    buffer: Uint8Array,
    xSize: number,
    ySize: number,
    factor: FieldElement,
  ): Promise<Uint8Array>;
  batchScaleCoeffsYBuffer(
    buffer: Uint8Array,
    xSize: number,
    ySize: number,
    factor: FieldElement,
  ): Promise<Uint8Array>;
  batchFromMontgomeryBuffer(buffer: Uint8Array): Promise<Uint8Array>;
  batchInverseBuffer(buffer: Uint8Array): Promise<Uint8Array>;
  ruffiniXBuffer(
    buffer: Uint8Array,
    xSize: number,
    ySize: number,
    point: FieldElement,
  ): Promise<{ readonly quotient: Uint8Array; readonly remainder: Uint8Array }>;
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
  evaluateScaledChallengeSetBuffer(
    buffer: Uint8Array,
    xSize: number,
    ySize: number,
    xPoint: FieldElement,
    scaledXPoint: FieldElement,
    yPoint: FieldElement,
    scaledYPoint: FieldElement,
  ): Promise<readonly [FieldElement, FieldElement, FieldElement]>;
  divideByVanishingBuffer(
    buffer: Uint8Array,
    xSize: number,
    ySize: number,
    xDegree: number,
    yDegree: number,
  ): Promise<{ readonly quotientX: Uint8Array; readonly quotientY: Uint8Array }>;
  computeRecursionRecurrenceBuffer(
    gEvals: Uint8Array,
    inverseFEvals: Uint8Array,
    mI: number,
    sMax: number,
  ): Promise<Uint8Array>;
  k0RecurrenceBuffer(
    buffer: Uint8Array,
    inputXSize: number,
    inputYSize: number,
    outputXSize: number,
    outputYSize: number,
    mI: number,
  ): Promise<Uint8Array>;
  klRecurrenceBuffer(
    buffer: Uint8Array,
    inputXSize: number,
    inputYSize: number,
    outputXSize: number,
    outputYSize: number,
    mI: number,
    sMax: number,
  ): Promise<Uint8Array>;
  specialPolynomialBuffer(
    buffer: Uint8Array,
    inputXSize: number,
    inputYSize: number,
    activeXSize: number,
    activeYSize: number,
    outputXSize: number,
    outputYSize: number,
    operation: SpecialPolynomialOperation,
    constant: FieldElement,
    xCoefficient: FieldElement,
    yCoefficient: FieldElement,
  ): Promise<Uint8Array>;
  fusedLinearPolynomialBuffer(
    buffer: Uint8Array,
    inputXSize: number,
    inputYSize: number,
    activeXSize: number,
    activeYSize: number,
    addend: Uint8Array,
    addendXSize: number,
    addendYSize: number,
    outputXSize: number,
    outputYSize: number,
    axis: "x" | "y",
    constant: FieldElement,
    shiftCoefficient: FieldElement,
    addendScale: FieldElement,
  ): Promise<Uint8Array>;
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
