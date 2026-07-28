import type { CurveRuntime } from "../../runtime/curve/curve.js";
import {
  msmAffineMontgomeryChunks,
  type AffineMontgomeryMsmChunk,
} from "../../runtime/group/affine-msm.js";
import { BivariatePolynomialBuffer } from "../../runtime/polynomial/bivariate-polynomial-buffer.js";
import {
  proverCrsG1PointAt,
  proverCrsG1PointRange,
  type ProverCrsRuntime,
} from "../api/binary-input.js";
import type { ProverSetupParams } from "../protocol/witness.js";
import type { ProverCommitmentEncoder } from "./commitment-encoder.js";
import { G1_AFFINE_BYTES } from "./commitment-layout.js";

const SIGMA1_DENSE_MSM_CHUNK_POINTS = 1 << 18;
const SIGMA1_DENSE_MSM_MIN_DENSITY = 0.75;

export async function encodePolynomialBufferWithSigma1(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  setup: ProverSetupParams,
  polynomial: BivariatePolynomialBuffer,
  denseMsmChunkPoints = SIGMA1_DENSE_MSM_CHUNK_POINTS,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(denseMsmChunkPoints) || denseMsmChunkPoints <= 0) {
    throw new Error("Dense Sigma1 MSM chunk size must be a positive safe integer.");
  }
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
  if (shouldUseChunkedDenseSigma1Msm(densePointCount, nonzeroCount, denseMsmChunkPoints)) {
    return encodeSigma1DenseChunks(
      runtime,
      crs,
      referenceStringYSize,
      polynomial,
      xSize,
      ySize,
      denseMsmChunkPoints,
    );
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

function shouldUseChunkedDenseSigma1Msm(
  densePointCount: number,
  nonzeroCount: number,
  denseMsmChunkPoints: number,
): boolean {
  return (
    densePointCount > denseMsmChunkPoints &&
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
      const base = proverCrsG1PointAt(crs.sigma1.xyPowers, referenceStringYSize * x + y);

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
  denseMsmChunkPoints: number,
): Promise<Uint8Array> {
  return msmAffineMontgomeryChunks(
    runtime,
    prepareSigma1DenseChunks(
      runtime,
      crs,
      referenceStringYSize,
      polynomial,
      xSize,
      ySize,
      denseMsmChunkPoints,
    ),
  );
}

function* prepareSigma1DenseChunks(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  referenceStringYSize: number,
  polynomial: BivariatePolynomialBuffer,
  xSize: number,
  ySize: number,
  denseMsmChunkPoints: number,
): Iterable<AffineMontgomeryMsmChunk> {
  const rowsPerChunk = Math.max(1, Math.floor(denseMsmChunkPoints / ySize));
  for (let xStart = 0; xStart < xSize; xStart += rowsPerChunk) {
    const rowCount = Math.min(rowsPerChunk, xSize - xStart);
    yield {
      bases: prepareSigma1BaseChunk(
        crs,
        referenceStringYSize,
        xStart,
        rowCount,
        ySize,
      ),
      montgomeryScalars: prepareSigma1ScalarChunk(
        runtime,
        polynomial,
        xStart,
        rowCount,
        ySize,
      ),
    };
  }
}

export function createSigma1CommitmentEncoder(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  setup: ProverSetupParams,
  denseMsmChunkPoints = SIGMA1_DENSE_MSM_CHUNK_POINTS,
): ProverCommitmentEncoder {
  return (polynomial) => encodePolynomialBufferWithSigma1(
    runtime,
    crs,
    setup,
    polynomial,
    denseMsmChunkPoints,
  );
}

function prepareSigma1BaseChunk(
  crs: ProverCrsRuntime,
  referenceStringYSize: number,
  xStart: number,
  rowCount: number,
  ySize: number,
): Uint8Array {
  if (ySize === referenceStringYSize) {
    return proverCrsG1PointRange(
      crs.sigma1.xyPowers,
      xStart * referenceStringYSize,
      rowCount * referenceStringYSize,
    );
  }

  const output = new Uint8Array(rowCount * ySize * G1_AFFINE_BYTES);
  for (let row = 0; row < rowCount; row += 1) {
    output.set(
      proverCrsG1PointRange(
        crs.sigma1.xyPowers,
        (xStart + row) * referenceStringYSize,
        ySize,
      ),
      row * ySize * G1_AFFINE_BYTES,
    );
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
