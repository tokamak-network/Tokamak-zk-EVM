import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { createCurveRuntime, type CurveRuntime } from "../../../src/runtime/curve/curve.js";
import type { FieldElement, FieldRuntime } from "../../../src/runtime/field/field-runtime.js";
import {
  BivariatePolynomialBuffer,
  biNttBuffer,
} from "../../../src/runtime/polynomial/bivariate-polynomial-buffer.js";
import { DensePolynomialExt } from "../../support/polynomial/dense-polynomial.js";
import {
  bivariateBufferFromDense,
  bivariateBufferToHexCoeffs,
  denseFromBivariateBuffer,
} from "../../support/polynomial/dense-buffer-adapter.js";
import type { ProverCrsRuntime } from "../../../src/prover/api/binary-input.js";
import type { SetupParams } from "../../../src/artifacts/setup/setup-params.js";
import {
  intt2dReference,
  ntt2dReference,
} from "../../support/polynomial/ntt-reference.js";
import { encodePolynomialBufferWithSigma1 } from "../../../src/prover/commitments/sigma1-encoder.js";
import { assertJsonEqual as assertEqual } from "../../support/assertions.js";
import { concatBytes } from "../../support/bytes.js";
import {
  lowDegreeXTimesVanishingBuffer,
  lowDegreeYTimesVanishingBuffer,
} from "../../../src/prover/polynomial/shifted-products.js";

async function main(): Promise<void> {
  const runtime = await createCurveRuntime();
  try {
    await checkBivariatePolynomialBuffer(runtime.Fr);
    const operationRecords = await checkOperationParityMatrix(runtime.Fr);
    printOperationParityMatrix(operationRecords);
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
  } as SetupParams;
  const crs = {
    sigma1: {
      xyPowers: {
        data: concatBytes(Array.from({ length: 16 }, () => runtime.G1.generator)),
        count: 16,
        elementByteLength: 96,
      },
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
  const buffer = bivariateBufferFromDense(dense);

  assertEqual(bivariateBufferToHexCoeffs(buffer), dense.toHexCoeffs(), "fromDense coefficients");
  assertEqual(denseFromBivariateBuffer(buffer).toHexCoeffs(), dense.toHexCoeffs(), "toDense coefficients");
  assertEqual(formatFields(field, field.split(buffer.coefficients)), dense.toHexCoeffs(), "buffer coefficients");

  const otherDense = DensePolynomialExt.fromCoeffs(
    field,
    coefficients.map((coefficient) => field.square(coefficient)),
    4,
    2,
  );
  const otherBuffer = bivariateBufferFromDense(otherDense);
  const scale = field.fromBigInt(29n);

  assertEqual(bivariateBufferToHexCoeffs(await buffer.addBatch(otherBuffer)), dense.add(otherDense).toHexCoeffs(), "addBatch");
  assertEqual(bivariateBufferToHexCoeffs(await buffer.subBatch(otherBuffer)), dense.sub(otherDense).toHexCoeffs(), "subBatch");
  assertEqual(bivariateBufferToHexCoeffs(await buffer.scaleBatch(scale)), dense.scale(scale).toHexCoeffs(), "scaleBatch");
  assertEqual(bivariateBufferToHexCoeffs(buffer), dense.toHexCoeffs(), "non-mutating operations must not alter the source");
  assertEqual(
    bivariateBufferToHexCoeffs(buffer.clone().addScaledPrefixAssign(otherBuffer, scale)),
    dense.add(otherDense.scale(scale)).toHexCoeffs(),
    "addScaledPrefixAssign",
  );

  const xScale = field.fromBigInt(31n);
  const yScale = field.fromBigInt(37n);
  assertEqual(
    bivariateBufferToHexCoeffs(await buffer.scaleCoeffsXBatch(xScale)),
    dense.scaleCoeffsX(xScale).toHexCoeffs(),
    "scaleCoeffsXBatch",
  );
  assertEqual(
    bivariateBufferToHexCoeffs(await buffer.scaleCoeffsYBatch(yScale)),
    dense.scaleCoeffsY(yScale).toHexCoeffs(),
    "scaleCoeffsYBatch",
  );
  assertEqual(
    bivariateBufferToHexCoeffs(await buffer.resize(8, 4).addScaledPrefixBatch(buffer, scale)),
    dense.resize(8, 4).add(dense.scale(scale)).toHexCoeffs(),
    "addScaledPrefixBatch",
  );

  const xPoint = field.fromBigInt(41n);
  const yPoint = field.fromBigInt(43n);
  assertEqual(field.toHex(buffer.eval(xPoint, yPoint)), field.toHex(dense.eval(xPoint, yPoint)), "eval");
  assertEqual(bivariateBufferToHexCoeffs(buffer.resize(8, 4)), dense.resize(8, 4).toHexCoeffs(), "resize");
  assertEqual(
    bivariateBufferToHexCoeffs(
      BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.zero, field.zero, field.zero], 2, 2)
        .optimizeSize(),
    ),
    DensePolynomialExt.zero(field).toHexCoeffs(),
    "optimizeSize zero",
  );
  checkPrefixAdd(field);
  assertDenseEqual(denseFromBivariateBuffer(await buffer.mul(otherBuffer)), dense.mul(otherDense), "ntt mul");

  const beforeRou = bivariateBufferToHexCoeffs(buffer);
  await buffer.toRouEvals();
  assertEqual(bivariateBufferToHexCoeffs(buffer), beforeRou, "toRouEvals must not mutate coefficients");

  await assertRouParity(field, dense, buffer, undefined, undefined, "rou");
  await assertRouParity(field, dense, buffer, xScale, yScale, "coset rou");
  await checkRuffiniDivision(field);
  await checkVanishingDivision(field);
}

