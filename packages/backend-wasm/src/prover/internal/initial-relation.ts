import { BivariatePolynomialBuffer } from "../../core/polynomial/bivariate-polynomial-buffer.js";
import type { CurveRuntime } from "../../core/curve/curve.js";
import type { FieldElement } from "../../core/field/field.js";
import type { ProverCrsRuntime } from "../api/binary-input.js";
import type {
  ProverPlacementVariables,
  ProverSetupParams,
  ProverSubcircuitInfo,
} from "./witness.js";
import {
  linearCombinationBufferBatch,
  lowDegreeXTimesVanishingBuffer,
  lowDegreeYTimesVanishingBuffer,
} from "./polynomial-ops.js";
import {
  encodeSigma1CommitmentBarrier,
  requireCommitment,
  type ProverCommitmentEncoder,
} from "./commitment-encoder.js";
import type { ProverMixer } from "./state.js";
import type { ProverState } from "./state.js";

const G1_AFFINE_BYTES = 96;
const SIGMA1_DENSE_MSM_CHUNK_POINTS = 1 << 18;
const SIGMA1_DENSE_MSM_MIN_DENSITY = 0.75;

export interface InitialRelationCommitments {
  readonly U: Uint8Array;
  readonly V: Uint8Array;
  readonly W: Uint8Array;
  readonly Q_AX: Uint8Array;
  readonly Q_AY: Uint8Array;
  readonly B: Uint8Array;
}

export interface InitialRelationComputation {
  readonly commitments: InitialRelationCommitments;
  readonly q0XY: BivariatePolynomialBuffer;
  readonly q1XY: BivariatePolynomialBuffer;
  readonly wZk: BivariatePolynomialBuffer;
  readonly termBZk: BivariatePolynomialBuffer;
}

export interface ProverBinding {
  readonly A_free: Uint8Array;
  readonly O_pub_free: Uint8Array;
  readonly O_mid: Uint8Array;
  readonly O_prv: Uint8Array;
}

export interface ProverOperationOptions {
  readonly commitmentEncoder?: ProverCommitmentEncoder;
}

export async function buildProverBinding(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  setup: ProverSetupParams,
  placementVariables: readonly ProverPlacementVariables[],
  subcircuitInfos: readonly ProverSubcircuitInfo[],
  aFreeX: BivariatePolynomialBuffer,
  mixer: ProverMixer,
): Promise<ProverBinding> {
  const A_free = await encodePolynomialBufferWithSigma1(runtime, crs, setup, aFreeX);
  const O_pub_free = await encodeOPubFree(runtime, crs, placementVariables, subcircuitInfos);
  const O_mid_core = await encodeOMidNoZk(runtime, crs, setup, placementVariables, subcircuitInfos);
  const O_mid = runtime.G1.add(O_mid_core, runtime.G1.mulAffineScalar(crs.sigma1.delta, mixer.rO_mid));
  const O_prv_core = await encodeOPrvNoZk(runtime, crs, setup, placementVariables, subcircuitInfos);
  const O_prv = addG1Terms(runtime, [
    O_prv_core,
    runtime.G1.neg(runtime.G1.mulAffineScalar(crs.sigma1.eta, mixer.rO_mid)),
    runtime.G1.mulAffineScalar(matrixAt(crs.sigma1.deltaInvAlphakXhTx, 3, 0, 0), mixer.rU_X),
    runtime.G1.mulAffineScalar(matrixAt(crs.sigma1.deltaInvAlphakXhTx, 3, 1, 0), mixer.rV_X),
    runtime.G1.mulAffineScalar(matrixAt(crs.sigma1.deltaInvAlphakXhTx, 3, 2, 0), mixer.rW_X[0]),
    runtime.G1.mulAffineScalar(matrixAt(crs.sigma1.deltaInvAlphakXhTx, 3, 2, 1), mixer.rW_X[1]),
    runtime.G1.mulAffineScalar(matrixAt(crs.sigma1.deltaInvAlphakXhTx, 3, 2, 2), mixer.rW_X[2]),
    runtime.G1.mulAffineScalar(crs.sigma1.deltaInvAlpha4XjTx[0], mixer.rB_X[0]),
    runtime.G1.mulAffineScalar(crs.sigma1.deltaInvAlpha4XjTx[1], mixer.rB_X[1]),
    runtime.G1.mulAffineScalar(matrixAt(crs.sigma1.deltaInvAlphakYiTy, 3, 0, 0), mixer.rU_Y),
    runtime.G1.mulAffineScalar(matrixAt(crs.sigma1.deltaInvAlphakYiTy, 3, 1, 0), mixer.rV_Y),
    runtime.G1.mulAffineScalar(matrixAt(crs.sigma1.deltaInvAlphakYiTy, 3, 2, 0), mixer.rW_Y[0]),
    runtime.G1.mulAffineScalar(matrixAt(crs.sigma1.deltaInvAlphakYiTy, 3, 2, 1), mixer.rW_Y[1]),
    runtime.G1.mulAffineScalar(matrixAt(crs.sigma1.deltaInvAlphakYiTy, 3, 2, 2), mixer.rW_Y[2]),
    runtime.G1.mulAffineScalar(matrixAt(crs.sigma1.deltaInvAlphakYiTy, 3, 3, 0), mixer.rB_Y[0]),
    runtime.G1.mulAffineScalar(matrixAt(crs.sigma1.deltaInvAlphakYiTy, 3, 3, 1), mixer.rB_Y[1]),
  ]);

  return {
    A_free,
    O_pub_free,
    O_mid,
    O_prv,
  };
}

