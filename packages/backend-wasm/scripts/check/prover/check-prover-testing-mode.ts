import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  BinaryArtifactFileKind,
  BivariatePolynomialBuffer,
  RollingKeccakTranscript,
  RuntimeArtifactFileRole,
  buildDomainContext,
  buildWitnessPolynomials,
  collectChallenges,
  createCurveRuntime,
  createProverState,
  createVerifierProofArtifactFromProverOutput,
  decodeVerifierBinaryResult,
  evalAPub,
  evalLagrangeK0,
  g1AddMany,
  lhsArith,
  lhsBinding,
  lhsCopyMsm,
  loadRuntimeArtifactFile,
  loadProverInputFromRuntimeBundles,
  loadVerifierInputFromRuntimeBundles,
  parseRuntimeArtifactBundleManifest,
  verifyBinary,
  type CurveRuntime,
  type FieldElement,
  type G1Point,
  type ProverCrsRuntime,
  type ProverRuntimeInput,
  type ProverState,
  type RuntimeArtifactBundleManifest,
  type VerifierChallenges,
  type VerifierDomainContext,
  type VerifierInput,
} from "../../../src/index.js";
import {
  buildProverBinding,
  encodePolynomialBufferWithSigma1,
  computeInitialRelationCommitments,
  type InitialRelationComputation,
} from "../../../src/prover/internal/initial-relation.js";
import { computeRecursionCommitment, type RecursionComputation } from "../../../src/prover/internal/recursion-commitment.js";
import { computeCopyQuotientCommitments, type CopyQuotientComputation } from "../../../src/prover/internal/copy-quotient.js";
import { evaluateChallengePoints, type ChallengeEvaluations } from "../../../src/prover/internal/challenge-evaluations.js";
import { type OpeningCommitmentsComputation, computeOpeningCommitments } from "../../../src/prover/internal/opening-commitments.js";
import {
  buildLagrangeK0,
  buildLagrangeKl,
  computeRecursionEvalsBuffer,
  constantPolynomialBuffer,
  linearCombinationBuffer,
  lowDegreeXTimesVanishingBuffer,
  lowDegreeYTimesVanishingBuffer,
  mulByOneMinusX,
  mulByTerm9,
  mulByXMinusOne,
} from "../../../src/prover/internal/polynomial-ops.js";

interface ProverTestingModeOutput {
  readonly proofArtifact: Uint8Array;
  readonly openings: OpeningCommitmentsComputation;
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

    const proverInput = await timed("load prover runtime bundles", () =>
      loadProverInputFromRuntimeBundles(
        runtime,
        proverProofWitnessInput,
        proverCrsPreparedData,
        (artifactPath) => readPreparedRuntimeFile(runtimeDir, artifactPath),
      ),
    );
    const proverOutput = await provePreparedInputWithTestingModeChecks(runtime, proverInput);

    await timed("load generated proof artifact", () => loadRuntimeArtifactFile(proverOutput.proofArtifact)).then(
      (artifact) => {
        if (artifact.kind !== BinaryArtifactFileKind.VerifierProof) {
          throw new Error(`Prover output artifact kind mismatch: ${artifact.kind}.`);
        }
      },
    );

    const proofResolver = createGeneratedProofResolver(runtimeDir, verifierProofInput, proverOutput.proofArtifact);
    const verifierInput = await timed("load verifier runtime bundles with generated proof", () =>
      loadVerifierInputFromRuntimeBundles(runtime, verifierProofInput, verifierSetupInput, proofResolver),
    );
    await timed("check verifier testing-mode split pairings", () =>
      checkVerifierTestingModeSplitPairings(runtime, verifierInput, proverOutput.openings),
    );

    const verificationResult = await timed("verify generated proof", () =>
      verifyBinary(runtime, verifierProofInput, verifierSetupInput, proofResolver, {
        randomScalar: () => runtime.Fr.one,
      }),
    );
    const valid = decodeVerifierBinaryResult(verificationResult);
    if (!valid) {
      throw new Error("Verifier rejected the proof produced from prepared prover runtime fixtures.");
    }
  } finally {
    await runtime.terminate();
  }

  console.log("Checked prover diagnostics against native testing-mode invariants");
}

