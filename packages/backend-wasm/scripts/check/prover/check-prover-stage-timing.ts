import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BinaryArtifactFileKind,
  BivariatePolynomialBuffer,
  RollingKeccakTranscript,
  RuntimeArtifactFileRole,
  buildWitnessPolynomials,
  createCurveRuntime,
  createProverState,
  createVerifierProofArtifactFromProverOutput,
  decodeVerifierBinaryResult,
  loadProverInputFromRuntimeBundles,
  loadRuntimeArtifactFile,
  parseRuntimeArtifactBundleManifest,
  verifyBinary,
  type CurveRuntime,
  type FieldElement,
  type ProverCrsRuntime,
  type ProverRuntimeInput,
  type ProverState,
  type RuntimeArtifactBundleManifest,
} from "../../../src/index.js";
import {
  buildProverBinding,
  encodePolynomialBufferWithSigma1,
  type InitialRelationComputation,
  type InitialRelationCommitments,
} from "../../../src/prover/internal/initial-relation.js";
import type { RecursionComputation } from "../../../src/prover/internal/recursion-commitment.js";
import { type CopyQuotientComputation, type CopyQuotientCommitments } from "../../../src/prover/internal/copy-quotient.js";
import type { ChallengeEvaluations } from "../../../src/prover/internal/challenge-evaluations.js";
import {
  type OpeningCommitmentsComputation,
  type OpeningDebugCommitments,
  type OpeningProofCommitments,
} from "../../../src/prover/internal/opening-commitments.js";
import {
  buildLagrangeK0,
  buildLagrangeKl,
  constantPolynomialBuffer,
  computeRecursionEvalsBuffer,
  lowDegreeXTimesVanishingBuffer,
  lowDegreeYTimesVanishingBuffer,
  mulByLinearX,
  mulByLinearY,
  mulByOneMinusX,
  mulByTerm9,
  mulByXMinusOne,
  multiplyPairWithSharedRight,
} from "../../../src/prover/internal/polynomial-ops.js";

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
  "polynomial.add",
  "polynomial.sub",
  "polynomial.mul",
  "polynomial.div_ruffini",
  "polynomial.div_vanishing",
  "polynomial.scale",
  "polynomial.encode",
] as const;

const middleOperationOrder = ["polynomial.combine", "polynomial.division", "polynomial.encode"] as const;
const topOperationOrder = ["field.operations", "polynomial.encode"] as const;
type LowestOperation = (typeof lowestOperationOrder)[number];
const unclassifiedProverCategory = "unclassified.prover";
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

function polynomialAdd(
  label: string,
  left: BivariatePolynomialBuffer,
  right: BivariatePolynomialBuffer,
): BivariatePolynomialBuffer {
  return polynomialOperationSync("polynomial.add", label, () => left.add(right), [
    shapeSize("left", left.xSize, left.ySize),
    shapeSize("right", right.xSize, right.ySize),
  ]);
}

function polynomialSub(
  label: string,
  left: BivariatePolynomialBuffer,
  right: BivariatePolynomialBuffer,
): BivariatePolynomialBuffer {
  return polynomialOperationSync("polynomial.sub", label, () => left.sub(right), [
    shapeSize("left", left.xSize, left.ySize),
    shapeSize("right", right.xSize, right.ySize),
  ]);
}

function polynomialScale(
  label: string,
  polynomial: BivariatePolynomialBuffer,
  scalar: FieldElement,
): BivariatePolynomialBuffer {
  return polynomialOperationSync("polynomial.scale", label, () => polynomial.scale(scalar), [
    shapeSize("polynomial", polynomial.xSize, polynomial.ySize),
  ]);
}

function polynomialScaleX(
  label: string,
  polynomial: BivariatePolynomialBuffer,
  scalar: FieldElement,
): BivariatePolynomialBuffer {
  return unclassifiedProverOperationSync(label, () => polynomial.scaleCoeffsX(scalar), [
    shapeSize("polynomial", polynomial.xSize, polynomial.ySize),
  ]);
}

function polynomialScaleY(
  label: string,
  polynomial: BivariatePolynomialBuffer,
  scalar: FieldElement,
): BivariatePolynomialBuffer {
  return unclassifiedProverOperationSync(label, () => polynomial.scaleCoeffsY(scalar), [
    shapeSize("polynomial", polynomial.xSize, polynomial.ySize),
  ]);
}

async function polynomialMul(
  label: string,
  left: BivariatePolynomialBuffer,
  right: BivariatePolynomialBuffer,
): Promise<BivariatePolynomialBuffer> {
  return polynomialOperation("polynomial.mul", label, () => left.mul(right), [
    shapeSize("left", left.xSize, left.ySize),
    shapeSize("right", right.xSize, right.ySize),
  ]);
}

function polynomialMulSpecial(
  label: string,
  callback: () => BivariatePolynomialBuffer,
  sizes: readonly SizeInfo[] = [],
): BivariatePolynomialBuffer {
  return polynomialOperationSync("polynomial.mul", label, callback, sizes);
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
    async () => Promise.resolve(polynomial.divByVanishingOpt(xDegree, yDegree)),
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
    async () => Promise.resolve(polynomial.divByRuffini(xPoint, yPoint)),
    [shapeSize("polynomial", polynomial.xSize, polynomial.ySize)],
  );
}

function polynomialDivRuffiniSync(
  label: string,
  polynomial: BivariatePolynomialBuffer,
  xPoint: FieldElement,
  yPoint: FieldElement,
): { readonly quotientX: BivariatePolynomialBuffer; readonly quotientY: BivariatePolynomialBuffer } {
  return polynomialOperationSync("polynomial.div_ruffini", label, () => polynomial.divByRuffini(xPoint, yPoint), [
    shapeSize("polynomial", polynomial.xSize, polynomial.ySize),
  ]);
}

