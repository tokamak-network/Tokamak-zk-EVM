import { BivariatePolynomialBuffer } from "../../core/polynomial/bivariate-polynomial-buffer.js";
import type { CurveRuntime } from "../../core/curve/curve.js";
import type { FieldElement } from "../../core/field/field.js";
import type { ProverCrsRuntime } from "../api/binary-input.js";
import {
  constantPolynomialBuffer,
  evaluateAtScaledChallengeSet,
  evaluateLagrangeK0At,
  linearCombinationBufferBatch,
  mulByOneMinusX,
  mulByTerm9,
  multiplyByLagrangeK0,
} from "./polynomial-ops.js";
import { encodePolynomialBufferWithSigma1, type InitialRelationComputation, type ProverOperationOptions } from "./initial-relation.js";
import { encodeSigma1CommitmentBarrier, requireCommitment } from "./commitment-encoder.js";
import type { CopyQuotientComputation } from "./copy-quotient.js";
import type { ChallengeEvaluations } from "./challenge-evaluations.js";
import type { ProverState } from "./state.js";

export interface OpeningProofCommitments {
  readonly Pi_X: Uint8Array;
  readonly Pi_Y: Uint8Array;
  readonly M_X: Uint8Array;
  readonly M_Y: Uint8Array;
  readonly N_X: Uint8Array;
  readonly N_Y: Uint8Array;
}

export interface OpeningDebugCommitments {
  readonly Pi_AX: Uint8Array;
  readonly Pi_AY: Uint8Array;
  readonly Pi_CX: Uint8Array;
  readonly Pi_CY: Uint8Array;
  readonly Pi_B: Uint8Array;
  readonly M_X: Uint8Array;
  readonly M_Y: Uint8Array;
  readonly N_X: Uint8Array;
  readonly N_Y: Uint8Array;
}

export interface OpeningCommitmentsComputation {
  readonly commitments: OpeningProofCommitments;
  readonly debug: OpeningDebugCommitments;
}

