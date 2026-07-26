import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BinaryArtifactFileKind,
  BivariatePolynomialBuffer,
  RollingKeccakTranscript,
  buildWitnessPolynomials,
  createCurveRuntime,
  createProverState,
  createVerifierProofArtifactFromProverOutput,
  loadRuntimeArtifactFile,
  verifyBinary,
  type CurveRuntime,
  type FieldElement,
  type ProverCrsRuntime,
  type ProverRuntimeInput,
  type ProverState,
} from "../../../src/index.js";
import { readProverRuntimeInput, readVerifierBinaryInput } from "../../support/runtime-inputs.js";
import {
  buildProverBinding,
  encodePolynomialBufferWithSigma1,
  type InitialRelationComputation,
  type InitialRelationCommitments,
} from "../../../src/prover/protocol/initial-relation.js";
import type { RecursionComputation } from "../../../src/prover/protocol/recursion-commitment.js";
import { type CopyQuotientComputation, type CopyQuotientCommitments } from "../../../src/prover/protocol/copy-quotient.js";
import type { ChallengeEvaluations } from "../../../src/prover/protocol/challenge-evaluations.js";
import type { OpeningCommitmentsComputation } from "../../../src/prover/protocol/opening-commitments.js";
import {
  buildLagrangeKl,
  combineLinearXWithScaled,
  combineLinearYWithScaled,
  constantPolynomialBuffer,
  computeRecursionEvalsBuffer,
  evaluateAtScaledChallengeSetBatch,
  evaluateLagrangeK0At,
  linearCombinationBufferBatch,
  lowDegreeXTimesVanishingBuffer,
  lowDegreeYTimesVanishingBuffer,
  mulByOneMinusX,
  mulByTerm9,
  mulByXMinusOne,
  multiplyByLagrangeK0,
  multiplyByLagrangeKl,
  multiplyOmegaShiftedProducts,
} from "../../../src/prover/polynomial/polynomial-ops.js";

interface SizeInfo {
  readonly label: string;
  readonly dims: readonly number[];
}

interface TimingEvent {
  readonly name: string;
  readonly category: string;
  readonly durationMs: number;
  readonly sizes: readonly SizeInfo[];
}

interface TimingReport {
  readonly generatedAt: string;
  readonly totalWallMs: number;
  readonly classifiedOperationMs: number;
  readonly unclassifiedProverMs: number;
  readonly summary: Record<string, ModuleTimingSummary>;
  readonly events: readonly TimingEvent[];
  readonly categoryTotals: readonly TimingTotal[];
  readonly lowestOperationTotals: readonly OperationTimingTotal[];
  readonly middleOperationTotals: readonly OperationTimingTotal[];
  readonly topOperationTotals: readonly OperationTimingTotal[];
  readonly executionBoundaryTotals: readonly OperationTimingTotal[];
  readonly invariantChecks: readonly TimingInvariantCheck[];
}

interface TimingTotal {
  readonly category: string;
  readonly durationMs: number;
  readonly count: number;
}

interface OperationTimingTotal {
  readonly operation: string;
  readonly durationMs: number;
  readonly count: number;
}

interface ModuleTimingSummary {
  readonly totalMs: number;
  readonly polyMs: number;
  readonly encodeMs: number;
}

interface TimingInvariantCheck {
  readonly name: string;
  readonly parentMs: number;
  readonly childMs: number;
  readonly ok: boolean;
}

const lowestOperationOrder = [
  "polynomial.combination_without_multiplication",
  "polynomial.combination_with_multiplication",
  "polynomial.recursion",
  "polynomial.evaluation",
  "polynomial.div_ruffini",
  "polynomial.div_vanishing",
  "polynomial.encode",
  "binding.encode",
] as const;

const middleOperationOrder = ["polynomial.combination", "polynomial.recursion", "polynomial.evaluation", "polynomial.division", "encode"] as const;
const topOperationOrder = ["field.operations", "encode"] as const;
const executionBoundaryOrder = [
  "init",
  "field.operations",
  "encode",
  "stage.unclassified",
  "io",
  "verify",
  "output",
  "external.unclassified",
] as const;
type LowestOperation = (typeof lowestOperationOrder)[number];
const timingToleranceMs = 1;

interface ActiveTimingSpan {
  readonly name: string;
  readonly category: string;
  readonly startMs: number;
  readonly sizes: readonly SizeInfo[];
}

class TimingCollector {
  readonly events: TimingEvent[] = [];

  async span<T>(
    name: string,
    category: string,
    callback: () => Promise<T>,
    sizes: readonly SizeInfo[] = [],
  ): Promise<T> {
    const active = this.startRecord(name, category, sizes);
    try {
      return await callback();
    } finally {
      this.endRecord(active);
    }
  }

  spanSync<T>(
    name: string,
    category: string,
    callback: () => T,
    sizes: readonly SizeInfo[] = [],
  ): T {
    const active = this.startRecord(name, category, sizes);
    try {
      return callback();
    } finally {
      this.endRecord(active);
    }
  }

  private startRecord(
    name: string,
    category: string,
    sizes: readonly SizeInfo[],
  ): ActiveTimingSpan {
    return {
      name,
      category,
      startMs: performance.now(),
      sizes,
    };
  }

  private endRecord(active: ActiveTimingSpan): void {
    const end = performance.now();
    this.record({
      name: active.name,
      category: active.category,
      durationMs: end - active.startMs,
      sizes: active.sizes,
    });
  }

  private record(event: TimingEvent): void {
    this.events.push(event);
  }
}

const timing = new TimingCollector();

async function polynomialOperation<T>(
  operation: LowestOperation,
  label: string,
  callback: () => Promise<T>,
  sizes: readonly SizeInfo[] = [],
): Promise<T> {
  return timing.span(label, operation, callback, sizes);
}

function polynomialOperationSync<T>(
  operation: LowestOperation,
  label: string,
  callback: () => T,
  sizes: readonly SizeInfo[] = [],
): T {
  return timing.spanSync(label, operation, callback, sizes);
}

async function polynomialAdd(
  label: string,
  left: BivariatePolynomialBuffer,
  right: BivariatePolynomialBuffer,
): Promise<BivariatePolynomialBuffer> {
  return polynomialOperation("polynomial.combination_without_multiplication", label, () =>
    linearCombinationBufferBatch(left.field, [
      [left.field.one, left],
      [left.field.one, right],
    ]), [
    shapeSize("left", left.xSize, left.ySize),
    shapeSize("right", right.xSize, right.ySize),
  ]);
}

async function polynomialSub(
  label: string,
  left: BivariatePolynomialBuffer,
  right: BivariatePolynomialBuffer,
): Promise<BivariatePolynomialBuffer> {
  return polynomialOperation("polynomial.combination_without_multiplication", label, () =>
    linearCombinationBufferBatch(left.field, [
      [left.field.one, left],
      [left.field.neg(left.field.one), right],
    ]), [
    shapeSize("left", left.xSize, left.ySize),
    shapeSize("right", right.xSize, right.ySize),
  ]);
}

async function polynomialScaleX(
  label: string,
  polynomial: BivariatePolynomialBuffer,
  scalar: FieldElement,
): Promise<BivariatePolynomialBuffer> {
  return polynomialOperation("polynomial.combination_without_multiplication", label, () =>
    polynomial.scaleCoeffsXBatch(scalar), [
    shapeSize("polynomial", polynomial.xSize, polynomial.ySize),
  ]);
}

async function polynomialBatchScale(
  label: string,
  polynomial: BivariatePolynomialBuffer,
  first: FieldElement,
  increment: FieldElement,
): Promise<BivariatePolynomialBuffer> {
  return polynomialOperation(
    "polynomial.combination_without_multiplication",
    label,
    async () =>
      BivariatePolynomialBuffer.fromOwnedBuffer(
        polynomial.field,
        await polynomial.field.batchApplyKeyBuffer(polynomial.coefficients, first, increment),
        polynomial.xSize,
        polynomial.ySize,
      ),
    [shapeSize("polynomial", polynomial.xSize, polynomial.ySize)],
  );
}

async function polynomialMul(
  label: string,
  left: BivariatePolynomialBuffer,
  right: BivariatePolynomialBuffer,
): Promise<BivariatePolynomialBuffer> {
  return polynomialOperation("polynomial.combination_with_multiplication", label, () => left.mul(right), [
    shapeSize("left", left.xSize, left.ySize),
    shapeSize("right", right.xSize, right.ySize),
  ]);
}

async function polynomialMulLagrangeK0(
  label: string,
  polynomial: BivariatePolynomialBuffer,
  mI: number,
): Promise<BivariatePolynomialBuffer> {
  return polynomialOperation(
    "polynomial.combination_with_multiplication",
    label,
    () => multiplyByLagrangeK0(polynomial, mI),
    [
      shapeSize("lagrange-domain", mI, 1),
      shapeSize("polynomial", polynomial.xSize, polynomial.ySize),
    ],
  );
}

async function polynomialMulLagrangeKl(
  label: string,
  polynomial: BivariatePolynomialBuffer,
  mI: number,
  sMax: number,
): Promise<BivariatePolynomialBuffer> {
  return polynomialOperation(
    "polynomial.combination_with_multiplication",
    label,
    () => multiplyByLagrangeKl(polynomial, mI, sMax),
    [
      shapeSize("lagrange-domain", mI, sMax),
      shapeSize("polynomial", polynomial.xSize, polynomial.ySize),
    ],
  );
}

