import { BivariatePolynomialBuffer } from "../../../src/core/polynomial/bivariate-polynomial-buffer.js";
import type { CurveRuntime } from "../../../src/core/curve/curve.js";
import type { FieldElement } from "../../../src/core/field/field.js";
import {
  constantPolynomialBuffer,
  evaluateAtScaledChallengeSetBatch,
  evaluateLagrangeK0At,
  linearCombinationBufferBatch,
  mulByOneMinusX,
  mulByTerm9,
  multiplyByLagrangeK0,
} from "../../../src/prover/internal/polynomial-ops.js";
import type { PreparedProverContext } from "../support/prepared-prover-context.js";

export interface OpeningBenchmarkInputs {
  readonly piANumerator: BivariatePolynomialBuffer;
  readonly piCNumerator: BivariatePolynomialBuffer;
  readonly piBNumerator: BivariatePolynomialBuffer;
  readonly rXYWithBlinding: BivariatePolynomialBuffer;
  readonly chi: FieldElement;
  readonly zeta: FieldElement;
  readonly mXPoint: FieldElement;
  readonly nYPoint: FieldElement;
  readonly piAConstant: FieldElement;
  readonly piCConstant: FieldElement;
  readonly piBConstant: FieldElement;
  readonly kappa1Fourth: FieldElement;
}

export async function buildOpeningBenchmarkInputs(
  runtime: CurveRuntime,
  context: PreparedProverContext,
): Promise<OpeningBenchmarkInputs> {
  const { state, initialRelation, evaluations, kappa0, chi, zeta, kappa1 } = context;
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
  const smallVEval = await state.witnessBuffers.vXY.evalBatch(chi, zeta);
  const rW_X = BivariatePolynomialBuffer.fromCoeffs(field, state.mixer.rW_X, state.mixer.rW_X.length, 1);
  const rW_Y = BivariatePolynomialBuffer.fromCoeffs(field, state.mixer.rW_Y, 1, state.mixer.rW_Y.length);
  const VXY = await linearCombinationBufferBatch(field, [
    [field.one, state.witnessBuffers.vXY],
    [state.mixer.rV_X, state.instanceBuffers.tN],
    [state.mixer.rV_Y, state.instanceBuffers.tSMax],
  ]);
  const piANumerator = await linearCombinationBufferBatch(field, [
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
  const rXYWithBlinding = await linearCombinationBufferBatch(field, [
    [field.one, context.recursion.rXY],
    [state.mixer.rR_X, state.instanceBuffers.tMi],
    [state.mixer.rR_Y, state.instanceBuffers.tSMax],
  ]);
  const piCNumerator = await buildCopyOpeningNumerator(runtime, context, {
    rXYWithBlinding,
    omegaMIInv,
    omegaSMaxInv,
    kappa0Sq,
    kappa1Sq,
    kappa1Cube,
  });
  const piBConstant = await state.instanceBuffers.aFreeX.evalBatch(chi, zeta);

  return {
    piANumerator,
    piCNumerator,
    piBNumerator: state.instanceBuffers.aFreeX,
    rXYWithBlinding,
    chi,
    zeta,
    mXPoint: field.mul(omegaMIInv, chi),
    nYPoint: field.mul(omegaSMaxInv, zeta),
    piAConstant: field.mul(kappa1, evaluations.V_eval),
    piCConstant: field.mul(kappa1Cube, evaluations.R_eval),
    piBConstant,
    kappa1Fourth,
  };
}

async function buildCopyOpeningNumerator(
  runtime: CurveRuntime,
  context: PreparedProverContext,
  values: {
    readonly rXYWithBlinding: BivariatePolynomialBuffer;
    readonly omegaMIInv: FieldElement;
    readonly omegaSMaxInv: FieldElement;
    readonly kappa0Sq: FieldElement;
    readonly kappa1Sq: FieldElement;
    readonly kappa1Cube: FieldElement;
  },
): Promise<BivariatePolynomialBuffer> {
  const { state, initialRelation, copyQuotient, thetas, kappa0, chi, zeta } = context;
  const { rXYWithBlinding, omegaMIInv, omegaSMaxInv, kappa0Sq, kappa1Sq, kappa1Cube } = values;
  const field = runtime.Fr;
  const mI = state.setup.l_D - state.setup.l;
  const sMax = state.setup.s_max;
  const rOmegaX = await context.recursion.rXY.scaleCoeffsXBatch(omegaMIInv);
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
  const [smallREval, smallROmegaXEval, smallROmegaXOmegaYEval] = await evaluateAtScaledChallengeSetBatch(
    field,
    context.recursion.rXY,
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
  const rD1 = await context.recursion.rXY.subBatch(rOmegaX);
  const rD2 = await context.recursion.rXY.subBatch(rOmegaXOmegaY);
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
  const lhsZk2 = await linearCombinationBufferBatch(field, [
    [field.mul(lagrangeK0Eval, rD2Eval), initialRelation.termBZk],
    [lagrangeK0Eval, term10],
    [field.neg(field.one), await multiplyByLagrangeK0(rD2Term9PlusTerm10, mI)],
  ]);

  return linearCombinationBufferBatch(field, [
    [kappa1Sq, pCXY],
    [field.mul(kappa1Sq, kappa0), lhsZk1],
    [field.mul(kappa1Sq, kappa0Sq), lhsZk2],
    [kappa1Cube, rXYWithBlinding],
  ]);
}
