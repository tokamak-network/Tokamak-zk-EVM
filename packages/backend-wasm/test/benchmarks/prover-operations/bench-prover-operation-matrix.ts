import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BivariatePolynomialBuffer,
  biNttBuffer,
  createCurveRuntime,
  DensePolynomialExt,
  type FieldElement,
  type FieldRuntime,
} from "../../../src/index.js";
import {
  linearCombinationBuffer,
  transposeRowMajorBuffer,
} from "../../../src/prover/internal/polynomial-ops.js";

interface BenchmarkOptions {
  readonly seed: bigint;
  readonly shapes: readonly Shape[];
  readonly groups: ReadonlySet<BenchmarkGroup>;
  readonly iterations: number;
  readonly warmup: number;
  readonly jsonPath: string;
}

type BenchmarkGroup =
  | "2d-ntt"
  | "field-vector-mul"
  | "polynomial-mul"
  | "linear-combination"
  | "division"
  | "materialization";

const ALL_GROUPS: readonly BenchmarkGroup[] = [
  "2d-ntt",
  "field-vector-mul",
  "polynomial-mul",
  "linear-combination",
  "division",
  "materialization",
];

interface Shape {
  readonly xSize: number;
  readonly ySize: number;
}

interface BenchmarkRecord {
  readonly group: string;
  readonly candidate: string;
  readonly shape: string;
  readonly ms: number;
  readonly notes: string;
}

interface BenchmarkReport {
  readonly generatedAt: string;
  readonly options: {
    readonly seed: string;
    readonly shapes: readonly string[];
    readonly groups: readonly BenchmarkGroup[];
    readonly iterations: number;
    readonly warmup: number;
  };
  readonly records: readonly BenchmarkRecord[];
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const runtime = await createCurveRuntime({ singleThread: true });

  try {
    const records: BenchmarkRecord[] = [];
    for (const shape of options.shapes) {
      const context = buildCase(runtime.Fr, shape, options.seed);
      if (options.groups.has("2d-ntt")) {
        records.push(...await benchmarkNtt(runtime.Fr, context, options));
      }
      if (options.groups.has("field-vector-mul")) {
        records.push(...await benchmarkElementWiseMul(runtime.Fr, context, options));
      }
      if (options.groups.has("polynomial-mul")) {
        records.push(...await benchmarkPolynomialMul(runtime.Fr, context, options));
      }
      if (options.groups.has("linear-combination")) {
        records.push(...await benchmarkLinearCombination(runtime.Fr, context, options));
      }
      if (options.groups.has("division")) {
        records.push(...await benchmarkDivision(runtime.Fr, context, options));
      }
      if (options.groups.has("materialization")) {
        records.push(...await benchmarkMaterialization(runtime.Fr, context, options));
      }
    }

    printRecords(records);
    await writeReport(options, records);
  } finally {
    await runtime.terminate();
  }
}

interface BenchmarkCase {
  readonly shape: Shape;
  readonly left: BivariatePolynomialBuffer;
  readonly right: BivariatePolynomialBuffer;
  readonly third: BivariatePolynomialBuffer;
  readonly scaleA: FieldElement;
  readonly scaleB: FieldElement;
  readonly scaleC: FieldElement;
  readonly xPoint: FieldElement;
  readonly yPoint: FieldElement;
}

function buildCase(field: FieldRuntime, shape: Shape, seed: bigint): BenchmarkCase {
  const elementCount = shape.xSize * shape.ySize;
  const left = randomPolynomial(field, shape, seed + 0x11n);
  const right = randomPolynomial(field, shape, seed + 0x22n);
  const third = randomPolynomial(field, shape, seed + 0x33n);
  if (elementCount < 4) {
    throw new Error("Benchmark shapes must contain at least four coefficients.");
  }

  return {
    shape,
    left,
    right,
    third,
    scaleA: field.fromBigInt(3n),
    scaleB: field.fromBigInt(5n),
    scaleC: field.fromBigInt(7n),
    xPoint: field.fromBigInt(11n),
    yPoint: field.fromBigInt(13n),
  };
}

async function benchmarkNtt(
  field: FieldRuntime,
  testCase: BenchmarkCase,
  options: BenchmarkOptions,
): Promise<BenchmarkRecord[]> {
  const shape = formatShape(testCase.shape);
  const current = await testCase.left.toRouEvals();
  const direct = await biNttBuffer(field, testCase.left.coefficients, testCase.shape.xSize, testCase.shape.ySize, "forward");
  const transposeScheduled = await biNttBufferViaTransposeSchedule(
    field,
    testCase.left.coefficients,
    testCase.shape.xSize,
    testCase.shape.ySize,
    "forward",
  );
  assertBytesEqual(current, direct, `2D NTT current/direct mismatch at ${shape}`);
  assertBytesEqual(current, transposeScheduled, `2D NTT transpose-scheduled mismatch at ${shape}`);

  const transposed = transposeRowMajorBuffer(field, testCase.left.coefficients, testCase.shape.xSize, testCase.shape.ySize);
  const doubleTransposed = transposeRowMajorBuffer(field, transposed, testCase.shape.ySize, testCase.shape.xSize);
  assertBytesEqual(testCase.left.coefficients, doubleTransposed, `transpose roundtrip mismatch at ${shape}`);

  return [
    {
      group: "2d-ntt",
      candidate: "current-toRouEvals",
      shape,
      ms: await measure(options, () => testCase.left.toRouEvals()),
      notes: "Current BivariatePolynomialBuffer 2D ROU conversion path.",
    },
    {
      group: "2d-ntt",
      candidate: "direct-biNttBuffer",
      shape,
      ms: await measure(options, () => biNttBuffer(field, testCase.left.coefficients, testCase.shape.xSize, testCase.shape.ySize, "forward")),
      notes: "Direct buffer NTT call without the toRouEvals wrapper clone.",
    },
    {
      group: "2d-ntt",
      candidate: "transpose-scheduled-biNttBuffer",
      shape,
      ms: await measure(options, () =>
        biNttBufferViaTransposeSchedule(field, testCase.left.coefficients, testCase.shape.xSize, testCase.shape.ySize, "forward"),
      ),
      notes: "Benchmark-only candidate: transform Y rows, transpose, transform X rows contiguously, then transpose back.",
    },
    {
      group: "2d-ntt",
      candidate: "transpose-only-cost",
      shape,
      ms: await measure(options, () => Promise.resolve(transposeRowMajorBuffer(field, testCase.left.coefficients, testCase.shape.xSize, testCase.shape.ySize))),
      notes: "Measures transpose overhead for future contiguous row/column NTT candidates.",
    },
  ];
}