export async function computeOpeningCommitments(input: {
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
  readonly options?: ProverOperationOptions;
}): Promise<OpeningCommitmentsComputation> {
  const {
    runtime,
    crs,
    state,
    rXY,
    initialRelation,
    copyQuotient,
    evaluations,
    thetas,
    kappa0,
    chi,
    zeta,
    kappa1,
    options = {},
  } = input;
  if (thetas.length < 3) {
    throw new Error("computeOpeningCommitments requires at least three theta challenges.");
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
  const VXY = await linearCombinationBufferBatch(field, [
    [field.one, state.witnessBuffers.vXY],
    [state.mixer.rV_X, state.instanceBuffers.tN],
    [state.mixer.rV_Y, state.instanceBuffers.tSMax],
  ]);
  const pAXY = await linearCombinationBufferBatch(field, [
    [kappa1, VXY],
    [smallVEval, state.witnessBuffers.uXY],
    [field.neg(field.one), state.witnessBuffers.wXY],
    [field.neg(tNEval), initialRelation.q0XY],
    [field.neg(tSMaxEval), initialRelation.q1XY],
    [field.mul(smallVEval, state.mixer.rU_X), state.instanceBuffers.tN],
    [field.mul(smallVEval, state.mixer.rU_Y), state.instanceBuffers.tSMax],
    [
      field.neg(field.add(field.mul(state.mixer.rU_X, tNEval), field.mul(state.mixer.rU_Y, tSMaxEval))),
      state.witnessBuffers.vXY,
    ],
    [tNEval, rW_X],
    [tSMaxEval, rW_Y],
    [field.neg(field.one), initialRelation.wZk],
  ]);
  const piADivision = await divideAfterSubtractingConstant(
    pAXY,
    chi,
    zeta,
    field.mul(kappa1, evaluations.V_eval),
  );
  const RXY = await linearCombinationBufferBatch(field, [
    [field.one, rXY],
    [state.mixer.rR_X, state.instanceBuffers.tMi],
    [state.mixer.rR_Y, state.instanceBuffers.tSMax],
  ]);
  const mDivision = await divideAfterSubtractingConstant(
    RXY,
    field.mul(omegaMIInv, chi),
    zeta,
    evaluations.R_omegaX_eval,
  );
  const nDivision = await divideAfterSubtractingConstant(
    RXY,
    field.mul(omegaMIInv, chi),
    field.mul(omegaSMaxInv, zeta),
    evaluations.R_omegaX_omegaY_eval,
  );
  const copyDivision = await buildCopyOpeningPolynomials({
    runtime,
    state,
    rXY,
    RXY,
    initialRelation,
    copyQuotient,
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
  const piBDivision = await divideAfterSubtractingConstant(
    state.instanceBuffers.aFreeX,
    chi,
    zeta,
    aEval,
  );
  const commitments = await encodeSigma1CommitmentBarrier(
    options.commitmentEncoder ?? {
      parallelSafe: false,
      encodeSigma1PolynomialBuffer(job) {
        return encodePolynomialBufferWithSigma1(runtime, crs, state.setup, job.polynomial);
      },
    },
    [
      { label: "Pi_AX", polynomial: piADivision.quotientX },
      { label: "Pi_AY", polynomial: piADivision.quotientY },
      { label: "M_X", polynomial: mDivision.quotientX },
      { label: "M_Y", polynomial: mDivision.quotientY },
      { label: "N_X", polynomial: nDivision.quotientX },
      { label: "N_Y", polynomial: nDivision.quotientY },
      { label: "Pi_CX", polynomial: copyDivision.quotientX },
      { label: "Pi_CY", polynomial: copyDivision.quotientY },
      { label: "Pi_B", polynomial: piBDivision.quotientX },
    ],
  );
  const Pi_AX = requireCommitment(commitments, "Pi_AX");
  const Pi_AY = requireCommitment(commitments, "Pi_AY");
  const M_X = requireCommitment(commitments, "M_X");
  const M_Y = requireCommitment(commitments, "M_Y");
  const N_X = requireCommitment(commitments, "N_X");
  const N_Y = requireCommitment(commitments, "N_Y");
  const Pi_CX = requireCommitment(commitments, "Pi_CX");
  const Pi_CY = requireCommitment(commitments, "Pi_CY");
  const Pi_B = runtime.G1.mulScalar(requireCommitment(commitments, "Pi_B"), kappa1Fourth);
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

async function buildCopyOpeningPolynomials(input: {
  readonly runtime: CurveRuntime;
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
}): Promise<{ readonly quotientX: BivariatePolynomialBuffer; readonly quotientY: BivariatePolynomialBuffer }> {
  const {
    runtime,
    state,
    rXY,
    RXY,
    initialRelation,
    copyQuotient,
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
  const rOmegaX = await rXY.scaleCoeffsXBatch(omegaMIInv);
  const rOmegaXOmegaY = BivariatePolynomialBuffer.fromOwnedBuffer(
    field,
    await field.batchApplyKeyBuffer(rOmegaX.coefficients, field.one, omegaSMaxInv),
    rOmegaX.xSize,
    rOmegaX.ySize,
  );
  const xMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 2, 1);
  const yMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 1, 2);
  const theta2 = constantPolynomialBuffer(field, thetas[2]);
  const fXY = await linearCombinationBufferBatch(field, [
    [field.one, state.witnessBuffers.bXY],
    [thetas[0], state.instanceBuffers.s0XY],
    [thetas[1], state.instanceBuffers.s1XY],
    [field.one, theta2],
  ]);
  const gXY = await linearCombinationBufferBatch(field, [
    [field.one, state.witnessBuffers.bXY],
    [thetas[0], xMonomial],
    [thetas[1], yMonomial],
    [field.one, theta2],
  ]);
  const tMiEval = field.sub(field.pow(chi, mI), field.one);
  const tSMaxEval = field.sub(field.pow(zeta, sMax), field.one);
  const lagrangeK0Eval = evaluateLagrangeK0At(field, mI, chi, tMiEval);
  const [smallREval, smallROmegaXEval, smallROmegaXOmegaYEval] = evaluateAtScaledChallengeSet(
    field,
    rXY,
    chi,
    field.mul(omegaMIInv, chi),
    zeta,
    field.mul(omegaSMaxInv, zeta),
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
  const pCXY = await linearCombinationBufferBatch(field, [
    [field.sub(smallREval, field.one), copyQuotient.lagrangeKlXY],
    [gScale, gXY],
    [fScale, fXY],
    [field.neg(tMiEval), copyQuotient.q2XY],
    [field.neg(tSMaxEval), copyQuotient.q3XY],
  ]);
  const rD1 = await rXY.subBatch(rOmegaX);
  const rD2 = await rXY.subBatch(rOmegaXOmegaY);
  const rD1Eval = field.sub(smallREval, smallROmegaXEval);
  const rD2Eval = field.sub(smallREval, smallROmegaXOmegaYEval);
  const gMinusF = await gXY.subBatch(fXY);
  const term10Scale = field.add(field.mul(state.mixer.rR_X, tMiEval), field.mul(state.mixer.rR_Y, tSMaxEval));
  const term10 = BivariatePolynomialBuffer.fromOwnedBuffer(
    field,
    await field.batchApplyKeyBuffer(gMinusF.coefficients, term10Scale, field.one),
    gMinusF.xSize,
    gMinusF.ySize,
  );
  const rD1Term9 = mulByTerm9(rD1, state.mixer.rB_X, state.mixer.rB_Y, tMiEval, tSMaxEval);
  const rD1Term9PlusTerm10 = await linearCombinationBufferBatch(field, [
    [field.one, rD1Term9],
    [field.one, term10],
  ]);
  const lhsZk1 = await linearCombinationBufferBatch(field, [
    [field.mul(field.sub(chi, field.one), rD1Eval), initialRelation.termBZk],
    [field.one, mulByOneMinusX(rD1Term9PlusTerm10)],
    [field.sub(chi, field.one), term10],
  ]);
  const rD2Term9 = mulByTerm9(rD2, state.mixer.rB_X, state.mixer.rB_Y, tMiEval, tSMaxEval);
  const rD2Term9PlusTerm10 = await linearCombinationBufferBatch(field, [
    [field.one, rD2Term9],
    [field.one, term10],
  ]);
  const lhsZk2Product = await multiplyByLagrangeK0(rD2Term9PlusTerm10, mI);
  const lhsZk2 = await linearCombinationBufferBatch(field, [
    [field.mul(lagrangeK0Eval, rD2Eval), initialRelation.termBZk],
    [lagrangeK0Eval, term10],
    [field.neg(field.one), lhsZk2Product],
  ]);
  const lhsForCopy = await linearCombinationBufferBatch(field, [
    [kappa1Sq, pCXY],
    [field.mul(kappa1Sq, kappa0), lhsZk1],
    [field.mul(field.mul(kappa1Sq, kappa0Sq), field.one), lhsZk2],
    [kappa1Cube, RXY],
  ]);
  const division = await divideAfterSubtractingConstant(
    lhsForCopy,
    chi,
    zeta,
    field.mul(kappa1Cube, evaluations.R_eval),
  );

  return {
    quotientX: division.quotientX,
    quotientY: division.quotientY,
  };
}

async function divideAfterSubtractingConstant(
  polynomial: BivariatePolynomialBuffer,
  xPoint: FieldElement,
  yPoint: FieldElement,
  constant: FieldElement,
): Promise<ReturnType<BivariatePolynomialBuffer["divByRuffini"]>> {
  const division = await polynomial.divByRuffiniBatch(xPoint, yPoint);
  return {
    quotientX: division.quotientX,
    quotientY: division.quotientY,
    remainder: polynomial.field.sub(division.remainder, constant),
  };
}