function unclassifiedProverOperationSync<T>(
  label: string,
  callback: () => T,
  sizes: readonly SizeInfo[] = [],
): T {
  return timing.spanSync(label, unclassifiedProverCategory, callback, sizes);
}

function polynomialLinearCombination(
  label: string,
  field: CurveRuntime["Fr"],
  terms: readonly (readonly [FieldElement, BivariatePolynomialBuffer])[],
): BivariatePolynomialBuffer {
  let xSize = 1;
  let ySize = 1;
  let firstNonZeroTerm: number | undefined;
  for (let index = 0; index < terms.length; index += 1) {
    const [scalar, polynomial] = terms[index];
    if (polynomial.field !== field) {
      throw new Error("Linear combination terms must use the requested field.");
    }
    xSize = Math.max(xSize, polynomial.xSize);
    ySize = Math.max(ySize, polynomial.ySize);
    if (firstNonZeroTerm === undefined && !field.isZero(scalar)) {
      firstNonZeroTerm = index;
    }
  }

  if (firstNonZeroTerm === undefined) {
    return BivariatePolynomialBuffer.zero(field).resize(xSize, ySize);
  }

  const [firstScalar, firstPolynomial] = terms[firstNonZeroTerm];
  const accumulator = scaleTermIntoShapeForTiming(`${label}.term${firstNonZeroTerm}`, field, firstPolynomial, firstScalar, xSize, ySize);
  for (let index = firstNonZeroTerm + 1; index < terms.length; index += 1) {
    const [scalar, polynomial] = terms[index];
    if (field.isZero(scalar)) {
      continue;
    }

    if (field.eq(scalar, field.one)) {
      polynomialOperationSync("polynomial.add", `${label}.term${index}.add`, () =>
        accumulator.addScaledPrefixAssign(polynomial, scalar),
        [
          shapeSize("accumulator", accumulator.xSize, accumulator.ySize),
          shapeSize("term", polynomial.xSize, polynomial.ySize),
        ],
      );
    } else if (field.eq(scalar, field.neg(field.one))) {
      polynomialOperationSync("polynomial.sub", `${label}.term${index}.sub`, () =>
        accumulator.addScaledPrefixAssign(polynomial, scalar),
        [
          shapeSize("accumulator", accumulator.xSize, accumulator.ySize),
          shapeSize("term", polynomial.xSize, polynomial.ySize),
        ],
      );
    } else {
      const scaledTerm = scaleTermIntoShapeForTiming(
        `${label}.term${index}.scale`,
        field,
        polynomial,
        scalar,
        accumulator.xSize,
        accumulator.ySize,
      );
      polynomialOperationSync("polynomial.add", `${label}.term${index}.add_scaled`, () =>
        accumulator.addScaledPrefixAssign(scaledTerm, field.one),
        [
          shapeSize("accumulator", accumulator.xSize, accumulator.ySize),
          shapeSize("term", scaledTerm.xSize, scaledTerm.ySize),
        ],
      );
    }
  }

  return accumulator;
}

function scaleTermIntoShapeForTiming(
  label: string,
  field: CurveRuntime["Fr"],
  polynomial: BivariatePolynomialBuffer,
  scalar: FieldElement,
  xSize: number,
  ySize: number,
): BivariatePolynomialBuffer {
  if (field.eq(scalar, field.one)) {
    return scaleTermIntoShape(field, polynomial, scalar, xSize, ySize);
  }

  return polynomialOperationSync("polynomial.scale", label, () => scaleTermIntoShape(field, polynomial, scalar, xSize, ySize), [
    shapeSize("polynomial", polynomial.xSize, polynomial.ySize),
    shapeSize("output", xSize, ySize),
  ]);
}

function scaleTermIntoShape(
  field: CurveRuntime["Fr"],
  polynomial: BivariatePolynomialBuffer,
  scalar: FieldElement,
  xSize: number,
  ySize: number,
): BivariatePolynomialBuffer {
  const output = field.createZeroBuffer(xSize * ySize);
  const elementBytes = field.byteLength;
  const targetRowBytes = ySize * elementBytes;
  const sourceRowBytes = polynomial.ySize * elementBytes;
  const isOne = field.eq(scalar, field.one);
  const isMinusOne = field.eq(scalar, field.neg(field.one));

  for (let x = 0; x < polynomial.xSize; x += 1) {
    const targetRowOffset = x * targetRowBytes;
    const sourceRowOffset = x * sourceRowBytes;
    for (let yOffset = 0; yOffset < sourceRowBytes; yOffset += elementBytes) {
      const targetOffset = targetRowOffset + yOffset;
      const source = polynomial.coefficients.subarray(sourceRowOffset + yOffset, sourceRowOffset + yOffset + elementBytes);
      if (isOne) {
        output.set(source, targetOffset);
      } else if (isMinusOne) {
        output.set(field.neg(source), targetOffset);
      } else {
        output.set(field.mul(source, scalar), targetOffset);
      }
    }
  }

  return createPolynomialFromTimingBuffer(field, output, xSize, ySize);
}

function createPolynomialFromTimingBuffer(
  field: CurveRuntime["Fr"],
  coefficients: Uint8Array,
  xSize: number,
  ySize: number,
): BivariatePolynomialBuffer {
  const constructor = BivariatePolynomialBuffer as unknown as {
    fromOwnedBuffer?: (field: CurveRuntime["Fr"], coefficients: Uint8Array, xSize: number, ySize: number) => BivariatePolynomialBuffer;
    fromBuffer: (field: CurveRuntime["Fr"], coefficients: Uint8Array, xSize: number, ySize: number) => BivariatePolynomialBuffer;
  };

  return constructor.fromOwnedBuffer?.(field, coefficients, xSize, ySize) ?? constructor.fromBuffer(field, coefficients, xSize, ySize);
}

