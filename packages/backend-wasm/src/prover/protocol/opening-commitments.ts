import { BivariatePolynomialBuffer } from "../../runtime/polynomial/bivariate-polynomial-buffer.js";
import type { CurveRuntime } from "../../runtime/curve/curve.js";
import type { FieldElement } from "../../runtime/field/field-runtime.js";
import type { ProverCrsRuntime } from "../api/binary-input.js";
import {
  constantPolynomialBuffer,
  linearCombinationBufferBatch,
} from "../polynomial/linear-combinations.js";
import {
  evaluateAtScaledChallengeSetBatch,
  evaluateLagrangeK0At,
} from "../polynomial/evaluation.js";
import {
  mulByOneMinusX,
  mulByTerm9,
} from "../polynomial/special-products.js";
import {
  multiplyByLagrangeK0,
} from "../polynomial/recursion.js";
import type { InitialRelationComputation, ProverOperationOptions } from "./initial-relation.js";
import { encodePolynomialBufferWithSigma1 } from "../commitments/sigma1-encoder.js";
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

export interface OpeningCommitmentsComputation {
  readonly commitments: OpeningProofCommitments;
}

export interface CopyOpeningCommitments {
  readonly M_X: Uint8Array;
  readonly M_Y: Uint8Array;
  readonly N_X: Uint8Array;
  readonly N_Y: Uint8Array;
}

export interface CopyOpeningComputation {
  readonly commitments: CopyOpeningCommitments;
  readonly RXY: BivariatePolynomialBuffer;
}

export interface IntegratedOpeningCommitments {
  readonly Pi_X: Uint8Array;
  readonly Pi_Y: Uint8Array;
}

export interface IntegratedOpeningComputation {
  readonly commitments: IntegratedOpeningCommitments;
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
  const copyOpenings = await computeCopyOpeningCommitments({
    runtime: input.runtime,
    crs: input.crs,
    state: input.state,
    rXY: input.rXY,
    chi: input.chi,
    zeta: input.zeta,
    options: input.options,
  });
  const integratedOpenings = await computeIntegratedOpeningCommitments({
    ...input,
    copyOpenings,
  });

  return combineOpeningCommitments(copyOpenings, integratedOpenings);
}

export async function computeCopyOpeningCommitments(input: {
  readonly runtime: CurveRuntime;
  readonly crs: ProverCrsRuntime;
  readonly state: ProverState;
  readonly rXY: BivariatePolynomialBuffer;
  readonly chi: FieldElement;
  readonly zeta: FieldElement;
  readonly options?: ProverOperationOptions;
}): Promise<CopyOpeningComputation> {
  const {
    runtime,
    crs,
    state,
    rXY,
    chi,
    zeta,
    options = {},
  } = input;

  const field = runtime.Fr;
  const mI = state.setup.l_D - state.setup.l;
  const sMax = state.setup.s_max;
  const omegaMIInv = field.inv(field.rootOfUnity(mI));
  const omegaSMaxInv = field.inv(field.rootOfUnity(sMax));
  const RXY = await linearCombinationBufferBatch(field, [
    [field.one, rXY],
    [state.mixer.rR_X, state.instance.tMi],
    [state.mixer.rR_Y, state.instance.tSMax],
  ]);
  const sharedXDivision = await field.ruffiniXBuffer(
    RXY.coefficients,
    RXY.xSize,
    RXY.ySize,
    field.mul(omegaMIInv, chi),
  );
  const mYDivision = await field.ruffiniYBuffer(
    sharedXDivision.remainder,
    RXY.ySize,
    zeta,
  );
  const nYDivision = await field.ruffiniYBuffer(
    sharedXDivision.remainder,
    RXY.ySize,
    field.mul(omegaSMaxInv, zeta),
  );
  const sharedXQuotient = BivariatePolynomialBuffer.fromOwnedBuffer(
    field,
    sharedXDivision.quotient,
    RXY.xSize,
    RXY.ySize,
  );
  const mYQuotient = BivariatePolynomialBuffer.fromOwnedBuffer(
    field,
    mYDivision.quotient,
    1,
    RXY.ySize,
  );
  const nYQuotient = BivariatePolynomialBuffer.fromOwnedBuffer(
    field,
    nYDivision.quotient,
    1,
    RXY.ySize,
  );
  const encode = options.commitmentEncoder
    ?? ((polynomial: BivariatePolynomialBuffer) =>
      encodePolynomialBufferWithSigma1(runtime, crs, state.setup, polynomial));
  const M_X = await encode(sharedXQuotient);
  const M_Y = await encode(mYQuotient);
  const N_X = M_X;
  const N_Y = await encode(nYQuotient);

  return {
    commitments: { M_X, M_Y, N_X, N_Y },
    RXY,
  };
}

