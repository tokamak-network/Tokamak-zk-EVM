import { fileURLToPath } from "node:url";

import { BivariatePolynomialBuffer, createCurveRuntime, DensePolynomialExt } from "../../../src/index.js";
import type { FieldElement, FieldRuntime } from "../../../src/index.js";
import {
  buildLagrangeK0,
  buildLagrangeKl,
  computeRecursionEvalsBuffer,
  constantPolynomialBuffer,
  linearCombinationBuffer,
  lowDegreeXTimesVanishingBuffer,
  lowDegreeYTimesVanishingBuffer,
  mulByLinearX,
  mulByLinearY,
  mulByOneMinusX,
  mulByTerm9,
  mulByXMinusOne,
  multiplyPairWithSharedRight,
  transposeRowMajorBuffer,
} from "../../../src/prover/internal/polynomial-ops.js";

async function main(): Promise<void> {
  const runtime = await createCurveRuntime();
  try {
    await checkProverPolynomialOps(runtime.Fr);
  } finally {
    await runtime.terminate();
  }

  console.log("Checked prover polynomial operation parity");
}

async function checkProverPolynomialOps(field: FieldRuntime): Promise<void> {
  checkLinearCombination(field);
  checkLowDegreeVanishingProducts(field);
  checkTranspose(field);
  await checkRecursionEvals(field);
  await checkLagrangeBuilders(field);
  checkSpecialProducts(field);
  await checkSharedRightMultiplication(field);
}

function checkLinearCombination(field: FieldRuntime): void {
  const left = DensePolynomialExt.fromCoeffs(
    field,
    [3n, 5n, 7n, 11n].map((value) => field.fromBigInt(value)),
    2,
    2,
  );
  const right = DensePolynomialExt.fromCoeffs(field, [13n, 17n].map((value) => field.fromBigInt(value)), 2, 1);
  const leftScale = field.fromBigInt(19n);
  const rightScale = field.fromBigInt(23n);
  const constant = field.fromBigInt(29n);

  const actual = linearCombinationBuffer(field, [
    [leftScale, BivariatePolynomialBuffer.fromDense(left)],
    [rightScale, BivariatePolynomialBuffer.fromDense(right)],
    [field.one, constantPolynomialBuffer(field, constant)],
  ]);
  const expected = left.scale(leftScale)
    .add(right.scale(rightScale))
    .add(DensePolynomialExt.fromCoeffs(field, [constant], 1, 1));

  assertBufferDenseEqual(actual, expected, "linearCombinationBuffer");
}

function checkLowDegreeVanishingProducts(field: FieldRuntime): void {
  const coefficients = [3n, 5n, 7n].map((value) => field.fromBigInt(value));
  const exponent = 4;

  assertBufferDenseEqual(
    lowDegreeXTimesVanishingBuffer(field, coefficients, exponent),
    lowDegreeXTimesVanishingDense(field, coefficients, exponent),
    "lowDegreeXTimesVanishingBuffer",
  );
  assertBufferDenseEqual(
    lowDegreeYTimesVanishingBuffer(field, coefficients, exponent),
    lowDegreeYTimesVanishingDense(field, coefficients, exponent),
    "lowDegreeYTimesVanishingBuffer",
  );
  assertThrows(() => lowDegreeXTimesVanishingBuffer(field, coefficients, 0), "lowDegreeX invalid exponent");
  assertThrows(() => lowDegreeYTimesVanishingBuffer(field, coefficients, 0), "lowDegreeY invalid exponent");
}

function checkTranspose(field: FieldRuntime): void {
  const values = [3n, 5n, 7n, 11n, 13n, 17n].map((value) => field.fromBigInt(value));
  const actual = transposeRowMajorBuffer(field, field.concat(values), 2, 3);
  const expected = [values[0], values[3], values[1], values[4], values[2], values[5]];
  assertFields(field, field.split(actual), expected, "transposeRowMajorBuffer");
  assertThrows(() => transposeRowMajorBuffer(field, field.concat(values), 4, 2), "transpose shape mismatch");
}