async function benchmarkElementWiseMul(
  field: FieldRuntime,
  testCase: BenchmarkCase,
  options: BenchmarkOptions,
): Promise<BenchmarkRecord[]> {
  const shape = formatShape(testCase.shape);
  const allocationHeavy = multiplyViaSplit(field, testCase.left.coefficients, testCase.right.coefficients);
  const tight = multiplyTightLoop(field, testCase.left.coefficients, testCase.right.coefficients);
  assertBytesEqual(allocationHeavy, tight, `element-wise multiplication mismatch at ${shape}`);

  return [
    {
      group: "field-vector-mul",
      candidate: "split-map-concat",
      shape,
      ms: await measure(options, () => Promise.resolve(multiplyViaSplit(field, testCase.left.coefficients, testCase.right.coefficients))),
      notes: "Allocation-heavy oracle using split/map/concat.",
    },
    {
      group: "field-vector-mul",
      candidate: "tight-buffer-loop",
      shape,
      ms: await measure(options, () => Promise.resolve(multiplyTightLoop(field, testCase.left.coefficients, testCase.right.coefficients))),
      notes: "Single output buffer with indexed field reads and writes.",
    },
  ];
}

async function benchmarkPolynomialMul(
  field: FieldRuntime,
  testCase: BenchmarkCase,
  options: BenchmarkOptions,
): Promise<BenchmarkRecord[]> {
  const shape = formatShape(testCase.shape);
  const xFactor = randomPolynomial(field, { xSize: testCase.shape.xSize, ySize: 1 }, options.seed + 0x44n);
  const yFactor = randomPolynomial(field, { xSize: 1, ySize: testCase.shape.ySize }, options.seed + 0x55n);

  const xAxisCurrent = await testCase.left.mul(xFactor);
  const xAxisGeneric = await generic2dNttMul(testCase.left, xFactor);
  assertBytesEqual(
    xAxisCurrent.coefficients,
    xAxisGeneric.coefficients,
    `X-axis polynomial multiplication mismatch at ${shape}`,
  );

  const yAxisCurrent = await testCase.left.mul(yFactor);
  const yAxisGeneric = await generic2dNttMul(testCase.left, yFactor);
  assertBytesEqual(
    yAxisCurrent.coefficients,
    yAxisGeneric.coefficients,
    `Y-axis polynomial multiplication mismatch at ${shape}`,
  );

  const bivariateCurrent = await testCase.left.mul(testCase.right);
  const bivariateConcurrent = await generic2dNttMulConcurrentInputs(testCase.left, testCase.right);
  assertBytesEqual(
    bivariateCurrent.coefficients,
    bivariateConcurrent.coefficients,
    `Concurrent-input bivariate multiplication mismatch at ${shape}`,
  );
  const bivariateTransposeScheduled = await generic2dNttMulTransposeScheduled(testCase.left, testCase.right);
  assertBytesEqual(
    bivariateCurrent.coefficients,
    bivariateTransposeScheduled.coefficients,
    `Transpose-scheduled bivariate multiplication mismatch at ${shape}`,
  );
  const [separateFirst, separateSecond] = await currentTwoBivariateMulSharedRight(testCase.left, testCase.right, testCase.third);
  const [sharedFirst, sharedSecond] = await generic2dNttTwoMulSharedRight(testCase.left, testCase.right, testCase.third);
  assertBytesEqual(separateFirst.coefficients, sharedFirst.coefficients, `Shared-right first product mismatch at ${shape}`);
  assertBytesEqual(separateSecond.coefficients, sharedSecond.coefficients, `Shared-right second product mismatch at ${shape}`);

  return [
    {
      group: "polynomial-mul",
      candidate: "current-bivariate",
      shape,
      ms: await measure(options, () => testCase.left.mul(testCase.right)),
      notes: "Current BivariatePolynomialBuffer.mul path for two bivariate operands.",
    },
    {
      group: "polynomial-mul",
      candidate: "concurrent-input-rou-bivariate",
      shape,
      ms: await measure(options, () => generic2dNttMulConcurrentInputs(testCase.left, testCase.right)),
      notes: "Reference path that starts the left and right ROU conversions concurrently before pointwise multiplication.",
    },
    {
      group: "polynomial-mul",
      candidate: "transpose-scheduled-bivariate",
      shape,
      ms: await measure(options, () => generic2dNttMulTransposeScheduled(testCase.left, testCase.right)),
      notes: "Benchmark-only generic multiplication candidate using transpose-scheduled forward and inverse 2D NTTs.",
    },
    {
      group: "polynomial-mul",
      candidate: "current-two-bivariate-shared-right",
      shape,
      ms: await measure(options, () => currentTwoBivariateMulSharedRight(testCase.left, testCase.right, testCase.third)),
      notes: "Current path for two unrelated bivariate products that share the same right operand.",
    },
    {
      group: "polynomial-mul",
      candidate: "shared-right-rou-two-bivariate",
      shape,
      ms: await measure(options, () => generic2dNttTwoMulSharedRight(testCase.left, testCase.right, testCase.third)),
      notes: "Benchmark-only local expression kernel that reuses the shared right operand ROU evals across two same-shape bivariate products.",
    },
    {
      group: "polynomial-mul",
      candidate: "current-x-axis-factor",
      shape,
      ms: await measure(options, () => testCase.left.mul(xFactor)),
      notes: "Current BivariatePolynomialBuffer.mul path when one operand is X-only.",
    },
    {
      group: "polynomial-mul",
      candidate: "generic-2d-ntt-x-axis-factor",
      shape,
      ms: await measure(options, () => generic2dNttMul(testCase.left, xFactor)),
      notes: "Reference path that forces the old full 2D NTT multiplication shape.",
    },
    {
      group: "polynomial-mul",
      candidate: "current-y-axis-factor",
      shape,
      ms: await measure(options, () => testCase.left.mul(yFactor)),
      notes: "Current BivariatePolynomialBuffer.mul path when one operand is Y-only.",
    },
    {
      group: "polynomial-mul",
      candidate: "generic-2d-ntt-y-axis-factor",
      shape,
      ms: await measure(options, () => generic2dNttMul(testCase.left, yFactor)),
      notes: "Reference path that forces the old full 2D NTT multiplication shape.",
    },
  ];
}

async function currentTwoBivariateMulSharedRight(
  firstLeft: BivariatePolynomialBuffer,
  sharedRight: BivariatePolynomialBuffer,
  secondLeft: BivariatePolynomialBuffer,
): Promise<readonly [BivariatePolynomialBuffer, BivariatePolynomialBuffer]> {
  return [
    await firstLeft.mul(sharedRight),
    await secondLeft.mul(sharedRight),
  ];
}