export async function computeInitialRelationCommitments(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  state: ProverState,
  options: ProverOperationOptions = {},
): Promise<InitialRelationComputation> {
  const field = runtime.Fr;
  const p0Product = await state.witnessBuffers.uXY.mul(
    state.witnessBuffers.vXY,
  );
  const p0XY = await p0Product.subBatch(state.witnessBuffers.wXY.resize(p0Product.xSize, p0Product.ySize));
  const { quotientX: q0XY, quotientY: q1XY } = p0XY.divByVanishingOpt(
    state.setup.n,
    state.setup.s_max,
  );

  const rW_X = BivariatePolynomialBuffer.fromCoeffs(field, state.mixer.rW_X, state.mixer.rW_X.length, 1);
  const rW_Y = BivariatePolynomialBuffer.fromCoeffs(field, state.mixer.rW_Y, 1, state.mixer.rW_Y.length);
  const UXY = await linearCombinationBufferBatch(field, [
    [field.one, state.witnessBuffers.uXY],
    [state.mixer.rU_X, state.instanceBuffers.tN],
    [state.mixer.rU_Y, state.instanceBuffers.tSMax],
  ]);
  const VXY = await linearCombinationBufferBatch(field, [
    [field.one, state.witnessBuffers.vXY],
    [state.mixer.rV_X, state.instanceBuffers.tN],
    [state.mixer.rV_Y, state.instanceBuffers.tSMax],
  ]);
  const wZk = await linearCombinationBufferBatch(field, [
    [field.one, lowDegreeXTimesVanishingBuffer(field, state.mixer.rW_X, state.setup.n)],
    [field.one, lowDegreeYTimesVanishingBuffer(field, state.mixer.rW_Y, state.setup.s_max)],
  ]);
  const WXY = await linearCombinationBufferBatch(field, [
    [field.one, state.witnessBuffers.wXY],
    [field.one, wZk],
  ]);
  const Q_AX_XY = await linearCombinationBufferBatch(field, [
    [field.one, q0XY],
    [state.mixer.rU_X, state.witnessBuffers.vXY],
    [state.mixer.rV_X, state.witnessBuffers.uXY],
    [field.neg(field.one), rW_X],
    [field.mul(state.mixer.rU_X, state.mixer.rV_X), state.instanceBuffers.tN],
    [field.mul(state.mixer.rU_Y, state.mixer.rV_X), state.instanceBuffers.tSMax],
  ]);
  const Q_AY_XY = await linearCombinationBufferBatch(field, [
    [field.one, q1XY],
    [state.mixer.rU_Y, state.witnessBuffers.vXY],
    [state.mixer.rV_Y, state.witnessBuffers.uXY],
    [field.neg(field.one), rW_Y],
    [field.mul(state.mixer.rU_X, state.mixer.rV_Y), state.instanceBuffers.tN],
    [field.mul(state.mixer.rU_Y, state.mixer.rV_Y), state.instanceBuffers.tSMax],
  ]);
  const termBZk = await linearCombinationBufferBatch(field, [
    [field.one, lowDegreeXTimesVanishingBuffer(field, state.mixer.rB_X, state.setup.l_D - state.setup.l)],
    [field.one, lowDegreeYTimesVanishingBuffer(field, state.mixer.rB_Y, state.setup.s_max)],
  ]);
  const BXY = await linearCombinationBufferBatch(field, [
    [field.one, state.witnessBuffers.bXY],
    [field.one, termBZk],
  ]);

  const commitments = await encodeSigma1CommitmentBarrier(
    options.commitmentEncoder ?? createDefaultCommitmentEncoder(runtime, crs, state.setup),
    [
      { label: "U", polynomial: UXY },
      { label: "V", polynomial: VXY },
      { label: "W", polynomial: WXY },
      { label: "Q_AX", polynomial: Q_AX_XY },
      { label: "Q_AY", polynomial: Q_AY_XY },
      { label: "B", polynomial: BXY },
    ],
  );

  return {
    commitments: {
      U: requireCommitment(commitments, "U"),
      V: requireCommitment(commitments, "V"),
      W: requireCommitment(commitments, "W"),
      Q_AX: requireCommitment(commitments, "Q_AX"),
      Q_AY: requireCommitment(commitments, "Q_AY"),
      B: requireCommitment(commitments, "B"),
    },
    q0XY,
    q1XY,
    wZk,
    termBZk,
  };
}

