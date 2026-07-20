import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import {
  BivariatePolynomialBuffer,
  DensePolynomialExt,
  biNttBuffer,
  createCurveRuntime,
  intt2d,
  ntt2d,
} from "../../../src/index.js";
import type { CurveRuntime, FieldElement, FieldRuntime, ProverCrsRuntime, ProverSetupParams } from "../../../src/index.js";
import { encodePolynomialBufferWithSigma1 } from "../../../src/prover/internal/initial-relation.js";
import {
  lowDegreeXTimesVanishingBuffer,
  lowDegreeYTimesVanishingBuffer,
  mulByLinearX,
  mulByLinearY,
} from "../../../src/prover/internal/polynomial-ops.js";

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
  } as ProverSetupParams;
  const crs = {
    sigma1: {
      xyPowersRaw: concatBytes(Array.from({ length: 16 }, () => runtime.G1.generator)),
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

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
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
    const otherBuffer = BivariatePolynomialBuffer.fromDense(otherDense);
    const scale = field.fromBigInt(29n);
    const xScale = field.fromBigInt(31n);
    const yScale = field.fromBigInt(37n);
    const xPoint = field.fromBigInt(41n);
    const yPoint = field.fromBigInt(43n);
    const replacement = field.fromBigInt(47n);
    const linearX = [field.fromBigInt(53n), field.fromBigInt(59n)];
    const linearY = [field.fromBigInt(61n), field.fromBigInt(67n)];
    const targetXSize = testCase.xSize * 2;
    const targetYSize = testCase.ySize * 2;

    await recordOperation(records, "fromCoeffs/toCoeffs", testCase.label, () => dense.toHexCoeffs(), () => buffer.toHexCoeffs());
    await recordOperation(
      records,
      "fromBuffer",
      testCase.label,
      () => dense.toHexCoeffs(),
      () => BivariatePolynomialBuffer.fromBuffer(field, field.concat(testCase.coefficients), testCase.xSize, testCase.ySize).toHexCoeffs(),
    );
    await recordOperation(records, "fromDense", testCase.label, () => dense.toHexCoeffs(), () => BivariatePolynomialBuffer.fromDense(dense).toHexCoeffs());
    await recordOperation(records, "toDense", testCase.label, () => dense.toHexCoeffs(), () => buffer.toDense().toHexCoeffs());
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
        return clone.toHexCoeffs();
      },
    );
    await recordOperation(records, "findDegree", testCase.label, () => dense.findDegree(), () => buffer.findDegree());
    await recordOperation(records, "optimizeSize", testCase.label, () => dense.optimizeSize().toHexCoeffs(), () => buffer.optimizeSize().toHexCoeffs());
    await recordOperation(records, "resize", testCase.label, () => dense.resize(targetXSize, targetYSize).toHexCoeffs(), () => buffer.resize(targetXSize, targetYSize).toHexCoeffs());
    await recordOperation(records, "eval", testCase.label, () => field.toHex(dense.eval(xPoint, yPoint)), () => field.toHex(buffer.eval(xPoint, yPoint)));
    await recordOperation(records, "add", testCase.label, () => dense.add(otherDense).toHexCoeffs(), () => buffer.add(otherBuffer).toHexCoeffs());
    await recordOperation(records, "sub", testCase.label, () => dense.sub(otherDense).toHexCoeffs(), () => buffer.sub(otherBuffer).toHexCoeffs());
    await recordOperation(records, "scale", testCase.label, () => dense.scale(scale).toHexCoeffs(), () => buffer.scale(scale).toHexCoeffs());
    await recordOperation(records, "addAssign", testCase.label, () => dense.add(otherDense).toHexCoeffs(), () => buffer.clone().addAssign(otherBuffer).toHexCoeffs());
    await recordOperation(records, "subAssign", testCase.label, () => dense.sub(otherDense).toHexCoeffs(), () => buffer.clone().subAssign(otherBuffer).toHexCoeffs());
    await recordOperation(records, "scaleAssign", testCase.label, () => dense.scale(scale).toHexCoeffs(), () => buffer.clone().scaleAssign(scale).toHexCoeffs());
    await recordOperation(
      records,
      "addScaledAssign",
      testCase.label,
      () => dense.add(otherDense.scale(scale)).toHexCoeffs(),
      () => buffer.clone().addScaledAssign(otherBuffer, scale).toHexCoeffs(),
    );
    await recordOperation(
      records,
      "addScaledPrefixAssign",
      testCase.label,
      () => dense.resize(targetXSize, targetYSize).add(dense.scale(scale)).toHexCoeffs(),
      () => buffer.resize(targetXSize, targetYSize).addScaledPrefixAssign(buffer, scale).toHexCoeffs(),
    );
    await recordOperation(records, "scaleCoeffsX", testCase.label, () => dense.scaleCoeffsX(xScale).toHexCoeffs(), () => buffer.scaleCoeffsX(xScale).toHexCoeffs());
    await recordOperation(records, "scaleCoeffsY", testCase.label, () => dense.scaleCoeffsY(yScale).toHexCoeffs(), () => buffer.scaleCoeffsY(yScale).toHexCoeffs());
    await recordOperation(records, "mulMonomial", testCase.label, () => dense.mulMonomial(1, 1).toHexCoeffs(), () => buffer.mulMonomial(1, 1).toHexCoeffs());
    await recordOperation(
      records,
      "mulByLinearX",
      testCase.label,
      () => dense.scale(linearX[0]).add(dense.mulMonomial(1, 0).scale(linearX[1])).toHexCoeffs(),
      () => mulByLinearX(buffer, linearX).toHexCoeffs(),
    );
    await recordOperation(
      records,
      "mulByLinearY",
      testCase.label,
      () => dense.scale(linearY[0]).add(dense.mulMonomial(0, 1).scale(linearY[1])).toHexCoeffs(),
      () => mulByLinearY(buffer, linearY).toHexCoeffs(),
    );
    await recordOperation(records, "mul", testCase.label, () => dense.mul(otherDense).toHexCoeffs(), async () => (await buffer.mul(otherBuffer)).toHexCoeffs());
    await recordOperation(
      records,
      "biNtt forward",
      testCase.label,
      async () => formatFields(field, await ntt2d(field, testCase.coefficients, testCase.xSize, testCase.ySize)),
      async () => formatFields(field, field.split(await biNttBuffer(field, field.concat(testCase.coefficients), testCase.xSize, testCase.ySize, "forward"))),
    );
    const denseNttEvals = await ntt2d(field, testCase.coefficients, testCase.xSize, testCase.ySize);
    await recordOperation(
      records,
      "biNtt inverse",
      testCase.label,
      async () => formatFields(field, await intt2d(field, denseNttEvals, testCase.xSize, testCase.ySize)),
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
      async () => (await BivariatePolynomialBuffer.fromRouEvals(field, field.concat(denseEvals), testCase.xSize, testCase.ySize)).toHexCoeffs(),
    );
    await recordOperation(
      records,
      "fromRouEvals coset",
      testCase.label,
      async () => (await DensePolynomialExt.fromRouEvals(field, denseCosetEvals, testCase.xSize, testCase.ySize, xScale, yScale)).toHexCoeffs(),
      async () =>
        (await BivariatePolynomialBuffer.fromRouEvals(
          field,
          field.concat(denseCosetEvals),
          testCase.xSize,
          testCase.ySize,
          xScale,
          yScale,
        )).toHexCoeffs(),
    );
    await recordOperation(
      records,
      "divByRuffini",
      testCase.label,
      () => formatRuffiniDivision(field, dense.divByRuffini(xPoint, yPoint)),
      () => formatBufferRuffiniDivision(field, buffer.divByRuffini(xPoint, yPoint)),
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
  const buffer = BivariatePolynomialBuffer.fromDense(numerator);

  await recordOperation(
    records,
    "divByVanishingOpt",
    `${numerator.xSize}x${numerator.ySize}`,
    () => formatVanishingDivision(numerator.divByVanishingOpt(vanishingXDegree, vanishingYDegree)),
    () => formatBufferVanishingDivision(buffer.divByVanishingOpt(vanishingXDegree, vanishingYDegree)),
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
    () => lowDegreeXTimesVanishingBuffer(field, coefficients, exponent).toHexCoeffs(),
  );
  await recordOperation(
    records,
    "lowDegreeYTimesVanishing",
    `${coefficients.length}/${exponent}`,
    () =>
      DensePolynomialExt.fromCoeffs(field, padFieldArray(field, coefficients, nextPowerOfTwo(coefficients.length)), 1, nextPowerOfTwo(coefficients.length))
        .mul(vanishingPolynomialY(field, exponent))
        .toHexCoeffs(),
    () => lowDegreeYTimesVanishingBuffer(field, coefficients, exponent).toHexCoeffs(),
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
  division: ReturnType<BivariatePolynomialBuffer["divByRuffini"]>,
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

function formatBufferVanishingDivision(division: ReturnType<BivariatePolynomialBuffer["divByVanishingOpt"]>): {
  readonly quotientX: readonly string[];
  readonly quotientY: readonly string[];
} {
  return {
    quotientX: division.quotientX.toHexCoeffs(),
    quotientY: division.quotientY.toHexCoeffs(),
  };
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