interface OperationParityRecord {
  readonly operation: string;
  readonly shape: string;
  readonly denseMs: number;
  readonly bufferMs: number;
}

interface OperationCase {
  readonly label: string;
  readonly coefficients: readonly FieldElement[];
  readonly xSize: number;
  readonly ySize: number;
}

async function checkOperationParityMatrix(field: FieldRuntime): Promise<readonly OperationParityRecord[]> {
  const records: OperationParityRecord[] = [];
  const cases = createOperationCases(field);

  for (const testCase of cases) {
    const dense = DensePolynomialExt.fromCoeffs(field, testCase.coefficients, testCase.xSize, testCase.ySize);
    const buffer = BivariatePolynomialBuffer.fromCoeffs(field, testCase.coefficients, testCase.xSize, testCase.ySize);
    const otherDense = DensePolynomialExt.fromCoeffs(
      field,
      testCase.coefficients.map((coefficient, index) => field.add(field.square(coefficient), field.fromBigInt(BigInt(index + 1)))),
      testCase.xSize,
      testCase.ySize,
    );
    const otherBuffer = bivariateBufferFromDense(otherDense);
    const scale = field.fromBigInt(29n);
    const xScale = field.fromBigInt(31n);
    const yScale = field.fromBigInt(37n);
    const xPoint = field.fromBigInt(41n);
    const yPoint = field.fromBigInt(43n);
    const replacement = field.fromBigInt(47n);
    const targetXSize = testCase.xSize * 2;
    const targetYSize = testCase.ySize * 2;

    await recordOperation(records, "fromCoeffs/coefficients", testCase.label, () => dense.toHexCoeffs(), () => bivariateBufferToHexCoeffs(buffer));
    await recordOperation(records, "fromDense", testCase.label, () => dense.toHexCoeffs(), () => bivariateBufferToHexCoeffs(bivariateBufferFromDense(dense)));
    await recordOperation(records, "toDense", testCase.label, () => dense.toHexCoeffs(), () => denseFromBivariateBuffer(buffer).toHexCoeffs());
    await recordOperation(
      records,
      "getCoeff",
      testCase.label,
      () => field.toHex(dense.getCoeff(Math.min(1, testCase.xSize - 1), Math.min(1, testCase.ySize - 1))),
      () => field.toHex(buffer.getCoeff(Math.min(1, testCase.xSize - 1), Math.min(1, testCase.ySize - 1))),
    );
    await recordOperation(
      records,
      "setCoeff",
      testCase.label,
      () => {
        const expected = [...testCase.coefficients];
        expected[Math.min(1, testCase.xSize - 1) * testCase.ySize + Math.min(1, testCase.ySize - 1)] = replacement;
        return formatFields(field, expected);
      },
      () => {
        const clone = buffer.clone();
        clone.setCoeff(Math.min(1, testCase.xSize - 1), Math.min(1, testCase.ySize - 1), replacement);
        return bivariateBufferToHexCoeffs(clone);
      },
    );
    await recordOperation(records, "findDegree", testCase.label, () => dense.findDegree(), () => buffer.findDegree());
    await recordOperation(records, "optimizeSize", testCase.label, () => dense.optimizeSize().toHexCoeffs(), () => bivariateBufferToHexCoeffs(buffer.optimizeSize()));
    await recordOperation(records, "resize", testCase.label, () => dense.resize(targetXSize, targetYSize).toHexCoeffs(), () => bivariateBufferToHexCoeffs(buffer.resize(targetXSize, targetYSize)));
    await recordOperation(records, "eval", testCase.label, () => field.toHex(dense.eval(xPoint, yPoint)), () => field.toHex(buffer.eval(xPoint, yPoint)));
    await recordOperation(
      records,
      "addScaledPrefixAssign",
      testCase.label,
      () => dense.resize(targetXSize, targetYSize).add(dense.scale(scale)).toHexCoeffs(),
      () => bivariateBufferToHexCoeffs(buffer.resize(targetXSize, targetYSize).addScaledPrefixAssign(buffer, scale)),
    );
    await recordOperation(records, "mul", testCase.label, () => dense.mul(otherDense).toHexCoeffs(), async () => bivariateBufferToHexCoeffs(await buffer.mul(otherBuffer)));
    await recordOperation(
      records,
      "biNtt forward",
      testCase.label,
      async () => formatFields(field, await ntt2dReference(field, testCase.coefficients, testCase.xSize, testCase.ySize)),
      async () => formatFields(field, field.split(await biNttBuffer(field, field.concat(testCase.coefficients), testCase.xSize, testCase.ySize, "forward"))),
    );
    const denseNttEvals = await ntt2dReference(field, testCase.coefficients, testCase.xSize, testCase.ySize);
    await recordOperation(
      records,
      "biNtt inverse",
      testCase.label,
      async () => formatFields(field, await intt2dReference(field, denseNttEvals, testCase.xSize, testCase.ySize)),
      async () => formatFields(field, field.split(await biNttBuffer(field, field.concat(denseNttEvals), testCase.xSize, testCase.ySize, "inverse"))),
    );
    await recordOperation(
      records,
      "toRouEvals",
      testCase.label,
      async () => formatFields(field, await dense.toRouEvals()),
      async () => formatFields(field, field.split(await buffer.toRouEvals())),
    );
    await recordOperation(
      records,
      "toRouEvals coset",
      testCase.label,
      async () => formatFields(field, await dense.toRouEvals(xScale, yScale)),
      async () => formatFields(field, field.split(await buffer.toRouEvals(xScale, yScale))),
    );

    const denseEvals = await dense.toRouEvals();
    const denseCosetEvals = await dense.toRouEvals(xScale, yScale);
    await recordOperation(
      records,
      "fromRouEvals",
      testCase.label,
      async () => (await DensePolynomialExt.fromRouEvals(field, denseEvals, testCase.xSize, testCase.ySize)).toHexCoeffs(),
      async () => bivariateBufferToHexCoeffs(await BivariatePolynomialBuffer.fromRouEvals(field, field.concat(denseEvals), testCase.xSize, testCase.ySize)),
    );
    await recordOperation(
      records,
      "fromRouEvals coset",
      testCase.label,
      async () => (await DensePolynomialExt.fromRouEvals(field, denseCosetEvals, testCase.xSize, testCase.ySize, xScale, yScale)).toHexCoeffs(),
      async () =>
        bivariateBufferToHexCoeffs(
          await BivariatePolynomialBuffer.fromRouEvals(
            field,
            field.concat(denseCosetEvals),
            testCase.xSize,
            testCase.ySize,
            xScale,
            yScale,
          ),
        ),
    );
    await recordOperation(
      records,
      "divByRuffiniBatch",
      testCase.label,
      () => formatRuffiniDivision(field, dense.divByRuffini(xPoint, yPoint)),
      async () => formatBufferRuffiniDivision(field, await buffer.divByRuffiniBatch(xPoint, yPoint)),
    );
  }

  await recordVanishingDivisionOperation(field, records);
  await recordLowDegreeVanishingOperations(field, records);
  return records;
}