async function benchmarkLinearCombination(
  field: FieldRuntime,
  testCase: BenchmarkCase,
  options: BenchmarkOptions,
): Promise<BenchmarkRecord[]> {
  const shape = formatShape(testCase.shape);
  const one = field.one;
  const minusOne = field.neg(field.one);
  const prefixShape = prefixShapeFor(testCase.shape);
  const prefix = randomPolynomial(field, prefixShape, options.seed + 0x66n);
  const current = linearCombinationBuffer(field, [
    [testCase.scaleA, testCase.left],
    [testCase.scaleB, testCase.right],
    [testCase.scaleC, testCase.third],
  ]);
  const preallocated = linearCombinationPreallocated(field, testCase);
  const flatLinearCombination = linearCombinationSameShapeFlat(field, testCase);
  const currentAdd = testCase.left.add(testCase.right);
  const flatAdd = addScaledSameShapeFlat(field, testCase.left.coefficients, testCase.right.coefficients, one);
  const currentSub = testCase.left.sub(testCase.right);
  const flatSub = addScaledSameShapeFlat(field, testCase.left.coefficients, testCase.right.coefficients, minusOne);
  const currentScale = testCase.left.scale(testCase.scaleA);
  const flatScale = scaleSameShapeFlat(field, testCase.left.coefficients, testCase.scaleA);
  const currentAddScaled = testCase.left.clone().addScaledAssign(testCase.right, testCase.scaleA);
  const flatAddScaled = addScaledSameShapeFlat(field, testCase.left.coefficients, testCase.right.coefficients, testCase.scaleA);
  const currentPrefixAddScaled = testCase.left.clone().addScaledPrefixAssign(prefix, testCase.scaleA);
  const flatPrefixAddScaled = addScaledPrefixOffsetFlat(
    field,
    testCase.left.coefficients,
    testCase.shape,
    prefix.coefficients,
    prefixShape,
    testCase.scaleA,
  );
  const unitAdd = addSameShapeFlat(field, testCase.left.coefficients, testCase.right.coefficients);
  const unitSub = subSameShapeFlat(field, testCase.left.coefficients, testCase.right.coefficients);
  const twoPassAddScaled = addScaledNonUnitTwoPass(field, testCase.left.coefficients, testCase.right.coefficients, testCase.scaleA);
  const firstTermLinearCombination = linearCombinationFirstTermFlat(field, testCase);
  const mixedCurrent = linearCombinationBuffer(field, [
    [testCase.scaleA, testCase.left],
    [testCase.scaleB, prefix],
    [testCase.scaleC, testCase.right],
  ]);
  const mixedShapeAware = linearCombinationShapeAwareFlat(field, [
    [testCase.scaleA, testCase.left],
    [testCase.scaleB, prefix],
    [testCase.scaleC, testCase.right],
  ]);
  assertBytesEqual(current.coefficients, preallocated.coefficients, `linear combination mismatch at ${shape}`);
  assertBytesEqual(current.coefficients, flatLinearCombination, `flat same-shape linear combination mismatch at ${shape}`);
  assertBytesEqual(currentAdd.coefficients, flatAdd, `flat same-shape add mismatch at ${shape}`);
  assertBytesEqual(currentSub.coefficients, flatSub, `flat same-shape sub mismatch at ${shape}`);
  assertBytesEqual(currentScale.coefficients, flatScale, `flat same-shape scale mismatch at ${shape}`);
  assertBytesEqual(currentAddScaled.coefficients, flatAddScaled, `flat same-shape addScaled mismatch at ${shape}`);
  assertBytesEqual(currentPrefixAddScaled.coefficients, flatPrefixAddScaled, `flat prefix-shape addScaled mismatch at ${shape}`);
  assertBytesEqual(currentAdd.coefficients, unitAdd, `unit specialized add mismatch at ${shape}`);
  assertBytesEqual(currentSub.coefficients, unitSub, `unit specialized sub mismatch at ${shape}`);
  assertBytesEqual(currentAddScaled.coefficients, twoPassAddScaled, `two-pass non-unit addScaled mismatch at ${shape}`);
  assertBytesEqual(current.coefficients, firstTermLinearCombination, `first-term linear combination mismatch at ${shape}`);
  assertBytesEqual(mixedCurrent.coefficients, mixedShapeAware, `shape-aware mixed linear combination mismatch at ${shape}`);
  checkLinearOperationCandidateParity(field, testCase);

  return [
    {
      group: "linear-combination",
      candidate: "current-add",
      shape,
      ms: await measure(options, () => Promise.resolve(testCase.left.add(testCase.right))),
      notes: "Current same-shape add path through BivariatePolynomialBuffer.add().",
    },
    {
      group: "linear-combination",
      candidate: "candidate1-flat-same-shape-add",
      shape,
      ms: await measure(options, () => Promise.resolve(addScaledSameShapeFlat(field, testCase.left.coefficients, testCase.right.coefficients, one))),
      notes: "Diagnostic-only flat indexed add using same-shape raw coefficient buffers.",
    },
    {
      group: "linear-combination",
      candidate: "candidate3-unit-specialized-add",
      shape,
      ms: await measure(options, () => Promise.resolve(addSameShapeFlat(field, testCase.left.coefficients, testCase.right.coefficients))),
      notes: "Diagnostic-only unit-factor add path with no factor dispatch.",
    },
    {
      group: "linear-combination",
      candidate: "current-sub",
      shape,
      ms: await measure(options, () => Promise.resolve(testCase.left.sub(testCase.right))),
      notes: "Current same-shape subtraction path through BivariatePolynomialBuffer.sub().",
    },
    {
      group: "linear-combination",
      candidate: "candidate1-flat-same-shape-sub",
      shape,
      ms: await measure(options, () => Promise.resolve(addScaledSameShapeFlat(field, testCase.left.coefficients, testCase.right.coefficients, minusOne))),
      notes: "Diagnostic-only flat indexed subtraction using same-shape raw coefficient buffers.",
    },
    {
      group: "linear-combination",
      candidate: "candidate3-unit-specialized-sub",
      shape,
      ms: await measure(options, () => Promise.resolve(subSameShapeFlat(field, testCase.left.coefficients, testCase.right.coefficients))),
      notes: "Diagnostic-only unit-factor subtraction path using field.sub directly.",
    },
    {
      group: "linear-combination",
      candidate: "current-scale",
      shape,
      ms: await measure(options, () => Promise.resolve(testCase.left.scale(testCase.scaleA))),
      notes: "Current same-shape scalar scaling path through BivariatePolynomialBuffer.scale().",
    },
    {
      group: "linear-combination",
      candidate: "candidate1-flat-same-shape-scale",
      shape,
      ms: await measure(options, () => Promise.resolve(scaleSameShapeFlat(field, testCase.left.coefficients, testCase.scaleA))),
      notes: "Diagnostic-only flat indexed scalar scaling using a raw coefficient buffer.",
    },
    {
      group: "linear-combination",
      candidate: "current-addScaledAssign",
      shape,
      ms: await measure(options, () => {
        const target = testCase.left.clone();
        return Promise.resolve(target.addScaledAssign(testCase.right, testCase.scaleA));
      }),
      notes: "Current same-shape in-place scaled addition path.",
    },
    {
      group: "linear-combination",
      candidate: "candidate1-flat-same-shape-addScaled",
      shape,
      ms: await measure(options, () => Promise.resolve(addScaledSameShapeFlat(field, testCase.left.coefficients, testCase.right.coefficients, testCase.scaleA))),
      notes: "Diagnostic-only flat indexed scaled addition using same-shape raw coefficient buffers.",
    },
    {
      group: "linear-combination",
      candidate: "candidate4-non-unit-two-pass-addScaled",
      shape,
      ms: await measure(options, () => Promise.resolve(addScaledNonUnitTwoPass(field, testCase.left.coefficients, testCase.right.coefficients, testCase.scaleA))),
      notes: "Diagnostic-only non-unit scalar candidate that scales the source into a temporary buffer before adding.",
    },
    {
      group: "linear-combination",
      candidate: "current-prefix-addScaledAssign",
      shape,
      ms: await measure(options, () => {
        const target = testCase.left.clone();
        return Promise.resolve(target.addScaledPrefixAssign(prefix, testCase.scaleA));
      }),
      notes: `Current prefix-shape scaled addition path using prefix ${formatShape(prefixShape)}.`,
    },
    {
      group: "linear-combination",
      candidate: "candidate2-prefix-offset-addScaled",
      shape,
      ms: await measure(options, () =>
        Promise.resolve(addScaledPrefixOffsetFlat(field, testCase.left.coefficients, testCase.shape, prefix.coefficients, prefixShape, testCase.scaleA)),
      ),
      notes: `Diagnostic-only prefix-shape row-offset kernel using prefix ${formatShape(prefixShape)}.`,
    },
    {
      group: "linear-combination",
      candidate: "current-linearCombinationBuffer",
      shape,
      ms: await measure(options, () =>
        Promise.resolve(linearCombinationBuffer(field, [
          [testCase.scaleA, testCase.left],
          [testCase.scaleB, testCase.right],
          [testCase.scaleC, testCase.third],
        ])),
      ),
      notes: "Current shared helper used by integrated prover operations.",
    },
    {
      group: "linear-combination",
      candidate: "preallocated-addScaledPrefixAssign",
      shape,
      ms: await measure(options, () => Promise.resolve(linearCombinationPreallocated(field, testCase))),
      notes: "Explicit preallocated accumulator for same-shape inputs.",
    },
    {
      group: "linear-combination",
      candidate: "candidate1-flat-same-shape-linearCombination",
      shape,
      ms: await measure(options, () => Promise.resolve(linearCombinationSameShapeFlat(field, testCase))),
      notes: "Diagnostic-only flat indexed linear combination for same-shape inputs.",
    },
    {
      group: "linear-combination",
      candidate: "candidate5-first-term-linearCombination",
      shape,
      ms: await measure(options, () => Promise.resolve(linearCombinationFirstTermFlat(field, testCase))),
      notes: "Diagnostic-only same-shape linear combination that initializes the accumulator from the first term.",
    },
    {
      group: "linear-combination",
      candidate: "current-mixed-prefix-linearCombination",
      shape,
      ms: await measure(options, () =>
        Promise.resolve(linearCombinationBuffer(field, [
          [testCase.scaleA, testCase.left],
          [testCase.scaleB, prefix],
          [testCase.scaleC, testCase.right],
        ])),
      ),
      notes: `Current linearCombinationBuffer with two full-shape terms and one prefix ${formatShape(prefixShape)} term.`,
    },
    {
      group: "linear-combination",
      candidate: "candidate6-shape-aware-linearCombination",
      shape,
      ms: await measure(options, () =>
        Promise.resolve(linearCombinationShapeAwareFlat(field, [
          [testCase.scaleA, testCase.left],
          [testCase.scaleB, prefix],
          [testCase.scaleC, testCase.right],
        ])),
      ),
      notes: "Diagnostic-only shape-aware dispatch: same-shape flat kernel plus prefix row-offset kernel.",
    },
  ];
}

