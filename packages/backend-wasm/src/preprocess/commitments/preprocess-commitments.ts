import type { CurveRuntime } from "../../runtime/curve/curve.js";
import type { BivariatePolynomialBuffer } from "../../runtime/polynomial/bivariate-polynomial-buffer.js";

const G1_AFFINE_BYTES = 96;

export async function commitDensePreprocessPolynomial(
  runtime: CurveRuntime,
  xyPowers: Uint8Array,
  polynomial: BivariatePolynomialBuffer,
  chunkPoints: number,
): Promise<Uint8Array> {
  assertChunkPoints(chunkPoints);
  const pointCount = polynomial.xSize * polynomial.ySize;
  assertBufferLength(xyPowers, pointCount * G1_AFFINE_BYTES, "Preprocess xy-powers");
  assertBufferLength(
    polynomial.coefficients,
    pointCount * runtime.Fr.byteLength,
    "Preprocess polynomial coefficients",
  );

  let commitment = runtime.G1.zero;
  for (let start = 0; start < pointCount; start += chunkPoints) {
    const end = Math.min(start + chunkPoints, pointCount);
    const bases = xyPowers.subarray(start * G1_AFFINE_BYTES, end * G1_AFFINE_BYTES);
    const montgomeryScalars = polynomial.coefficients.subarray(
      start * runtime.Fr.byteLength,
      end * runtime.Fr.byteLength,
    );
    const scalars = await runtime.Fr.batchFromMontgomeryBuffer(montgomeryScalars);
    commitment = runtime.G1.add(
      commitment,
      await runtime.G1.msmAffineRaw(bases, scalars),
    );
  }
  return commitment;
}

export async function commitFunctionInstance(
  runtime: CurveRuntime,
  gammaInvOInst: Uint8Array,
  functionInstance: Uint8Array,
): Promise<Uint8Array> {
  if (gammaInvOInst.byteLength % G1_AFFINE_BYTES !== 0) {
    throw new Error("Preprocess gamma-inv-o-inst must contain whole affine G1 points.");
  }
  const pointCount = gammaInvOInst.byteLength / G1_AFFINE_BYTES;
  assertBufferLength(
    functionInstance,
    pointCount * runtime.Fr.byteLength,
    "Function instance",
  );
  const scalars = await runtime.Fr.batchFromMontgomeryBuffer(functionInstance);
  return runtime.G1.msmAffineRaw(gammaInvOInst, scalars);
}

function assertChunkPoints(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Preprocess MSM chunk size must be a positive safe integer.");
  }
}

function assertBufferLength(value: Uint8Array, expected: number, label: string): void {
  if (value.byteLength !== expected) {
    throw new Error(`${label} byte length must be ${expected}; received ${value.byteLength}.`);
  }
}