async function polynomialMulSpecial(
  label: string,
  callback: () => BivariatePolynomialBuffer | Promise<BivariatePolynomialBuffer>,
  sizes: readonly SizeInfo[] = [],
): Promise<BivariatePolynomialBuffer> {
  return polynomialOperation(
    "polynomial.combination_with_multiplication",
    label,
    async () => await callback(),
    sizes,
  );
}

async function polynomialRecursion<T>(
  label: string,
  callback: () => Promise<T>,
  sizes: readonly SizeInfo[] = [],
): Promise<T> {
  return polynomialOperation("polynomial.recursion", label, callback, sizes);
}

function polynomialEvaluation<T>(
  label: string,
  callback: () => T,
  sizes: readonly SizeInfo[] = [],
): T {
  return polynomialOperationSync("polynomial.evaluation", label, callback, sizes);
}

function evaluatePolynomialAt(
  label: string,
  polynomial: BivariatePolynomialBuffer,
  x: FieldElement,
  y: FieldElement,
): FieldElement {
  return polynomialEvaluation(label, () => polynomial.eval(x, y), [
    shapeSize("polynomial", polynomial.xSize, polynomial.ySize),
  ]);
}

async function evaluatePolynomialAtBatch(
  label: string,
  polynomial: BivariatePolynomialBuffer,
  x: FieldElement,
  y: FieldElement,
): Promise<FieldElement> {
  return polynomialOperation(
    "polynomial.evaluation",
    label,
    () => polynomial.evalBatch(x, y),
    [shapeSize("polynomial", polynomial.xSize, polynomial.ySize)],
  );
}

async function polynomialDivVanishing(
  label: string,
  polynomial: BivariatePolynomialBuffer,
  xDegree: number,
  yDegree: number,
): Promise<{ readonly quotientX: BivariatePolynomialBuffer; readonly quotientY: BivariatePolynomialBuffer }> {
  return polynomialOperation(
    "polynomial.div_vanishing",
    label,
    () => polynomial.divByVanishingOptBatch(xDegree, yDegree),
    [shapeSize("vanishing", xDegree, yDegree)],
  );
}

async function polynomialDivRuffini(
  label: string,
  polynomial: BivariatePolynomialBuffer,
  xPoint: FieldElement,
  yPoint: FieldElement,
): Promise<{ readonly quotientX: BivariatePolynomialBuffer; readonly quotientY: BivariatePolynomialBuffer }> {
  return polynomialOperation(
    "polynomial.div_ruffini",
    label,
    () => polynomial.divByRuffiniBatch(xPoint, yPoint),
    [shapeSize("polynomial", polynomial.xSize, polynomial.ySize)],
  );
}

async function polynomialSharedMnDivisions(
  label: string,
  polynomial: BivariatePolynomialBuffer,
  xPoint: FieldElement,
  mYPoint: FieldElement,
  nYPoint: FieldElement,
): Promise<{
  readonly sharedX: BivariatePolynomialBuffer;
  readonly mY: BivariatePolynomialBuffer;
  readonly nY: BivariatePolynomialBuffer;
}> {
  return polynomialOperation(
    "polynomial.div_ruffini",
    label,
    async () => {
      const xDivision = await polynomial.field.ruffiniXBuffer(
        polynomial.coefficients,
        polynomial.xSize,
        polynomial.ySize,
        xPoint,
      );
      const mYDivision = await polynomial.field.ruffiniYBuffer(
        xDivision.remainder,
        polynomial.ySize,
        mYPoint,
      );
      const nYDivision = await polynomial.field.ruffiniYBuffer(
        xDivision.remainder,
        polynomial.ySize,
        nYPoint,
      );
      return {
        sharedX: BivariatePolynomialBuffer.fromOwnedBuffer(
          polynomial.field,
          xDivision.quotient,
          polynomial.xSize,
          polynomial.ySize,
        ),
        mY: BivariatePolynomialBuffer.fromOwnedBuffer(
          polynomial.field,
          mYDivision.quotient,
          1,
          polynomial.ySize,
        ),
        nY: BivariatePolynomialBuffer.fromOwnedBuffer(
          polynomial.field,
          nYDivision.quotient,
          1,
          polynomial.ySize,
        ),
      };
    },
    [shapeSize("polynomial", polynomial.xSize, polynomial.ySize)],
  );
}

async function polynomialLinearCombination(
  label: string,
  field: CurveRuntime["Fr"],
  terms: readonly (readonly [FieldElement, BivariatePolynomialBuffer])[],
): Promise<BivariatePolynomialBuffer> {
  return polynomialOperation(
    "polynomial.combination_without_multiplication",
    label,
    () => linearCombinationBufferBatch(field, terms),
    terms.map(([, polynomial], index) => shapeSize(`term_${index}`, polynomial.xSize, polynomial.ySize)),
  );
}

async function main(): Promise<void> {
  const runtimeDir = path.resolve("fixtures/small/runtime");
  const runtime = await createCurveRuntime();

  try {
    const proverInput = await timing.span("load prover runtime input", "io", () =>
      readProverRuntimeInput(runtime, runtimeDir),
    );
    const generatedProof = await provePreparedInputWithStrictTimings(runtime, proverInput);

    await timing.span("load generated proof artifact", "io", () => loadRuntimeArtifactFile(generatedProof)).then(
      (artifact) => {
        if (artifact.kind !== BinaryArtifactFileKind.VerifierProof) {
          throw new Error(`Prover output artifact kind mismatch: ${artifact.kind}.`);
        }
      },
    );

    const verifierInput = await readVerifierBinaryInput(runtimeDir, generatedProof);
    const verificationResult = await timing.span("verify generated proof", "verify", () =>
      verifyBinary(
        runtime,
        verifierInput,
        {
          randomScalar: () => runtime.Fr.one,
        },
      ),
    );

    if (!verificationResult) {
      throw new Error("Verifier rejected the proof produced by the strict timing prover runner.");
    }

    const report = buildTimingReport(timing.events);
    const outputPath = path.resolve("tmp/timing/prover-stage-timing.json");
    const markdownOutputPath = path.resolve("tmp/timing/prover-stage-timing.md");
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(markdownOutputPath, buildMarkdownTimingReport(report));
    printTimingSummary(report, outputPath);
  } finally {
    await runtime.terminate();
  }
}

async function provePreparedInputWithStrictTimings(runtime: CurveRuntime, input: ProverRuntimeInput): Promise<Uint8Array> {
  const witness = await timing.span("build witness polynomials", "init", () =>
    buildWitnessPolynomials(runtime.Fr, input.witness),
  );
  const state = await timing.span("create prover state", "init", () =>
    createProverState({
      runtime,
      setup: input.witness.setup,
      publicInstance: input.publicInstance,
      permutation: input.permutation,
      witness,
    }),
  );
  const binding = await timing.span("build prover binding", "binding.encode", () =>
    buildProverBinding(
      runtime,
      input.crs,
      input.witness.setup,
      input.witness.placementVariables,
      input.witness.subcircuitInfos,
      state.instanceBuffers.aFreeX,
      state.mixer,
    ),
  );

  const transcript = new RollingKeccakTranscript(runtime.Fr);
  const prove0Output = await timing.span("prove0", "stage", () => prove0Timed(runtime, input.crs, state));
  const thetas = collectThetaChallenges(runtime, transcript, prove0Output.commitments);
  const prove1Output = await timing.span("prove1", "stage", () => prove1Timed(runtime, input.crs, state, thetas));
  const kappa0 = collectKappa0Challenge(runtime, transcript, prove1Output.commitment);
  const prove2Output = await timing.span("prove2", "stage", () =>
    prove2Timed({
      runtime,
      crs: input.crs,
      state,
      rXY: prove1Output.rXY,
      thetas,
      kappa0,
    }),
  );
  const { chi, zeta } = collectEvaluationChallenges(runtime, transcript, prove2Output.commitments);
  const evaluations = await timing.span("prove3", "stage", () =>
    evaluateChallengePointsTimed({
      runtime,
      state,
      rXY: prove1Output.rXY,
      chi,
      zeta,
    }),
  );
  const kappa1 = collectKappa1Challenge(transcript, evaluations);
  const prove4Output = await timing.span("prove4", "stage", () =>
    prove4Timed({
      runtime,
      crs: input.crs,
      state,
      rXY: prove1Output.rXY,
      initialRelation: prove0Output,
      copyQuotient: prove2Output,
      thetas,
      kappa0,
      chi,
      zeta,
      kappa1,
    }),
  );

  return timing.span("create verifier proof artifact", "output", () =>
    createVerifierProofArtifactFromProverOutput({
      runtime,
      binding,
      initialRelation: prove0Output,
      recursion: prove1Output,
      copyQuotient: prove2Output,
      evaluations,
      openings: prove4Output,
    }),
  );
}