function createDefaultCommitmentEncoder(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  setup: ProverSetupParams,
): ProverCommitmentEncoder {
  return {
    parallelSafe: false,
    encodeSigma1PolynomialBuffer(job) {
      return encodePolynomialBufferWithSigma1(runtime, crs, setup, job.polynomial);
    },
  };
}

export async function encodePolynomialBufferWithSigma1(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  setup: ProverSetupParams,
  polynomial: BivariatePolynomialBuffer,
): Promise<Uint8Array> {
  const coefficientWords = fieldBufferWords(polynomial.coefficients);
  const { xDegree, yDegree } = findCoefficientDegree(polynomial, coefficientWords);
  if (xDegree < 0 || yDegree < 0) {
    return runtime.G1.zero;
  }

  const xSize = xDegree + 1;
  const ySize = yDegree + 1;
  const referenceStringYSize = setup.s_max * 2;
  const referenceStringXSize = Math.max(setup.n * 2, (setup.l_D - setup.l) * 2);
  if (xSize > referenceStringXSize || ySize > referenceStringYSize) {
    throw new Error("Insufficient prover CRS sigma1.xy-powers length for polynomial encoding.");
  }

  const nonzeroCount = countNonzeroCoefficients(polynomial, coefficientWords, xSize, ySize);
  if (nonzeroCount === 0) {
    return runtime.G1.zero;
  }

  const densePointCount = xSize * ySize;
  if (shouldUseChunkedDenseSigma1Msm(densePointCount, nonzeroCount)) {
    return encodeSigma1DenseChunks(runtime, crs, referenceStringYSize, polynomial, xSize, ySize);
  }

  return encodeSigma1Sparse(
    runtime,
    crs,
    referenceStringYSize,
    polynomial,
    coefficientWords,
    xSize,
    ySize,
    nonzeroCount,
  );
}

function countNonzeroCoefficients(
  polynomial: BivariatePolynomialBuffer,
  coefficientWords: Uint32Array,
  xSize: number,
  ySize: number,
): number {
  let count = 0;
  for (let x = 0; x < xSize; x += 1) {
    for (let y = 0; y < ySize; y += 1) {
      if (!isZeroCoefficient(coefficientWords, x * polynomial.ySize + y)) {
        count += 1;
      }
    }
  }

  return count;
}

function shouldUseChunkedDenseSigma1Msm(densePointCount: number, nonzeroCount: number): boolean {
  return (
    densePointCount > SIGMA1_DENSE_MSM_CHUNK_POINTS &&
    nonzeroCount / densePointCount >= SIGMA1_DENSE_MSM_MIN_DENSITY
  );
}