async function benchmarkDivision(
  field: FieldRuntime,
  testCase: BenchmarkCase,
  options: BenchmarkOptions,
): Promise<BenchmarkRecord[]> {
  const shape = formatShape(testCase.shape);
  const numerator = await testCase.left.mul(testCase.right);
  const ruffini = numerator.divByRuffini(testCase.xPoint, testCase.yPoint);
  const reconstructedRuffini = reconstructRuffini(field, ruffini.quotientX, ruffini.quotientY, ruffini.remainder, testCase.xPoint, testCase.yPoint);
  assertBytesEqual(numerator.coefficients, reconstructedRuffini.resize(numerator.xSize, numerator.ySize).coefficients, `Ruffini reconstruction mismatch at ${shape}`);

  const vanishingNumerator = buildVanishingDivisibleNumerator(field, testCase);
  const vanishing = vanishingNumerator.divByVanishingOpt(testCase.shape.xSize, testCase.shape.ySize);
  const reconstructedVanishing = reconstructVanishing(field, vanishing.quotientX, vanishing.quotientY, testCase.shape.xSize, testCase.shape.ySize);
  assertBytesEqual(vanishingNumerator.coefficients, reconstructedVanishing.resize(vanishingNumerator.xSize, vanishingNumerator.ySize).coefficients, `vanishing reconstruction mismatch at ${shape}`);

  return [
    {
      group: "division",
      candidate: "current-ruffini",
      shape,
      ms: await measure(options, () => Promise.resolve(numerator.divByRuffini(testCase.xPoint, testCase.yPoint))),
      notes: "Current bivariate Ruffini opening division.",
    },
    {
      group: "division",
      candidate: "current-vanishing-opt",
      shape,
      ms: await measure(options, () => Promise.resolve(vanishingNumerator.divByVanishingOpt(testCase.shape.xSize, testCase.shape.ySize))),
      notes: "Current native-style vanishing quotient recurrence.",
    },
  ];
}