async function prove0Timed(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  state: ProverState,
): Promise<InitialRelationComputation> {
  const field = runtime.Fr;
  const p0Product = await polynomialMul("prove0.p0XY.mul", state.witness.uXY, state.witness.vXY);
  const p0XY = await polynomialOperation(
    "polynomial.combination_without_multiplication",
    "prove0.p0XY.sub_w",
    () => p0Product.subBatch(state.witness.wXY.resize(p0Product.xSize, p0Product.ySize)),
    [shapeSize("product", p0Product.xSize, p0Product.ySize)],
  );
  const { quotientX: q0XY, quotientY: q1XY } = await polynomialDivVanishing(
    "prove0.q0q1",
    p0XY,
    state.setup.n,
    state.setup.s_max,
  );

  const rW_X = BivariatePolynomialBuffer.fromCoeffs(field, state.mixer.rW_X, state.mixer.rW_X.length, 1);
  const rW_Y = BivariatePolynomialBuffer.fromCoeffs(field, state.mixer.rW_Y, 1, state.mixer.rW_Y.length);
  const UXY = await polynomialLinearCombination(
    "prove0.U",
    field,
    [
      [field.one, state.witness.uXY],
      [state.mixer.rU_X, state.instance.tN],
      [state.mixer.rU_Y, state.instance.tSMax],
    ],
  );
  const VXY = await polynomialLinearCombination(
    "prove0.V",
    field,
    [
      [field.one, state.witness.vXY],
      [state.mixer.rV_X, state.instance.tN],
      [state.mixer.rV_Y, state.instance.tSMax],
    ],
  );
  const wZkX = await polynomialMulSpecial("prove0.W_zk.x_vanishing_mul", () =>
    lowDegreeXTimesVanishingBuffer(field, state.mixer.rW_X, state.setup.n),
  );
  const wZkY = await polynomialMulSpecial("prove0.W_zk.y_vanishing_mul", () =>
    lowDegreeYTimesVanishingBuffer(field, state.mixer.rW_Y, state.setup.s_max),
  );
  const wZk = await polynomialLinearCombination("prove0.W_zk", field, [
    [field.one, wZkX],
    [field.one, wZkY],
  ]);
  const WXY = await polynomialLinearCombination(
    "prove0.W",
    field,
    [
      [field.one, state.witness.wXY],
      [field.one, wZk],
    ],
  );
  const Q_AX_XY = await polynomialLinearCombination(
    "prove0.Q_AX",
    field,
    [
      [field.one, q0XY],
      [state.mixer.rU_X, state.witness.vXY],
      [state.mixer.rV_X, state.witness.uXY],
      [field.neg(field.one), rW_X],
      [field.mul(state.mixer.rU_X, state.mixer.rV_X), state.instance.tN],
      [field.mul(state.mixer.rU_Y, state.mixer.rV_X), state.instance.tSMax],
    ],
  );
  const Q_AY_XY = await polynomialLinearCombination(
    "prove0.Q_AY",
    field,
    [
      [field.one, q1XY],
      [state.mixer.rU_Y, state.witness.vXY],
      [state.mixer.rV_Y, state.witness.uXY],
      [field.neg(field.one), rW_Y],
      [field.mul(state.mixer.rU_X, state.mixer.rV_Y), state.instance.tN],
      [field.mul(state.mixer.rU_Y, state.mixer.rV_Y), state.instance.tSMax],
    ],
  );
  const termBZkX = await polynomialMulSpecial("prove0.term_B_zk.x_vanishing_mul", () =>
    lowDegreeXTimesVanishingBuffer(field, state.mixer.rB_X, state.setup.l_D - state.setup.l),
  );
  const termBZkY = await polynomialMulSpecial("prove0.term_B_zk.y_vanishing_mul", () =>
    lowDegreeYTimesVanishingBuffer(field, state.mixer.rB_Y, state.setup.s_max),
  );
  const termBZk = await polynomialLinearCombination("prove0.term_B_zk", field, [
    [field.one, termBZkX],
    [field.one, termBZkY],
  ]);
  const BXY = await polynomialLinearCombination(
    "prove0.B",
    field,
    [
      [field.one, state.witness.bXY],
      [field.one, termBZk],
    ],
  );

  return {
    commitments: {
      U: await encodePolynomialBufferWithSigma1Timed(runtime, crs, state.setup, UXY, "prove0.U"),
      V: await encodePolynomialBufferWithSigma1Timed(runtime, crs, state.setup, VXY, "prove0.V"),
      W: await encodePolynomialBufferWithSigma1Timed(runtime, crs, state.setup, WXY, "prove0.W"),
      Q_AX: await encodePolynomialBufferWithSigma1Timed(runtime, crs, state.setup, Q_AX_XY, "prove0.Q_AX"),
      Q_AY: await encodePolynomialBufferWithSigma1Timed(runtime, crs, state.setup, Q_AY_XY, "prove0.Q_AY"),
      B: await encodePolynomialBufferWithSigma1Timed(runtime, crs, state.setup, BXY, "prove0.B"),
    },
    q0XY,
    q1XY,
    wZk,
    termBZk,
  };
}

async function prove1Timed(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  state: ProverState,
  thetas: readonly FieldElement[],
): Promise<RecursionComputation> {
  if (thetas.length < 3) {
    throw new Error("prove1 requires at least three theta challenges.");
  }

  const field = runtime.Fr;
  const mI = state.setup.l_D - state.setup.l;
  const sMax = state.setup.s_max;
  const xMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 2, 1);
  const yMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 1, 2);
  const theta2 = constantPolynomialBuffer(field, thetas[2]);
  const fXY = await polynomialLinearCombination("prove1.fXY", field, [
    [field.one, state.witnessBuffers.bXY],
    [thetas[0], state.instanceBuffers.s0XY],
    [thetas[1], state.instanceBuffers.s1XY],
    [field.one, theta2],
  ]);
  const gXY = await polynomialLinearCombination("prove1.gXY", field, [
    [field.one, state.witnessBuffers.bXY],
    [thetas[0], xMonomial],
    [thetas[1], yMonomial],
    [field.one, theta2],
  ]);
  const rXY = await polynomialRecursion(
    "prove1.recursion_polynomial",
    async () => {
      if (fXY.xSize !== mI || fXY.ySize !== sMax || gXY.xSize !== mI || gXY.ySize !== sMax) {
        throw new Error(
          `Recursion polynomial shape mismatch: expected ${mI}x${sMax}, `
            + `got fXY=${fXY.xSize}x${fXY.ySize}, gXY=${gXY.xSize}x${gXY.ySize}.`,
        );
      }
      const fXYEvals = await fXY.toRouEvals();
      const gXYEvals = await gXY.toRouEvals();
      const rXYEvals = await computeRecursionEvalsBuffer(field, gXYEvals, fXYEvals, mI, sMax);
      return BivariatePolynomialBuffer.fromRouEvals(field, rXYEvals, mI, sMax);
    },
    [shapeSize("domain", mI, sMax)],
  );
  const RXY = await polynomialLinearCombination("prove1.R", field, [
    [field.one, rXY],
    [state.mixer.rR_X, state.instanceBuffers.tMi],
    [state.mixer.rR_Y, state.instanceBuffers.tSMax],
  ]);

  return {
    commitment: {
      R: await encodePolynomialBufferWithSigma1Timed(runtime, crs, state.setup, RXY, "prove1.R"),
    },
    rXY,
  };
}