export async function computeIntegratedOpeningCommitments(input: {
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
  readonly copyOpenings: CopyOpeningComputation;
  readonly options?: ProverOperationOptions;
}): Promise<IntegratedOpeningComputation> {
  const {
    runtime,
    crs,
    state,
    rXY,
    initialRelation,
    copyQuotient,
    thetas,
    kappa0,
    chi,
    zeta,
    kappa1,
    copyOpenings,
    options = {},
  } = input;
  if (thetas.length < 3) {
    throw new Error("computeIntegratedOpeningCommitments requires at least three theta challenges.");
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
  const smallVEval = await state.witness.vXY.evalBatch(chi, zeta);
  const rW_X = BivariatePolynomialBuffer.fromCoeffs(field, state.mixer.rW_X, state.mixer.rW_X.length, 1);
  const rW_Y = BivariatePolynomialBuffer.fromCoeffs(field, state.mixer.rW_Y, 1, state.mixer.rW_Y.length);
  const VXY = await linearCombinationBufferBatch(field, [
    [field.one, state.witness.vXY],
    [state.mixer.rV_X, state.instance.tN],
    [state.mixer.rV_Y, state.instance.tSMax],
  ]);
  const pAXY = await linearCombinationBufferBatch(field, [
    [kappa1, VXY],
    [smallVEval, state.witness.uXY],
    [field.neg(field.one), state.witness.wXY],
    [field.neg(tNEval), initialRelation.q0XY],
    [field.neg(tSMaxEval), initialRelation.q1XY],
    [field.mul(smallVEval, state.mixer.rU_X), state.instance.tN],
    [field.mul(smallVEval, state.mixer.rU_Y), state.instance.tSMax],
    [
      field.neg(field.add(field.mul(state.mixer.rU_X, tNEval), field.mul(state.mixer.rU_Y, tSMaxEval))),
      state.witness.vXY,
    ],
    [tNEval, rW_X],
    [tSMaxEval, rW_Y],
    [field.neg(field.one), initialRelation.wZk],
  ]);
  const copyOpeningNumerator = await buildCopyOpeningNumerator({
    runtime,
    state,
    rXY,
    RXY: copyOpenings.RXY,
    initialRelation,
    copyQuotient,
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
  const combinedPiNumerator = await linearCombinationBufferBatch(field, [
    [field.one, pAXY],
    [field.one, copyOpeningNumerator],
    [kappa1Fourth, state.instance.aFreeX],
  ]);
  const combinedPiDivision = await combinedPiNumerator.divByRuffiniBatch(chi, zeta);
  const encode = options.commitmentEncoder
    ?? ((polynomial: BivariatePolynomialBuffer) =>
      encodePolynomialBufferWithSigma1(runtime, crs, state.setup, polynomial));

  return {
    commitments: {
      Pi_X: await encode(combinedPiDivision.quotientX),
      Pi_Y: await encode(combinedPiDivision.quotientY),
    },
  };
}

export function combineOpeningCommitments(
  copyOpenings: CopyOpeningComputation,
  integratedOpenings: IntegratedOpeningComputation,
): OpeningCommitmentsComputation {
  return {
    commitments: {
      ...integratedOpenings.commitments,
      ...copyOpenings.commitments,
    },
  };
}

async function buildCopyOpeningNumerator(input: {
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
    initialRelation,
    copyQuotient,
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
    [field.one, state.witness.bXY],
    [thetas[0], state.instance.s0XY],
    [thetas[1], state.instance.s1XY],
    [field.one, theta2],
  ]);
  const gXY = await linearCombinationBufferBatch(field, [
    [field.one, state.witness.bXY],
    [thetas[0], xMonomial],
    [thetas[1], yMonomial],
    [field.one, theta2],
  ]);
  const tMiEval = field.sub(field.pow(chi, mI), field.one);
  const tSMaxEval = field.sub(field.pow(zeta, sMax), field.one);
  const lagrangeK0Eval = evaluateLagrangeK0At(field, mI, chi, tMiEval);
  const [smallREval, smallROmegaXEval, smallROmegaXOmegaYEval] = await evaluateAtScaledChallengeSetBatch(
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
  const rD1Term9 = await mulByTerm9(rD1, state.mixer.rB_X, state.mixer.rB_Y, tMiEval, tSMaxEval);
  const rD1Term9PlusTerm10 = await linearCombinationBufferBatch(field, [
    [field.one, rD1Term9],
    [field.one, term10],
  ]);
  const lhsZk1 = await linearCombinationBufferBatch(field, [
    [field.mul(field.sub(chi, field.one), rD1Eval), initialRelation.termBZk],
    [field.one, await mulByOneMinusX(rD1Term9PlusTerm10)],
    [field.sub(chi, field.one), term10],
  ]);
  const rD2Term9 = await mulByTerm9(rD2, state.mixer.rB_X, state.mixer.rB_Y, tMiEval, tSMaxEval);
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
  return lhsForCopy;
}