async function encodeSigma1Sparse(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  referenceStringYSize: number,
  polynomial: BivariatePolynomialBuffer,
  coefficientWords: Uint32Array,
  xSize: number,
  ySize: number,
  nonzeroCount: number,
): Promise<Uint8Array> {
  const bases = new Uint8Array(nonzeroCount * G1_AFFINE_BYTES);
  const montgomeryScalars = new Uint8Array(nonzeroCount * runtime.Fr.byteLength);
  let outputIndex = 0;
  for (let x = 0; x < xSize; x += 1) {
    for (let y = 0; y < ySize; y += 1) {
      const polynomialIndex = x * polynomial.ySize + y;
      if (isZeroCoefficient(coefficientWords, polynomialIndex)) {
        continue;
      }
      const base = crs.sigma1.xyPowers[referenceStringYSize * x + y];
      if (base === undefined) {
        throw new Error("Prover CRS sigma1.xy-powers section is shorter than the declared setup shape.");
      }

      bases.set(base, outputIndex * G1_AFFINE_BYTES);
      montgomeryScalars.set(
        polynomial.coefficients.subarray(
          polynomialIndex * runtime.Fr.byteLength,
          (polynomialIndex + 1) * runtime.Fr.byteLength,
        ),
        outputIndex * runtime.Fr.byteLength,
      );
      outputIndex += 1;
    }
  }

  const rawScalars = await runtime.Fr.batchFromMontgomeryBuffer(montgomeryScalars);
  return runtime.G1.msmAffineRaw(bases, rawScalars);
}

function findCoefficientDegree(
  polynomial: BivariatePolynomialBuffer,
  coefficientWords: Uint32Array,
): { readonly xDegree: number; readonly yDegree: number } {
  let xDegree = -1;
  let yDegree = -1;
  for (let x = polynomial.xSize - 1; x >= 0 && xDegree < 0; x -= 1) {
    for (let y = 0; y < polynomial.ySize; y += 1) {
      if (!isZeroCoefficient(coefficientWords, x * polynomial.ySize + y)) {
        xDegree = x;
        break;
      }
    }
  }
  for (let y = polynomial.ySize - 1; y >= 0 && yDegree < 0; y -= 1) {
    for (let x = 0; x < polynomial.xSize; x += 1) {
      if (!isZeroCoefficient(coefficientWords, x * polynomial.ySize + y)) {
        yDegree = y;
        break;
      }
    }
  }
  return { xDegree, yDegree };
}

function fieldBufferWords(buffer: Uint8Array): Uint32Array {
  if (buffer.byteOffset % 4 !== 0 || buffer.byteLength % 4 !== 0) {
    throw new Error("Prover field coefficient buffers must be four-byte aligned.");
  }
  return new Uint32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
}

function isZeroCoefficient(words: Uint32Array, coefficientIndex: number): boolean {
  const offset = coefficientIndex * 8;
  return (
    words[offset] | words[offset + 1] | words[offset + 2] | words[offset + 3]
    | words[offset + 4] | words[offset + 5] | words[offset + 6] | words[offset + 7]
  ) === 0;
}

async function encodeSigma1DenseChunks(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  referenceStringYSize: number,
  polynomial: BivariatePolynomialBuffer,
  xSize: number,
  ySize: number,
): Promise<Uint8Array> {
  let result = runtime.G1.zero;
  const rowsPerChunk = Math.max(1, Math.floor(SIGMA1_DENSE_MSM_CHUNK_POINTS / ySize));

  for (let xStart = 0; xStart < xSize; xStart += rowsPerChunk) {
    const rowCount = Math.min(rowsPerChunk, xSize - xStart);
    const bases = prepareSigma1BaseChunk(crs, referenceStringYSize, xStart, rowCount, ySize);
    const montgomeryScalars = prepareSigma1ScalarChunk(runtime, polynomial, xStart, rowCount, ySize);
    const rawScalars = await runtime.Fr.batchFromMontgomeryBuffer(montgomeryScalars);
    const partial = await runtime.G1.msmAffineRaw(bases, rawScalars);
    result = runtime.G1.add(result, partial);
  }

  return result;
}