async function prove2Timed(input: {
  readonly runtime: CurveRuntime;
  readonly crs: ProverCrsRuntime;
  readonly state: ProverState;
  readonly rXY: BivariatePolynomialBuffer;
  readonly thetas: readonly FieldElement[];
  readonly kappa0: FieldElement;
}): Promise<CopyQuotientComputation> {
  const { runtime, crs, state, rXY, thetas, kappa0 } = input;
  if (thetas.length < 3) {
    throw new Error("prove2 requires at least three theta challenges.");
  }

  const field = runtime.Fr;
  const mI = state.setup.l_D - state.setup.l;
  const sMax = state.setup.s_max;
  const kappa0Sq = field.square(kappa0);
  const omegaMI = field.rootOfUnity(mI);
  const omegaSMax = field.rootOfUnity(sMax);
  const rOmegaX = await polynomialScaleX("prove2.r_omega_x", rXY, field.inv(omegaMI));
  const rOmegaXOmegaY = await polynomialBatchScale(
    "prove2.r_omega_x_omega_y",
    rOmegaX,
    field.one,
    field.inv(omegaSMax),
  );
  const xMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 2, 1);
  const yMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 1, 2);
  const theta2 = constantPolynomialBuffer(field, thetas[2]);
  const fXY = await polynomialLinearCombination(
    "prove2.fXY",
    field,
    [
      [field.one, state.witness.bXY],
      [thetas[0], state.instance.s0XY],
      [thetas[1], state.instance.s1XY],
      [field.one, theta2],
    ],
  );
  const gXY = await polynomialLinearCombination(
    "prove2.gXY",
    field,
    [
      [field.one, state.witness.bXY],
      [thetas[0], xMonomial],
      [thetas[1], yMonomial],
      [field.one, theta2],
    ],
  );
  const lagrangeKlXY = await polynomialOperation("polynomial.combination_with_multiplication", "prove2.lagrange_KL", () =>
    buildLagrangeKl(field, mI, sMax),
  );
  const [rGXY, rOmegaXFXY, rOmegaXOmegaYFXY] = await polynomialOperation(
    "polynomial.combination_with_multiplication",
    "prove2.omega_shifted_products",
    () => multiplyOmegaShiftedProducts(rXY, gXY, fXY, mI, sMax),
  );
  const p1Numerator = await polynomialSub("prove2.p1.sub_one", rXY, constantPolynomialBuffer(field, field.one));
  const p1XY = await polynomialMulLagrangeKl("prove2.p1.mul_lagrange_KL", p1Numerator, mI, sMax);
  const p2Input = await polynomialSub("prove2.p2_input", rGXY, rOmegaXFXY);
  const p2XY = await polynomialMulSpecial("prove2.p2.mul_x_minus_one", () => mulByXMinusOne(p2Input), [
    shapeSize("polynomial", p2Input.xSize, p2Input.ySize),
  ]);
  const p3Input = await polynomialSub("prove2.p3.sub", rGXY, rOmegaXOmegaYFXY);
  const p3XY = await polynomialMulLagrangeK0("prove2.p3.mul_lagrange_K0", p3Input, mI);
  const pCombined = await polynomialLinearCombination(
    "prove2.p_comb",
    field,
    [
      [field.one, p1XY],
      [kappa0, p2XY],
      [kappa0Sq, p3XY],
    ],
  );
  const { quotientX: q2XY, quotientY: q3XY } = await polynomialDivVanishing("prove2.qCXqCY", pCombined, mI, sMax);
  const rD1 = await polynomialSub("prove2.rD1", rXY, rOmegaX);
  const rD2 = await polynomialSub("prove2.rD2", rXY, rOmegaXOmegaY);
  const gD = await polynomialSub("prove2.gD", gXY, fXY);
  const qCxTerm2Sum = await polynomialOperation(
    "polynomial.combination_without_multiplication",
    "prove2.Q_CX.term2.fused_inner",
    () => combineLinearXWithScaled(rD1, state.mixer.rB_X, gD, state.mixer.rR_X),
  );
  const qCxTerm2 = await polynomialMulSpecial(
    "prove2.Q_CX.term2.mul_x_minus_one",
    () => mulByXMinusOne(qCxTerm2Sum),
    [shapeSize("polynomial", qCxTerm2Sum.xSize, qCxTerm2Sum.ySize)],
  );
  const qCxTerm3Sum = await polynomialOperation(
    "polynomial.combination_without_multiplication",
    "prove2.Q_CX.term3.fused_inner",
    () => combineLinearXWithScaled(rD2, state.mixer.rB_X, gD, state.mixer.rR_X),
  );
  const qCxTerm3 = await polynomialMulLagrangeK0("prove2.Q_CX.term3.mul_lagrange_K0", qCxTerm3Sum, mI);
  const qCxXY = await polynomialLinearCombination(
    "prove2.Q_CX",
    field,
    [
      [field.one, q2XY],
      [state.mixer.rR_X, lagrangeKlXY],
      [kappa0, qCxTerm2],
      [kappa0Sq, qCxTerm3],
    ],
  );
  const qCyTerm2Sum = await polynomialOperation(
    "polynomial.combination_without_multiplication",
    "prove2.Q_CY.term2.fused_inner",
    () => combineLinearYWithScaled(rD1, state.mixer.rB_Y, gD, state.mixer.rR_Y),
  );
  const qCyTerm2 = await polynomialMulSpecial(
    "prove2.Q_CY.term2.mul_x_minus_one",
    () => mulByXMinusOne(qCyTerm2Sum),
    [shapeSize("polynomial", qCyTerm2Sum.xSize, qCyTerm2Sum.ySize)],
  );
  const qCyTerm3Sum = await polynomialOperation(
    "polynomial.combination_without_multiplication",
    "prove2.Q_CY.term3.fused_inner",
    () => combineLinearYWithScaled(rD2, state.mixer.rB_Y, gD, state.mixer.rR_Y),
  );
  const qCyTerm3 = await polynomialMulLagrangeK0("prove2.Q_CY.term3.mul_lagrange_K0", qCyTerm3Sum, mI);
  const qCyXY = await polynomialLinearCombination(
    "prove2.Q_CY",
    field,
    [
      [field.one, q3XY],
      [state.mixer.rR_Y, lagrangeKlXY],
      [kappa0, qCyTerm2],
      [kappa0Sq, qCyTerm3],
    ],
  );

  return {
    commitments: {
      Q_CX: await encodePolynomialBufferWithSigma1Timed(runtime, crs, state.setup, qCxXY, "prove2.Q_CX"),
      Q_CY: await encodePolynomialBufferWithSigma1Timed(runtime, crs, state.setup, qCyXY, "prove2.Q_CY"),
    },
    q2XY,
    q3XY,
    lagrangeKlXY,
  };
}

async function prove4Timed(input: {
  readonly runtime: CurveRuntime;
  readonly crs: ProverCrsRuntime;
  readonly state: ProverState;
  readonly rXY: BivariatePolynomialBuffer;
  readonly initialRelation: InitialRelationComputation;
  readonly copyQuotient: CopyQuotientComputation;
  readonly thetas: readonly FieldElement[];
  readonly kappa0: FieldElement;
  readonly chi: FieldElement;
  readonly zeta: FieldElement;
  readonly kappa1: FieldElement;
}): Promise<OpeningCommitmentsComputation> {
  const {
    runtime,
    crs,
    state,
    rXY,
    initialRelation: prove0,
    copyQuotient: prove2,
    thetas,
    kappa0,
    chi,
    zeta,
    kappa1,
  } = input;
  if (thetas.length < 3) {
    throw new Error("prove4 requires at least three theta challenges.");
  }

  const field = runtime.Fr;
  const mI = state.setup.l_D - state.setup.l;
  const sMax = state.setup.s_max;
  const omegaMIInv = field.inv(field.rootOfUnity(mI));
  const omegaSMaxInv = field.inv(field.rootOfUnity(sMax));
  const kappa0Sq = field.square(kappa0);
  const kappa1Sq = field.square(kappa1);
  const kappa1Cube = field.mul(kappa1Sq, kappa1);
  const kappa1Fourth = field.square(kappa1Sq);
  const tNEval = evaluatePolynomialAt("prove4.tN_eval", state.instance.tN, chi, field.one);
  const tSMaxEval = evaluatePolynomialAt("prove4.tSMax_eval", state.instance.tSMax, field.one, zeta);
  const smallVEval = await evaluatePolynomialAtBatch(
    "prove4.V_eval",
    state.witnessBuffers.vXY,
    chi,
    zeta,
  );
  const rW_X = BivariatePolynomialBuffer.fromCoeffs(field, state.mixer.rW_X, state.mixer.rW_X.length, 1);
  const rW_Y = BivariatePolynomialBuffer.fromCoeffs(field, state.mixer.rW_Y, 1, state.mixer.rW_Y.length);
  const VXY = await polynomialLinearCombination(
    "prove4.V",
    field,
    [
      [field.one, state.witness.vXY],
      [state.mixer.rV_X, state.instance.tN],
      [state.mixer.rV_Y, state.instance.tSMax],
    ],
  );
  const pAXY = await polynomialLinearCombination(
    "prove4.Pi_A",
    field,
    [
      [kappa1, VXY],
      [smallVEval, state.witness.uXY],
      [field.neg(field.one), state.witness.wXY],
      [field.neg(tNEval), prove0.q0XY],
      [field.neg(tSMaxEval), prove0.q1XY],
      [field.mul(smallVEval, state.mixer.rU_X), state.instance.tN],
      [field.mul(smallVEval, state.mixer.rU_Y), state.instance.tSMax],
      [
        field.neg(field.add(field.mul(state.mixer.rU_X, tNEval), field.mul(state.mixer.rU_Y, tSMaxEval))),
        state.witness.vXY,
      ],
      [tNEval, rW_X],
      [tSMaxEval, rW_Y],
      [field.neg(field.one), prove0.wZk],
    ],
  );
  const RXY = await polynomialLinearCombination(
    "prove4.R",
    field,
    [
      [field.one, rXY],
      [state.mixer.rR_X, state.instance.tMi],
      [state.mixer.rR_Y, state.instance.tSMax],
    ],
  );
  const mnDivisions = await polynomialSharedMnDivisions(
    "prove4.M_N_shared",
    RXY,
    field.mul(omegaMIInv, chi),
    zeta,
    field.mul(omegaSMaxInv, zeta),
  );
  const M_X = await encodePolynomialBufferWithSigma1Timed(
    runtime,
    crs,
    state.setup,
    mnDivisions.sharedX,
    "prove4.M_N_X",
  );
  const M_Y = await encodePolynomialBufferWithSigma1Timed(
    runtime,
    crs,
    state.setup,
    mnDivisions.mY,
    "prove4.M_Y",
  );
  const N_X = M_X;
  const N_Y = await encodePolynomialBufferWithSigma1Timed(
    runtime,
    crs,
    state.setup,
    mnDivisions.nY,
    "prove4.N_Y",
  );
  const copyOpeningNumerator = await buildCopyOpeningNumeratorTimed({
    runtime,
    state,
    rXY,
    RXY,
    initialRelation: prove0,
    copyQuotient: prove2,
    thetas,
    kappa0,
    kappa0Sq,
    kappa1Sq,
    kappa1Cube,
    chi,
    zeta,
    omegaMIInv,
    omegaSMaxInv,
  });
  const combinedPiNumerator = await polynomialLinearCombination(
    "prove4.Pi_combined",
    field,
    [
      [field.one, pAXY],
      [field.one, copyOpeningNumerator],
      [kappa1Fourth, state.instance.aFreeX],
    ],
  );
  const combinedPiDivision = await polynomialDivRuffini(
    "prove4.Pi_combined",
    combinedPiNumerator,
    chi,
    zeta,
  );
  const Pi_X = await encodePolynomialBufferWithSigma1Timed(
    runtime,
    crs,
    state.setup,
    combinedPiDivision.quotientX,
    "prove4.Pi_X",
  );
  const Pi_Y = await encodePolynomialBufferWithSigma1Timed(
    runtime,
    crs,
    state.setup,
    combinedPiDivision.quotientY,
    "prove4.Pi_Y",
  );

  return {
    commitments: {
      Pi_X,
      Pi_Y,
      M_X,
      M_Y,
      N_X,
      N_Y,
    },
  };
}