function createOperationCases(field: FieldRuntime): readonly OperationCase[] {
  const shapes = [
    { label: "4x2", xSize: 4, ySize: 2 },
    { label: "4x4", xSize: 4, ySize: 4 },
    { label: "8x4", xSize: 8, ySize: 4 },
  ];

  return shapes.map((shape) => ({
    ...shape,
    coefficients: Array.from({ length: shape.xSize * shape.ySize }, (_, index) =>
      index % 5 === 0 ? field.zero : field.fromBigInt(BigInt((index + 3) * (index + 7))),
    ),
  }));
}

async function recordVanishingDivisionOperation(field: FieldRuntime, records: OperationParityRecord[]): Promise<void> {
  const vanishingXDegree = 2;
  const vanishingYDegree = 2;
  const qX = DensePolynomialExt.fromCoeffs(
    field,
    [3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n].map((value) => field.fromBigInt(value)),
    4,
    2,
  );
  const qY = DensePolynomialExt.fromCoeffs(
    field,
    [29n, 31n, 37n, 41n, 43n, 47n, 53n, 59n].map((value) => field.fromBigInt(value)),
    2,
    4,
  );
  const numerator = qX.mul(vanishingPolynomialX(field, vanishingXDegree)).add(
    qY.mul(vanishingPolynomialY(field, vanishingYDegree)),
  );
  const buffer = bivariateBufferFromDense(numerator);

  await recordOperation(
    records,
    "divByVanishingOptBatch",
    `${numerator.xSize}x${numerator.ySize}`,
    () => formatVanishingDivision(numerator.divByVanishingOpt(vanishingXDegree, vanishingYDegree)),
    async () => formatBufferVanishingDivision(
      await buffer.divByVanishingOptBatch(vanishingXDegree, vanishingYDegree),
    ),
  );
}