function prepareSigma1BaseChunk(
  crs: ProverCrsRuntime,
  referenceStringYSize: number,
  xStart: number,
  rowCount: number,
  ySize: number,
): Uint8Array {
  if (ySize === referenceStringYSize) {
    const start = xStart * referenceStringYSize * G1_AFFINE_BYTES;
    const end = (xStart + rowCount) * referenceStringYSize * G1_AFFINE_BYTES;
    if (end > crs.sigma1.xyPowersRaw.byteLength) {
      throw new Error("Prover CRS raw sigma1.xy-powers section is shorter than the declared setup shape.");
    }
    return crs.sigma1.xyPowersRaw.subarray(start, end);
  }

  const output = new Uint8Array(rowCount * ySize * G1_AFFINE_BYTES);
  for (let row = 0; row < rowCount; row += 1) {
    const sourceStart = (xStart + row) * referenceStringYSize * G1_AFFINE_BYTES;
    const sourceEnd = sourceStart + ySize * G1_AFFINE_BYTES;
    if (sourceEnd > crs.sigma1.xyPowersRaw.byteLength) {
      throw new Error("Prover CRS raw sigma1.xy-powers section is shorter than the declared setup shape.");
    }
    output.set(crs.sigma1.xyPowersRaw.subarray(sourceStart, sourceEnd), row * ySize * G1_AFFINE_BYTES);
  }
  return output;
}

function prepareSigma1ScalarChunk(
  runtime: CurveRuntime,
  polynomial: BivariatePolynomialBuffer,
  xStart: number,
  rowCount: number,
  ySize: number,
): Uint8Array {
  if (ySize === polynomial.ySize) {
    const start = xStart * polynomial.ySize * runtime.Fr.byteLength;
    const end = (xStart + rowCount) * polynomial.ySize * runtime.Fr.byteLength;
    return polynomial.coefficients.subarray(start, end);
  }

  const output = new Uint8Array(rowCount * ySize * runtime.Fr.byteLength);
  for (let row = 0; row < rowCount; row += 1) {
    const sourceStart = ((xStart + row) * polynomial.ySize) * runtime.Fr.byteLength;
    const sourceEnd = sourceStart + ySize * runtime.Fr.byteLength;
    output.set(polynomial.coefficients.subarray(sourceStart, sourceEnd), row * ySize * runtime.Fr.byteLength);
  }
  return output;
}

export async function encodeOPubFree(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  placementVariables: readonly ProverPlacementVariables[],
  subcircuitInfos: readonly ProverSubcircuitInfo[],
): Promise<Uint8Array> {
  const bases: Uint8Array[] = [];
  const scalars: FieldElement[] = [];

  for (const placement of placementVariables) {
    const subcircuitInfo = subcircuitInfos[placement.subcircuitId];
    if (subcircuitInfo.name === "bufferEVMIn") {
      continue;
    }

    const range = publicFreeRange(subcircuitInfo);
    if (range === undefined) {
      continue;
    }

    for (let localIndex = range.start; localIndex < range.end; localIndex += 1) {
      const globalIndex = subcircuitInfo.flattenMap[localIndex];
      bases.push(crs.sigma1.gammaInvOInst[globalIndex]);
      scalars.push(placement.variables[localIndex]);
    }
  }

  return msmG1(runtime, bases, scalars);
}

export function countOMidVariables(
  placementVariables: readonly ProverPlacementVariables[],
  subcircuitInfos: readonly ProverSubcircuitInfo[],
): number {
  let count = 0;
  for (const placement of placementVariables) {
    const subcircuitInfo = subcircuitInfos[placement.subcircuitId];
    if (subcircuitInfo.name === "bufferPubOut") {
      count += subcircuitInfo.In_idx[1];
    } else if (
      subcircuitInfo.name === "bufferPubIn" ||
      subcircuitInfo.name === "bufferBlockIn" ||
      subcircuitInfo.name === "bufferEVMIn"
    ) {
      count += subcircuitInfo.Out_idx[1];
    } else {
      count += subcircuitInfo.Out_idx[1] + subcircuitInfo.In_idx[1];
    }
    count += 1;
  }

  return count;
}

export function countOPrvVariables(
  placementVariables: readonly ProverPlacementVariables[],
  subcircuitInfos: readonly ProverSubcircuitInfo[],
): number {
  let count = 0;
  for (const placement of placementVariables) {
    const subcircuitInfo = subcircuitInfos[placement.subcircuitId];
    count += subcircuitInfo.Nwires - subcircuitInfo.In_idx[1] - subcircuitInfo.Out_idx[1] - 1;
  }

  return count;
}