async function buildCopyOpeningNumeratorTimed(input: {
  readonly runtime: CurveRuntime;
  readonly state: ProverState;
  readonly rXY: BivariatePolynomialBuffer;
  readonly RXY: BivariatePolynomialBuffer;
  readonly initialRelation: InitialRelationComputation;
  readonly copyQuotient: CopyQuotientComputation;
  readonly thetas: readonly FieldElement[];
  readonly kappa0: FieldElement;
  readonly kappa0Sq: FieldElement;
  readonly kappa1Sq: FieldElement;
  readonly kappa1Cube: FieldElement;
  readonly chi: FieldElement;
  readonly zeta: FieldElement;
  readonly omegaMIInv: FieldElement;
  readonly omegaSMaxInv: FieldElement;
}): Promise<BivariatePolynomialBuffer> {
  const {
    runtime,
    state,
    rXY,
    RXY,
    initialRelation: prove0,
    copyQuotient: prove2,
    thetas,
    kappa0,
    kappa0Sq,
    kappa1Sq,
    kappa1Cube,
    chi,
    zeta,
    omegaMIInv,
    omegaSMaxInv,
  } = input;
  const field = runtime.Fr;
  const mI = state.setup.l_D - state.setup.l;
  const sMax = state.setup.s_max;
  const rOmegaX = await polynomialScaleX("prove4.r_omega_x", rXY, omegaMIInv);
  const rOmegaXOmegaY = await polynomialBatchScale(
    "prove4.r_omega_x_omega_y",
    rOmegaX,
    field.one,
    omegaSMaxInv,
  );
  const xMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 2, 1);
  const yMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 1, 2);
  const theta2 = constantPolynomialBuffer(field, thetas[2]);
  const fXY = await polynomialLinearCombination(
    "prove4.fXY",
    field,
    [
      [field.one, state.witness.bXY],
      [thetas[0], state.instance.s0XY],
      [thetas[1], state.instance.s1XY],
      [field.one, theta2],
    ],
  );
  const gXY = await polynomialLinearCombination(
    "prove4.gXY",
    field,
    [
      [field.one, state.witness.bXY],
      [thetas[0], xMonomial],
      [thetas[1], yMonomial],
      [field.one, theta2],
    ],
  );
  const tMiEval = field.sub(field.pow(chi, mI), field.one);
  const tSMaxEval = field.sub(field.pow(zeta, sMax), field.one);
  const lagrangeK0Eval = polynomialEvaluation(
    "prove4.lagrange_K0_eval",
    () => evaluateLagrangeK0At(field, mI, chi, tMiEval),
    [shapeSize("lagrange_K0", mI, 1)],
  );
  const [smallREval, smallROmegaXEval, smallROmegaXOmegaYEval] = await polynomialOperation(
    "polynomial.evaluation",
    "prove4.r_scaled_evaluation_set",
    () =>
      evaluateAtScaledChallengeSetBatch(
        field,
        rXY,
        chi,
        field.mul(omegaMIInv, chi),
        zeta,
        field.mul(omegaSMaxInv, zeta),
      ),
    [
      shapeSize("r", rXY.xSize, rXY.ySize),
      shapeSize("r_omega_x", rXY.xSize, rXY.ySize),
      shapeSize("r_omega_x_omega_y", rXY.xSize, rXY.ySize),
    ],
  );
  const term5Scale = field.mul(kappa0, field.sub(chi, field.one));
  const term6Scale = field.mul(kappa0Sq, lagrangeK0Eval);
  const gScale = field.mul(smallREval, field.add(term5Scale, term6Scale));
  const fScale = field.neg(
    field.add(
      field.mul(term5Scale, smallROmegaXEval),
      field.mul(term6Scale, smallROmegaXOmegaYEval),
    ),
  );
  const pCXY = await polynomialLinearCombination(
    "prove4.pC",
    field,
    [
      [field.sub(smallREval, field.one), prove2.lagrangeKlXY],
      [gScale, gXY],
      [fScale, fXY],
      [field.neg(tMiEval), prove2.q2XY],
      [field.neg(tSMaxEval), prove2.q3XY],
    ],
  );
  const rD1 = await polynomialSub("prove4.rD1", rXY, rOmegaX);
  const rD2 = await polynomialSub("prove4.rD2", rXY, rOmegaXOmegaY);
  const [rD1Eval, rD2Eval] = polynomialEvaluation(
    "prove4.rD_evaluation_set",
    () => [
      field.sub(smallREval, smallROmegaXEval),
      field.sub(smallREval, smallROmegaXOmegaYEval),
    ],
    [
      shapeSize("rD1", rD1.xSize, rD1.ySize),
      shapeSize("rD2", rD2.xSize, rD2.ySize),
    ],
  );
  const gMinusF = await polynomialSub("prove4.gMinusF", gXY, fXY);
  const term10Scale = field.add(field.mul(state.mixer.rR_X, tMiEval), field.mul(state.mixer.rR_Y, tSMaxEval));
  const term10 = await polynomialBatchScale("prove4.term10", gMinusF, term10Scale, field.one);
  const lhsZk1 = await (async () => {
    const rD1Term9 = await polynomialMulSpecial("prove4.LHS_zk1.term9", () =>
      mulByTerm9(rD1, state.mixer.rB_X, state.mixer.rB_Y, tMiEval, tSMaxEval),
    );
    const rD1Term9PlusTerm10 = await polynomialAdd("prove4.LHS_zk1.term9_plus_term10", rD1Term9, term10);
    const oneMinusX = await polynomialMulSpecial("prove4.LHS_zk1.one_minus_x", () =>
      mulByOneMinusX(rD1Term9PlusTerm10),
      [shapeSize("polynomial", rD1Term9PlusTerm10.xSize, rD1Term9PlusTerm10.ySize)],
    );
    return await polynomialLinearCombination("prove4.LHS_zk1", field, [
      [field.mul(field.sub(chi, field.one), rD1Eval), prove0.termBZk],
      [field.one, oneMinusX],
      [field.sub(chi, field.one), term10],
    ]);
  })();
  const lhsZk2 = await (async () => {
    const rD2Term9 = await polynomialMulSpecial("prove4.LHS_zk2.term9", () =>
      mulByTerm9(rD2, state.mixer.rB_X, state.mixer.rB_Y, tMiEval, tSMaxEval),
    );
    const rD2Term9PlusTerm10 = await polynomialAdd("prove4.LHS_zk2.term9_plus_term10", rD2Term9, term10);
    const lhsZk2Product = await polynomialMulLagrangeK0(
      "prove4.LHS_zk2.mul_lagrange_K0",
      rD2Term9PlusTerm10,
      mI,
    );
    return await polynomialLinearCombination("prove4.LHS_zk2", field, [
      [field.mul(lagrangeK0Eval, rD2Eval), prove0.termBZk],
      [lagrangeK0Eval, term10],
      [field.neg(field.one), lhsZk2Product],
    ]);
  })();
  const lhsForCopy = await polynomialLinearCombination(
    "prove4.LHS_for_copy",
    field,
    [
      [kappa1Sq, pCXY],
      [field.mul(kappa1Sq, kappa0), lhsZk1],
      [field.mul(field.mul(kappa1Sq, kappa0Sq), field.one), lhsZk2],
      [kappa1Cube, RXY],
    ],
  );
  return lhsForCopy;
}

async function evaluateChallengePointsTimed(input: {
  readonly runtime: CurveRuntime;
  readonly state: ProverState;
  readonly rXY: BivariatePolynomialBuffer;
  readonly chi: FieldElement;
  readonly zeta: FieldElement;
}): Promise<ChallengeEvaluations> {
  const { runtime, state, rXY, chi, zeta } = input;
  const field = runtime.Fr;
  const mI = state.setup.l_D - state.setup.l;
  const omegaMI = field.rootOfUnity(mI);
  const omegaSMax = field.rootOfUnity(state.setup.s_max);
  const VXY = await polynomialLinearCombination("prove3.V", field, [
    [field.one, state.witnessBuffers.vXY],
    [state.mixer.rV_X, state.instanceBuffers.tN],
    [state.mixer.rV_Y, state.instanceBuffers.tSMax],
  ]);
  const RXY = await polynomialLinearCombination("prove3.R", field, [
    [field.one, rXY],
    [state.mixer.rR_X, state.instanceBuffers.tMi],
    [state.mixer.rR_Y, state.instanceBuffers.tSMax],
  ]);
  const scaledChi = field.mul(field.inv(omegaMI), chi);
  const scaledZeta = field.mul(field.inv(omegaSMax), zeta);

  return polynomialOperation(
    "polynomial.evaluation",
    "prove3.challenge_evaluations",
    async () => {
      const [R_eval, R_omegaX_eval, R_omegaX_omegaY_eval] = await evaluateAtScaledChallengeSetBatch(
        field,
        RXY,
        chi,
        scaledChi,
        zeta,
        scaledZeta,
      );
      return {
        V_eval: await VXY.evalBatch(chi, zeta),
        R_eval,
        R_omegaX_eval,
        R_omegaX_omegaY_eval,
      };
    },
    [
      shapeSize("V", VXY.xSize, VXY.ySize),
      shapeSize("R", RXY.xSize, RXY.ySize),
      shapeSize("R_omega_x", RXY.xSize, RXY.ySize),
      shapeSize("R_omega_x_omega_y", RXY.xSize, RXY.ySize),
    ],
  );
}

async function encodePolynomialBufferWithSigma1Timed(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  setup: ProverRuntimeInput["witness"]["setup"],
  polynomial: BivariatePolynomialBuffer,
  label: string,
): Promise<Uint8Array> {
  return timing.span(label, "polynomial.encode", () =>
    encodePolynomialBufferWithSigma1(runtime, crs, setup, polynomial),
    [shapeSize("polynomial", polynomial.xSize, polynomial.ySize)],
  );
}