async function provePreparedInputWithTestingModeChecks(
  runtime: CurveRuntime,
  input: ProverRuntimeInput,
): Promise<ProverTestingModeOutput> {
  const witness = await timed("build witness polynomials", () => buildWitnessPolynomials(runtime.Fr, input.witness));
  const state = await timed("create prover state", () =>
    createProverState({
      runtime,
      setup: input.witness.setup,
      publicInstance: input.publicInstance,
      permutation: input.permutation,
      witness,
    }),
  );

  await timed("check witness copy setup", () => checkWitnessCopySetup(runtime, state, input.permutation));

  const binding = await timed("build prover binding", () =>
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
  const prove0Output = await timed("prove0", () => computeInitialRelationCommitments(runtime, input.crs, state));
  await timed("check prove0 arithmetic", () => checkProve0Arithmetic(runtime, input.crs, state, prove0Output));

  const thetas = collectThetaChallenges(runtime, transcript, prove0Output.commitments);
  const prove1Output = await timed("prove1", () => computeRecursionCommitment(runtime, input.crs, state, thetas));
  await timed("check prove1 recursion", () => checkProve1Recursion(runtime, state, thetas, prove1Output));

  const kappa0 = collectKappa0Challenge(runtime, transcript, prove1Output.commitment);
  const prove2Output = await timed("prove2", () =>
    computeCopyQuotientCommitments({
      runtime,
      crs: input.crs,
      state,
      rXY: prove1Output.rXY,
      thetas,
      kappa0,
    }),
  );
  await timed("check prove2 copy quotient", () =>
    checkProve2CopyQuotient(runtime, state, prove1Output.rXY, thetas, kappa0, prove2Output),
  );

  const { chi, zeta } = collectEvaluationChallenges(runtime, transcript, prove2Output.commitments);
  const evaluations = await timed("prove3", () =>
    evaluateChallengePoints({
      runtime,
      state,
      rXY: prove1Output.rXY,
      chi,
      zeta,
    }),
  );
  const kappa1 = collectKappa1Challenge(transcript, evaluations);
  const prove4Output = await timed("prove4", () =>
    computeOpeningCommitments({
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
  await timed("check prove4 openings", () =>
    checkProve4Openings({
      runtime,
      state,
      rXY: prove1Output.rXY,
      crs: input.crs,
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

  const proofArtifact = await timed("create verifier proof artifact", () =>
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

  return {
    proofArtifact,
    openings: prove4Output,
  };
}

async function checkWitnessCopySetup(
  runtime: CurveRuntime,
  state: ProverState,
  permutation: ProverRuntimeInput["permutation"],
): Promise<void> {
  const field = runtime.Fr;
  const mI = state.setup.l_D - state.setup.l;
  const sMax = state.setup.s_max;
  const bXYEvals = await state.witness.bXY.resize(mI, sMax).toRouEvals();
  const s0XYEvals = await state.instance.s0XY.resize(mI, sMax).toRouEvals();
  const s1XYEvals = await state.instance.s1XY.resize(mI, sMax).toRouEvals();
  const xPowers = powerTable(field, field.rootOfUnity(mI), mI);
  const yPowers = powerTable(field, field.rootOfUnity(sMax), sMax);
  const thetas = [field.fromBigInt(2n), field.fromBigInt(3n), field.fromBigInt(5n)] as const;
  const { fXY, gXY } = buildCopyPolynomials(runtime, state, thetas);
  const fXYEvals = await fXY.resize(mI, sMax).toRouEvals();
  const gXYEvals = await gXY.resize(mI, sMax).toRouEvals();

  for (const entry of permutation) {
    const thisIndex = entry.row * sMax + entry.col;
    const nextIndex = entry.X * sMax + entry.Y;
    assertFieldEqual(runtime, readField(field, bXYEvals, thisIndex), readField(field, bXYEvals, nextIndex), {
      label: "copy setup b(X,Y)",
      index: thisIndex,
    });
    assertFieldEqual(runtime, readField(field, s0XYEvals, thisIndex), xPowers[entry.X], {
      label: "copy setup s0(X,Y)",
      index: thisIndex,
    });
    assertFieldEqual(runtime, readField(field, s1XYEvals, thisIndex), yPowers[entry.Y], {
      label: "copy setup s1(X,Y)",
      index: thisIndex,
    });
    assertFieldEqual(runtime, readField(field, fXYEvals, thisIndex), readField(field, gXYEvals, nextIndex), {
      label: "copy setup f/g",
      index: thisIndex,
    });
  }

  assertFieldEqual(runtime, productBuffer(field, fXYEvals), productBuffer(field, gXYEvals), {
    label: "copy setup Lemma 3 product",
  });
}

async function checkProve0Arithmetic(
  runtime: CurveRuntime,
  crs: ProverCrsRuntime,
  state: ProverState,
  prove0Output: InitialRelationComputation,
): Promise<void> {
  const field = runtime.Fr;
  const uXY = state.witness.uXY.resize(state.setup.n, state.setup.s_max);
  const vXY = state.witness.vXY.resize(state.setup.n, state.setup.s_max);
  const wXY = state.witness.wXY.resize(state.setup.n, state.setup.s_max);
  const uXYEvals = await uXY.toRouEvals();
  const vXYEvals = await vXY.toRouEvals();
  const wXYEvals = await wXY.toRouEvals();

  for (let row = 0; row < state.setup.n; row += 1) {
    for (let col = 0; col < state.setup.s_max; col += 1) {
      const index = row * state.setup.s_max + col;
      const lhs = field.mul(readField(field, uXYEvals, index), readField(field, vXYEvals, index));
      assertFieldEqual(runtime, lhs, readField(field, wXYEvals, index), {
        label: "prove0 R1CS evaluation",
        index,
      });
    }
  }

  const p0XY = await state.witness.uXY.mul(
    state.witness.vXY,
  );
  p0XY.subAssign(state.witness.wXY.resize(p0XY.xSize, p0XY.ySize));
  assertVanishingQuotientAtPoint(runtime, {
    label: "prove0 arithmetic quotient",
    numerator: p0XY,
    quotientX: prove0Output.q0XY,
    quotientY: prove0Output.q1XY,
    xDegree: state.setup.n,
    yDegree: state.setup.s_max,
    xPoint: field.fromBigInt(7n),
    yPoint: field.fromBigInt(11n),
  });

  const rW_X = BivariatePolynomialBuffer.fromCoeffs(field, state.mixer.rW_X, state.mixer.rW_X.length, 1);
  const rW_Y = BivariatePolynomialBuffer.fromCoeffs(field, state.mixer.rW_Y, 1, state.mixer.rW_Y.length);
  const UXY = linearCombinationBuffer(field, [
    [field.one, state.witness.uXY],
    [state.mixer.rU_X, state.instance.tN],
    [state.mixer.rU_Y, state.instance.tSMax],
  ]);
  const VXY = linearCombinationBuffer(field, [
    [field.one, state.witness.vXY],
    [state.mixer.rV_X, state.instance.tN],
    [state.mixer.rV_Y, state.instance.tSMax],
  ]);
  const WXY = linearCombinationBuffer(field, [
    [field.one, state.witness.wXY],
    [field.one, prove0Output.wZk],
  ]);
  const Q_AX_XY = linearCombinationBuffer(field, [
    [field.one, prove0Output.q0XY],
    [state.mixer.rU_X, state.witness.vXY],
    [state.mixer.rV_X, state.witness.uXY],
    [field.neg(field.one), rW_X],
    [field.mul(state.mixer.rU_X, state.mixer.rV_X), state.instance.tN],
    [field.mul(state.mixer.rU_Y, state.mixer.rV_X), state.instance.tSMax],
  ]);
  const Q_AY_XY = linearCombinationBuffer(field, [
    [field.one, prove0Output.q1XY],
    [state.mixer.rU_Y, state.witness.vXY],
    [state.mixer.rV_Y, state.witness.uXY],
    [field.neg(field.one), rW_Y],
    [field.mul(state.mixer.rU_X, state.mixer.rV_Y), state.instance.tN],
    [field.mul(state.mixer.rU_Y, state.mixer.rV_Y), state.instance.tSMax],
  ]);
  const BXY = linearCombinationBuffer(field, [
    [field.one, state.witness.bXY],
    [
      field.one,
      linearCombinationBuffer(field, [
        [field.one, lowDegreeXTimesVanishingBuffer(field, state.mixer.rB_X, state.setup.l_D - state.setup.l)],
        [field.one, lowDegreeYTimesVanishingBuffer(field, state.mixer.rB_Y, state.setup.s_max)],
      ]),
    ],
  ]);

  assertG1Equal(runtime, prove0Output.commitments.U, await encodePolynomialBufferWithSigma1(runtime, crs, state.setup, UXY), "prove0 U commitment");
  assertG1Equal(runtime, prove0Output.commitments.V, await encodePolynomialBufferWithSigma1(runtime, crs, state.setup, VXY), "prove0 V commitment");
  assertG1Equal(runtime, prove0Output.commitments.W, await encodePolynomialBufferWithSigma1(runtime, crs, state.setup, WXY), "prove0 W commitment");
  assertG1Equal(runtime, prove0Output.commitments.Q_AX, await encodePolynomialBufferWithSigma1(runtime, crs, state.setup, Q_AX_XY), "prove0 Q_AX commitment");
  assertG1Equal(runtime, prove0Output.commitments.Q_AY, await encodePolynomialBufferWithSigma1(runtime, crs, state.setup, Q_AY_XY), "prove0 Q_AY commitment");
  assertG1Equal(runtime, prove0Output.commitments.B, await encodePolynomialBufferWithSigma1(runtime, crs, state.setup, BXY), "prove0 B commitment");

  const alpha = field.fromBigInt(43n);
  const beta = field.fromBigInt(47n);
  const gamma = field.fromBigInt(53n);
  const combinedPolynomial = linearCombinationBuffer(field, [
    [alpha, UXY],
    [beta, VXY],
    [gamma, WXY],
    [field.neg(alpha), Q_AX_XY],
    [field.neg(beta), Q_AY_XY],
  ]);
  const directCombinedCommitment = await encodePolynomialBufferWithSigma1(runtime, crs, state.setup, combinedPolynomial);
  const linearCombinedCommitment = g1AddMany(runtime.G1, [
    runtime.G1.mulScalar(prove0Output.commitments.U, alpha),
    runtime.G1.mulScalar(prove0Output.commitments.V, beta),
    runtime.G1.mulScalar(prove0Output.commitments.W, gamma),
    runtime.G1.neg(runtime.G1.mulScalar(prove0Output.commitments.Q_AX, alpha)),
    runtime.G1.neg(runtime.G1.mulScalar(prove0Output.commitments.Q_AY, beta)),
  ]);
  assertG1Equal(runtime, linearCombinedCommitment, directCombinedCommitment, "prove0 actual CRS commitment linearity");
  assertG1Equal(
    runtime,
    runtime.G1.mulScalar(prove0Output.commitments.U, alpha),
    runtime.G1.mulAffineScalar(runtime.G1.toAffine(prove0Output.commitments.U), alpha),
    "prove0 projective scalar multiplication",
  );
}

async function checkProve1Recursion(
  runtime: CurveRuntime,
  state: ProverState,
  thetas: readonly FieldElement[],
  prove1Output: RecursionComputation,
): Promise<void> {
  const field = runtime.Fr;
  const mI = state.setup.l_D - state.setup.l;
  const sMax = state.setup.s_max;
  const { fXY, gXY } = buildCopyPolynomials(runtime, state, thetas);
  const fXYEvals = await fXY.resize(mI, sMax).toRouEvals();
  const gXYEvals = await gXY.resize(mI, sMax).toRouEvals();
  const expectedRXYEvals = await computeRecursionEvalsBuffer(field, gXYEvals, fXYEvals, mI, sMax);
  const rXYEvals = await prove1Output.rXY.resize(mI, sMax).toRouEvals();

  assertFieldBufferEqual(runtime, rXYEvals, expectedRXYEvals, "prove1 recursion eval construction");

  for (let row = 1; row < mI - 1; row += 1) {
    for (let col = 0; col < sMax - 1; col += 1) {
      const thisIndex = row * sMax + col;
      const previousIndex = (row - 1) * sMax + col;
      const lhs = field.mul(readField(field, rXYEvals, thisIndex), readField(field, gXYEvals, thisIndex));
      const rhs = field.mul(readField(field, rXYEvals, previousIndex), readField(field, fXYEvals, thisIndex));
      assertFieldEqual(runtime, lhs, rhs, {
        label: "prove1 row recursion",
        index: thisIndex,
      });
    }
  }

  for (let col = 1; col < sMax; col += 1) {
    const thisIndex = col;
    const previousIndex = (mI - 1) * sMax + col - 1;
    const lhs = field.mul(readField(field, rXYEvals, thisIndex), readField(field, gXYEvals, thisIndex));
    const rhs = field.mul(readField(field, rXYEvals, previousIndex), readField(field, fXYEvals, thisIndex));
    assertFieldEqual(runtime, lhs, rhs, {
      label: "prove1 boundary recursion",
      index: thisIndex,
    });
  }
}

async function checkProve2CopyQuotient(
  runtime: CurveRuntime,
  state: ProverState,
  rXY: BivariatePolynomialBuffer,
  thetas: readonly FieldElement[],
  kappa0: FieldElement,
  prove2Output: CopyQuotientComputation,
): Promise<void> {
  const field = runtime.Fr;
  const mI = state.setup.l_D - state.setup.l;
  const sMax = state.setup.s_max;
  const omegaMI = field.rootOfUnity(mI);
  const omegaSMax = field.rootOfUnity(sMax);
  const rOmegaX = rXY.scaleCoeffsX(field.inv(omegaMI));
  const rOmegaXOmegaY = rOmegaX.scaleCoeffsY(field.inv(omegaSMax));
  const checkX = field.fromBigInt(13n);
  const checkY = field.fromBigInt(17n);

  assertFieldEqual(runtime, rXY.eval(checkX, checkY), rOmegaX.eval(field.mul(omegaMI, checkX), checkY), {
    label: "prove2 r_omegaX scaling",
  });
  assertFieldEqual(
    runtime,
    rXY.eval(checkX, checkY),
    rOmegaXOmegaY.eval(field.mul(omegaMI, checkX), field.mul(omegaSMax, checkY)),
    {
      label: "prove2 r_omegaX_omegaY scaling",
    },
  );

  const { pCombined } = await buildCopyQuotientNumerator(runtime, state, rXY, thetas, kappa0);
  assertVanishingQuotientAtPoint(runtime, {
    label: "prove2 copy quotient",
    numerator: pCombined,
    quotientX: prove2Output.q2XY,
    quotientY: prove2Output.q3XY,
    xDegree: mI,
    yDegree: sMax,
    xPoint: field.fromBigInt(19n),
    yPoint: field.fromBigInt(23n),
  });
}

async function checkProve4Openings(input: {
  readonly runtime: CurveRuntime;
  readonly state: ProverState;
  readonly rXY: BivariatePolynomialBuffer;
  readonly crs: ProverCrsRuntime;
  readonly initialRelation: InitialRelationComputation;
  readonly copyQuotient: CopyQuotientComputation;
  readonly evaluations: ChallengeEvaluations;
  readonly thetas: readonly FieldElement[];
  readonly kappa0: FieldElement;
  readonly chi: FieldElement;
  readonly zeta: FieldElement;
  readonly kappa1: FieldElement;
}): Promise<void> {
  const { runtime, state, rXY, crs, initialRelation: prove0Output, copyQuotient: prove2Output, evaluations, thetas, kappa0, chi, zeta, kappa1 } =
    input;
  const field = runtime.Fr;
  const mI = state.setup.l_D - state.setup.l;
  const sMax = state.setup.s_max;
  const omegaMIInv = field.inv(field.rootOfUnity(mI));
  const omegaSMaxInv = field.inv(field.rootOfUnity(sMax));
  const tNEval = state.instance.tN.eval(chi, field.one);
  const tSMaxEval = state.instance.tSMax.eval(field.one, zeta);
  const smallVEval = state.witness.vXY.eval(chi, zeta);
  const VXY = linearCombinationBuffer(field, [
    [field.one, state.witness.vXY],
    [state.mixer.rV_X, state.instance.tN],
    [state.mixer.rV_Y, state.instance.tSMax],
  ]);
  const UXY = linearCombinationBuffer(field, [
    [field.one, state.witness.uXY],
    [state.mixer.rU_X, state.instance.tN],
    [state.mixer.rU_Y, state.instance.tSMax],
  ]);
  const rW_X = BivariatePolynomialBuffer.fromCoeffs(field, state.mixer.rW_X, state.mixer.rW_X.length, 1);
  const rW_Y = BivariatePolynomialBuffer.fromCoeffs(field, state.mixer.rW_Y, 1, state.mixer.rW_Y.length);
  const WXY = linearCombinationBuffer(field, [
    [field.one, state.witness.wXY],
    [field.one, prove0Output.wZk],
  ]);
  const Q_AX_XY = linearCombinationBuffer(field, [
    [field.one, prove0Output.q0XY],
    [state.mixer.rU_X, state.witness.vXY],
    [state.mixer.rV_X, state.witness.uXY],
    [field.neg(field.one), rW_X],
    [field.mul(state.mixer.rU_X, state.mixer.rV_X), state.instance.tN],
    [field.mul(state.mixer.rU_Y, state.mixer.rV_X), state.instance.tSMax],
  ]);
  const Q_AY_XY = linearCombinationBuffer(field, [
    [field.one, prove0Output.q1XY],
    [state.mixer.rU_Y, state.witness.vXY],
    [state.mixer.rV_Y, state.witness.uXY],
    [field.neg(field.one), rW_Y],
    [field.mul(state.mixer.rU_X, state.mixer.rV_Y), state.instance.tN],
    [field.mul(state.mixer.rU_Y, state.mixer.rV_Y), state.instance.tSMax],
  ]);
  const pAXY = linearCombinationBuffer(field, [
    [kappa1, VXY.sub(constantPolynomialBuffer(field, evaluations.V_eval))],
    [smallVEval, state.witness.uXY],
    [field.neg(field.one), state.witness.wXY],
    [field.neg(tNEval), prove0Output.q0XY],
    [field.neg(tSMaxEval), prove0Output.q1XY],
    [field.mul(smallVEval, state.mixer.rU_X), state.instance.tN],
    [field.mul(smallVEval, state.mixer.rU_Y), state.instance.tSMax],
    [
      field.neg(field.add(field.mul(state.mixer.rU_X, tNEval), field.mul(state.mixer.rU_Y, tSMaxEval))),
      state.witness.vXY,
    ],
    [tNEval, rW_X],
    [tSMaxEval, rW_Y],
    [field.neg(field.one), prove0Output.wZk],
  ]);
  const proof0Numerator = linearCombinationBuffer(field, [
    [evaluations.V_eval, UXY],
    [field.neg(field.one), WXY],
    [kappa1, VXY.sub(constantPolynomialBuffer(field, evaluations.V_eval))],
    [field.neg(tNEval), Q_AX_XY],
    [field.neg(tSMaxEval), Q_AY_XY],
  ]);
  assertPolynomialEqual(runtime, proof0Numerator, pAXY, "prove4 arithmetic numerator polynomial");
  const piADivision = pAXY.divByRuffini(chi, zeta);
  const pACommitment = await encodePolynomialBufferWithSigma1(runtime, crs, state.setup, pAXY);
  const lhsACommitment = lhsArithFromProverOutput(runtime, crs.G, prove0Output, evaluations, tNEval, tSMaxEval, kappa1);
  assertG1Equal(runtime, lhsACommitment, pACommitment, "prove4 arithmetic numerator commitment");
  assertRuffiniDivisionAtPoint(runtime, {
    label: "prove4 arithmetic opening",
    numerator: pAXY,
    quotientX: piADivision.quotientX,
    quotientY: piADivision.quotientY,
    xRoot: chi,
    yRoot: zeta,
  });

  const RXY = linearCombinationBuffer(field, [
    [field.one, rXY],
    [state.mixer.rR_X, state.instance.tMi],
    [state.mixer.rR_Y, state.instance.tSMax],
  ]);
  const mDivision = RXY
    .sub(constantPolynomialBuffer(field, evaluations.R_omegaX_eval))
    .divByRuffini(field.mul(omegaMIInv, chi), zeta);
  assertRuffiniDivisionAtPoint(runtime, {
    label: "prove4 M opening",
    numerator: RXY.sub(constantPolynomialBuffer(field, evaluations.R_omegaX_eval)),
    quotientX: mDivision.quotientX,
    quotientY: mDivision.quotientY,
    xRoot: field.mul(omegaMIInv, chi),
    yRoot: zeta,
  });

  const nNumerator = RXY.sub(constantPolynomialBuffer(field, evaluations.R_omegaX_omegaY_eval));
  const nDivision = nNumerator.divByRuffini(field.mul(omegaMIInv, chi), field.mul(omegaSMaxInv, zeta));
  assertRuffiniDivisionAtPoint(runtime, {
    label: "prove4 N opening",
    numerator: nNumerator,
    quotientX: nDivision.quotientX,
    quotientY: nDivision.quotientY,
    xRoot: field.mul(omegaMIInv, chi),
    yRoot: field.mul(omegaSMaxInv, zeta),
  });

  const copyOpeningNumerator = await buildCopyOpeningNumerator({
    runtime,
    state,
    rXY,
    RXY,
    initialRelation: prove0Output,
    copyQuotient: prove2Output,
    evaluations,
    thetas,
    kappa0,
    kappa1,
    chi,
    zeta,
    omegaMIInv,
    omegaSMaxInv,
  });
  const copyDivision = copyOpeningNumerator.divByRuffini(chi, zeta);
  assertRuffiniDivisionAtPoint(runtime, {
    label: "prove4 copy opening",
    numerator: copyOpeningNumerator,
    quotientX: copyDivision.quotientX,
    quotientY: copyDivision.quotientY,
    xRoot: chi,
    yRoot: zeta,
  });

  const aEval = state.instance.aFreeX.eval(chi, zeta);
  const bindingNumerator = state.instance.aFreeX.sub(constantPolynomial(field, aEval));
  const bindingDivision = bindingNumerator.divByRuffini(chi, zeta);
  assertRuffiniDivisionAtPoint(runtime, {
    label: "prove4 binding opening",
    numerator: bindingNumerator,
    quotientX: bindingDivision.quotientX,
    quotientY: bindingDivision.quotientY,
    xRoot: chi,
    yRoot: zeta,
  });
}

async function checkVerifierTestingModeSplitPairings(
  runtime: CurveRuntime,
  input: VerifierInput,
  prove4Output: OpeningCommitmentsComputation,
): Promise<void> {
  const challenges = await collectChallenges(runtime.Fr, runtime.G1, () => runtime.Fr.one, input.proof);
  const domain = buildDomainContext(runtime.Fr, input.setup, challenges);
  const lagrangeK0Eval = evalLagrangeK0(runtime.Fr, domain, challenges);
  const aEval = evalAPub(input.aPubX, challenges);

  await assertPairing(runtime, "verifier arith split", verifyArithSplit(runtime, input, domain, challenges, prove4Output));
  await assertPairing(
    runtime,
    "verifier copy split",
    verifyCopySplit(runtime, input, domain, challenges, lagrangeK0Eval, prove4Output),
  );
  await assertPairing(
    runtime,
    "verifier binding split",
    verifyBindingSplit(runtime, input, challenges, aEval, prove4Output),
  );
}

async function verifyArithSplit(
  runtime: CurveRuntime,
  input: VerifierInput,
  domain: VerifierDomainContext,
  challenges: VerifierChallenges,
  prove4Output: OpeningCommitmentsComputation,
): Promise<boolean> {
  const Pi_AX = runtime.G1.toAffine(prove4Output.debug.Pi_AX);
  const Pi_AY = runtime.G1.toAffine(prove4Output.debug.Pi_AY);
  const lhsA = lhsArith(runtime.Fr, runtime.G1, input, domain, challenges);
  const auxA = g1AddMany(runtime.G1, [
    runtime.G1.mulScalar(Pi_AX, challenges.chi),
    runtime.G1.mulScalar(Pi_AY, challenges.zeta),
  ]);

  return runtime.pairing.productsEqual(
    [{ g1: runtime.G1.add(lhsA, auxA), g2: input.sigma.H }],
    [
      { g1: Pi_AX, g2: input.sigma.sigma2.x },
      { g1: Pi_AY, g2: input.sigma.sigma2.y },
    ],
  );
}

async function verifyCopySplit(
  runtime: CurveRuntime,
  input: VerifierInput,
  domain: VerifierDomainContext,
  challenges: VerifierChallenges,
  lagrangeK0Eval: FieldElement,
  prove4Output: OpeningCommitmentsComputation,
): Promise<boolean> {
  const field = runtime.Fr;
  const lhsC = await lhsCopyMsm(field, runtime.G1, input, domain, challenges, lagrangeK0Eval);
  const { aux, auxX, auxY } = copyAux(runtime, prove4Output.debug, domain, challenges);

  return runtime.pairing.productsEqual(
    [{ g1: runtime.G1.add(lhsC, aux), g2: input.sigma.H }],
    [
      { g1: auxX, g2: input.sigma.sigma2.x },
      { g1: auxY, g2: input.sigma.sigma2.y },
    ],
  );
}

async function verifyBindingSplit(
  runtime: CurveRuntime,
  input: VerifierInput,
  challenges: VerifierChallenges,
  aEval: FieldElement,
  prove4Output: OpeningCommitmentsComputation,
): Promise<boolean> {
  const field = runtime.Fr;
  const Pi_B = runtime.G1.toAffine(prove4Output.debug.Pi_B);
  const proof0 = input.proof.proof0;
  const binding = input.proof.binding;
  const lhsB = lhsBinding(field, runtime.G1, input.proof, input.sigma.G, challenges, aEval);
  const auxB = runtime.G1.mulScalar(Pi_B, field.mul(challenges.kappa2, challenges.chi));

  return runtime.pairing.productsEqual(
    [
      { g1: runtime.G1.add(lhsB, auxB), g2: input.sigma.H },
      { g1: proof0.B, g2: input.sigma.sigma2.alpha4 },
      { g1: proof0.U, g2: input.sigma.sigma2.alpha },
      { g1: proof0.V, g2: input.sigma.sigma2.alpha2 },
      { g1: proof0.W, g2: input.sigma.sigma2.alpha3 },
    ],
    [
      { g1: runtime.G1.add(input.preprocess.O_pub_fix, binding.O_pub_free), g2: input.sigma.sigma2.gamma },
      { g1: binding.O_mid, g2: input.sigma.sigma2.eta },
      { g1: binding.O_prv, g2: input.sigma.sigma2.delta },
      { g1: runtime.G1.mulScalar(Pi_B, challenges.kappa2), g2: input.sigma.sigma2.x },
    ],
  );
}

function copyAux(
  runtime: CurveRuntime,
  proof4: OpeningCommitmentsComputation["debug"],
  domain: VerifierDomainContext,
  challenges: VerifierChallenges,
): { readonly aux: G1Point; readonly auxX: G1Point; readonly auxY: G1Point } {
  const field = runtime.Fr;
  const Pi_CX = runtime.G1.toAffine(proof4.Pi_CX);
  const Pi_CY = runtime.G1.toAffine(proof4.Pi_CY);
  const M_X = runtime.G1.toAffine(proof4.M_X);
  const M_Y = runtime.G1.toAffine(proof4.M_Y);
  const N_X = runtime.G1.toAffine(proof4.N_X);
  const N_Y = runtime.G1.toAffine(proof4.N_Y);
  const kappa2Squared = field.square(challenges.kappa2);
  const omegaMIInv = field.inv(domain.omegaMI);
  const omegaSMaxInv = field.inv(domain.omegaSMax);
  const aux = g1AddMany(runtime.G1, [
    runtime.G1.mulScalar(Pi_CX, challenges.chi),
    runtime.G1.mulScalar(Pi_CY, challenges.zeta),
    runtime.G1.mulScalar(M_X, field.mul(field.mul(challenges.kappa2, omegaMIInv), challenges.chi)),
    runtime.G1.mulScalar(M_Y, field.mul(challenges.kappa2, challenges.zeta)),
    runtime.G1.mulScalar(N_X, field.mul(field.mul(kappa2Squared, omegaMIInv), challenges.chi)),
    runtime.G1.mulScalar(N_Y, field.mul(field.mul(kappa2Squared, omegaSMaxInv), challenges.zeta)),
  ]);
  const auxX = g1AddMany(runtime.G1, [
    Pi_CX,
    runtime.G1.mulScalar(M_X, challenges.kappa2),
    runtime.G1.mulScalar(N_X, kappa2Squared),
  ]);
  const auxY = g1AddMany(runtime.G1, [
    Pi_CY,
    runtime.G1.mulScalar(M_Y, challenges.kappa2),
    runtime.G1.mulScalar(N_Y, kappa2Squared),
  ]);

  return { aux, auxX, auxY };
}

function lhsArithFromProverOutput(
  runtime: CurveRuntime,
  sigmaG: G1Point,
  prove0Output: InitialRelationComputation,
  evaluations: ChallengeEvaluations,
  tNEval: FieldElement,
  tSMaxEval: FieldElement,
  kappa1: FieldElement,
): G1Point {
  return runtime.G1.sub(
    runtime.G1.sub(
      runtime.G1.sub(
        runtime.G1.add(
          runtime.G1.sub(runtime.G1.mulScalar(prove0Output.commitments.U, evaluations.V_eval), prove0Output.commitments.W),
          runtime.G1.mulScalar(
            runtime.G1.sub(prove0Output.commitments.V, runtime.G1.mulScalar(sigmaG, evaluations.V_eval)),
            kappa1,
          ),
        ),
        runtime.G1.mulScalar(prove0Output.commitments.Q_AX, tNEval),
      ),
      runtime.G1.mulScalar(prove0Output.commitments.Q_AY, tSMaxEval),
    ),
    runtime.G1.zero,
  );
}

async function buildCopyQuotientNumerator(
  runtime: CurveRuntime,
  state: ProverState,
  rXY: BivariatePolynomialBuffer,
  thetas: readonly FieldElement[],
  kappa0: FieldElement,
): Promise<{ readonly pCombined: BivariatePolynomialBuffer }> {
  const field = runtime.Fr;
  const mI = state.setup.l_D - state.setup.l;
  const sMax = state.setup.s_max;
  const kappa0Sq = field.square(kappa0);
  const omegaMI = field.rootOfUnity(mI);
  const omegaSMax = field.rootOfUnity(sMax);
  const rOmegaX = rXY.scaleCoeffsX(field.inv(omegaMI));
  const rOmegaXOmegaY = rOmegaX.scaleCoeffsY(field.inv(omegaSMax));
  const { fXY, gXY } = buildCopyPolynomials(runtime, state, thetas);
  const lagrangeKlXY = await buildLagrangeKl(field, mI, sMax);
  const lagrangeK0XY = await buildLagrangeK0(field, mI);
  const rGXY = await rXY.mul(gXY);
  const p1XY = await rXY.sub(constantPolynomialBuffer(field, field.one)).mul(lagrangeKlXY);
  const p2XY = mulByXMinusOne(rGXY.sub(await rOmegaX.mul(fXY)));
  const p3XY = await lagrangeK0XY.mul(rGXY.sub(await rOmegaXOmegaY.mul(fXY)));

  return {
    pCombined: linearCombinationBuffer(field, [
      [field.one, p1XY],
      [kappa0, p2XY],
      [kappa0Sq, p3XY],
    ]),
  };
}

async function buildCopyOpeningNumerator(input: {
  readonly runtime: CurveRuntime;
  readonly state: ProverState;
  readonly rXY: BivariatePolynomialBuffer;
  readonly RXY: BivariatePolynomialBuffer;
  readonly initialRelation: InitialRelationComputation;
  readonly copyQuotient: CopyQuotientComputation;
  readonly evaluations: ChallengeEvaluations;
  readonly thetas: readonly FieldElement[];
  readonly kappa0: FieldElement;
  readonly kappa1: FieldElement;
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
    initialRelation: prove0Output,
    copyQuotient: prove2Output,
    evaluations,
    thetas,
    kappa0,
    kappa1,
    chi,
    zeta,
  } = input;
  const field = runtime.Fr;
  const mI = state.setup.l_D - state.setup.l;
  const sMax = state.setup.s_max;
  const kappa0Sq = field.square(kappa0);
  const { fXY, gXY } = buildCopyPolynomials(runtime, state, thetas);
  const omegaMIInv = input.omegaMIInv;
  const omegaSMaxInv = input.omegaSMaxInv;
  const rOmegaX = rXY.scaleCoeffsX(omegaMIInv);
  const rOmegaXOmegaY = rOmegaX.scaleCoeffsY(omegaSMaxInv);
  const tMiEval = field.sub(field.pow(chi, mI), field.one);
  const tSMaxEval = field.sub(field.pow(zeta, sMax), field.one);
  const lagrangeK0XY = await buildLagrangeK0(field, mI);
  const lagrangeK0Eval = lagrangeK0XY.eval(chi, zeta);
  const smallREval = rXY.eval(chi, zeta);
  const smallROmegaXEval = rOmegaX.eval(chi, zeta);
  const smallROmegaXOmegaYEval = rOmegaXOmegaY.eval(chi, zeta);
  const term5 = linearCombinationBuffer(field, [
    [smallREval, gXY],
    [field.neg(smallROmegaXEval), fXY],
  ]);
  const term6 = linearCombinationBuffer(field, [
    [smallREval, gXY],
    [field.neg(smallROmegaXOmegaYEval), fXY],
  ]);
  const pCXY = linearCombinationBuffer(field, [
    [field.sub(smallREval, field.one), prove2Output.lagrangeKlXY],
    [field.mul(kappa0, field.sub(chi, field.one)), term5],
    [field.mul(kappa0Sq, lagrangeK0Eval), term6],
    [field.neg(tMiEval), prove2Output.q2XY],
    [field.neg(tSMaxEval), prove2Output.q3XY],
  ]);
  const rD1 = rXY.sub(rOmegaX);
  const rD2 = rXY.sub(rOmegaXOmegaY);
  const rD1Eval = rD1.eval(chi, zeta);
  const rD2Eval = rD2.eval(chi, zeta);
  const gMinusF = gXY.sub(fXY);
  const term10Scale = field.add(field.mul(state.mixer.rR_X, tMiEval), field.mul(state.mixer.rR_Y, tSMaxEval));
  const term10 = gMinusF.scale(term10Scale);
  const rD1Term9 = mulByTerm9(rD1, state.mixer.rB_X, state.mixer.rB_Y, tMiEval, tSMaxEval);
  const rD1Term9PlusTerm10 = rD1Term9.add(term10);
  const lhsZk1 = linearCombinationBuffer(field, [
    [field.mul(field.sub(chi, field.one), rD1Eval), prove0Output.termBZk],
    [field.one, mulByOneMinusX(rD1Term9PlusTerm10)],
    [field.sub(chi, field.one), term10],
  ]);
  const rD2Term9 = mulByTerm9(rD2, state.mixer.rB_X, state.mixer.rB_Y, tMiEval, tSMaxEval);
  const rD2Term9PlusTerm10 = rD2Term9.add(term10);
  const lhsZk2Product = await lagrangeK0XY.mul(rD2Term9PlusTerm10);
  const lhsZk2 = linearCombinationBuffer(field, [
    [field.mul(lagrangeK0Eval, rD2Eval), prove0Output.termBZk],
    [lagrangeK0Eval, term10],
    [field.neg(field.one), lhsZk2Product],
  ]);
  const rMinusEval = RXY.sub(constantPolynomialBuffer(field, evaluations.R_eval));
  const kappa1SqActual = field.square(kappa1);
  const kappa1Cube = field.mul(kappa1SqActual, kappa1);

  return linearCombinationBuffer(field, [
    [kappa1SqActual, pCXY],
    [field.mul(kappa1SqActual, kappa0), lhsZk1],
    [field.mul(kappa1SqActual, kappa0Sq), lhsZk2],
    [kappa1Cube, rMinusEval],
  ]);
}

function buildCopyPolynomials(
  runtime: CurveRuntime,
  state: ProverState,
  thetas: readonly FieldElement[],
): { readonly fXY: BivariatePolynomialBuffer; readonly gXY: BivariatePolynomialBuffer } {
  if (thetas.length < 3) {
    throw new Error("Copy polynomial construction requires at least three theta challenges.");
  }

  const field = runtime.Fr;
  const xMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 2, 1);
  const yMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 1, 2);
  const theta2 = constantPolynomialBuffer(field, thetas[2]);

  return {
    fXY: linearCombinationBuffer(field, [
      [field.one, state.witness.bXY],
      [thetas[0], state.instance.s0XY],
      [thetas[1], state.instance.s1XY],
      [field.one, theta2],
    ]),
    gXY: linearCombinationBuffer(field, [
      [field.one, state.witness.bXY],
      [thetas[0], xMonomial],
      [thetas[1], yMonomial],
      [field.one, theta2],
    ]),
  };
}

function assertVanishingQuotientAtPoint(
  runtime: CurveRuntime,
  input: {
    readonly label: string;
    readonly numerator: BivariatePolynomialBuffer;
    readonly quotientX: BivariatePolynomialBuffer;
    readonly quotientY: BivariatePolynomialBuffer;
    readonly xDegree: number;
    readonly yDegree: number;
    readonly xPoint: FieldElement;
    readonly yPoint: FieldElement;
  },
): void {
  const field = runtime.Fr;
  const numeratorEval = input.numerator.eval(input.xPoint, input.yPoint);
  const rhs = field.add(
    field.mul(input.quotientX.eval(input.xPoint, input.yPoint), field.sub(field.pow(input.xPoint, input.xDegree), field.one)),
    field.mul(input.quotientY.eval(input.xPoint, input.yPoint), field.sub(field.pow(input.yPoint, input.yDegree), field.one)),
  );
  assertFieldEqual(runtime, numeratorEval, rhs, { label: input.label });
}

function assertRuffiniDivisionAtPoint(
  runtime: CurveRuntime,
  input: {
    readonly label: string;
    readonly numerator: BivariatePolynomialBuffer;
    readonly quotientX: BivariatePolynomialBuffer;
    readonly quotientY: BivariatePolynomialBuffer;
    readonly xRoot: FieldElement;
    readonly yRoot: FieldElement;
  },
): void {
  const field = runtime.Fr;
  const division = input.numerator.divByRuffini(input.xRoot, input.yRoot);
  assertFieldEqual(runtime, division.remainder, field.zero, { label: `${input.label} remainder` });

  const xPoint = field.fromBigInt(29n);
  const yPoint = field.fromBigInt(31n);
  const rhs = field.add(
    field.mul(input.quotientX.eval(xPoint, yPoint), field.sub(xPoint, input.xRoot)),
    field.mul(input.quotientY.eval(xPoint, yPoint), field.sub(yPoint, input.yRoot)),
  );
  assertFieldEqual(runtime, input.numerator.eval(xPoint, yPoint), rhs, { label: `${input.label} reconstruction` });
}

async function assertPairing(runtime: CurveRuntime, label: string, result: Promise<boolean>): Promise<void> {
  if (!(await result)) {
    throw new Error(`${label} pairing equation failed.`);
  }
}

function assertFieldBufferEqual(
  runtime: CurveRuntime,
  actual: Uint8Array,
  expected: Uint8Array,
  label: string,
): void {
  const field = runtime.Fr;
  const count = field.bufferElementCount(actual);
  if (field.bufferElementCount(expected) !== count) {
    throw new Error(`${label} length mismatch.`);
  }

  for (let index = 0; index < count; index += 1) {
    assertFieldEqual(runtime, readField(field, actual, index), readField(field, expected, index), { label, index });
  }
}

function assertPolynomialEqual(
  runtime: CurveRuntime,
  actual: BivariatePolynomialBuffer,
  expected: BivariatePolynomialBuffer,
  label: string,
): void {
  const xSize = Math.max(actual.xSize, expected.xSize);
  const ySize = Math.max(actual.ySize, expected.ySize);
  for (let x = 0; x < xSize; x += 1) {
    for (let y = 0; y < ySize; y += 1) {
      const actualCoeff = x < actual.xSize && y < actual.ySize ? actual.getCoeff(x, y) : runtime.Fr.zero;
      const expectedCoeff = x < expected.xSize && y < expected.ySize ? expected.getCoeff(x, y) : runtime.Fr.zero;
      assertFieldEqual(runtime, actualCoeff, expectedCoeff, { label: `${label} coefficient`, index: x * ySize + y });
    }
  }
}

function assertFieldEqual(
  runtime: CurveRuntime,
  actual: FieldElement,
  expected: FieldElement,
  context: { readonly label: string; readonly index?: number },
): void {
  if (!runtime.Fr.eq(actual, expected)) {
    const suffix = context.index === undefined ? "" : ` at index ${context.index}`;
    throw new Error(
      `${context.label}${suffix} failed: actual=${runtime.Fr.toHex(actual)}, expected=${runtime.Fr.toHex(expected)}.`,
    );
  }
}

function assertG1Equal(runtime: CurveRuntime, actual: G1Point, expected: G1Point, label: string): void {
  if (!runtime.G1.eq(actual, expected)) {
    throw new Error(
      [
        `${label} failed.`,
        `actual=${JSON.stringify(runtime.G1.formatAffine(actual))}`,
        `expected=${JSON.stringify(runtime.G1.formatAffine(expected))}`,
      ].join(" "),
    );
  }
}

function productBuffer(field: CurveRuntime["Fr"], buffer: Uint8Array): FieldElement {
  let product = field.one;
  const count = field.bufferElementCount(buffer);
  for (let index = 0; index < count; index += 1) {
    product = field.mul(product, readField(field, buffer, index));
  }
  return product;
}

function readField(field: CurveRuntime["Fr"], buffer: Uint8Array, index: number): FieldElement {
  return field.readBufferElement(buffer, index);
}

function powerTable(field: CurveRuntime["Fr"], base: FieldElement, length: number): FieldElement[] {
  const output = Array.from({ length }, () => field.one);
  for (let index = 1; index < length; index += 1) {
    output[index] = field.mul(output[index - 1], base);
  }
  return output;
}

function constantPolynomial(field: CurveRuntime["Fr"], value: FieldElement): BivariatePolynomialBuffer {
  return BivariatePolynomialBuffer.fromCoeffs(field, [value], 1, 1);
}

async function timed<T>(label: string, callback: () => Promise<T>): Promise<T> {
  const start = performance.now();
  console.log(`Starting ${label}...`);
  const result = await callback();
  console.log(`Finished ${label} in ${formatDuration(performance.now() - start)}.`);
  return result;
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${milliseconds.toFixed(0)} ms`;
  }

  return `${(milliseconds / 1000).toFixed(2)} s`;
}

function collectThetaChallenges(
  runtime: CurveRuntime,
  transcript: RollingKeccakTranscript,
  proof0: {
    readonly U: Uint8Array;
    readonly V: Uint8Array;
    readonly W: Uint8Array;
    readonly Q_AX: Uint8Array;
    readonly Q_AY: Uint8Array;
    readonly B: Uint8Array;
  },
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
  proof2: { readonly Q_CX: Uint8Array; readonly Q_CY: Uint8Array },
): { readonly chi: FieldElement; readonly zeta: FieldElement } {
  transcript.commitG1Point(proof2.Q_CX, runtime.G1).commitG1Point(proof2.Q_CY, runtime.G1);

  return {
    chi: transcript.squeezeChallenge(),
    zeta: transcript.squeezeChallenge(),
  };
}

function collectKappa1Challenge(
  transcript: RollingKeccakTranscript,
  evaluations: {
    readonly V_eval: FieldElement;
    readonly R_eval: FieldElement;
    readonly R_omegaX_eval: FieldElement;
    readonly R_omegaX_omegaY_eval: FieldElement;
  },
): FieldElement {
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

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