async function checkRecursionEvals(field: FieldRuntime): Promise<void> {
  const mI = 4;
  const sMax = 4;
  const g = Array.from({ length: mI * sMax }, (_, index) => field.fromBigInt(BigInt(index + 3)));
  const f = Array.from({ length: mI * sMax }, (_, index) => field.fromBigInt(BigInt(index + 41)));
  const actual = await computeRecursionEvalsBuffer(field, field.concat(g), field.concat(f), mI, sMax);
  const expected = computeRecursionEvalsDense(field, g, f, mI, sMax);
  assertFields(field, field.split(actual), expected, "computeRecursionEvalsBuffer");
  await assertRejects(
    () => computeRecursionEvalsBuffer(field, field.concat(g.slice(1)), field.concat(f), mI, sMax),
    "recursion eval length mismatch",
  );
}

async function checkLagrangeBuilders(field: FieldRuntime): Promise<void> {
  const mI = 4;
  const sMax = 4;
  const k0Evals = field.createZeroBuffer(mI);
  field.writeBufferElement(k0Evals, 0, field.one);
  const expectedK0 = await DensePolynomialExt.fromRouEvals(field, field.split(k0Evals), mI, 1);
  assertBufferDenseEqual(await buildLagrangeK0(field, mI), expectedK0, "buildLagrangeK0");

  const kEvals = field.createZeroBuffer(mI);
  field.writeBufferElement(kEvals, mI - 1, field.one);
  const lEvals = field.createZeroBuffer(sMax);
  field.writeBufferElement(lEvals, sMax - 1, field.one);
  const expectedK = await DensePolynomialExt.fromRouEvals(field, field.split(kEvals), mI, 1);
  const expectedL = await DensePolynomialExt.fromRouEvals(field, field.split(lEvals), 1, sMax);
  assertBufferDenseEqual(await buildLagrangeKl(field, mI, sMax), expectedK.mul(expectedL), "buildLagrangeKl");
}

function checkSpecialProducts(field: FieldRuntime): void {
  const polynomial = DensePolynomialExt.fromCoeffs(
    field,
    [3n, 5n, 7n, 11n].map((value) => field.fromBigInt(value)),
    2,
    2,
  );
  const buffer = BivariatePolynomialBuffer.fromDense(polynomial);
  const xCoefficients = [13n, 17n].map((value) => field.fromBigInt(value));
  const yCoefficients = [19n, 23n].map((value) => field.fromBigInt(value));
  const tMiEval = field.fromBigInt(29n);
  const tSMaxEval = field.fromBigInt(31n);

  assertBufferDenseEqual(mulByXMinusOne(buffer), polynomial.mulMonomial(1, 0).sub(polynomial), "mulByXMinusOne");
  assertBufferDenseEqual(mulByOneMinusX(buffer), polynomial.sub(polynomial.mulMonomial(1, 0)), "mulByOneMinusX");
  assertBufferDenseEqual(
    mulByLinearX(buffer, xCoefficients),
    polynomial.scale(xCoefficients[0]).add(polynomial.mulMonomial(1, 0).scale(xCoefficients[1])),
    "mulByLinearX",
  );
  assertBufferDenseEqual(
    mulByLinearY(buffer, yCoefficients),
    polynomial.scale(yCoefficients[0]).add(polynomial.mulMonomial(0, 1).scale(yCoefficients[1])),
    "mulByLinearY",
  );

  const term9Constant = field.add(field.mul(tMiEval, xCoefficients[0]), field.mul(tSMaxEval, yCoefficients[0]));
  const term9X = field.mul(tMiEval, xCoefficients[1]);
  const term9Y = field.mul(tSMaxEval, yCoefficients[1]);
  const expectedTerm9 = polynomial
    .scale(term9Constant)
    .add(polynomial.mulMonomial(1, 0).scale(term9X))
    .add(polynomial.mulMonomial(0, 1).scale(term9Y));
  assertBufferDenseEqual(
    mulByTerm9(buffer, xCoefficients, yCoefficients, tMiEval, tSMaxEval),
    expectedTerm9,
    "mulByTerm9",
  );

  assertThrows(() => mulByLinearX(buffer, [field.one]), "mulByLinearX invalid coefficient count");
  assertThrows(() => mulByLinearY(buffer, [field.one]), "mulByLinearY invalid coefficient count");
  assertThrows(() => mulByTerm9(buffer, [field.one], yCoefficients, tMiEval, tSMaxEval), "mulByTerm9 invalid rB_X count");
}