async function benchmarkMaterialization(
  field: FieldRuntime,
  testCase: BenchmarkCase,
  options: BenchmarkOptions,
): Promise<BenchmarkRecord[]> {
  const shape = formatShape(testCase.shape);
  const dense = testCase.left.toDense();
  assertBytesEqual(testCase.left.coefficients, BivariatePolynomialBuffer.fromDense(dense).coefficients, `dense roundtrip mismatch at ${shape}`);

  return [
    {
      group: "materialization",
      candidate: "buffer-clone",
      shape,
      ms: await measure(options, () => Promise.resolve(testCase.left.clone())),
      notes: "Baseline cost for copying one coefficient buffer.",
    },
    {
      group: "materialization",
      candidate: "toDense-fromDense-roundtrip",
      shape,
      ms: await measure(options, () => Promise.resolve(BivariatePolynomialBuffer.fromDense(testCase.left.toDense()))),
      notes: "Object-heavy dense materialization roundtrip that hot prover paths should avoid.",
    },
    {
      group: "materialization",
      candidate: "fromBuffer-copy",
      shape,
      ms: await measure(options, () => Promise.resolve(BivariatePolynomialBuffer.fromBuffer(field, testCase.left.coefficients, testCase.shape.xSize, testCase.shape.ySize))),
      notes: "Current public buffer constructor copy boundary.",
    },
  ];
}

async function generic2dNttMul(
  left: BivariatePolynomialBuffer,
  right: BivariatePolynomialBuffer,
): Promise<BivariatePolynomialBuffer> {
  const leftDegree = left.findDegree();
  const rightDegree = right.findDegree();
  if (
    leftDegree.xDegree < 0 ||
    leftDegree.yDegree < 0 ||
    rightDegree.xDegree < 0 ||
    rightDegree.yDegree < 0
  ) {
    return BivariatePolynomialBuffer.zero(left.field);
  }

  const xSize = nextPowerOfTwo(leftDegree.xDegree + rightDegree.xDegree + 1);
  const ySize = nextPowerOfTwo(leftDegree.yDegree + rightDegree.yDegree + 1);
  const leftEvals = await left.resize(xSize, ySize).toRouEvals();
  const rightEvals = await right.resize(xSize, ySize).toRouEvals();
  const outputEvals = left.field.createZeroBuffer(xSize * ySize);

  for (let index = 0; index < xSize * ySize; index += 1) {
    left.field.writeBufferElement(
      outputEvals,
      index,
      left.field.mul(
        left.field.readBufferElement(leftEvals, index),
        left.field.readBufferElement(rightEvals, index),
      ),
    );
  }

  return await BivariatePolynomialBuffer.fromRouEvals(left.field, outputEvals, xSize, ySize);
}

async function generic2dNttMulConcurrentInputs(
  left: BivariatePolynomialBuffer,
  right: BivariatePolynomialBuffer,
): Promise<BivariatePolynomialBuffer> {
  const leftDegree = left.findDegree();
  const rightDegree = right.findDegree();
  if (
    leftDegree.xDegree < 0 ||
    leftDegree.yDegree < 0 ||
    rightDegree.xDegree < 0 ||
    rightDegree.yDegree < 0
  ) {
    return BivariatePolynomialBuffer.zero(left.field);
  }

  const xSize = nextPowerOfTwo(leftDegree.xDegree + rightDegree.xDegree + 1);
  const ySize = nextPowerOfTwo(leftDegree.yDegree + rightDegree.yDegree + 1);
  const [leftEvals, rightEvals] = await Promise.all([
    left.resize(xSize, ySize).toRouEvals(),
    right.resize(xSize, ySize).toRouEvals(),
  ]);
  const outputEvals = left.field.createZeroBuffer(xSize * ySize);

  for (let index = 0; index < xSize * ySize; index += 1) {
    left.field.writeBufferElement(
      outputEvals,
      index,
      left.field.mul(
        left.field.readBufferElement(leftEvals, index),
        left.field.readBufferElement(rightEvals, index),
      ),
    );
  }

  return await BivariatePolynomialBuffer.fromRouEvals(left.field, outputEvals, xSize, ySize);
}

async function generic2dNttMulTransposeScheduled(
  left: BivariatePolynomialBuffer,
  right: BivariatePolynomialBuffer,
): Promise<BivariatePolynomialBuffer> {
  const leftDegree = left.findDegree();
  const rightDegree = right.findDegree();
  if (
    leftDegree.xDegree < 0 ||
    leftDegree.yDegree < 0 ||
    rightDegree.xDegree < 0 ||
    rightDegree.yDegree < 0
  ) {
    return BivariatePolynomialBuffer.zero(left.field);
  }

  const xSize = nextPowerOfTwo(leftDegree.xDegree + rightDegree.xDegree + 1);
  const ySize = nextPowerOfTwo(leftDegree.yDegree + rightDegree.yDegree + 1);
  const leftCoeffs = left.resize(xSize, ySize).coefficients;
  const rightCoeffs = right.resize(xSize, ySize).coefficients;
  const leftEvals = await biNttBufferViaTransposeSchedule(left.field, leftCoeffs, xSize, ySize, "forward");
  const rightEvals = await biNttBufferViaTransposeSchedule(left.field, rightCoeffs, xSize, ySize, "forward");
  const outputEvals = left.field.createZeroBuffer(xSize * ySize);

  for (let index = 0; index < xSize * ySize; index += 1) {
    left.field.writeBufferElement(
      outputEvals,
      index,
      left.field.mul(
        left.field.readBufferElement(leftEvals, index),
        left.field.readBufferElement(rightEvals, index),
      ),
    );
  }

  const coefficients = await biNttBufferViaTransposeSchedule(left.field, outputEvals, xSize, ySize, "inverse");
  return BivariatePolynomialBuffer.fromBuffer(left.field, coefficients, xSize, ySize);
}

async function generic2dNttTwoMulSharedRight(
  firstLeft: BivariatePolynomialBuffer,
  sharedRight: BivariatePolynomialBuffer,
  secondLeft: BivariatePolynomialBuffer,
): Promise<readonly [BivariatePolynomialBuffer, BivariatePolynomialBuffer]> {
  const firstShape = multiplicationShape(firstLeft, sharedRight);
  const secondShape = multiplicationShape(secondLeft, sharedRight);
  if (firstShape === undefined || secondShape === undefined) {
    return [
      BivariatePolynomialBuffer.zero(firstLeft.field),
      BivariatePolynomialBuffer.zero(firstLeft.field),
    ];
  }
  if (firstShape.xSize !== secondShape.xSize || firstShape.ySize !== secondShape.ySize) {
    throw new Error("Shared-right multiplication benchmark requires matching output shapes.");
  }

  const { xSize, ySize } = firstShape;
  const sharedRightEvals = await sharedRight.resize(xSize, ySize).toRouEvals();
  const firstLeftEvals = await firstLeft.resize(xSize, ySize).toRouEvals();
  const secondLeftEvals = await secondLeft.resize(xSize, ySize).toRouEvals();
  const firstOutputEvals = multiplyTightLoop(firstLeft.field, firstLeftEvals, sharedRightEvals);
  const secondOutputEvals = multiplyTightLoop(firstLeft.field, secondLeftEvals, sharedRightEvals);

  return [
    await BivariatePolynomialBuffer.fromRouEvals(firstLeft.field, firstOutputEvals, xSize, ySize),
    await BivariatePolynomialBuffer.fromRouEvals(firstLeft.field, secondOutputEvals, xSize, ySize),
  ];
}

