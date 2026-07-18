import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BinaryArtifactFileKind,
  BivariatePolynomialBuffer,
  DensePolynomialExt,
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
import { buildProverBinding, type Prove0Computation, type Prove0Output } from "../../../src/prover/stages/prove0.js";
import { prove1 } from "../../../src/prover/stages/prove1.js";
import { type Prove2Computation, type Prove2Output } from "../../../src/prover/stages/prove2.js";
import { prove3, type Prove3Output } from "../../../src/prover/stages/prove3.js";
import {
  type Prove4Computation,
  type Prove4DebugOutput,
  type Prove4Output,
} from "../../../src/prover/stages/prove4.js";
import {
  buildLagrangeK0,
  buildLagrangeKl,
  constantPolynomialBuffer,
  linearCombinationBuffer,
  lowDegreeXTimesVanishingBuffer,
  lowDegreeYTimesVanishingBuffer,
  mulByLinearX,
  mulByLinearY,
  mulByOneMinusX,
  mulByTerm9,
  mulByXMinusOne,
} from "../../../src/prover/stages/polynomial-ops.js";

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
  readonly events: readonly TimingEvent[];
  readonly totalsByCategory: readonly TimingTotal[];
  readonly topEvents: readonly TimingEvent[];
}

interface TimingTotal {
  readonly category: string;
  readonly durationMs: number;
  readonly count: number;
}

class TimingCollector {
  readonly events: TimingEvent[] = [];
  private readonly detailStack: string[] = [];

  async span<T>(
    name: string,
    category: string,
    callback: () => Promise<T>,
    sizes: readonly SizeInfo[] = [],
  ): Promise<T> {
    const activeDetail = category === "poly" && name.startsWith("poly.combine.");
    if (activeDetail) {
      this.detailStack.push(name);
    }

    const start = performance.now();
    try {
      return await callback();
    } finally {
      const durationMs = performance.now() - start;
      if (activeDetail) {
        this.detailStack.pop();
      }
      this.record(name, category, durationMs, sizes);
    }
  }

  spanSync<T>(
    name: string,
    category: string,
    callback: () => T,
    sizes: readonly SizeInfo[] = [],
  ): T {
    const activeDetail = category === "poly" && name.startsWith("poly.combine.");
    if (activeDetail) {
      this.detailStack.push(name);
    }

    const start = performance.now();
    try {
      return callback();
    } finally {
      const durationMs = performance.now() - start;
      if (activeDetail) {
        this.detailStack.pop();
      }
      this.record(name, category, durationMs, sizes);
    }
  }

  recordDetail(operation: string, durationMs: number, sizes: readonly SizeInfo[]): void {
    const context = this.detailStack[this.detailStack.length - 1];
    if (context === undefined) {
      return;
    }

    const suffix = context.startsWith("poly.combine.") ? context.slice("poly.combine.".length) : context;
    this.record(`poly_detail.${operation}.${suffix}`, "poly_detail", durationMs, sizes);
  }

  private record(name: string, category: string, durationMs: number, sizes: readonly SizeInfo[]): void {
    this.events.push({ name, category, durationMs, sizes });
  }
}

const timing = new TimingCollector();

async function main(): Promise<void> {
  installPolynomialDetailInstrumentation(timing);

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
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
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
      state.instance,
      state.mixer,
    ),
  );

  const transcript = new RollingKeccakTranscript(runtime.Fr);
  const prove0Output = await timing.span("prove0", "stage", () => prove0Timed(runtime, input.crs, state));
  const thetas = collectThetaChallenges(runtime, transcript, prove0Output.proof0);
  const prove1Output = await timing.span("prove1", "stage", () => prove1(runtime, input.crs, state, thetas));
  const kappa0 = collectKappa0Challenge(runtime, transcript, prove1Output.proof1);
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
  const { chi, zeta } = collectEvaluationChallenges(runtime, transcript, prove2Output.proof2);
  const proof3 = timing.spanSync("prove3", "stage", () =>
    prove3({
      runtime,
      state,
      rXY: prove1Output.rXY,
      chi,
      zeta,
    }),
  );
  const kappa1 = collectKappa1Challenge(transcript, proof3);
  const prove4Output = await timing.span("prove4", "stage", () =>
    prove4Timed({
      runtime,
      crs: input.crs,
      state,
      rXY: prove1Output.rXY,
      prove0: prove0Output,
      prove2: prove2Output,
      proof3,
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
      prove0: prove0Output,
      prove1: prove1Output,
      prove2: prove2Output,
      proof3,
      prove4: prove4Output,
    }),
  );
}

