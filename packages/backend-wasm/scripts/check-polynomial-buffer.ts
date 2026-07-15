import { fileURLToPath } from "node:url";

import {
  BivariatePolynomialBuffer,
  DensePolynomialExt,
  createCurveRuntime,
  encodePolynomialBufferWithSigma1,
} from "../src/index.js";
import type { CurveRuntime, FieldElement, FieldRuntime, ProverCrsRuntime, ProverSetupParams } from "../src/index.js";

async function main(): Promise<void> {
  const runtime = await createCurveRuntime();
  try {
    await checkBivariatePolynomialBuffer(runtime.Fr);
    await checkBufferCommitmentEncoding(runtime);
  } finally {
    await runtime.terminate();
  }

  console.log("Checked bivariate polynomial buffer parity");
}

async function checkBufferCommitmentEncoding(runtime: CurveRuntime): Promise<void> {
  const coefficients = [
    runtime.Fr.fromBigInt(3n),
    runtime.Fr.fromBigInt(5n),
    runtime.Fr.zero,
    runtime.Fr.fromBigInt(11n),
  ];
  const polynomial = BivariatePolynomialBuffer.fromCoeffs(runtime.Fr, coefficients, 2, 2);
  const setup = {
    n: 2,
    s_max: 2,
    l: 0,
    l_D: 2,
  } as ProverSetupParams;
  const crs = {
    sigma1: {
      xyPowers: Array.from({ length: 16 }, () => runtime.G1.generator),
    },
  } as unknown as ProverCrsRuntime;
  const actual = await encodePolynomialBufferWithSigma1(runtime, crs, setup, polynomial);
  const expectedScalar = coefficients.reduce((accumulator, coefficient) => runtime.Fr.add(accumulator, coefficient), runtime.Fr.zero);
  const expected = runtime.G1.mulAffineScalar(runtime.G1.generator, expectedScalar);

  if (!runtime.G1.eq(actual, expected)) {
    throw new Error("buffer commitment encoding mismatch against repeated-generator synthetic CRS");
  }
}

async function checkBivariatePolynomialBuffer(field: FieldRuntime): Promise<void> {
  const coefficients = [
    field.fromBigInt(3n),
    field.fromBigInt(5n),
    field.fromBigInt(7n),
    field.fromBigInt(11n),
    field.fromBigInt(13n),
    field.fromBigInt(17n),
    field.fromBigInt(19n),
    field.fromBigInt(23n),
  ];
  const dense = DensePolynomialExt.fromCoeffs(field, coefficients, 4, 2);
  const buffer = BivariatePolynomialBuffer.fromDense(dense);

  assertEqual(buffer.toHexCoeffs(), dense.toHexCoeffs(), "fromDense coefficients");
  assertEqual(buffer.toDense().toHexCoeffs(), dense.toHexCoeffs(), "toDense coefficients");
  assertEqual(formatFields(field, buffer.toCoeffs()), dense.toHexCoeffs(), "toCoeffs");

  const otherDense = DensePolynomialExt.fromCoeffs(
    field,
    coefficients.map((coefficient) => field.square(coefficient)),
    4,
    2,
  );
  const otherBuffer = BivariatePolynomialBuffer.fromDense(otherDense);
  const scale = field.fromBigInt(29n);

  assertEqual(buffer.clone().addAssign(otherBuffer).toHexCoeffs(), dense.add(otherDense).toHexCoeffs(), "addAssign");
  assertEqual(buffer.clone().subAssign(otherBuffer).toHexCoeffs(), dense.sub(otherDense).toHexCoeffs(), "subAssign");
  assertEqual(buffer.clone().scaleAssign(scale).toHexCoeffs(), dense.scale(scale).toHexCoeffs(), "scaleAssign");
  assertEqual(buffer.add(otherBuffer).toHexCoeffs(), dense.add(otherDense).toHexCoeffs(), "add");
  assertEqual(buffer.sub(otherBuffer).toHexCoeffs(), dense.sub(otherDense).toHexCoeffs(), "sub");
  assertEqual(buffer.scale(scale).toHexCoeffs(), dense.scale(scale).toHexCoeffs(), "scale");
  assertEqual(buffer.toHexCoeffs(), dense.toHexCoeffs(), "non-mutating operations must not alter the source");
  assertEqual(
    buffer.clone().addScaledAssign(otherBuffer, scale).toHexCoeffs(),
    dense.add(otherDense.scale(scale)).toHexCoeffs(),
    "addScaledAssign",
  );

  const xScale = field.fromBigInt(31n);
  const yScale = field.fromBigInt(37n);
  assertEqual(
    buffer.clone().scaleCoeffsXAssign(xScale).toHexCoeffs(),
    dense.scaleCoeffsX(xScale).toHexCoeffs(),
    "scaleCoeffsXAssign",
  );
  assertEqual(buffer.scaleCoeffsX(xScale).toHexCoeffs(), dense.scaleCoeffsX(xScale).toHexCoeffs(), "scaleCoeffsX");
  assertEqual(
    buffer.clone().scaleCoeffsYAssign(yScale).toHexCoeffs(),
    dense.scaleCoeffsY(yScale).toHexCoeffs(),
    "scaleCoeffsYAssign",
  );
  assertEqual(buffer.scaleCoeffsY(yScale).toHexCoeffs(), dense.scaleCoeffsY(yScale).toHexCoeffs(), "scaleCoeffsY");

  const xPoint = field.fromBigInt(41n);
  const yPoint = field.fromBigInt(43n);
  assertEqual(field.toHex(buffer.eval(xPoint, yPoint)), field.toHex(dense.eval(xPoint, yPoint)), "eval");
  assertEqual(buffer.resize(8, 4).toHexCoeffs(), dense.resize(8, 4).toHexCoeffs(), "resize");
  assertEqual(buffer.mulMonomial(1, 2).toHexCoeffs(), dense.mulMonomial(1, 2).toHexCoeffs(), "mulMonomial");
  assertEqual(
    BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.zero, field.zero, field.zero], 2, 2)
      .optimizeSize()
      .toHexCoeffs(),
    DensePolynomialExt.zero(field).toHexCoeffs(),
    "optimizeSize zero",
  );
  checkBufferCopySemantics(field, coefficients);
  checkPrefixAdd(field);
  assertDenseEqual((await buffer.mul(otherBuffer)).toDense(), dense.mul(otherDense), "ntt mul");

  await assertRouParity(field, dense, buffer, undefined, undefined, "rou");
  await assertRouParity(field, dense, buffer, xScale, yScale, "coset rou");
  checkRuffiniDivision(field);
  checkVanishingDivision(field);
}