async function checkSharedRightMultiplication(field: FieldRuntime): Promise<void> {
  const firstLeft = BivariatePolynomialBuffer.fromCoeffs(
    field,
    [3n, 5n, 7n, 11n].map((value) => field.fromBigInt(value)),
    2,
    2,
  );
  const secondLeft = BivariatePolynomialBuffer.fromCoeffs(
    field,
    [13n, 17n, 19n, 23n].map((value) => field.fromBigInt(value)),
    2,
    2,
  );
  const sharedRight = BivariatePolynomialBuffer.fromCoeffs(
    field,
    [29n, 31n, 37n, 41n].map((value) => field.fromBigInt(value)),
    2,
    2,
  );

  const [actualFirst, actualSecond] = await multiplyPairWithSharedRight(firstLeft, secondLeft, sharedRight);
  assertBufferDenseEqual(actualFirst, (await firstLeft.mul(sharedRight)).toDense(), "multiplyPairWithSharedRight first");
  assertBufferDenseEqual(actualSecond, (await secondLeft.mul(sharedRight)).toDense(), "multiplyPairWithSharedRight second");
}

function lowDegreeXTimesVanishingDense(
  field: FieldRuntime,
  coefficients: readonly FieldElement[],
  exponent: number,
): DensePolynomialExt {
  const xSize = nextPowerOfTwo(exponent + coefficients.length);
  const output = Array.from({ length: xSize }, () => field.zero);
  for (let index = 0; index < coefficients.length; index += 1) {
    output[index] = field.sub(output[index], coefficients[index]);
    output[index + exponent] = field.add(output[index + exponent], coefficients[index]);
  }
  return DensePolynomialExt.fromCoeffs(field, output, xSize, 1);
}

function lowDegreeYTimesVanishingDense(
  field: FieldRuntime,
  coefficients: readonly FieldElement[],
  exponent: number,
): DensePolynomialExt {
  const ySize = nextPowerOfTwo(exponent + coefficients.length);
  const output = Array.from({ length: ySize }, () => field.zero);
  for (let index = 0; index < coefficients.length; index += 1) {
    output[index] = field.sub(output[index], coefficients[index]);
    output[index + exponent] = field.add(output[index + exponent], coefficients[index]);
  }
  return DensePolynomialExt.fromCoeffs(field, output, 1, ySize);
}

function computeRecursionEvalsDense(
  field: FieldRuntime,
  g: readonly FieldElement[],
  f: readonly FieldElement[],
  mI: number,
  sMax: number,
): FieldElement[] {
  const scalers = g.map((value, index) => field.div(value, f[index]));
  const scalersTransposed = transposeArray(scalers, mI, sMax);
  const recursionTransposed = Array.from({ length: mI * sMax }, () => field.zero);
  recursionTransposed[mI * sMax - 1] = field.one;
  for (let index = mI * sMax - 2; index >= 0; index -= 1) {
    recursionTransposed[index] = field.mul(recursionTransposed[index + 1], scalersTransposed[index + 1]);
  }
  return transposeArray(recursionTransposed, sMax, mI);
}

function transposeArray<T>(values: readonly T[], rowCount: number, columnCount: number): T[] {
  if (values.length !== rowCount * columnCount) {
    throw new Error("Array length does not match shape.");
  }

  const output = new Array<T>(values.length);
  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      output[column * rowCount + row] = values[row * columnCount + column];
    }
  }
  return output;
}

function assertBufferDenseEqual(
  actual: BivariatePolynomialBuffer,
  expected: DensePolynomialExt,
  label: string,
): void {
  const actualDense = actual.toDense();
  const xSize = Math.max(actualDense.xSize, expected.xSize);
  const ySize = Math.max(actualDense.ySize, expected.ySize);
  assertEqual(actualDense.resize(xSize, ySize).toHexCoeffs(), expected.resize(xSize, ySize).toHexCoeffs(), label);
}

function assertFields(
  field: FieldRuntime,
  actual: readonly FieldElement[],
  expected: readonly FieldElement[],
  label: string,
): void {
  assertEqual(actual.map((value) => field.toHex(value)), expected.map((value) => field.toHex(value)), label);
}

function assertThrows(fn: () => unknown, label: string): void {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(`${label} did not throw`);
}

async function assertRejects(fn: () => Promise<unknown>, label: string): Promise<void> {
  try {
    await fn();
  } catch {
    return;
  }
  throw new Error(`${label} did not reject`);
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function nextPowerOfTwo(value: number): number {
  let size = 1;
  while (size < value) {
    size *= 2;
  }
  return size;
}

const entrypoint = fileURLToPath(import.meta.url);

if (process.argv[1] === entrypoint) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Prover polynomial operation check failed: ${message}`);
    process.exitCode = 1;
  });
}