async function prove0Timed(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  state: ProverState,
): Promise<Prove0Computation> {
  const field = runtime.Fr;
  const p0XY = await timing.span(
    "poly.combine.prove0.p0XY",
    "poly",
    async () => {
      const product = await BivariatePolynomialBuffer.fromDense(state.witness.uXY).mul(
        BivariatePolynomialBuffer.fromDense(state.witness.vXY),
      );
      product.subAssign(BivariatePolynomialBuffer.fromDense(state.witness.wXY).resize(product.xSize, product.ySize));
      return product;
    },
    [shapeSize("uXY", state.witness.uXY.xSize, state.witness.uXY.ySize)],
  );
  const { quotientX: q0XY, quotientY: q1XY } = await timing.span(
    "poly.div_by_vanishing_opt.prove0.q0q1",
    "poly",
    async () => Promise.resolve(p0XY.divByVanishingOpt(state.setup.n, state.setup.s_max)),
    [shapeSize("vanishing", state.setup.n, state.setup.s_max)],
  );

  const rW_X = DensePolynomialExt.fromCoeffs(field, state.mixer.rW_X, state.mixer.rW_X.length, 1);
  const rW_Y = DensePolynomialExt.fromCoeffs(field, state.mixer.rW_Y, 1, state.mixer.rW_Y.length);
  const UXY = timing.spanSync("poly.combine.prove0.U", "poly", () =>
    linearCombinationBuffer(field, [
      [field.one, BivariatePolynomialBuffer.fromDense(state.witness.uXY)],
      [state.mixer.rU_X, BivariatePolynomialBuffer.fromDense(state.instance.tN)],
      [state.mixer.rU_Y, BivariatePolynomialBuffer.fromDense(state.instance.tSMax)],
    ]),
  );
  const VXY = timing.spanSync("poly.combine.prove0.V", "poly", () =>
    linearCombinationBuffer(field, [
      [field.one, BivariatePolynomialBuffer.fromDense(state.witness.vXY)],
      [state.mixer.rV_X, BivariatePolynomialBuffer.fromDense(state.instance.tN)],
      [state.mixer.rV_Y, BivariatePolynomialBuffer.fromDense(state.instance.tSMax)],
    ]),
  );
  const wZk = timing.spanSync("poly.combine.prove0.W_zk", "poly", () =>
    linearCombinationBuffer(field, [
      [field.one, lowDegreeXTimesVanishingBuffer(field, state.mixer.rW_X, state.setup.n)],
      [field.one, lowDegreeYTimesVanishingBuffer(field, state.mixer.rW_Y, state.setup.s_max)],
    ]),
  );
  const WXY = timing.spanSync("poly.combine.prove0.W", "poly", () =>
    linearCombinationBuffer(field, [
      [field.one, BivariatePolynomialBuffer.fromDense(state.witness.wXY)],
      [field.one, wZk],
    ]),
  );
  const Q_AX_XY = timing.spanSync("poly.combine.prove0.Q_AX", "poly", () =>
    linearCombinationBuffer(field, [
      [field.one, q0XY],
      [state.mixer.rU_X, BivariatePolynomialBuffer.fromDense(state.witness.vXY)],
      [state.mixer.rV_X, BivariatePolynomialBuffer.fromDense(state.witness.uXY)],
      [field.neg(field.one), BivariatePolynomialBuffer.fromDense(rW_X)],
      [field.mul(state.mixer.rU_X, state.mixer.rV_X), BivariatePolynomialBuffer.fromDense(state.instance.tN)],
      [field.mul(state.mixer.rU_Y, state.mixer.rV_X), BivariatePolynomialBuffer.fromDense(state.instance.tSMax)],
    ]),
  );
  const Q_AY_XY = timing.spanSync("poly.combine.prove0.Q_AY", "poly", () =>
    linearCombinationBuffer(field, [
      [field.one, q1XY],
      [state.mixer.rU_Y, BivariatePolynomialBuffer.fromDense(state.witness.vXY)],
      [state.mixer.rV_Y, BivariatePolynomialBuffer.fromDense(state.witness.uXY)],
      [field.neg(field.one), BivariatePolynomialBuffer.fromDense(rW_Y)],
      [field.mul(state.mixer.rU_X, state.mixer.rV_Y), BivariatePolynomialBuffer.fromDense(state.instance.tN)],
      [field.mul(state.mixer.rU_Y, state.mixer.rV_Y), BivariatePolynomialBuffer.fromDense(state.instance.tSMax)],
    ]),
  );
  const termBZk = timing.spanSync("poly.combine.prove0.term_B_zk", "poly", () =>
    linearCombinationBuffer(field, [
      [field.one, lowDegreeXTimesVanishingBuffer(field, state.mixer.rB_X, state.setup.l_D - state.setup.l)],
      [field.one, lowDegreeYTimesVanishingBuffer(field, state.mixer.rB_Y, state.setup.s_max)],
    ]),
  );
  const BXY = timing.spanSync("poly.combine.prove0.B", "poly", () =>
    linearCombinationBuffer(field, [
      [field.one, BivariatePolynomialBuffer.fromDense(state.witness.bXY)],
      [field.one, termBZk],
    ]),
  );

  return {
    proof0: {
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

async function prove2Timed(input: {
  readonly runtime: CurveRuntime;
  readonly crs: ProverCrsRuntime;
  readonly state: ProverState;
  readonly rXY: BivariatePolynomialBuffer;
  readonly thetas: readonly FieldElement[];
  readonly kappa0: FieldElement;
}): Promise<Prove2Computation> {
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
  const rOmegaX = timing.spanSync("poly.combine.prove2.r_omega_x", "poly", () => rXY.scaleCoeffsX(field.inv(omegaMI)));
  const rOmegaXOmegaY = timing.spanSync("poly.combine.prove2.r_omega_x_omega_y", "poly", () =>
    rOmegaX.scaleCoeffsY(field.inv(omegaSMax)),
  );
  const xMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 2, 1);
  const yMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 1, 2);
  const theta2 = constantPolynomialBuffer(field, thetas[2]);
  const fXY = timing.spanSync("poly.combine.prove2.fXY", "poly", () =>
    linearCombinationBuffer(field, [
      [field.one, BivariatePolynomialBuffer.fromDense(state.witness.bXY)],
      [thetas[0], BivariatePolynomialBuffer.fromDense(state.instance.s0XY)],
      [thetas[1], BivariatePolynomialBuffer.fromDense(state.instance.s1XY)],
      [field.one, theta2],
    ]),
  );
  const gXY = timing.spanSync("poly.combine.prove2.gXY", "poly", () =>
    linearCombinationBuffer(field, [
      [field.one, BivariatePolynomialBuffer.fromDense(state.witness.bXY)],
      [thetas[0], xMonomial],
      [thetas[1], yMonomial],
      [field.one, theta2],
    ]),
  );
  const lagrangeKlXY = await timing.span("poly.combine.prove2.lagrange_KL", "poly", () =>
    buildLagrangeKl(field, mI, sMax),
  );
  const lagrangeK0XY = await timing.span("poly.combine.prove2.lagrange_K0", "poly", () =>
    buildLagrangeK0(field, mI),
  );
  const rGXY = await timing.span("poly.combine.prove2.rG", "poly", () => rXY.mul(gXY));
  const p1XY = await timing.span("poly.combine.prove2.p1", "poly", () =>
    rXY.sub(constantPolynomialBuffer(field, field.one)).mul(lagrangeKlXY),
  );
  const p2Input = await timing.span("poly.combine.prove2.p2_input", "poly", async () =>
    Promise.resolve(rGXY.sub(await rOmegaX.mul(fXY))),
  );
  const p2XY = timing.spanSync("poly.combine.prove2.p2", "poly", () => mulByXMinusOne(p2Input));
  const p3XY = await timing.span("poly.combine.prove2.p3", "poly", async () =>
    lagrangeK0XY.mul(rGXY.sub(await rOmegaXOmegaY.mul(fXY))),
  );
  const pCombined = timing.spanSync("poly.combine.prove2.p_comb", "poly", () =>
    linearCombinationBuffer(field, [
      [field.one, p1XY],
      [kappa0, p2XY],
      [kappa0Sq, p3XY],
    ]),
  );
  const { quotientX: q2XY, quotientY: q3XY } = await timing.span(
    "poly.div_by_vanishing_opt.prove2.qCXqCY",
    "poly",
    async () => Promise.resolve(pCombined.divByVanishingOpt(mI, sMax)),
    [shapeSize("vanishing", mI, sMax)],
  );
  const rD1 = timing.spanSync("poly.combine.prove2.rD1", "poly", () => rXY.sub(rOmegaX));
  const rD2 = timing.spanSync("poly.combine.prove2.rD2", "poly", () => rXY.sub(rOmegaXOmegaY));
  const gD = timing.spanSync("poly.combine.prove2.gD", "poly", () => gXY.sub(fXY));
  const qCxXY = await timing.span("poly.combine.prove2.Q_CX", "poly", async () => {
    const qCxTerm2 = mulByXMinusOne(
      mulByLinearX(rD1, state.mixer.rB_X).add(gD.scale(state.mixer.rR_X)),
    );
    const qCxTerm3 = await lagrangeK0XY.mul(
      mulByLinearX(rD2, state.mixer.rB_X).add(gD.scale(state.mixer.rR_X)),
    );
    return linearCombinationBuffer(field, [
      [field.one, q2XY],
      [state.mixer.rR_X, lagrangeKlXY],
      [kappa0, qCxTerm2],
      [kappa0Sq, qCxTerm3],
    ]);
  });
  const qCyXY = await timing.span("poly.combine.prove2.Q_CY", "poly", async () => {
    const qCyTerm2 = mulByXMinusOne(
      mulByLinearY(rD1, state.mixer.rB_Y).add(gD.scale(state.mixer.rR_Y)),
    );
    const qCyTerm3 = await lagrangeK0XY.mul(
      mulByLinearY(rD2, state.mixer.rB_Y).add(gD.scale(state.mixer.rR_Y)),
    );
    return linearCombinationBuffer(field, [
      [field.one, q3XY],
      [state.mixer.rR_Y, lagrangeKlXY],
      [kappa0, qCyTerm2],
      [kappa0Sq, qCyTerm3],
    ]);
  });

  return {
    proof2: {
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
  readonly prove0: Prove0Computation;
  readonly prove2: Prove2Computation;
  readonly proof3: Prove3Output;
  readonly thetas: readonly FieldElement[];
  readonly kappa0: FieldElement;
  readonly chi: FieldElement;
  readonly zeta: FieldElement;
  readonly kappa1: FieldElement;
}): Promise<Prove4Computation> {
  const { runtime, crs, state, rXY, prove0, prove2, proof3, thetas, kappa0, chi, zeta, kappa1 } = input;
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
  const rW_X = DensePolynomialExt.fromCoeffs(field, state.mixer.rW_X, state.mixer.rW_X.length, 1);
  const rW_Y = DensePolynomialExt.fromCoeffs(field, state.mixer.rW_Y, 1, state.mixer.rW_Y.length);
  const VXY = timing.spanSync("poly.combine.prove4.V", "poly", () =>
    linearCombinationBuffer(field, [
      [field.one, BivariatePolynomialBuffer.fromDense(state.witness.vXY)],
      [state.mixer.rV_X, BivariatePolynomialBuffer.fromDense(state.instance.tN)],
      [state.mixer.rV_Y, BivariatePolynomialBuffer.fromDense(state.instance.tSMax)],
    ]),
  );
  const pAXY = timing.spanSync("poly.combine.prove4.Pi_A", "poly", () =>
    linearCombinationBuffer(field, [
      [kappa1, VXY.sub(constantPolynomialBuffer(field, proof3.V_eval))],
      [smallVEval, BivariatePolynomialBuffer.fromDense(state.witness.uXY)],
      [field.neg(field.one), BivariatePolynomialBuffer.fromDense(state.witness.wXY)],
      [field.neg(tNEval), prove0.q0XY],
      [field.neg(tSMaxEval), prove0.q1XY],
      [field.mul(smallVEval, state.mixer.rU_X), BivariatePolynomialBuffer.fromDense(state.instance.tN)],
      [field.mul(smallVEval, state.mixer.rU_Y), BivariatePolynomialBuffer.fromDense(state.instance.tSMax)],
      [
        field.neg(field.add(field.mul(state.mixer.rU_X, tNEval), field.mul(state.mixer.rU_Y, tSMaxEval))),
        BivariatePolynomialBuffer.fromDense(state.witness.vXY),
      ],
      [tNEval, BivariatePolynomialBuffer.fromDense(rW_X)],
      [tSMaxEval, BivariatePolynomialBuffer.fromDense(rW_Y)],
      [field.neg(field.one), prove0.wZk],
    ]),
  );
  const piADivision = await timing.span("poly.div_by_ruffini.prove4.Pi_A", "poly", async () =>
    Promise.resolve(pAXY.divByRuffini(chi, zeta)),
  );
  const Pi_AX = await encodePolynomialBufferWithSigma1Timed(runtime, crs, state.setup, piADivision.quotientX, "prove4.Pi_AX");
  const Pi_AY = await encodePolynomialBufferWithSigma1Timed(runtime, crs, state.setup, piADivision.quotientY, "prove4.Pi_AY");
  const RXY = timing.spanSync("poly.combine.prove4.R", "poly", () =>
    linearCombinationBuffer(field, [
      [field.one, rXY],
      [state.mixer.rR_X, BivariatePolynomialBuffer.fromDense(state.instance.tMi)],
      [state.mixer.rR_Y, BivariatePolynomialBuffer.fromDense(state.instance.tSMax)],
    ]),
  );
  const mDivision = await timing.span("poly.div_by_ruffini.prove4.M", "poly", async () =>
    Promise.resolve(
      RXY.sub(constantPolynomialBuffer(field, proof3.R_omegaX_eval)).divByRuffini(field.mul(omegaMIInv, chi), zeta),
    ),
  );
  const M_X = await encodePolynomialBufferWithSigma1Timed(runtime, crs, state.setup, mDivision.quotientX, "prove4.M_X");
  const M_Y = await encodePolynomialBufferWithSigma1Timed(runtime, crs, state.setup, mDivision.quotientY, "prove4.M_Y");
  const nDivision = await timing.span("poly.div_by_ruffini.prove4.N", "poly", async () =>
    Promise.resolve(
      RXY
        .sub(constantPolynomialBuffer(field, proof3.R_omegaX_omegaY_eval))
        .divByRuffini(field.mul(omegaMIInv, chi), field.mul(omegaSMaxInv, zeta)),
    ),
  );
  const N_X = await encodePolynomialBufferWithSigma1Timed(runtime, crs, state.setup, nDivision.quotientX, "prove4.N_X");
  const N_Y = await encodePolynomialBufferWithSigma1Timed(runtime, crs, state.setup, nDivision.quotientY, "prove4.N_Y");
  const { Pi_CX, Pi_CY } = await buildCopyOpeningsTimed({
    runtime,
    crs,
    state,
    rXY,
    RXY,
    prove0,
    prove2,
    proof3,
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
  const piBDivision = timing.spanSync("poly.div_by_ruffini.prove4.Pi_B", "poly", () =>
    state.instance.aFreeX.sub(constantPolynomial(field, aEval)).divByRuffini(chi, zeta),
  );
  const Pi_B = runtime.G1.mulScalar(
    await encodePolynomialWithSigma1Timed(runtime, crs, state.setup, piBDivision.quotientX, "prove4.Pi_B"),
    kappa1Fourth,
  );
  const Pi_X = runtime.G1.add(runtime.G1.add(Pi_AX, Pi_CX), Pi_B);
  const Pi_Y = runtime.G1.add(Pi_AY, Pi_CY);

  return {
    proof4: {
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
  readonly prove0: Prove0Computation;
  readonly prove2: Prove2Computation;
  readonly proof3: Prove3Output;
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
    prove0,
    prove2,
    proof3,
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
  const rOmegaX = timing.spanSync("poly.combine.prove4.r_omega_x", "poly", () => rXY.scaleCoeffsX(omegaMIInv));
  const rOmegaXOmegaY = timing.spanSync("poly.combine.prove4.r_omega_x_omega_y", "poly", () =>
    rOmegaX.scaleCoeffsY(omegaSMaxInv),
  );
  const xMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 2, 1);
  const yMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 1, 2);
  const theta2 = constantPolynomialBuffer(field, thetas[2]);
  const fXY = timing.spanSync("poly.combine.prove4.fXY", "poly", () =>
    linearCombinationBuffer(field, [
      [field.one, BivariatePolynomialBuffer.fromDense(state.witness.bXY)],
      [thetas[0], BivariatePolynomialBuffer.fromDense(state.instance.s0XY)],
      [thetas[1], BivariatePolynomialBuffer.fromDense(state.instance.s1XY)],
      [field.one, theta2],
    ]),
  );
  const gXY = timing.spanSync("poly.combine.prove4.gXY", "poly", () =>
    linearCombinationBuffer(field, [
      [field.one, BivariatePolynomialBuffer.fromDense(state.witness.bXY)],
      [thetas[0], xMonomial],
      [thetas[1], yMonomial],
      [field.one, theta2],
    ]),
  );
  const tMiEval = field.sub(field.pow(chi, mI), field.one);
  const tSMaxEval = field.sub(field.pow(zeta, sMax), field.one);
  const lagrangeK0XY = await timing.span("poly.combine.prove4.lagrange_K0", "poly", () =>
    buildLagrangeK0(field, mI),
  );
  const lagrangeK0Eval = lagrangeK0XY.eval(chi, zeta);
  const smallREval = rXY.eval(chi, zeta);
  const smallROmegaXEval = rOmegaX.eval(chi, zeta);
  const smallROmegaXOmegaYEval = rOmegaXOmegaY.eval(chi, zeta);
  const term5 = timing.spanSync("poly.combine.prove4.term5", "poly", () =>
    linearCombinationBuffer(field, [
      [smallREval, gXY],
      [field.neg(smallROmegaXEval), fXY],
    ]),
  );
  const term6 = timing.spanSync("poly.combine.prove4.term6", "poly", () =>
    linearCombinationBuffer(field, [
      [smallREval, gXY],
      [field.neg(smallROmegaXOmegaYEval), fXY],
    ]),
  );
  const pCXY = timing.spanSync("poly.combine.prove4.pC", "poly", () =>
    linearCombinationBuffer(field, [
      [field.sub(smallREval, field.one), prove2.lagrangeKlXY],
      [field.mul(kappa0, field.sub(chi, field.one)), term5],
      [field.mul(kappa0Sq, lagrangeK0Eval), term6],
      [field.neg(tMiEval), prove2.q2XY],
      [field.neg(tSMaxEval), prove2.q3XY],
    ]),
  );
  const rD1 = timing.spanSync("poly.combine.prove4.rD1", "poly", () => rXY.sub(rOmegaX));
  const rD2 = timing.spanSync("poly.combine.prove4.rD2", "poly", () => rXY.sub(rOmegaXOmegaY));
  const rD1Eval = rD1.eval(chi, zeta);
  const rD2Eval = rD2.eval(chi, zeta);
  const gMinusF = timing.spanSync("poly.combine.prove4.gMinusF", "poly", () => gXY.sub(fXY));
  const term10Scale = field.add(field.mul(state.mixer.rR_X, tMiEval), field.mul(state.mixer.rR_Y, tSMaxEval));
  const term10 = timing.spanSync("poly.combine.prove4.term10", "poly", () => gMinusF.scale(term10Scale));
  const lhsZk1 = timing.spanSync("poly.combine.prove4.LHS_zk1", "poly", () => {
    const rD1Term9 = mulByTerm9(rD1, state.mixer.rB_X, state.mixer.rB_Y, tMiEval, tSMaxEval);
    const rD1Term9PlusTerm10 = rD1Term9.add(term10);
    return linearCombinationBuffer(field, [
      [field.mul(field.sub(chi, field.one), rD1Eval), prove0.termBZk],
      [field.one, mulByOneMinusX(rD1Term9PlusTerm10)],
      [field.sub(chi, field.one), term10],
    ]);
  });
  const lhsZk2 = await timing.span("poly.combine.prove4.LHS_zk2", "poly", async () => {
    const rD2Term9 = mulByTerm9(rD2, state.mixer.rB_X, state.mixer.rB_Y, tMiEval, tSMaxEval);
    const rD2Term9PlusTerm10 = rD2Term9.add(term10);
    const lhsZk2Product = await lagrangeK0XY.mul(rD2Term9PlusTerm10);
    return linearCombinationBuffer(field, [
      [field.mul(lagrangeK0Eval, rD2Eval), prove0.termBZk],
      [lagrangeK0Eval, term10],
      [field.neg(field.one), lhsZk2Product],
    ]);
  });
  const rMinusEval = timing.spanSync("poly.combine.prove4.R_minus_eval", "poly", () =>
    RXY.sub(constantPolynomialBuffer(field, proof3.R_eval)),
  );
  const lhsForCopy = timing.spanSync("poly.combine.prove4.LHS_for_copy", "poly", () =>
    linearCombinationBuffer(field, [
      [kappa1Sq, pCXY],
      [field.mul(kappa1Sq, kappa0), lhsZk1],
      [field.mul(field.mul(kappa1Sq, kappa0Sq), field.one), lhsZk2],
      [kappa1Cube, rMinusEval],
    ]),
  );
  const division = await timing.span("poly.div_by_ruffini.prove4.Pi_C", "poly", async () =>
    Promise.resolve(lhsForCopy.divByRuffini(chi, zeta)),
  );

  return {
    Pi_CX: await encodePolynomialBufferWithSigma1Timed(runtime, crs, state.setup, division.quotientX, "prove4.Pi_CX"),
    Pi_CY: await encodePolynomialBufferWithSigma1Timed(runtime, crs, state.setup, division.quotientY, "prove4.Pi_CY"),
  };
}

async function encodePolynomialWithSigma1Timed(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  setup: ProverRuntimeInput["witness"]["setup"],
  polynomial: DensePolynomialExt,
  label: string,
): Promise<Uint8Array> {
  return encodePolynomialBufferWithSigma1Timed(runtime, crs, setup, BivariatePolynomialBuffer.fromDense(polynomial), label);
}

async function encodePolynomialBufferWithSigma1Timed(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  setup: ProverRuntimeInput["witness"]["setup"],
  polynomial: BivariatePolynomialBuffer,
  label: string,
): Promise<Uint8Array> {
  const prepared = timing.spanSync(`encode.prep.${label}`, "encode", () => {
    const { xDegree, yDegree } = polynomial.findDegree();
    if (xDegree < 0 || yDegree < 0) {
      return { isZero: true as const };
    }

    const xSize = xDegree + 1;
    const ySize = yDegree + 1;
    const referenceStringYSize = setup.s_max * 2;
    const referenceStringXSize = Math.max(setup.n * 2, (setup.l_D - setup.l) * 2);
    if (xSize > referenceStringXSize || ySize > referenceStringYSize) {
      throw new Error("Insufficient prover CRS sigma1.xy-powers length for polynomial encoding.");
    }

    let nonzeroCount = 0;
    for (let x = 0; x < xSize; x += 1) {
      for (let y = 0; y < ySize; y += 1) {
        const scalar = polynomial.getCoeff(x, y);
        if (runtime.Fr.isZero(scalar)) {
          continue;
        }
        nonzeroCount += 1;
      }
    }

    if (nonzeroCount === 0) {
      return { isZero: true as const };
    }

    const bases = new Uint8Array(nonzeroCount * 96);
    const scalars = new Uint8Array(nonzeroCount * runtime.Fr.byteLength);
    let outputIndex = 0;
    for (let x = 0; x < xSize; x += 1) {
      for (let y = 0; y < ySize; y += 1) {
        const scalar = polynomial.getCoeff(x, y);
        if (runtime.Fr.isZero(scalar)) {
          continue;
        }
        const base = crs.sigma1.xyPowers[referenceStringYSize * x + y];
        if (base === undefined) {
          throw new Error("Prover CRS sigma1.xy-powers section is shorter than the declared setup shape.");
        }

        bases.set(base, outputIndex * 96);
        scalars.set(runtime.Fr.toRawLittleEndian(scalar), outputIndex * runtime.Fr.byteLength);
        outputIndex += 1;
      }
    }

    return { isZero: false as const, bases, scalars, nonzeroCount };
  }, [shapeSize("polynomial", polynomial.xSize, polynomial.ySize)]);

  if (prepared.isZero) {
    return runtime.G1.zero;
  }

  return timing.span(`encode.msm.${label}`, "encode", () =>
    Promise.resolve(runtime.G1.msmAffineRaw(prepared.bases, prepared.scalars)),
    [flatSize("nonzero", prepared.nonzeroCount)],
  );
}

function installPolynomialDetailInstrumentation(collector: TimingCollector): void {
  const prototype = BivariatePolynomialBuffer.prototype as unknown as Record<string, unknown>;
  for (const methodName of [
    "clone",
    "add",
    "sub",
    "scale",
    "scaleCoeffsX",
    "scaleCoeffsY",
    "toDense",
    "toCoeffs",
    "findDegree",
    "optimizeSize",
    "resize",
    "eval",
    "addAssign",
    "subAssign",
    "mul",
    "mulMonomial",
    "scaleAssign",
    "addScaledAssign",
    "addScaledPrefixAssign",
    "scaleCoeffsXAssign",
    "scaleCoeffsYAssign",
    "toRouEvals",
    "divByRuffini",
    "divByVanishingOpt",
  ]) {
    wrapPrototypeMethod(prototype, methodName, collector);
  }

  const constructor = BivariatePolynomialBuffer as unknown as Record<string, unknown>;
  for (const methodName of ["zero", "fromCoeffs", "fromBuffer", "fromDense", "fromRouEvals"]) {
    wrapStaticMethod(constructor, methodName, collector);
  }
}

function wrapPrototypeMethod(
  prototype: Record<string, unknown>,
  methodName: string,
  collector: TimingCollector,
): void {
  const original = prototype[methodName];
  if (typeof original !== "function") {
    return;
  }

  prototype[methodName] = function wrappedPolynomialMethod(this: BivariatePolynomialBuffer, ...args: unknown[]): unknown {
    const start = performance.now();
    const result = original.apply(this, args) as unknown;
    if (result instanceof Promise) {
      return result.finally(() => {
        collector.recordDetail(methodName, performance.now() - start, [shapeSize("self", this.xSize, this.ySize)]);
      });
    }

    collector.recordDetail(methodName, performance.now() - start, [shapeSize("self", this.xSize, this.ySize)]);
    return result;
  };
}

function wrapStaticMethod(
  constructor: Record<string, unknown>,
  methodName: string,
  collector: TimingCollector,
): void {
  const original = constructor[methodName];
  if (typeof original !== "function") {
    return;
  }

  constructor[methodName] = function wrappedPolynomialStaticMethod(...args: unknown[]): unknown {
    const start = performance.now();
    const result = original.apply(this, args) as unknown;
    if (result instanceof Promise) {
      return result.finally(() => {
        collector.recordDetail(`static_${methodName}`, performance.now() - start, []);
      });
    }

    collector.recordDetail(`static_${methodName}`, performance.now() - start, []);
    return result;
  };
}

function constantPolynomial(field: CurveRuntime["Fr"], value: FieldElement): DensePolynomialExt {
  return DensePolynomialExt.fromCoeffs(field, [value], 1, 1);
}

function collectThetaChallenges(
  runtime: CurveRuntime,
  transcript: RollingKeccakTranscript,
  proof0: Prove0Output,
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
  proof2: Prove2Output,
): { readonly chi: FieldElement; readonly zeta: FieldElement } {
  transcript.commitG1Point(proof2.Q_CX, runtime.G1).commitG1Point(proof2.Q_CY, runtime.G1);

  return {
    chi: transcript.squeezeChallenge(),
    zeta: transcript.squeezeChallenge(),
  };
}

function collectKappa1Challenge(transcript: RollingKeccakTranscript, proof3: Prove3Output): FieldElement {
  transcript
    .commitField(proof3.V_eval)
    .commitField(proof3.R_eval)
    .commitField(proof3.R_omegaX_eval)
    .commitField(proof3.R_omegaX_omegaY_eval);

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
  const totals = new Map<string, { durationMs: number; count: number }>();
  for (const event of events) {
    const total = totals.get(event.category) ?? { durationMs: 0, count: 0 };
    total.durationMs += event.durationMs;
    total.count += 1;
    totals.set(event.category, total);
  }

  return {
    generatedAt: new Date().toISOString(),
    events,
    totalsByCategory: Array.from(totals.entries())
      .map(([category, total]) => ({ category, ...total }))
      .sort((left, right) => right.durationMs - left.durationMs),
    topEvents: [...events].sort((left, right) => right.durationMs - left.durationMs).slice(0, 40),
  };
}

function printTimingSummary(report: TimingReport, outputPath: string): void {
  console.log(`Wrote prover stage timing report to ${path.relative(process.cwd(), outputPath)}`);
  console.log("Totals by category:");
  for (const total of report.totalsByCategory) {
    console.log(`  ${total.category}: ${formatDuration(total.durationMs)} (${total.count} events)`);
  }
  console.log("Top events:");
  for (const event of report.topEvents.slice(0, 20)) {
    console.log(`  ${event.name}: ${formatDuration(event.durationMs)}`);
  }
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

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