async function main(): Promise<void> {
  const runtimeDir = path.resolve("fixtures/small/runtime");
  const runtime = await createCurveRuntime();

  try {
    const proverProofWitnessInput = await readPreparedRuntimeManifest(
      runtimeDir,
      "prover-proof-witness-input/manifest.json",
    );
    const proverCrsPreparedData = await readPreparedRuntimeManifest(
      runtimeDir,
      "prover-crs-prepared-data/manifest.json",
    );
    const verifierProofInput = await readPreparedRuntimeManifest(runtimeDir, "verifier-proof-input/manifest.json");
    const verifierSetupInput = await readPreparedRuntimeManifest(runtimeDir, "verifier-setup-input/manifest.json");

    const proverInput = await timing.span("load prover runtime bundles", "io", () =>
      loadProverInputFromRuntimeBundles(
        runtime,
        proverProofWitnessInput,
        proverCrsPreparedData,
        (artifactPath) => readPreparedRuntimeFile(runtimeDir, artifactPath),
      ),
    );
    const generatedProof = await provePreparedInputWithStrictTimings(runtime, proverInput);

    await timing.span("load generated proof artifact", "io", () => loadRuntimeArtifactFile(generatedProof)).then(
      (artifact) => {
        if (artifact.kind !== BinaryArtifactFileKind.VerifierProof) {
          throw new Error(`Prover output artifact kind mismatch: ${artifact.kind}.`);
        }
      },
    );

    const verificationResult = await timing.span("verify generated proof", "verify", () =>
      verifyBinary(
        runtime,
        verifierProofInput,
        verifierSetupInput,
        createGeneratedProofResolver(runtimeDir, verifierProofInput, generatedProof),
        {
          randomScalar: () => runtime.Fr.one,
        },
      ),
    );
    const valid = decodeVerifierBinaryResult(verificationResult);

    if (!valid) {
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
  const binding = await timing.span("build prover binding", "encode", () =>
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
  const evaluations = timing.spanSync("prove3", "stage", () =>
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
      evaluations,
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
  const p0W = unclassifiedProverOperationSync(
    "prove0.p0XY.resize_w",
    () => state.witness.wXY.resize(p0Product.xSize, p0Product.ySize),
    [
      shapeSize("source", state.witness.wXY.xSize, state.witness.wXY.ySize),
      shapeSize("output", p0Product.xSize, p0Product.ySize),
    ],
  );
  const p0XY = polynomialOperationSync("polynomial.sub", "prove0.p0XY.sub_w", () => {
    p0Product.subAssign(p0W);
    return p0Product;
  }, [shapeSize("product", p0Product.xSize, p0Product.ySize)]);
  const { quotientX: q0XY, quotientY: q1XY } = await polynomialDivVanishing(
    "prove0.q0q1",
    p0XY,
    state.setup.n,
    state.setup.s_max,
  );

  const rW_X = BivariatePolynomialBuffer.fromCoeffs(field, state.mixer.rW_X, state.mixer.rW_X.length, 1);
  const rW_Y = BivariatePolynomialBuffer.fromCoeffs(field, state.mixer.rW_Y, 1, state.mixer.rW_Y.length);
  const UXY = polynomialLinearCombination(
    "prove0.U",
    field,
    [
      [field.one, state.witness.uXY],
      [state.mixer.rU_X, state.instance.tN],
      [state.mixer.rU_Y, state.instance.tSMax],
    ],
  );
  const VXY = polynomialLinearCombination(
    "prove0.V",
    field,
    [
      [field.one, state.witness.vXY],
      [state.mixer.rV_X, state.instance.tN],
      [state.mixer.rV_Y, state.instance.tSMax],
    ],
  );
  const wZkX = polynomialMulSpecial("prove0.W_zk.x_vanishing_mul", () =>
    lowDegreeXTimesVanishingBuffer(field, state.mixer.rW_X, state.setup.n),
  );
  const wZkY = polynomialMulSpecial("prove0.W_zk.y_vanishing_mul", () =>
    lowDegreeYTimesVanishingBuffer(field, state.mixer.rW_Y, state.setup.s_max),
  );
  const wZk = polynomialLinearCombination("prove0.W_zk", field, [
    [field.one, wZkX],
    [field.one, wZkY],
  ]);
  const WXY = polynomialLinearCombination(
    "prove0.W",
    field,
    [
      [field.one, state.witness.wXY],
      [field.one, wZk],
    ],
  );
  const Q_AX_XY = polynomialLinearCombination(
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
  const Q_AY_XY = polynomialLinearCombination(
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
  const termBZkX = polynomialMulSpecial("prove0.term_B_zk.x_vanishing_mul", () =>
    lowDegreeXTimesVanishingBuffer(field, state.mixer.rB_X, state.setup.l_D - state.setup.l),
  );
  const termBZkY = polynomialMulSpecial("prove0.term_B_zk.y_vanishing_mul", () =>
    lowDegreeYTimesVanishingBuffer(field, state.mixer.rB_Y, state.setup.s_max),
  );
  const termBZk = polynomialLinearCombination("prove0.term_B_zk", field, [
    [field.one, termBZkX],
    [field.one, termBZkY],
  ]);
  const BXY = polynomialLinearCombination(
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
  const fXY = polynomialLinearCombination("prove1.fXY", field, [
    [field.one, state.witnessBuffers.bXY],
    [thetas[0], state.instanceBuffers.s0XY],
    [thetas[1], state.instanceBuffers.s1XY],
    [field.one, theta2],
  ]);
  const gXY = polynomialLinearCombination("prove1.gXY", field, [
    [field.one, state.witnessBuffers.bXY],
    [thetas[0], xMonomial],
    [thetas[1], yMonomial],
    [field.one, theta2],
  ]);
  const fXYEvals = await fXY.resize(mI, sMax).toRouEvals();
  const gXYEvals = await gXY.resize(mI, sMax).toRouEvals();
  const rXYEvals = computeRecursionEvalsBuffer(field, gXYEvals, fXYEvals, mI, sMax);
  const rXY = await BivariatePolynomialBuffer.fromRouEvals(field, rXYEvals, mI, sMax);
  const RXY = polynomialLinearCombination("prove1.R", field, [
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
  const rOmegaX = polynomialScaleX("prove2.r_omega_x", rXY, field.inv(omegaMI));
  const rOmegaXOmegaY = polynomialScaleY("prove2.r_omega_x_omega_y", rOmegaX, field.inv(omegaSMax));
  const xMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 2, 1);
  const yMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 1, 2);
  const theta2 = constantPolynomialBuffer(field, thetas[2]);
  const fXY = polynomialLinearCombination(
    "prove2.fXY",
    field,
    [
      [field.one, state.witness.bXY],
      [thetas[0], state.instance.s0XY],
      [thetas[1], state.instance.s1XY],
      [field.one, theta2],
    ],
  );
  const gXY = polynomialLinearCombination(
    "prove2.gXY",
    field,
    [
      [field.one, state.witness.bXY],
      [thetas[0], xMonomial],
      [thetas[1], yMonomial],
      [field.one, theta2],
    ],
  );
  const lagrangeKlXY = await polynomialOperation("polynomial.mul", "prove2.lagrange_KL", () =>
    buildLagrangeKl(field, mI, sMax),
  );
  const lagrangeK0XY = await buildLagrangeK0(field, mI);
  const rGXY = await polynomialMul("prove2.rG", rXY, gXY);
  const [rOmegaXFXY, rOmegaXOmegaYFXY] = await polynomialOperation(
    "polynomial.mul",
    "prove2.shared_f_products",
    () => multiplyPairWithSharedRight(rOmegaX, rOmegaXOmegaY, fXY),
  );
  const p1Numerator = polynomialSub("prove2.p1.sub_one", rXY, constantPolynomialBuffer(field, field.one));
  const p1XY = await polynomialMul("prove2.p1.mul_lagrange_KL", p1Numerator, lagrangeKlXY);
  const p2Input = polynomialSub("prove2.p2_input", rGXY, rOmegaXFXY);
  const p2XY = polynomialMulSpecial("prove2.p2.mul_x_minus_one", () => mulByXMinusOne(p2Input), [
    shapeSize("polynomial", p2Input.xSize, p2Input.ySize),
  ]);
  const p3Input = polynomialSub("prove2.p3.sub", rGXY, rOmegaXOmegaYFXY);
  const p3XY = await polynomialMul("prove2.p3.mul_lagrange_K0", lagrangeK0XY, p3Input);
  const pCombined = polynomialLinearCombination(
    "prove2.p_comb",
    field,
    [
      [field.one, p1XY],
      [kappa0, p2XY],
      [kappa0Sq, p3XY],
    ],
  );
  const { quotientX: q2XY, quotientY: q3XY } = await polynomialDivVanishing("prove2.qCXqCY", pCombined, mI, sMax);
  const rD1 = polynomialSub("prove2.rD1", rXY, rOmegaX);
  const rD2 = polynomialSub("prove2.rD2", rXY, rOmegaXOmegaY);
  const gD = polynomialSub("prove2.gD", gXY, fXY);
  const qCxTerm2Linear = polynomialMulSpecial("prove2.Q_CX.term2.linear_x", () => mulByLinearX(rD1, state.mixer.rB_X));
  const qCxTerm2Scale = polynomialScale("prove2.Q_CX.term2.scale_gD", gD, state.mixer.rR_X);
  const qCxTerm2Sum = polynomialAdd("prove2.Q_CX.term2.add", qCxTerm2Linear, qCxTerm2Scale);
  const qCxTerm2 = polynomialMulSpecial(
    "prove2.Q_CX.term2.mul_x_minus_one",
    () => mulByXMinusOne(qCxTerm2Sum),
    [shapeSize("polynomial", qCxTerm2Sum.xSize, qCxTerm2Sum.ySize)],
  );
  const qCxTerm3Linear = polynomialMulSpecial("prove2.Q_CX.term3.linear_x", () => mulByLinearX(rD2, state.mixer.rB_X));
  const qCxTerm3Scale = polynomialScale("prove2.Q_CX.term3.scale_gD", gD, state.mixer.rR_X);
  const qCxTerm3Sum = polynomialAdd("prove2.Q_CX.term3.add", qCxTerm3Linear, qCxTerm3Scale);
  const qCxTerm3 = await polynomialMul("prove2.Q_CX.term3.mul_lagrange_K0", lagrangeK0XY, qCxTerm3Sum);
  const qCxXY = polynomialLinearCombination(
    "prove2.Q_CX",
    field,
    [
      [field.one, q2XY],
      [state.mixer.rR_X, lagrangeKlXY],
      [kappa0, qCxTerm2],
      [kappa0Sq, qCxTerm3],
    ],
  );
  const qCyTerm2Linear = polynomialMulSpecial("prove2.Q_CY.term2.linear_y", () => mulByLinearY(rD1, state.mixer.rB_Y));
  const qCyTerm2Scale = polynomialScale("prove2.Q_CY.term2.scale_gD", gD, state.mixer.rR_Y);
  const qCyTerm2Sum = polynomialAdd("prove2.Q_CY.term2.add", qCyTerm2Linear, qCyTerm2Scale);
  const qCyTerm2 = polynomialMulSpecial(
    "prove2.Q_CY.term2.mul_x_minus_one",
    () => mulByXMinusOne(qCyTerm2Sum),
    [shapeSize("polynomial", qCyTerm2Sum.xSize, qCyTerm2Sum.ySize)],
  );
  const qCyTerm3Linear = polynomialMulSpecial("prove2.Q_CY.term3.linear_y", () => mulByLinearY(rD2, state.mixer.rB_Y));
  const qCyTerm3Scale = polynomialScale("prove2.Q_CY.term3.scale_gD", gD, state.mixer.rR_Y);
  const qCyTerm3Sum = polynomialAdd("prove2.Q_CY.term3.add", qCyTerm3Linear, qCyTerm3Scale);
  const qCyTerm3 = await polynomialMul("prove2.Q_CY.term3.mul_lagrange_K0", lagrangeK0XY, qCyTerm3Sum);
  const qCyXY = polynomialLinearCombination(
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
  readonly evaluations: ChallengeEvaluations;
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
    evaluations,
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
  const tNEval = state.instance.tN.eval(chi, field.one);
  const tSMaxEval = state.instance.tSMax.eval(field.one, zeta);
  const smallVEval = state.witness.vXY.eval(chi, zeta);
  const rW_X = BivariatePolynomialBuffer.fromCoeffs(field, state.mixer.rW_X, state.mixer.rW_X.length, 1);
  const rW_Y = BivariatePolynomialBuffer.fromCoeffs(field, state.mixer.rW_Y, 1, state.mixer.rW_Y.length);
  const VXY = polynomialLinearCombination(
    "prove4.V",
    field,
    [
      [field.one, state.witness.vXY],
      [state.mixer.rV_X, state.instance.tN],
      [state.mixer.rV_Y, state.instance.tSMax],
    ],
  );
  const vMinusEval = polynomialSub("prove4.Pi_A.V_minus_eval", VXY, constantPolynomialBuffer(field, evaluations.V_eval));
  const pAXY = polynomialLinearCombination(
    "prove4.Pi_A",
    field,
    [
      [kappa1, vMinusEval],
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
  const piADivision = await polynomialDivRuffini("prove4.Pi_A", pAXY, chi, zeta);
  const Pi_AX = await encodePolynomialBufferWithSigma1Timed(runtime, crs, state.setup, piADivision.quotientX, "prove4.Pi_AX");
  const Pi_AY = await encodePolynomialBufferWithSigma1Timed(runtime, crs, state.setup, piADivision.quotientY, "prove4.Pi_AY");
  const RXY = polynomialLinearCombination(
    "prove4.R",
    field,
    [
      [field.one, rXY],
      [state.mixer.rR_X, state.instance.tMi],
      [state.mixer.rR_Y, state.instance.tSMax],
    ],
  );
  const mNumerator = polynomialSub(
    "prove4.M.R_minus_eval",
    RXY,
    constantPolynomialBuffer(field, evaluations.R_omegaX_eval),
  );
  const mDivision = await polynomialDivRuffini("prove4.M", mNumerator, field.mul(omegaMIInv, chi), zeta);
  const M_X = await encodePolynomialBufferWithSigma1Timed(runtime, crs, state.setup, mDivision.quotientX, "prove4.M_X");
  const M_Y = await encodePolynomialBufferWithSigma1Timed(runtime, crs, state.setup, mDivision.quotientY, "prove4.M_Y");
  const nNumerator = polynomialSub(
    "prove4.N.R_minus_eval",
    RXY,
    constantPolynomialBuffer(field, evaluations.R_omegaX_omegaY_eval),
  );
  const nDivision = await polynomialDivRuffini(
    "prove4.N",
    nNumerator,
    field.mul(omegaMIInv, chi),
    field.mul(omegaSMaxInv, zeta),
  );
  const N_X = await encodePolynomialBufferWithSigma1Timed(runtime, crs, state.setup, nDivision.quotientX, "prove4.N_X");
  const N_Y = await encodePolynomialBufferWithSigma1Timed(runtime, crs, state.setup, nDivision.quotientY, "prove4.N_Y");
  const { Pi_CX, Pi_CY } = await buildCopyOpeningsTimed({
    runtime,
    crs,
    state,
    rXY,
    RXY,
    initialRelation: prove0,
    copyQuotient: prove2,
    evaluations,
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
  const aEval = state.instance.aFreeX.eval(chi, zeta);
  const piBNumerator = polynomialSub(
    "prove4.Pi_B.A_free_minus_eval",
    state.instance.aFreeX,
    constantPolynomial(field, aEval),
  );
  const piBDivision = polynomialDivRuffiniSync("prove4.Pi_B", piBNumerator, chi, zeta);
  const Pi_B = runtime.G1.mulScalar(
    await encodePolynomialBufferWithSigma1Timed(runtime, crs, state.setup, piBDivision.quotientX, "prove4.Pi_B"),
    kappa1Fourth,
  );
  const Pi_X = runtime.G1.add(runtime.G1.add(Pi_AX, Pi_CX), Pi_B);
  const Pi_Y = runtime.G1.add(Pi_AY, Pi_CY);

  return {
    commitments: {
      Pi_X,
      Pi_Y,
      M_X,
      M_Y,
      N_X,
      N_Y,
    },
    debug: {
      Pi_AX,
      Pi_AY,
      Pi_CX,
      Pi_CY,
      Pi_B,
      M_X,
      M_Y,
      N_X,
      N_Y,
    },
  };
}

async function buildCopyOpeningsTimed(input: {
  readonly runtime: CurveRuntime;
  readonly crs: ProverCrsRuntime;
  readonly state: ProverState;
  readonly rXY: BivariatePolynomialBuffer;
  readonly RXY: BivariatePolynomialBuffer;
  readonly initialRelation: InitialRelationComputation;
  readonly copyQuotient: CopyQuotientComputation;
  readonly evaluations: ChallengeEvaluations;
  readonly thetas: readonly FieldElement[];
  readonly kappa0: FieldElement;
  readonly kappa0Sq: FieldElement;
  readonly kappa1Sq: FieldElement;
  readonly kappa1Cube: FieldElement;
  readonly chi: FieldElement;
  readonly zeta: FieldElement;
  readonly omegaMIInv: FieldElement;
  readonly omegaSMaxInv: FieldElement;
}): Promise<{ readonly Pi_CX: Uint8Array; readonly Pi_CY: Uint8Array }> {
  const {
    runtime,
    crs,
    state,
    rXY,
    RXY,
    initialRelation: prove0,
    copyQuotient: prove2,
    evaluations,
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
  const rOmegaX = polynomialScaleX("prove4.r_omega_x", rXY, omegaMIInv);
  const rOmegaXOmegaY = polynomialScaleY("prove4.r_omega_x_omega_y", rOmegaX, omegaSMaxInv);
  const xMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 2, 1);
  const yMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 1, 2);
  const theta2 = constantPolynomialBuffer(field, thetas[2]);
  const fXY = polynomialLinearCombination(
    "prove4.fXY",
    field,
    [
      [field.one, state.witness.bXY],
      [thetas[0], state.instance.s0XY],
      [thetas[1], state.instance.s1XY],
      [field.one, theta2],
    ],
  );
  const gXY = polynomialLinearCombination(
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
  const lagrangeK0XY = await buildLagrangeK0(field, mI);
  const lagrangeK0Eval = lagrangeK0XY.eval(chi, zeta);
  const smallREval = rXY.eval(chi, zeta);
  const smallROmegaXEval = rOmegaX.eval(chi, zeta);
  const smallROmegaXOmegaYEval = rOmegaXOmegaY.eval(chi, zeta);
  const term5 = polynomialLinearCombination(
    "prove4.term5",
    field,
    [
      [smallREval, gXY],
      [field.neg(smallROmegaXEval), fXY],
    ],
  );
  const term6 = polynomialLinearCombination(
    "prove4.term6",
    field,
    [
      [smallREval, gXY],
      [field.neg(smallROmegaXOmegaYEval), fXY],
    ],
  );
  const pCXY = polynomialLinearCombination(
    "prove4.pC",
    field,
    [
      [field.sub(smallREval, field.one), prove2.lagrangeKlXY],
      [field.mul(kappa0, field.sub(chi, field.one)), term5],
      [field.mul(kappa0Sq, lagrangeK0Eval), term6],
      [field.neg(tMiEval), prove2.q2XY],
      [field.neg(tSMaxEval), prove2.q3XY],
    ],
  );
  const rD1 = polynomialSub("prove4.rD1", rXY, rOmegaX);
  const rD2 = polynomialSub("prove4.rD2", rXY, rOmegaXOmegaY);
  const rD1Eval = rD1.eval(chi, zeta);
  const rD2Eval = rD2.eval(chi, zeta);
  const gMinusF = polynomialSub("prove4.gMinusF", gXY, fXY);
  const term10Scale = field.add(field.mul(state.mixer.rR_X, tMiEval), field.mul(state.mixer.rR_Y, tSMaxEval));
  const term10 = polynomialScale("prove4.term10", gMinusF, term10Scale);
  const lhsZk1 = (() => {
    const rD1Term9 = polynomialMulSpecial("prove4.LHS_zk1.term9", () =>
      mulByTerm9(rD1, state.mixer.rB_X, state.mixer.rB_Y, tMiEval, tSMaxEval),
    );
    const rD1Term9PlusTerm10 = polynomialAdd("prove4.LHS_zk1.term9_plus_term10", rD1Term9, term10);
    const oneMinusX = polynomialMulSpecial("prove4.LHS_zk1.one_minus_x", () =>
      mulByOneMinusX(rD1Term9PlusTerm10),
      [shapeSize("polynomial", rD1Term9PlusTerm10.xSize, rD1Term9PlusTerm10.ySize)],
    );
    return polynomialLinearCombination("prove4.LHS_zk1", field, [
      [field.mul(field.sub(chi, field.one), rD1Eval), prove0.termBZk],
      [field.one, oneMinusX],
      [field.sub(chi, field.one), term10],
    ]);
  })();
  const lhsZk2 = await (async () => {
    const rD2Term9 = polynomialMulSpecial("prove4.LHS_zk2.term9", () =>
      mulByTerm9(rD2, state.mixer.rB_X, state.mixer.rB_Y, tMiEval, tSMaxEval),
    );
    const rD2Term9PlusTerm10 = polynomialAdd("prove4.LHS_zk2.term9_plus_term10", rD2Term9, term10);
    const lhsZk2Product = await polynomialMul("prove4.LHS_zk2.mul_lagrange_K0", lagrangeK0XY, rD2Term9PlusTerm10);
    return polynomialLinearCombination("prove4.LHS_zk2", field, [
      [field.mul(lagrangeK0Eval, rD2Eval), prove0.termBZk],
      [lagrangeK0Eval, term10],
      [field.neg(field.one), lhsZk2Product],
    ]);
  })();
  const rMinusEval = polynomialSub("prove4.R_minus_eval", RXY, constantPolynomialBuffer(field, evaluations.R_eval));
  const lhsForCopy = polynomialLinearCombination(
    "prove4.LHS_for_copy",
    field,
    [
      [kappa1Sq, pCXY],
      [field.mul(kappa1Sq, kappa0), lhsZk1],
      [field.mul(field.mul(kappa1Sq, kappa0Sq), field.one), lhsZk2],
      [kappa1Cube, rMinusEval],
    ],
  );
  const division = await polynomialDivRuffini("prove4.Pi_C", lhsForCopy, chi, zeta);

  return {
    Pi_CX: await encodePolynomialBufferWithSigma1Timed(runtime, crs, state.setup, division.quotientX, "prove4.Pi_CX"),
    Pi_CY: await encodePolynomialBufferWithSigma1Timed(runtime, crs, state.setup, division.quotientY, "prove4.Pi_CY"),
  };
}

function evaluateChallengePointsTimed(input: {
  readonly runtime: CurveRuntime;
  readonly state: ProverState;
  readonly rXY: BivariatePolynomialBuffer;
  readonly chi: FieldElement;
  readonly zeta: FieldElement;
}): ChallengeEvaluations {
  const { runtime, state, rXY, chi, zeta } = input;
  const field = runtime.Fr;
  const mI = state.setup.l_D - state.setup.l;
  const omegaMI = field.rootOfUnity(mI);
  const omegaSMax = field.rootOfUnity(state.setup.s_max);
  const VXY = polynomialLinearCombination("prove3.V", field, [
    [field.one, state.witnessBuffers.vXY],
    [state.mixer.rV_X, state.instanceBuffers.tN],
    [state.mixer.rV_Y, state.instanceBuffers.tSMax],
  ]);
  const RXY = polynomialLinearCombination("prove3.R", field, [
    [field.one, rXY],
    [state.mixer.rR_X, state.instanceBuffers.tMi],
    [state.mixer.rR_Y, state.instanceBuffers.tSMax],
  ]);
  const rOmegaX = polynomialScaleX("prove3.r_omega_x", RXY, field.inv(omegaMI));
  const rOmegaXOmegaY = polynomialScaleY("prove3.r_omega_x_omega_y", rOmegaX, field.inv(omegaSMax));

  return {
    V_eval: VXY.eval(chi, zeta),
    R_eval: RXY.eval(chi, zeta),
    R_omegaX_eval: rOmegaX.eval(chi, zeta),
    R_omegaX_omegaY_eval: rOmegaXOmegaY.eval(chi, zeta),
  };
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

function constantPolynomial(field: CurveRuntime["Fr"], value: FieldElement): BivariatePolynomialBuffer {
  return BivariatePolynomialBuffer.fromCoeffs(field, [value], 1, 1);
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

async function readPreparedRuntimeManifest(
  runtimeDir: string,
  artifactPath: string,
): Promise<RuntimeArtifactBundleManifest> {
  return parseRuntimeArtifactBundleManifest(await readPreparedRuntimeJson(runtimeDir, artifactPath));
}

function createGeneratedProofResolver(
  runtimeDir: string,
  verifierProofInput: RuntimeArtifactBundleManifest,
  generatedProof: Uint8Array,
): (artifactPath: string) => Promise<Uint8Array> {
  const proofPath = requireBundleRolePath(verifierProofInput, RuntimeArtifactFileRole.Proof);

  return async (artifactPath: string): Promise<Uint8Array> => {
    if (artifactPath === proofPath) {
      return generatedProof;
    }

    return readPreparedRuntimeFile(runtimeDir, artifactPath);
  };
}

function requireBundleRolePath(manifest: RuntimeArtifactBundleManifest, role: RuntimeArtifactFileRole): string {
  const matches = manifest.files.filter((file) => file.role === role);

  if (matches.length !== 1) {
    throw new Error(`${manifest.kind} bundle must contain exactly one '${role}' file.`);
  }

  return matches[0].path;
}

async function readPreparedRuntimeJson<T>(runtimeDir: string, artifactPath: string): Promise<T> {
  const bytes = await readPreparedRuntimeFile(runtimeDir, artifactPath);

  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

async function readPreparedRuntimeFile(runtimeDir: string, artifactPath: string): Promise<Uint8Array> {
  const filePath = resolvePreparedRuntimePath(runtimeDir, artifactPath);

  try {
    return await readFile(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        `Required prepared runtime fixture file is missing: ${path.relative(process.cwd(), filePath)}.`,
        "Prepare owner package outputs, run npm run fixtures:copy, then run npm run fixtures:prepare.",
        `Original read error: ${message}`,
      ].join(" "),
    );
  }
}

function resolvePreparedRuntimePath(runtimeDir: string, artifactPath: string): string {
  if (path.isAbsolute(artifactPath) || artifactPath.includes("\\") || artifactPath.split("/").includes("..")) {
    throw new Error(`Prepared runtime artifact path must be a safe relative POSIX path: ${artifactPath}`);
  }

  const filePath = path.resolve(runtimeDir, artifactPath);
  const relative = path.relative(runtimeDir, filePath);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Prepared runtime artifact path escapes fixtures/small/runtime: ${artifactPath}`);
  }

  return filePath;
}

function buildTimingReport(events: readonly TimingEvent[]): TimingReport {
  const summary = buildModuleTimingSummary(events);
  const lowestOperationTotals = buildLowestOperationTotals(events);
  const middleOperationTotals = buildMiddleOperationTotals(lowestOperationTotals);
  const topOperationTotals = buildTopOperationTotals(middleOperationTotals);
  const totalWallMs = sumRootWallTime(events);
  const classifiedOperationMs =
    operationDuration(topOperationTotals, "field.operations") + operationDuration(topOperationTotals, "polynomial.encode");
  const unclassifiedProverMs = totalWallMs - classifiedOperationMs;
  const invariantChecks = buildTimingInvariantChecks({
    events,
    summary,
    lowestOperationTotals,
    middleOperationTotals,
    topOperationTotals,
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
    categoryTotals: summarizeByCategory(events),
    lowestOperationTotals,
    middleOperationTotals,
    topOperationTotals,
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
    event.name === "load prover runtime bundles" ||
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
    "polynomial.combine",
    operationDuration(lowestOperationTotals, "polynomial.add") +
      operationDuration(lowestOperationTotals, "polynomial.sub") +
      operationDuration(lowestOperationTotals, "polynomial.mul") +
      operationDuration(lowestOperationTotals, "polynomial.scale"),
    operationCount(lowestOperationTotals, "polynomial.add") +
      operationCount(lowestOperationTotals, "polynomial.sub") +
      operationCount(lowestOperationTotals, "polynomial.mul") +
      operationCount(lowestOperationTotals, "polynomial.scale"),
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
    "polynomial.encode",
    operationDuration(lowestOperationTotals, "polynomial.encode"),
    operationCount(lowestOperationTotals, "polynomial.encode"),
  );

  return fixedOperationTotalsToRows(totals, middleOperationOrder);
}

function buildTopOperationTotals(middleOperationTotals: readonly OperationTimingTotal[]): readonly OperationTimingTotal[] {
  const totals = createFixedOperationTotals(topOperationOrder);
  addOperationTotal(
    totals,
    "field.operations",
    operationDuration(middleOperationTotals, "polynomial.combine") +
      operationDuration(middleOperationTotals, "polynomial.division"),
    operationCount(middleOperationTotals, "polynomial.combine") +
      operationCount(middleOperationTotals, "polynomial.division"),
  );
  addOperationTotal(
    totals,
    "polynomial.encode",
    operationDuration(middleOperationTotals, "polynomial.encode"),
    operationCount(middleOperationTotals, "polynomial.encode"),
  );

  return fixedOperationTotalsToRows(totals, topOperationOrder);
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
    category === "polynomial.add" ||
    category === "polynomial.sub" ||
    category === "polynomial.mul" ||
    category === "polynomial.div_ruffini" ||
    category === "polynomial.div_vanishing" ||
    category === "polynomial.scale"
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

  const forbiddenOfficialEvents = events.filter(
    (event) =>
      isLowestOperation(event.category) &&
      (event.name.includes("addScaledPrefixAssign") ||
        event.name.includes("scaleCoeffsX") ||
        event.name.includes("scaleCoeffsY")),
  );
  checks.push({
    name: "official_events_have_no_forbidden_helper_folding",
    parentMs: 0,
    childMs: forbiddenOfficialEvents.length,
    ok: forbiddenOfficialEvents.length === 0,
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
      event.category.startsWith("polynomial.") &&
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
    name: "middle_combine_equals_lowest_sum",
    parentMs: operationDuration(middleOperationTotals, "polynomial.combine"),
    childMs:
      operationDuration(lowestOperationTotals, "polynomial.add") +
      operationDuration(lowestOperationTotals, "polynomial.sub") +
      operationDuration(lowestOperationTotals, "polynomial.mul") +
      operationDuration(lowestOperationTotals, "polynomial.scale"),
    ok: durationsEqual(
      operationDuration(middleOperationTotals, "polynomial.combine"),
      operationDuration(lowestOperationTotals, "polynomial.add") +
        operationDuration(lowestOperationTotals, "polynomial.sub") +
        operationDuration(lowestOperationTotals, "polynomial.mul") +
        operationDuration(lowestOperationTotals, "polynomial.scale"),
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
    name: "middle_encode_equals_lowest_encode",
    parentMs: operationDuration(middleOperationTotals, "polynomial.encode"),
    childMs: operationDuration(lowestOperationTotals, "polynomial.encode"),
    ok: durationsEqual(
      operationDuration(middleOperationTotals, "polynomial.encode"),
      operationDuration(lowestOperationTotals, "polynomial.encode"),
    ),
  });
  checks.push({
    name: "top_field_operations_equals_middle_sum",
    parentMs: operationDuration(topOperationTotals, "field.operations"),
    childMs:
      operationDuration(middleOperationTotals, "polynomial.combine") +
      operationDuration(middleOperationTotals, "polynomial.division"),
    ok: durationsEqual(
      operationDuration(topOperationTotals, "field.operations"),
      operationDuration(middleOperationTotals, "polynomial.combine") +
        operationDuration(middleOperationTotals, "polynomial.division"),
    ),
  });
  checks.push({
    name: "top_encode_equals_middle_encode",
    parentMs: operationDuration(topOperationTotals, "polynomial.encode"),
    childMs: operationDuration(middleOperationTotals, "polynomial.encode"),
    ok: durationsEqual(
      operationDuration(topOperationTotals, "polynomial.encode"),
      operationDuration(middleOperationTotals, "polynomial.encode"),
    ),
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
  lines.push("- The lowest layer is limited to seven polynomial operations: add, subtract, multiply, Ruffini division, vanishing division, scale, and encode.");
  lines.push("- `polynomial.scale` means polynomial scalar multiplication only.");
  lines.push("- Fused scaled-add work is decomposed for diagnostics or excluded from official operation rows.");
  lines.push("- `scaleCoeffsX` and `scaleCoeffsY` are excluded from official operation rows and remain unclassified unless a new row is approved.");
  lines.push("- The middle layer is limited to polynomial combine, polynomial division, and polynomial encode.");
  lines.push("- The top layer is limited to field operations and polynomial encode.");
  lines.push("- `polynomial.combine = add + subtract + multiply + scale`.");
  lines.push("- `polynomial.division = Ruffini division + vanishing division`.");
  lines.push("- `field.operations = polynomial.combine + polynomial.division`.");
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

function shapeSize(label: string, xSize: number, ySize: number): SizeInfo {
  return { label, dims: [xSize, ySize] };
}

function flatSize(label: string, count: number): SizeInfo {
  return { label, dims: [count] };
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${milliseconds.toFixed(0)} ms`;
  }

  return `${(milliseconds / 1000).toFixed(2)} s`;
}

function middleOperationDefinition(operation: string): string {
  switch (operation) {
    case "polynomial.combine":
      return "polynomial.add + polynomial.sub + polynomial.mul + polynomial.scale";
    case "polynomial.division":
      return "polynomial.div_ruffini + polynomial.div_vanishing";
    case "polynomial.encode":
      return "polynomial.encode";
    default:
      return "";
  }
}

function topOperationDefinition(operation: string): string {
  switch (operation) {
    case "field.operations":
      return "polynomial.combine + polynomial.division";
    case "polynomial.encode":
      return "polynomial.encode";
    default:
      return "";
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