async function assertRouParity(
  field: FieldRuntime,
  dense: DensePolynomialExt,
  buffer: BivariatePolynomialBuffer,
  cosetX: FieldElement | undefined,
  cosetY: FieldElement | undefined,
  label: string,
): Promise<void> {
  const denseRouEvals = await dense.toRouEvals(cosetX, cosetY);
  const bufferRouEvals = await buffer.toRouEvals(cosetX, cosetY);
  assertEqual(formatFields(field, field.split(bufferRouEvals)), formatFields(field, denseRouEvals), `${label} toRouEvals`);

  const recoveredBuffer = await BivariatePolynomialBuffer.fromRouEvals(
    field,
    bufferRouEvals,
    buffer.xSize,
    buffer.ySize,
    cosetX,
    cosetY,
  );
  assertEqual(recoveredBuffer.toHexCoeffs(), dense.toHexCoeffs(), `${label} fromRouEvals`);
}

function checkRuffiniDivision(field: FieldRuntime): void {
  const polynomial = DensePolynomialExt.fromCoeffs(
    field,
    [
      field.fromBigInt(3n),
      field.fromBigInt(5n),
      field.fromBigInt(7n),
      field.fromBigInt(11n),
      field.fromBigInt(13n),
      field.fromBigInt(17n),
      field.fromBigInt(19n),
      field.fromBigInt(23n),
    ],
    4,
    2,
  );
  const xPoint = field.fromBigInt(29n);
  const yPoint = field.fromBigInt(31n);
  const denseDivision = polynomial.divByRuffini(xPoint, yPoint);
  const bufferDivision = BivariatePolynomialBuffer.fromDense(polynomial).divByRuffini(xPoint, yPoint);

  assertDenseEqual(
    bufferDivision.quotientX.toDense(),
    denseDivision.quotientX,
    "ruffini quotientX",
  );
  assertDenseEqual(
    bufferDivision.quotientY.toDense(),
    denseDivision.quotientY,
    "ruffini quotientY",
  );
  assertEqual(field.toHex(bufferDivision.remainder), field.toHex(denseDivision.remainder), "ruffini remainder");
}