function multiplicationShape(
  left: BivariatePolynomialBuffer,
  right: BivariatePolynomialBuffer,
): Shape | undefined {
  const leftDegree = left.findDegree();
  const rightDegree = right.findDegree();
  if (
    leftDegree.xDegree < 0 ||
    leftDegree.yDegree < 0 ||
    rightDegree.xDegree < 0 ||
    rightDegree.yDegree < 0
  ) {
    return undefined;
  }

  return {
    xSize: nextPowerOfTwo(leftDegree.xDegree + rightDegree.xDegree + 1),
    ySize: nextPowerOfTwo(leftDegree.yDegree + rightDegree.yDegree + 1),
  };
}

async function biNttBufferViaTransposeSchedule(
  field: FieldRuntime,
  values: Uint8Array,
  xSize: number,
  ySize: number,
  direction: "forward" | "inverse",
): Promise<Uint8Array> {
  if (field.bufferElementCount(values) !== xSize * ySize) {
    throw new Error("NTT input count does not match the bivariate shape.");
  }

  const transform = direction === "forward" ? field.fftBuffer.bind(field) : field.ifftBuffer.bind(field);
  if (xSize === 1 || ySize === 1) {
    return await transform(values);
  }

  const yTransformed = field.createZeroBuffer(xSize * ySize);
  for (let x = 0; x < xSize; x += 1) {
    const rowStart = x * ySize * field.byteLength;
    const row = values.slice(rowStart, rowStart + ySize * field.byteLength);
    yTransformed.set(await transform(row), rowStart);
  }

  const transposed = transposeRowMajorBuffer(field, yTransformed, xSize, ySize);
  const xTransformedTransposed = field.createZeroBuffer(xSize * ySize);
  for (let y = 0; y < ySize; y += 1) {
    const rowStart = y * xSize * field.byteLength;
    const row = transposed.slice(rowStart, rowStart + xSize * field.byteLength);
    xTransformedTransposed.set(await transform(row), rowStart);
  }

  return transposeRowMajorBuffer(field, xTransformedTransposed, ySize, xSize);
}

function multiplyViaSplit(field: FieldRuntime, left: Uint8Array, right: Uint8Array): Uint8Array {
  const leftValues = field.split(left);
  const rightValues = field.split(right);
  return field.concat(leftValues.map((value, index) => field.mul(value, rightValues[index])));
}

function nextPowerOfTwo(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Cannot compute power-of-two size for a non-positive value.");
  }

  let size = 1;
  while (size < value) {
    size *= 2;
  }
  return size;
}

function multiplyTightLoop(field: FieldRuntime, left: Uint8Array, right: Uint8Array): Uint8Array {
  const count = field.bufferElementCount(left);
  if (field.bufferElementCount(right) !== count) {
    throw new Error("Field buffers must have the same element count.");
  }

  const output = field.createZeroBuffer(count);
  for (let index = 0; index < count; index += 1) {
    field.writeBufferElement(output, index, field.mul(field.readBufferElement(left, index), field.readBufferElement(right, index)));
  }
  return output;
}

function linearCombinationPreallocated(
  field: FieldRuntime,
  testCase: BenchmarkCase,
): BivariatePolynomialBuffer {
  return BivariatePolynomialBuffer.fromBuffer(
    field,
    field.createZeroBuffer(testCase.shape.xSize * testCase.shape.ySize),
    testCase.shape.xSize,
    testCase.shape.ySize,
  )
    .addScaledPrefixAssign(testCase.left, testCase.scaleA)
    .addScaledPrefixAssign(testCase.right, testCase.scaleB)
    .addScaledPrefixAssign(testCase.third, testCase.scaleC);
}

function checkLinearOperationCandidateParity(
  field: FieldRuntime,
  testCase: BenchmarkCase,
): void {
  const shape = formatShape(testCase.shape);
  const factors = [
    ["zero", field.zero],
    ["one", field.one],
    ["minus-one", field.neg(field.one)],
    ["non-unit", testCase.scaleA],
  ] as const;

  for (const [label, factor] of factors) {
    const currentScale = testCase.left.scale(factor);
    const flatScale = scaleSameShapeFlat(field, testCase.left.coefficients, factor);
    assertBytesEqual(currentScale.coefficients, flatScale, `flat same-shape scale ${label} mismatch at ${shape}`);

    const currentAddScaled = testCase.left.clone().addScaledAssign(testCase.right, factor);
    const flatAddScaled = addScaledSameShapeFlat(field, testCase.left.coefficients, testCase.right.coefficients, factor);
    assertBytesEqual(currentAddScaled.coefficients, flatAddScaled, `flat same-shape addScaled ${label} mismatch at ${shape}`);

    const currentSelfAlias = testCase.left.clone();
    currentSelfAlias.addScaledAssign(currentSelfAlias, factor);
    const flatSelfAlias = testCase.left.coefficients.slice();
    addScaledSameShapeFlatInPlace(field, flatSelfAlias, flatSelfAlias, factor);
    assertBytesEqual(currentSelfAlias.coefficients, flatSelfAlias, `flat same-shape self-alias addScaled ${label} mismatch at ${shape}`);
  }
}

function linearCombinationSameShapeFlat(
  field: FieldRuntime,
  testCase: BenchmarkCase,
): Uint8Array {
  const output = field.createZeroBuffer(testCase.shape.xSize * testCase.shape.ySize);
  addScaledSameShapeFlatInPlace(field, output, testCase.left.coefficients, testCase.scaleA);
  addScaledSameShapeFlatInPlace(field, output, testCase.right.coefficients, testCase.scaleB);
  addScaledSameShapeFlatInPlace(field, output, testCase.third.coefficients, testCase.scaleC);
  return output;
}

function linearCombinationFirstTermFlat(
  field: FieldRuntime,
  testCase: BenchmarkCase,
): Uint8Array {
  const output = scaleSameShapeFlat(field, testCase.left.coefficients, testCase.scaleA);
  addScaledSameShapeFlatInPlace(field, output, testCase.right.coefficients, testCase.scaleB);
  addScaledSameShapeFlatInPlace(field, output, testCase.third.coefficients, testCase.scaleC);
  return output;
}