function collectThetaChallenges(
  runtime: CurveRuntime,
  transcript: RollingKeccakTranscript,
  proof0: InitialRelationCommitments,
): readonly [FieldElement, FieldElement, FieldElement] {
  transcript
    .commitG1Point(proof0.U, runtime.G1)
    .commitG1Point(proof0.V, runtime.G1)
    .commitG1Point(proof0.W, runtime.G1)
    .commitG1Point(proof0.Q_AX, runtime.G1)
    .commitG1Point(proof0.Q_AY, runtime.G1)
    .commitG1Point(proof0.B, runtime.G1);
  const thetas = transcript.getChallenges(3);

  return [thetas[0], thetas[1], thetas[2]];
}

function collectKappa0Challenge(
  runtime: CurveRuntime,
  transcript: RollingKeccakTranscript,
  proof1: { readonly R: Uint8Array },
): FieldElement {
  transcript.commitG1Point(proof1.R, runtime.G1);
  return transcript.squeezeChallenge();
}

function collectEvaluationChallenges(
  runtime: CurveRuntime,
  transcript: RollingKeccakTranscript,
  proof2: CopyQuotientCommitments,
): { readonly chi: FieldElement; readonly zeta: FieldElement } {
  transcript.commitG1Point(proof2.Q_CX, runtime.G1).commitG1Point(proof2.Q_CY, runtime.G1);

  return {
    chi: transcript.squeezeChallenge(),
    zeta: transcript.squeezeChallenge(),
  };
}

function collectKappa1Challenge(transcript: RollingKeccakTranscript, evaluations: ChallengeEvaluations): FieldElement {
  transcript
    .commitField(evaluations.V_eval)
    .commitField(evaluations.R_eval)
    .commitField(evaluations.R_omegaX_eval)
    .commitField(evaluations.R_omegaX_omegaY_eval);

  return transcript.squeezeChallenge();
}

function buildTimingReport(events: readonly TimingEvent[]): TimingReport {
  const summary = buildModuleTimingSummary(events);
  const categoryTotals = summarizeByCategory(events);
  const lowestOperationTotals = buildLowestOperationTotals(events);
  const middleOperationTotals = buildMiddleOperationTotals(lowestOperationTotals);
  const topOperationTotals = buildTopOperationTotals(middleOperationTotals);
  const totalWallMs = sumRootWallTime(events);
  const classifiedOperationMs =
    operationDuration(topOperationTotals, "field.operations") + operationDuration(topOperationTotals, "encode");
  const unclassifiedProverMs = totalWallMs - classifiedOperationMs;
  const executionBoundaryTotals = buildExecutionBoundaryTotals({
    categoryTotals,
    topOperationTotals,
    totalWallMs,
  });
  const invariantChecks = buildTimingInvariantChecks({
    events,
    summary,
    lowestOperationTotals,
    middleOperationTotals,
    topOperationTotals,
    executionBoundaryTotals,
    totalWallMs,
    classifiedOperationMs,
    unclassifiedProverMs,
  });

  return {
    generatedAt: new Date().toISOString(),
    totalWallMs,
    classifiedOperationMs,
    unclassifiedProverMs,
    summary,
    events,
    categoryTotals,
    lowestOperationTotals,
    middleOperationTotals,
    topOperationTotals,
    executionBoundaryTotals,
    invariantChecks,
  };
}

function printTimingSummary(report: TimingReport, outputPath: string): void {
  const stageMs = Object.values(report.summary).reduce((total, item) => total + item.totalMs, 0);

  console.log(`Wrote prover stage timing report to ${path.relative(process.cwd(), outputPath)}`);
  console.log("Fixed operation timing:");
  console.log("  lowest:");
  for (const total of report.lowestOperationTotals) {
    console.log(`    ${total.operation}: ${formatDuration(total.durationMs)} (${total.count} events)`);
  }
  console.log("  middle:");
  for (const total of report.middleOperationTotals) {
    console.log(`    ${total.operation}: ${formatDuration(total.durationMs)} (${total.count} events)`);
  }
  console.log("  top:");
  for (const total of report.topOperationTotals) {
    console.log(`    ${total.operation}: ${formatDuration(total.durationMs)} (${total.count} events)`);
  }
  console.log("  execution boundary:");
  for (const total of report.executionBoundaryTotals) {
    console.log(`    ${total.operation}: ${formatDuration(total.durationMs)} (${total.count} events)`);
  }
  console.log(`  stage total: ${formatDuration(stageMs)}`);
  console.log(`  total wall time: ${formatDuration(report.totalWallMs)}`);
  console.log(`  classified operation time: ${formatDuration(report.classifiedOperationMs)}`);
  console.log(`  unclassified prover time: ${formatDuration(report.unclassifiedProverMs)}`);
  console.log("Module times:");
  for (const moduleName of ["prove0", "prove1", "prove2", "prove3", "prove4"]) {
    const item = report.summary[moduleName];
    if (item === undefined) {
      continue;
    }

    console.log(
      `  ${moduleName}: total=${formatDuration(item.totalMs)}, poly=${formatDuration(item.polyMs)}, encode=${formatDuration(item.encodeMs)}`,
    );
  }

  const failedChecks = report.invariantChecks.filter((check) => !check.ok);
  if (failedChecks.length > 0) {
    throw new Error(`Timing invariant failed: ${failedChecks.map((check) => check.name).join(", ")}`);
  }
}

function sumRootWallTime(events: readonly TimingEvent[]): number {
  return events
    .filter((event) => isRootWallEvent(event))
    .reduce((total, event) => total + event.durationMs, 0);
}

function isRootWallEvent(event: TimingEvent): boolean {
  return (
    event.name === "load prover runtime input" ||
    event.name === "build witness polynomials" ||
    event.name === "create prover state" ||
    event.name === "build prover binding" ||
    event.name === "load generated proof artifact" ||
    event.name === "verify generated proof" ||
    event.name === "create verifier proof artifact" ||
    event.name === "prove0" ||
    event.name === "prove1" ||
    event.name === "prove2" ||
    event.name === "prove3" ||
    event.name === "prove4"
  );
}

function buildModuleTimingSummary(events: readonly TimingEvent[]): Record<string, ModuleTimingSummary> {
  const modules: Record<string, ModuleTimingSummary> = {};
  for (const moduleName of ["prove0", "prove1", "prove2", "prove3", "prove4"]) {
    modules[moduleName] = {
      totalMs: events
        .filter((event) => event.name === moduleName && event.category === "stage")
        .reduce((total, event) => total + event.durationMs, 0),
      polyMs: events
        .filter((event) => isPolynomialFieldOperation(event.category) && event.name.includes(`${moduleName}.`))
        .reduce((total, event) => total + event.durationMs, 0),
      encodeMs: events
        .filter((event) => event.category === "polynomial.encode" && event.name.includes(`${moduleName}.`))
        .reduce((total, event) => total + event.durationMs, 0),
    };
  }

  return modules;
}

function summarizeByCategory(events: readonly TimingEvent[]): readonly TimingTotal[] {
  const totals = new Map<string, { durationMs: number; count: number }>();
  for (const event of events) {
    const total = totals.get(event.category) ?? { durationMs: 0, count: 0 };
    total.durationMs += event.durationMs;
    total.count += 1;
    totals.set(event.category, total);
  }

  return Array.from(totals.entries())
    .map(([category, total]) => ({ category, ...total }))
    .sort((left, right) => right.durationMs - left.durationMs);
}

function buildLowestOperationTotals(events: readonly TimingEvent[]): readonly OperationTimingTotal[] {
  const totals = createFixedOperationTotals(lowestOperationOrder);
  for (const event of events) {
    const operation = lowestOperationForEvent(event);
    if (operation !== undefined) {
      addOperationTotal(totals, operation, event.durationMs);
    }
  }

  return fixedOperationTotalsToRows(totals, lowestOperationOrder);
}

function buildMiddleOperationTotals(
  lowestOperationTotals: readonly OperationTimingTotal[],
): readonly OperationTimingTotal[] {
  const totals = createFixedOperationTotals(middleOperationOrder);
  addOperationTotal(
    totals,
    "polynomial.combination",
    operationDuration(lowestOperationTotals, "polynomial.combination_without_multiplication") +
      operationDuration(lowestOperationTotals, "polynomial.combination_with_multiplication"),
    operationCount(lowestOperationTotals, "polynomial.combination_without_multiplication") +
      operationCount(lowestOperationTotals, "polynomial.combination_with_multiplication"),
  );
  addOperationTotal(
    totals,
    "polynomial.recursion",
    operationDuration(lowestOperationTotals, "polynomial.recursion"),
    operationCount(lowestOperationTotals, "polynomial.recursion"),
  );
  addOperationTotal(
    totals,
    "polynomial.evaluation",
    operationDuration(lowestOperationTotals, "polynomial.evaluation"),
    operationCount(lowestOperationTotals, "polynomial.evaluation"),
  );
  addOperationTotal(
    totals,
    "polynomial.division",
    operationDuration(lowestOperationTotals, "polynomial.div_ruffini") +
      operationDuration(lowestOperationTotals, "polynomial.div_vanishing"),
    operationCount(lowestOperationTotals, "polynomial.div_ruffini") +
      operationCount(lowestOperationTotals, "polynomial.div_vanishing"),
  );
  addOperationTotal(
    totals,
    "encode",
    operationDuration(lowestOperationTotals, "polynomial.encode") +
      operationDuration(lowestOperationTotals, "binding.encode"),
    operationCount(lowestOperationTotals, "polynomial.encode") +
      operationCount(lowestOperationTotals, "binding.encode"),
  );

  return fixedOperationTotalsToRows(totals, middleOperationOrder);
}