async function recordLowDegreeVanishingOperations(field: FieldRuntime, records: OperationParityRecord[]): Promise<void> {
  const coefficients = [3n, 5n, 7n].map((value) => field.fromBigInt(value));
  const exponent = 4;
  await recordOperation(
    records,
    "lowDegreeXTimesVanishing",
    `${coefficients.length}/${exponent}`,
    () =>
      DensePolynomialExt.fromCoeffs(field, padFieldArray(field, coefficients, nextPowerOfTwo(coefficients.length)), nextPowerOfTwo(coefficients.length), 1)
        .mul(vanishingPolynomialX(field, exponent))
        .toHexCoeffs(),
    () => bivariateBufferToHexCoeffs(lowDegreeXTimesVanishingBuffer(field, coefficients, exponent)),
  );
  await recordOperation(
    records,
    "lowDegreeYTimesVanishing",
    `${coefficients.length}/${exponent}`,
    () =>
      DensePolynomialExt.fromCoeffs(field, padFieldArray(field, coefficients, nextPowerOfTwo(coefficients.length)), 1, nextPowerOfTwo(coefficients.length))
        .mul(vanishingPolynomialY(field, exponent))
        .toHexCoeffs(),
    () => bivariateBufferToHexCoeffs(lowDegreeYTimesVanishingBuffer(field, coefficients, exponent)),
  );
}

function padFieldArray(field: FieldRuntime, values: readonly FieldElement[], length: number): FieldElement[] {
  return [...values, ...Array.from({ length: length - values.length }, () => field.zero)];
}

async function recordOperation<T>(
  records: OperationParityRecord[],
  operation: string,
  shape: string,
  denseFn: () => T | Promise<T>,
  bufferFn: () => T | Promise<T>,
): Promise<void> {
  const dense = await measure(denseFn);
  const buffer = await measure(bufferFn);
  assertEqual(buffer.result, dense.result, `${operation} ${shape}`);
  records.push({
    operation,
    shape,
    denseMs: dense.durationMs,
    bufferMs: buffer.durationMs,
  });
}