function linearCombinationShapeAwareFlat(
  field: FieldRuntime,
  terms: readonly (readonly [FieldElement, BivariatePolynomialBuffer])[],
): Uint8Array {
  if (terms.length === 0) {
    return field.createZeroBuffer(1);
  }

  let xSize = 1;
  let ySize = 1;
  for (const [, polynomial] of terms) {
    xSize = Math.max(xSize, polynomial.xSize);
    ySize = Math.max(ySize, polynomial.ySize);
  }

  const shape = { xSize, ySize };
  const output = field.createZeroBuffer(xSize * ySize);
  for (const [factor, polynomial] of terms) {
    addScaledPrefixOffsetFlatInPlace(
      field,
      output,
      shape,
      polynomial.coefficients,
      { xSize: polynomial.xSize, ySize: polynomial.ySize },
      factor,
    );
  }
  return output;
}

function scaleSameShapeFlat(
  field: FieldRuntime,
  source: Uint8Array,
  factor: FieldElement,
): Uint8Array {
  const output = field.createZeroBuffer(field.bufferElementCount(source));
  if (field.isZero(factor)) {
    return output;
  }

  const elementBytes = field.byteLength;
  for (let offset = 0; offset < source.byteLength; offset += elementBytes) {
    output.set(field.mul(source.subarray(offset, offset + elementBytes), factor), offset);
  }
  return output;
}

function addSameShapeFlat(
  field: FieldRuntime,
  left: Uint8Array,
  right: Uint8Array,
): Uint8Array {
  assertSameByteLength(left, right, "Candidate 3 add");
  const output = field.createZeroBuffer(field.bufferElementCount(left));
  const elementBytes = field.byteLength;
  for (let offset = 0; offset < left.byteLength; offset += elementBytes) {
    output.set(field.add(left.subarray(offset, offset + elementBytes), right.subarray(offset, offset + elementBytes)), offset);
  }
  return output;
}

function subSameShapeFlat(
  field: FieldRuntime,
  left: Uint8Array,
  right: Uint8Array,
): Uint8Array {
  assertSameByteLength(left, right, "Candidate 3 sub");
  const output = field.createZeroBuffer(field.bufferElementCount(left));
  const elementBytes = field.byteLength;
  for (let offset = 0; offset < left.byteLength; offset += elementBytes) {
    output.set(field.sub(left.subarray(offset, offset + elementBytes), right.subarray(offset, offset + elementBytes)), offset);
  }
  return output;
}

function addScaledSameShapeFlat(
  field: FieldRuntime,
  target: Uint8Array,
  source: Uint8Array,
  factor: FieldElement,
): Uint8Array {
  const output = target.slice();
  addScaledSameShapeFlatInPlace(field, output, source, factor);
  return output;
}

function addScaledNonUnitTwoPass(
  field: FieldRuntime,
  target: Uint8Array,
  source: Uint8Array,
  factor: FieldElement,
): Uint8Array {
  const scaled = scaleSameShapeFlat(field, source, factor);
  return addSameShapeFlat(field, target, scaled);
}

function addScaledSameShapeFlatInPlace(
  field: FieldRuntime,
  target: Uint8Array,
  source: Uint8Array,
  factor: FieldElement,
): void {
  assertSameByteLength(target, source, "Candidate 1");
  if (field.isZero(factor)) {
    return;
  }

  const elementBytes = field.byteLength;
  const isOne = field.eq(factor, field.one);
  const isMinusOne = field.eq(factor, field.neg(field.one));
  for (let offset = 0; offset < target.byteLength; offset += elementBytes) {
    const left = target.subarray(offset, offset + elementBytes);
    const right = source.subarray(offset, offset + elementBytes);
    const scaled = isOne ? right : isMinusOne ? field.neg(right) : field.mul(right, factor);
    target.set(field.add(left, scaled), offset);
  }
}

function addScaledPrefixOffsetFlat(
  field: FieldRuntime,
  target: Uint8Array,
  targetShape: Shape,
  source: Uint8Array,
  sourceShape: Shape,
  factor: FieldElement,
): Uint8Array {
  const output = target.slice();
  addScaledPrefixOffsetFlatInPlace(field, output, targetShape, source, sourceShape, factor);
  return output;
}

function addScaledPrefixOffsetFlatInPlace(
  field: FieldRuntime,
  target: Uint8Array,
  targetShape: Shape,
  source: Uint8Array,
  sourceShape: Shape,
  factor: FieldElement,
): void {
  if (sourceShape.xSize > targetShape.xSize || sourceShape.ySize > targetShape.ySize) {
    throw new Error("Candidate 2 prefix source shape must fit inside the target shape.");
  }
  const targetElementCount = targetShape.xSize * targetShape.ySize;
  const sourceElementCount = sourceShape.xSize * sourceShape.ySize;
  if (field.bufferElementCount(target) !== targetElementCount || field.bufferElementCount(source) !== sourceElementCount) {
    throw new Error("Candidate 2 buffer length does not match its shape.");
  }
  if (field.isZero(factor)) {
    return;
  }

  const elementBytes = field.byteLength;
  const targetRowBytes = targetShape.ySize * elementBytes;
  const sourceRowBytes = sourceShape.ySize * elementBytes;
  const isOne = field.eq(factor, field.one);
  const isMinusOne = field.eq(factor, field.neg(field.one));
  for (let x = 0; x < sourceShape.xSize; x += 1) {
    const targetRowOffset = x * targetRowBytes;
    const sourceRowOffset = x * sourceRowBytes;
    for (let yOffset = 0; yOffset < sourceRowBytes; yOffset += elementBytes) {
      const targetOffset = targetRowOffset + yOffset;
      const sourceOffset = sourceRowOffset + yOffset;
      const left = target.subarray(targetOffset, targetOffset + elementBytes);
      const right = source.subarray(sourceOffset, sourceOffset + elementBytes);
      const scaled = isOne ? right : isMinusOne ? field.neg(right) : field.mul(right, factor);
      target.set(field.add(left, scaled), targetOffset);
    }
  }
}

function prefixShapeFor(shape: Shape): Shape {
  return {
    xSize: Math.max(1, Math.floor(shape.xSize / 2)),
    ySize: Math.max(1, Math.floor(shape.ySize / 2)),
  };
}

function assertSameByteLength(left: Uint8Array, right: Uint8Array, label: string): void {
  if (left.byteLength !== right.byteLength) {
    throw new Error(`${label} only supports same-length coefficient buffers.`);
  }
}

function buildVanishingDivisibleNumerator(field: FieldRuntime, testCase: BenchmarkCase): BivariatePolynomialBuffer {
  const base = testCase.left;
  const output = BivariatePolynomialBuffer.fromBuffer(
    field,
    field.createZeroBuffer(base.xSize * 2 * base.ySize * 2),
    base.xSize * 2,
    base.ySize * 2,
  );
  for (let x = 0; x < base.xSize; x += 1) {
    for (let y = 0; y < base.ySize; y += 1) {
      const value = base.getCoeff(x, y);
      output.setCoeff(x, y, field.sub(output.getCoeff(x, y), value));
      output.setCoeff(x + base.xSize, y, field.add(output.getCoeff(x + base.xSize, y), value));
      output.setCoeff(x, y + base.ySize, field.add(output.getCoeff(x, y + base.ySize), value));
      output.setCoeff(x, y, field.sub(output.getCoeff(x, y), value));
    }
  }
  return output;
}