export async function encodeOMidNoZk(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  setup: ProverSetupParams,
  placementVariables: readonly ProverPlacementVariables[],
  subcircuitInfos: readonly ProverSubcircuitInfo[],
): Promise<Uint8Array> {
  return encodeStatement(
    runtime,
    setup.l,
    setup.l_D,
    countOMidVariables(placementVariables, subcircuitInfos),
    placementVariables,
    subcircuitInfos,
    (globalIndex, placementIndex) =>
      matrixAt(crs.sigma1.etaInvLiOInterAlpha4Kj, setup.s_max, globalIndex, placementIndex),
  );
}

export async function encodeOPrvNoZk(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  setup: ProverSetupParams,
  placementVariables: readonly ProverPlacementVariables[],
  subcircuitInfos: readonly ProverSubcircuitInfo[],
): Promise<Uint8Array> {
  return encodeStatement(
    runtime,
    setup.l_D,
    setup.m_D,
    countOPrvVariables(placementVariables, subcircuitInfos),
    placementVariables,
    subcircuitInfos,
    (globalIndex, placementIndex) =>
      matrixAt(crs.sigma1.deltaInvLiOPrv, setup.s_max, globalIndex, placementIndex),
  );
}

async function encodeStatement(
  runtime: CurveRuntime,
  globalWireIndexOffset: number,
  globalWireIndexEnd: number,
  expectedVariableCount: number,
  placementVariables: readonly ProverPlacementVariables[],
  subcircuitInfos: readonly ProverSubcircuitInfo[],
  baseAt: (globalIndex: number, placementIndex: number) => Uint8Array,
): Promise<Uint8Array> {
  const bases: Uint8Array[] = [];
  const scalars: FieldElement[] = [];

  for (let placementIndex = 0; placementIndex < placementVariables.length; placementIndex += 1) {
    const placement = placementVariables[placementIndex];
    const subcircuitInfo = subcircuitInfos[placement.subcircuitId];
    for (let localIndex = 0; localIndex < subcircuitInfo.Nwires; localIndex += 1) {
      const flattened = subcircuitInfo.flattenMap[localIndex];
      if (flattened >= globalWireIndexOffset && flattened < globalWireIndexEnd) {
        const globalIndex = flattened - globalWireIndexOffset;
        bases.push(baseAt(globalIndex, placementIndex));
        scalars.push(placement.variables[localIndex]);
      }
    }
  }

  if (bases.length !== expectedVariableCount) {
    throw new Error(`Statement encoding variable count mismatch: expected ${expectedVariableCount}, got ${bases.length}.`);
  }

  return msmG1(runtime, bases, scalars);
}

function publicFreeRange(
  subcircuitInfo: ProverSubcircuitInfo,
): { readonly start: number; readonly end: number } | undefined {
  if (subcircuitInfo.name === "bufferPubOut") {
    return { start: subcircuitInfo.Out_idx[0], end: subcircuitInfo.Out_idx[0] + subcircuitInfo.Out_idx[1] };
  }

  if (
    subcircuitInfo.name === "bufferPubIn" ||
    subcircuitInfo.name === "bufferBlockIn"
  ) {
    return { start: subcircuitInfo.In_idx[0], end: subcircuitInfo.In_idx[0] + subcircuitInfo.In_idx[1] };
  }

  return undefined;
}

function matrixAt(values: readonly Uint8Array[], width: number, row: number, column: number): Uint8Array {
  const value = values[row * width + column];
  if (value === undefined) {
    throw new Error(`Missing flattened prover CRS matrix entry at row ${row}, column ${column}.`);
  }

  return value;
}

async function msmG1(
  runtime: CurveRuntime,
  bases: readonly Uint8Array[],
  scalars: readonly FieldElement[],
): Promise<Uint8Array> {
  if (bases.length !== scalars.length) {
    throw new Error("G1 MSM bases and scalars must have the same length.");
  }

  if (bases.length === 0) {
    return runtime.G1.zero;
  }

  return runtime.G1.msmAffineRaw(concatBytes(bases), concatBytes(scalars.map((scalar) => runtime.Fr.toRawLittleEndian(scalar))));
}

function addG1Terms(runtime: CurveRuntime, terms: readonly Uint8Array[]): Uint8Array {
  let accumulator = runtime.G1.zero;
  for (const term of terms) {
    accumulator = runtime.G1.add(accumulator, term);
  }

  return accumulator;
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}
