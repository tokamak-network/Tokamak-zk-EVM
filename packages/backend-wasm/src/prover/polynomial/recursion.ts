import { BivariatePolynomialBuffer } from "../../runtime/polynomial/bivariate-polynomial-buffer.js";
import type { CurveRuntime } from "../../runtime/curve/curve.js";
import { checkedDomainProduct, nextPowerOfTwo } from "./polynomial-shapes.js";

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

  const inverseF = await field.batchInverseBuffer(fXYEvals);
  return await field.computeRecursionRecurrenceBuffer(gXYEvals, inverseF, mI, sMax);
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
  const unscaledOutput = await field.k0RecurrenceBuffer(
    polynomial.coefficients,
    polynomial.xSize,
    polynomial.ySize,
    xSize,
    ySize,
    mI,
  );

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
  const unscaledOutput = await field.klRecurrenceBuffer(
    polynomial.coefficients,
    polynomial.xSize,
    polynomial.ySize,
    xSize,
    ySize,
    mI,
    sMax,
  );

  const inverseDomain = field.inv(field.fromBigInt(BigInt(domainSize)));
  const output = await field.batchApplyKeyBuffer(unscaledOutput, inverseDomain, field.one);
  return BivariatePolynomialBuffer.fromOwnedBuffer(field, output, xSize, ySize);
}