function checkVanishingDivision(field: FieldRuntime): void {
  const vanishingXDegree = 2;
  const vanishingYDegree = 2;
  const qX = DensePolynomialExt.fromCoeffs(
    field,
    [field.fromBigInt(3n), field.fromBigInt(5n), field.fromBigInt(7n), field.fromBigInt(11n)],
    2,
    2,
  );
  const qY = DensePolynomialExt.fromCoeffs(field, [field.fromBigInt(13n), field.fromBigInt(17n)], 1, 2);
  const p = qX.mul(vanishingPolynomialX(field, vanishingXDegree)).add(
    qY.mul(vanishingPolynomialY(field, vanishingYDegree)),
  );
  const denseDivision = p.divByVanishingOpt(vanishingXDegree, vanishingYDegree);
  const bufferDivision = BivariatePolynomialBuffer.fromDense(p).divByVanishingOpt(
    vanishingXDegree,
    vanishingYDegree,
  );

  assertDenseEqual(bufferDivision.quotientX.toDense(), denseDivision.quotientX, "vanishing quotientX");
  assertDenseEqual(bufferDivision.quotientY.toDense(), denseDivision.quotientY, "vanishing quotientY");
}

function checkBufferCopySemantics(field: FieldRuntime, coefficients: readonly FieldElement[]): void {
  const raw = field.concat(coefficients);
  const polynomial = BivariatePolynomialBuffer.fromBuffer(field, raw, 4, 2);
  field.writeBufferElement(raw, 0, field.fromBigInt(101n));
  assertEqual(polynomial.toHexCoeffs(), formatFields(field, coefficients), "fromBuffer must copy the source buffer");
}

function checkPrefixAdd(field: FieldRuntime): void {
  const target = BivariatePolynomialBuffer.fromCoeffs(
    field,
    [3n, 5n, 7n, 11n].map((value) => field.fromBigInt(value)),
    2,
    2,
  );
  const prefix = BivariatePolynomialBuffer.fromCoeffs(field, [13n, 17n].map((value) => field.fromBigInt(value)), 2, 1);
  const scale = field.fromBigInt(19n);
  const actual = target.clone().addScaledPrefixAssign(prefix, scale);
  const expected = target.toDense().add(prefix.toDense().scale(scale));
  assertDenseEqual(actual.toDense(), expected, "addScaledPrefixAssign");

  const tooWide = BivariatePolynomialBuffer.fromCoeffs(
    field,
    Array.from({ length: 4 }, () => field.one),
    4,
    1,
  );
  assertThrows(() => target.clone().addScaledPrefixAssign(tooWide, scale), "addScaledPrefixAssign shape guard");
}

function assertDenseEqual(actual: DensePolynomialExt, expected: DensePolynomialExt, label: string): void {
  const xSize = Math.max(actual.xSize, expected.xSize);
  const ySize = Math.max(actual.ySize, expected.ySize);
  assertEqual(actual.resize(xSize, ySize).toHexCoeffs(), expected.resize(xSize, ySize).toHexCoeffs(), label);
}

function vanishingPolynomialX(field: FieldRuntime, degree: number): DensePolynomialExt {
  const size = nextPowerOfTwo(degree + 1);
  const coefficients = Array.from({ length: size }, () => field.zero);
  coefficients[0] = field.neg(field.one);
  coefficients[degree] = field.one;
  return DensePolynomialExt.fromCoeffs(field, coefficients, size, 1);
}

function vanishingPolynomialY(field: FieldRuntime, degree: number): DensePolynomialExt {
  const size = nextPowerOfTwo(degree + 1);
  const coefficients = Array.from({ length: size }, () => field.zero);
  coefficients[0] = field.neg(field.one);
  coefficients[degree] = field.one;
  return DensePolynomialExt.fromCoeffs(field, coefficients, 1, size);
}

function nextPowerOfTwo(value: number): number {
  let size = 1;
  while (size < value) {
    size *= 2;
  }
  return size;
}

function formatFields(field: FieldRuntime, values: readonly FieldElement[]): string[] {
  return values.map((value) => field.toHex(value));
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertThrows(fn: () => unknown, label: string): void {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(`${label} did not throw`);
}

const entrypoint = fileURLToPath(import.meta.url);

if (process.argv[1] === entrypoint) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Polynomial buffer check failed: ${message}`);
    process.exitCode = 1;
  });
}