async function measure<T>(fn: () => T | Promise<T>): Promise<{ readonly result: T; readonly durationMs: number }> {
  const startedAt = performance.now();
  const result = await fn();
  return {
    result,
    durationMs: performance.now() - startedAt,
  };
}

function printOperationParityMatrix(records: readonly OperationParityRecord[]): void {
  console.table(
    records.map((record) => ({
      operation: record.operation,
      shape: record.shape,
      denseMs: record.denseMs.toFixed(3),
      bufferMs: record.bufferMs.toFixed(3),
    })),
  );
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
  assertEqual(bivariateBufferToHexCoeffs(recoveredBuffer), dense.toHexCoeffs(), `${label} fromRouEvals`);
}

async function checkRuffiniDivision(field: FieldRuntime): Promise<void> {
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
  const buffer = bivariateBufferFromDense(polynomial);
  const batchDivision = await buffer.divByRuffiniBatch(xPoint, yPoint);

  assertDenseEqual(denseFromBivariateBuffer(batchDivision.quotientX), denseDivision.quotientX, "batch ruffini quotientX");
  assertDenseEqual(denseFromBivariateBuffer(batchDivision.quotientY), denseDivision.quotientY, "batch ruffini quotientY");
  assertEqual(field.toHex(batchDivision.remainder), field.toHex(denseDivision.remainder), "batch ruffini remainder");
}

async function checkVanishingDivision(field: FieldRuntime): Promise<void> {
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
  const bufferDivision = await bivariateBufferFromDense(p).divByVanishingOptBatch(
    vanishingXDegree,
    vanishingYDegree,
  );

  assertDenseEqual(denseFromBivariateBuffer(bufferDivision.quotientX), denseDivision.quotientX, "vanishing quotientX");
  assertDenseEqual(denseFromBivariateBuffer(bufferDivision.quotientY), denseDivision.quotientY, "vanishing quotientY");
}

function formatRuffiniDivision(
  field: FieldRuntime,
  division: {
    readonly quotientX: DensePolynomialExt;
    readonly quotientY: DensePolynomialExt;
    readonly remainder: FieldElement;
  },
): {
  readonly quotientX: readonly string[];
  readonly quotientY: readonly string[];
  readonly remainder: string;
} {
  return {
    quotientX: division.quotientX.optimizeSize().toHexCoeffs(),
    quotientY: division.quotientY.optimizeSize().toHexCoeffs(),
    remainder: field.toHex(division.remainder),
  };
}

function formatBufferRuffiniDivision(
  field: FieldRuntime,
  division: Awaited<ReturnType<BivariatePolynomialBuffer["divByRuffiniBatch"]>>,
): {
  readonly quotientX: readonly string[];
  readonly quotientY: readonly string[];
  readonly remainder: string;
} {
  return {
    quotientX: bivariateBufferToHexCoeffs(division.quotientX.optimizeSize()),
    quotientY: bivariateBufferToHexCoeffs(division.quotientY.optimizeSize()),
    remainder: field.toHex(division.remainder),
  };
}

function formatVanishingDivision(division: {
  readonly quotientX: DensePolynomialExt;
  readonly quotientY: DensePolynomialExt;
}): {
  readonly quotientX: readonly string[];
  readonly quotientY: readonly string[];
} {
  return {
    quotientX: division.quotientX.toHexCoeffs(),
    quotientY: division.quotientY.toHexCoeffs(),
  };
}

function formatBufferVanishingDivision(
  division: Awaited<ReturnType<BivariatePolynomialBuffer["divByVanishingOptBatch"]>>,
): {
  readonly quotientX: readonly string[];
  readonly quotientY: readonly string[];
} {
  return {
    quotientX: bivariateBufferToHexCoeffs(division.quotientX),
    quotientY: bivariateBufferToHexCoeffs(division.quotientY),
  };
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
  const expected = denseFromBivariateBuffer(target).add(denseFromBivariateBuffer(prefix).scale(scale));
  assertDenseEqual(denseFromBivariateBuffer(actual), expected, "addScaledPrefixAssign");

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