function reconstructRuffini(
  field: FieldRuntime,
  quotientX: BivariatePolynomialBuffer,
  quotientY: BivariatePolynomialBuffer,
  remainder: FieldElement,
  xPoint: FieldElement,
  yPoint: FieldElement,
): BivariatePolynomialBuffer {
  const xTerm = quotientX.mulMonomial(1, 0).sub(quotientX.scale(xPoint));
  const yTerm = quotientY.mulMonomial(0, 1).sub(quotientY.scale(yPoint));
  return xTerm.add(yTerm).add(BivariatePolynomialBuffer.fromCoeffs(field, [remainder], 1, 1));
}

function reconstructVanishing(
  field: FieldRuntime,
  quotientX: BivariatePolynomialBuffer,
  quotientY: BivariatePolynomialBuffer,
  xDegree: number,
  yDegree: number,
): BivariatePolynomialBuffer {
  const xTerm = quotientX.mulMonomial(xDegree, 0).sub(quotientX);
  const yTerm = quotientY.mulMonomial(0, yDegree).sub(quotientY);
  return BivariatePolynomialBuffer.fromCoeffs(field, [field.zero], 1, 1).add(xTerm).add(yTerm);
}

function randomPolynomial(field: FieldRuntime, shape: Shape, seed: bigint): BivariatePolynomialBuffer {
  const random = createSplitMix64(seed + BigInt(shape.xSize) * 0x9e3779b97f4a7c15n + BigInt(shape.ySize));
  const coefficients = Array.from({ length: shape.xSize * shape.ySize }, () => randomFieldElement(field, random));
  return BivariatePolynomialBuffer.fromCoeffs(field, coefficients, shape.xSize, shape.ySize);
}

function randomFieldElement(field: FieldRuntime, random: () => bigint): FieldElement {
  let value = 0n;
  for (let index = 0; index < 4; index += 1) {
    value = (value << 64n) | random();
  }
  return field.fromBigInt((value % (field.modulus - 1n)) + 1n);
}

function createSplitMix64(seed: bigint): () => bigint {
  let state = seed & 0xffffffffffffffffn;
  return () => {
    state = (state + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
    let value = state;
    value = ((value ^ (value >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
    value = ((value ^ (value >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
    return value ^ (value >> 31n);
  };
}

async function measure<T>(options: BenchmarkOptions, callback: () => Promise<T>): Promise<number> {
  for (let index = 0; index < options.warmup; index += 1) {
    await callback();
  }

  const start = performance.now();
  for (let index = 0; index < options.iterations; index += 1) {
    await callback();
  }
  return (performance.now() - start) / options.iterations;
}

function parseOptions(args: readonly string[]): BenchmarkOptions {
  const values = new Map<string, string>();
  for (const arg of args) {
    const match = /^--([a-zA-Z-]+)=(.+)$/.exec(arg);
    if (match === null) {
      throw new Error(`Unknown argument '${arg}'.`);
    }
    values.set(match[1], match[2]);
  }

  return {
    seed: parseSeed(values.get("seed") ?? "0x544f4b414d414b"),
    shapes: parseShapes(values.get("shapes") ?? "16x16,32x16"),
    groups: parseGroups(values.get("groups") ?? ALL_GROUPS.join(",")),
    iterations: parsePositiveInteger(values.get("iterations") ?? "2", "iterations"),
    warmup: parseNonNegativeInteger(values.get("warmup") ?? "1", "warmup"),
    jsonPath: values.get("json") ?? "tmp/timing/prover-operation-matrix.json",
  };
}

function parseSeed(value: string): bigint {
  if (!/^(0x[0-9a-fA-F]+|[0-9]+)$/.test(value)) {
    throw new Error("Seed must be a decimal integer or 0x-prefixed hexadecimal integer.");
  }
  return BigInt(value);
}

function parseShapes(value: string): Shape[] {
  const shapes = value.split(",").map((entry) => {
    const match = /^([0-9]+)x([0-9]+)$/.exec(entry.trim());
    if (match === null) {
      throw new Error(`Invalid shape '${entry}'. Expected <xSize>x<ySize>.`);
    }
    return {
      xSize: parsePositiveInteger(match[1], "xSize"),
      ySize: parsePositiveInteger(match[2], "ySize"),
    };
  });
  if (shapes.length === 0) {
    throw new Error("At least one shape is required.");
  }
  return shapes;
}

function parseGroups(value: string): ReadonlySet<BenchmarkGroup> {
  const groups = new Set<BenchmarkGroup>();
  for (const entry of value.split(",")) {
    const group = entry.trim();
    if (!ALL_GROUPS.includes(group as BenchmarkGroup)) {
      throw new Error(`Invalid benchmark group '${entry}'. Expected one of ${ALL_GROUPS.join(", ")}.`);
    }
    groups.add(group as BenchmarkGroup);
  }
  if (groups.size === 0) {
    throw new Error("At least one benchmark group is required.");
  }
  return groups;
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = parseNonNegativeInteger(value, label);
  if (parsed <= 0) {
    throw new Error(`${label} must be positive.`);
  }
  return parsed;
}

function parseNonNegativeInteger(value: string, label: string): number {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${label} must be a safe integer.`);
  }
  return parsed;
}

function assertBytesEqual(actual: Uint8Array, expected: Uint8Array, label: string): void {
  if (actual.byteLength !== expected.byteLength) {
    throw new Error(`${label}: byte length mismatch ${actual.byteLength} !== ${expected.byteLength}.`);
  }
  for (let index = 0; index < actual.byteLength; index += 1) {
    if (actual[index] !== expected[index]) {
      throw new Error(`${label}: byte mismatch at offset ${index}.`);
    }
  }
}

function formatShape(shape: Shape): string {
  return `${shape.xSize}x${shape.ySize}`;
}

function printRecords(records: readonly BenchmarkRecord[]): void {
  console.table(
    records.map((record) => ({
      group: record.group,
      candidate: record.candidate,
      shape: record.shape,
      "ms/op": record.ms.toFixed(3),
    })),
  );
}

async function writeReport(options: BenchmarkOptions, records: readonly BenchmarkRecord[]): Promise<void> {
  const report: BenchmarkReport = {
    generatedAt: new Date().toISOString(),
    options: {
      seed: `0x${options.seed.toString(16)}`,
      shapes: options.shapes.map(formatShape),
      groups: [...options.groups],
      iterations: options.iterations,
      warmup: options.warmup,
    },
    records,
  };
  const outputPath = path.resolve(options.jsonPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