function buildTopOperationTotals(middleOperationTotals: readonly OperationTimingTotal[]): readonly OperationTimingTotal[] {
  const totals = createFixedOperationTotals(topOperationOrder);
  addOperationTotal(
    totals,
    "field.operations",
    operationDuration(middleOperationTotals, "polynomial.combination") +
      operationDuration(middleOperationTotals, "polynomial.recursion") +
      operationDuration(middleOperationTotals, "polynomial.evaluation") +
      operationDuration(middleOperationTotals, "polynomial.division"),
    operationCount(middleOperationTotals, "polynomial.combination") +
      operationCount(middleOperationTotals, "polynomial.recursion") +
      operationCount(middleOperationTotals, "polynomial.evaluation") +
      operationCount(middleOperationTotals, "polynomial.division"),
  );
  addOperationTotal(
    totals,
    "encode",
    operationDuration(middleOperationTotals, "encode"),
    operationCount(middleOperationTotals, "encode"),
  );

  return fixedOperationTotalsToRows(totals, topOperationOrder);
}

function buildExecutionBoundaryTotals(input: {
  readonly categoryTotals: readonly TimingTotal[];
  readonly topOperationTotals: readonly OperationTimingTotal[];
  readonly totalWallMs: number;
}): readonly OperationTimingTotal[] {
  const { categoryTotals, topOperationTotals, totalWallMs } = input;
  const totals = createFixedOperationTotals(executionBoundaryOrder);
  const stageMs = categoryDuration(categoryTotals, "stage");
  const fieldOperationsMs = operationDuration(topOperationTotals, "field.operations");
  const encodeMs = operationDuration(topOperationTotals, "encode");
  const polynomialEncodeMs = categoryDuration(categoryTotals, "polynomial.encode");
  const initMs = categoryDuration(categoryTotals, "init");
  const bindingEncodeMs = categoryDuration(categoryTotals, "binding.encode");
  const ioMs = categoryDuration(categoryTotals, "io");
  const verifyMs = categoryDuration(categoryTotals, "verify");
  const outputMs = categoryDuration(categoryTotals, "output");
  const stageUnclassifiedMs = stageMs - fieldOperationsMs - polynomialEncodeMs;
  const externalUnclassifiedMs =
    totalWallMs - stageMs - initMs - bindingEncodeMs - ioMs - verifyMs - outputMs;

  addOperationTotal(totals, "init", initMs, categoryCount(categoryTotals, "init"));
  addOperationTotal(
    totals,
    "field.operations",
    fieldOperationsMs,
    operationCount(topOperationTotals, "field.operations"),
  );
  addOperationTotal(
    totals,
    "encode",
    encodeMs,
    operationCount(topOperationTotals, "encode"),
  );
  addOperationTotal(totals, "stage.unclassified", stageUnclassifiedMs);
  addOperationTotal(totals, "io", ioMs, categoryCount(categoryTotals, "io"));
  addOperationTotal(totals, "verify", verifyMs, categoryCount(categoryTotals, "verify"));
  addOperationTotal(totals, "output", outputMs, categoryCount(categoryTotals, "output"));
  addOperationTotal(totals, "external.unclassified", externalUnclassifiedMs);

  return fixedOperationTotalsToRows(totals, executionBoundaryOrder);
}

function lowestOperationForEvent(event: TimingEvent): (typeof lowestOperationOrder)[number] | undefined {
  if (isLowestOperation(event.category)) {
    return event.category;
  }

  return undefined;
}

function isLowestOperation(category: string): category is LowestOperation {
  return lowestOperationOrder.includes(category as LowestOperation);
}

function isPolynomialFieldOperation(category: string): boolean {
  return (
    category === "polynomial.combination_without_multiplication" ||
    category === "polynomial.combination_with_multiplication" ||
    category === "polynomial.recursion" ||
    category === "polynomial.evaluation" ||
    category === "polynomial.div_ruffini" ||
    category === "polynomial.div_vanishing"
  );
}

function createFixedOperationTotals<T extends string>(
  operations: readonly T[],
): Map<T, { durationMs: number; count: number }> {
  return new Map(operations.map((operation) => [operation, { durationMs: 0, count: 0 }]));
}

function addOperationTotal<T extends string>(
  totals: Map<T, { durationMs: number; count: number }>,
  operation: T,
  durationMs: number,
  count = 1,
): void {
  const total = totals.get(operation);
  if (total === undefined) {
    throw new Error(`Unknown fixed timing operation: ${operation}`);
  }

  total.durationMs += durationMs;
  total.count += count;
}

function fixedOperationTotalsToRows<T extends string>(
  totals: Map<T, { durationMs: number; count: number }>,
  operations: readonly T[],
): readonly OperationTimingTotal[] {
  return operations.map((operation) => {
    const total = totals.get(operation);
    if (total === undefined) {
      throw new Error(`Missing fixed timing operation: ${operation}`);
    }

    return { operation, durationMs: total.durationMs, count: total.count };
  });
}

function buildTimingInvariantChecks(input: {
  readonly events: readonly TimingEvent[];
  readonly summary: Record<string, ModuleTimingSummary>;
  readonly lowestOperationTotals: readonly OperationTimingTotal[];
  readonly middleOperationTotals: readonly OperationTimingTotal[];
  readonly topOperationTotals: readonly OperationTimingTotal[];
  readonly executionBoundaryTotals: readonly OperationTimingTotal[];
  readonly totalWallMs: number;
  readonly classifiedOperationMs: number;
  readonly unclassifiedProverMs: number;
}): readonly TimingInvariantCheck[] {
  const {
    events,
    summary,
    lowestOperationTotals,
    middleOperationTotals,
    topOperationTotals,
    executionBoundaryTotals,
    totalWallMs,
    classifiedOperationMs,
    unclassifiedProverMs,
  } = input;
  const checks: TimingInvariantCheck[] = [];
  for (const [moduleName, item] of Object.entries(summary)) {
    checks.push({
      name: `${moduleName}.poly_plus_encode_lte_total`,
      parentMs: item.totalMs,
      childMs: item.polyMs + item.encodeMs,
      ok: item.polyMs + item.encodeMs <= item.totalMs + timingToleranceMs,
    });
  }

  const oldLowestCategoryEvents = events.filter(
    (event) =>
      event.category === "polynomial.add" ||
      event.category === "polynomial.sub" ||
      event.category === "polynomial.mul" ||
      event.category === "polynomial.scale" ||
      event.category === "polynomial.combine",
  );
  checks.push({
    name: "old_lowest_operation_categories_absent",
    parentMs: 0,
    childMs: oldLowestCategoryEvents.length,
    ok: oldLowestCategoryEvents.length === 0,
  });

  const directDerivedLayerEvents = events.filter(
    (event) =>
      !isLowestOperation(event.category) &&
      (middleOperationOrder.includes(event.category as (typeof middleOperationOrder)[number]) ||
        topOperationOrder.includes(event.category as (typeof topOperationOrder)[number])),
  );
  checks.push({
    name: "derived_layers_are_not_direct_spans",
    parentMs: 0,
    childMs: directDerivedLayerEvents.length,
    ok: directDerivedLayerEvents.length === 0,
  });

  const unexpectedOfficialEvents = events.filter(
    (event) =>
      (event.category.startsWith("polynomial.") || event.category.startsWith("binding.")) &&
      !isLowestOperation(event.category) &&
      !middleOperationOrder.includes(event.category as (typeof middleOperationOrder)[number]) &&
      !topOperationOrder.includes(event.category as (typeof topOperationOrder)[number]),
  );
  checks.push({
    name: "official_event_categories_are_fixed_lowest_layer",
    parentMs: 0,
    childMs: unexpectedOfficialEvents.length,
    ok: unexpectedOfficialEvents.length === 0,
  });

  checks.push({
    name: "middle_combination_equals_lowest_sum",
    parentMs: operationDuration(middleOperationTotals, "polynomial.combination"),
    childMs:
      operationDuration(lowestOperationTotals, "polynomial.combination_without_multiplication") +
      operationDuration(lowestOperationTotals, "polynomial.combination_with_multiplication"),
    ok: durationsEqual(
      operationDuration(middleOperationTotals, "polynomial.combination"),
      operationDuration(lowestOperationTotals, "polynomial.combination_without_multiplication") +
        operationDuration(lowestOperationTotals, "polynomial.combination_with_multiplication"),
    ),
  });
  checks.push({
    name: "middle_division_equals_lowest_sum",
    parentMs: operationDuration(middleOperationTotals, "polynomial.division"),
    childMs:
      operationDuration(lowestOperationTotals, "polynomial.div_ruffini") +
      operationDuration(lowestOperationTotals, "polynomial.div_vanishing"),
    ok: durationsEqual(
      operationDuration(middleOperationTotals, "polynomial.division"),
      operationDuration(lowestOperationTotals, "polynomial.div_ruffini") +
        operationDuration(lowestOperationTotals, "polynomial.div_vanishing"),
    ),
  });
  checks.push({
    name: "middle_recursion_equals_lowest_recursion",
    parentMs: operationDuration(middleOperationTotals, "polynomial.recursion"),
    childMs: operationDuration(lowestOperationTotals, "polynomial.recursion"),
    ok: durationsEqual(
      operationDuration(middleOperationTotals, "polynomial.recursion"),
      operationDuration(lowestOperationTotals, "polynomial.recursion"),
    ),
  });
  checks.push({
    name: "middle_evaluation_equals_lowest_evaluation",
    parentMs: operationDuration(middleOperationTotals, "polynomial.evaluation"),
    childMs: operationDuration(lowestOperationTotals, "polynomial.evaluation"),
    ok: durationsEqual(
      operationDuration(middleOperationTotals, "polynomial.evaluation"),
      operationDuration(lowestOperationTotals, "polynomial.evaluation"),
    ),
  });
  checks.push({
    name: "middle_encode_equals_lowest_encode_sum",
    parentMs: operationDuration(middleOperationTotals, "encode"),
    childMs:
      operationDuration(lowestOperationTotals, "polynomial.encode") +
      operationDuration(lowestOperationTotals, "binding.encode"),
    ok: durationsEqual(
      operationDuration(middleOperationTotals, "encode"),
      operationDuration(lowestOperationTotals, "polynomial.encode") +
        operationDuration(lowestOperationTotals, "binding.encode"),
    ),
  });
  checks.push({
    name: "top_field_operations_equals_middle_sum",
    parentMs: operationDuration(topOperationTotals, "field.operations"),
    childMs:
      operationDuration(middleOperationTotals, "polynomial.combination") +
      operationDuration(middleOperationTotals, "polynomial.recursion") +
      operationDuration(middleOperationTotals, "polynomial.evaluation") +
      operationDuration(middleOperationTotals, "polynomial.division"),
    ok: durationsEqual(
      operationDuration(topOperationTotals, "field.operations"),
      operationDuration(middleOperationTotals, "polynomial.combination") +
        operationDuration(middleOperationTotals, "polynomial.recursion") +
        operationDuration(middleOperationTotals, "polynomial.evaluation") +
        operationDuration(middleOperationTotals, "polynomial.division"),
    ),
  });
  checks.push({
    name: "top_encode_equals_middle_encode",
    parentMs: operationDuration(topOperationTotals, "encode"),
    childMs: operationDuration(middleOperationTotals, "encode"),
    ok: durationsEqual(
      operationDuration(topOperationTotals, "encode"),
      operationDuration(middleOperationTotals, "encode"),
    ),
  });
  const executionBoundaryMs = executionBoundaryTotals.reduce((total, item) => total + item.durationMs, 0);
  checks.push({
    name: "execution_boundary_equals_total_wall",
    parentMs: totalWallMs,
    childMs: executionBoundaryMs,
    ok: durationsEqual(totalWallMs, executionBoundaryMs),
  });
  checks.push({
    name: "classified_operation_lte_total_wall",
    parentMs: totalWallMs,
    childMs: classifiedOperationMs,
    ok: classifiedOperationMs <= totalWallMs + timingToleranceMs,
  });
  checks.push({
    name: "unclassified_prover_time_non_negative",
    parentMs: 0,
    childMs: unclassifiedProverMs,
    ok: unclassifiedProverMs >= -timingToleranceMs,
  });

  return checks;
}

function durationsEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= timingToleranceMs;
}

function buildMarkdownTimingReport(report: TimingReport): string {
  const stageMs = Object.values(report.summary).reduce((total, item) => total + item.totalMs, 0);

  const lines: string[] = [];
  lines.push("# Backend-Wasm Prover Timing Report");
  lines.push("");
  lines.push("## Timing Boundaries");
  lines.push("");
  lines.push("- Timing is recorded as flat accumulated events, matching the native prover timing report model.");
  lines.push("- The reported operation taxonomy is fixed. Implementation method names are raw diagnostic event names only and are not reported as operation buckets.");
  lines.push("- Rows inside each reported layer are mutually exclusive.");
  lines.push("- The lowest layer is limited to the fixed production-like operation set listed in the lowest operation layer table.");
  lines.push("- Polynomial combination includes add, subtract, scale, fused scaled-add accumulation, coefficient rescale, and related shape/materialization work.");
  lines.push("- Fused polynomial combination work is measured at its production-like call-site boundary and is not decomposed into artificial helper rows.");
  lines.push("- The middle layer is limited to polynomial combination, recursion polynomial calculation, polynomial evaluation, polynomial division, and encode.");
  lines.push("- The top layer is limited to field operations and encode.");
  lines.push("- `polynomial.combination = polynomial.combination_without_multiplication + polynomial.combination_with_multiplication`.");
  lines.push("- `polynomial.recursion` is passed through from the lowest layer.");
  lines.push("- `polynomial.evaluation` is passed through from the lowest layer.");
  lines.push("- `polynomial.division = Ruffini division + vanishing division`.");
  lines.push("- `field.operations = polynomial.combination + polynomial.recursion + polynomial.evaluation + polynomial.division`.");
  lines.push("- `encode = polynomial.encode + binding.encode`.");
  lines.push("- `binding.encode` means the `buildProverBinding(...)` commitment work for `A_free`, `O_pub_free`, `O_mid`, and `O_prv`.");
  lines.push("- The execution boundary layer partitions total wall time and includes initialization, top-layer operation rows, stage gaps, binding encoding, I/O, verification, output, and external gaps.");
  lines.push("");
  lines.push("## Lowest Operation Layer");
  lines.push("");
  lines.push("| operation | total | count |");
  lines.push("| --- | ---: | ---: |");
  for (const total of report.lowestOperationTotals) {
    lines.push(`| ${total.operation} | ${formatDuration(total.durationMs)} | ${total.count} |`);
  }
  lines.push("");
  lines.push("## Middle Operation Layer");
  lines.push("");
  lines.push("| operation | definition | total | count |");
  lines.push("| --- | --- | ---: | ---: |");
  for (const total of report.middleOperationTotals) {
    lines.push(
      `| ${total.operation} | ${middleOperationDefinition(total.operation)} | ${formatDuration(total.durationMs)} | ${total.count} |`,
    );
  }
  lines.push("");
  lines.push("## Top Operation Layer");
  lines.push("");
  lines.push("| operation | definition | total | count |");
  lines.push("| --- | --- | ---: | ---: |");
  for (const total of report.topOperationTotals) {
    lines.push(
      `| ${total.operation} | ${topOperationDefinition(total.operation)} | ${formatDuration(total.durationMs)} | ${total.count} |`,
    );
  }
  lines.push("");
  lines.push("## Execution Boundary Summary");
  lines.push("");
  lines.push("| row | definition | total | count |");
  lines.push("| --- | --- | ---: | ---: |");
  for (const total of report.executionBoundaryTotals) {
    lines.push(
      `| ${total.operation} | ${executionBoundaryDefinition(total.operation)} | ${formatDuration(total.durationMs)} | ${total.count} |`,
    );
  }
  lines.push("");
  lines.push("## Execution Totals");
  lines.push("");
  lines.push("| row | total |");
  lines.push("| --- | ---: |");
  lines.push(`| prover stage total | ${formatDuration(stageMs)} |`);
  lines.push(`| classified operation time | ${formatDuration(report.classifiedOperationMs)} |`);
  lines.push(`| unclassified prover time | ${formatDuration(report.unclassifiedProverMs)} |`);
  lines.push(`| total wall | ${formatDuration(report.totalWallMs)} |`);
  lines.push("");
  lines.push("## Invariant Checks");
  lines.push("");
  lines.push("| check | reference | observed | status |");
  lines.push("| --- | ---: | ---: | --- |");
  for (const check of report.invariantChecks) {
    lines.push(
      `| ${check.name} | ${formatDuration(check.parentMs)} | ${formatDuration(check.childMs)} | ${check.ok ? "ok" : "failed"} |`,
    );
  }
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function operationDuration(totals: readonly OperationTimingTotal[], operation: string): number {
  return totals.find((total) => total.operation === operation)?.durationMs ?? 0;
}

function operationCount(totals: readonly OperationTimingTotal[], operation: string): number {
  return totals.find((total) => total.operation === operation)?.count ?? 0;
}

function categoryDuration(totals: readonly TimingTotal[], category: string): number {
  return totals.find((total) => total.category === category)?.durationMs ?? 0;
}

function categoryCount(totals: readonly TimingTotal[], category: string): number {
  return totals.find((total) => total.category === category)?.count ?? 0;
}

function shapeSize(label: string, xSize: number, ySize: number): SizeInfo {
  return { label, dims: [xSize, ySize] };
}

function formatDuration(milliseconds: number): string {
  const normalized = Math.abs(milliseconds) < 0.5 ? 0 : milliseconds;
  if (Math.abs(normalized) < 1000) {
    return `${normalized.toFixed(0)} ms`;
  }

  return `${(normalized / 1000).toFixed(2)} s`;
}

function middleOperationDefinition(operation: string): string {
  switch (operation) {
    case "polynomial.combination":
      return "polynomial.combination_without_multiplication + polynomial.combination_with_multiplication";
    case "polynomial.recursion":
      return "lowest-layer polynomial.recursion";
    case "polynomial.evaluation":
      return "lowest-layer polynomial.evaluation";
    case "polynomial.division":
      return "polynomial.div_ruffini + polynomial.div_vanishing";
    case "encode":
      return "polynomial.encode + binding.encode";
    default:
      return "";
  }
}

function topOperationDefinition(operation: string): string {
  switch (operation) {
    case "field.operations":
      return "polynomial.combination + polynomial.recursion + polynomial.evaluation + polynomial.division";
    case "encode":
      return "polynomial.encode + binding.encode";
    default:
      return "";
  }
}

function executionBoundaryDefinition(operation: string): string {
  switch (operation) {
    case "init":
      return "witness polynomial construction and prover state construction";
    case "field.operations":
      return "top-layer field operation total";
    case "encode":
      return "polynomial commitment encoding plus binding commitment encoding";
    case "stage.unclassified":
      return "prover stage wall time not assigned to field.operations or polynomial.encode";
    case "io":
      return "runtime binary input and generated artifact loading";
    case "verify":
      return "generated proof verification check";
    case "output":
      return "verifier proof artifact creation";
    case "external.unclassified":
      return "root wall time not assigned to another execution-boundary row";
    default:
      return "";
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
