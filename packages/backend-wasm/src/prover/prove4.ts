import { BivariatePolynomialBuffer } from "../libs/polynomial/bivariate-polynomial-buffer.js";
import { DensePolynomialExt } from "../libs/polynomial/dense-polynomial.js";
import type { CurveRuntime } from "../libs/runtime/curve.js";
import type { FieldElement } from "../libs/runtime/field.js";
import type { ProverCrsRuntime } from "./binary-input.js";
import { encodePolynomialBufferWithSigma1, encodePolynomialWithSigma1, type Prove0Computation } from "./prove0.js";
import type { Prove2Computation } from "./prove2.js";
import type { Prove3Output } from "./prove3.js";
import type { ProverState } from "./state.js";

export interface Prove4Output {
  readonly Pi_X: Uint8Array;
  readonly Pi_Y: Uint8Array;
  readonly M_X: Uint8Array;
  readonly M_Y: Uint8Array;
  readonly N_X: Uint8Array;
  readonly N_Y: Uint8Array;
}

export interface Prove4DebugOutput {
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

export interface Prove4Computation {
  readonly proof4: Prove4Output;
  readonly debug: Prove4DebugOutput;
}

export async function prove4(input: {
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
  const VXY = linearCombinationBuffer(field, [
    [field.one, BivariatePolynomialBuffer.fromDense(state.witness.vXY)],
    [state.mixer.rV_X, BivariatePolynomialBuffer.fromDense(state.instance.tN)],
    [state.mixer.rV_Y, BivariatePolynomialBuffer.fromDense(state.instance.tSMax)],
  ]);
  const pAXY = linearCombinationBuffer(field, [
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
  ]);
  const piADivision = pAXY.divByRuffini(chi, zeta);
  const Pi_AX = await encodePolynomialBufferWithSigma1(runtime, crs, state.setup, piADivision.quotientX);
  const Pi_AY = await encodePolynomialBufferWithSigma1(runtime, crs, state.setup, piADivision.quotientY);
  const RXY = linearCombinationBuffer(field, [
    [field.one, rXY],
    [state.mixer.rR_X, BivariatePolynomialBuffer.fromDense(state.instance.tMi)],
    [state.mixer.rR_Y, BivariatePolynomialBuffer.fromDense(state.instance.tSMax)],
  ]);
  const mDivision = RXY
    .sub(constantPolynomialBuffer(field, proof3.R_omegaX_eval))
    .divByRuffini(field.mul(omegaMIInv, chi), zeta);
  const M_X = await encodePolynomialBufferWithSigma1(runtime, crs, state.setup, mDivision.quotientX);
  const M_Y = await encodePolynomialBufferWithSigma1(runtime, crs, state.setup, mDivision.quotientY);
  const nDivision = RXY
    .sub(constantPolynomialBuffer(field, proof3.R_omegaX_omegaY_eval))
    .divByRuffini(field.mul(omegaMIInv, chi), field.mul(omegaSMaxInv, zeta));
  const N_X = await encodePolynomialBufferWithSigma1(runtime, crs, state.setup, nDivision.quotientX);
  const N_Y = await encodePolynomialBufferWithSigma1(runtime, crs, state.setup, nDivision.quotientY);
  const { Pi_CX, Pi_CY } = await buildCopyOpenings({
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
  const piBDivision = state.instance.aFreeX
    .sub(constantPolynomial(field, aEval))
    .divByRuffini(chi, zeta);
  const Pi_B = runtime.G1.mulScalar(
    await encodePolynomialWithSigma1(runtime, crs, state.setup, piBDivision.quotientX),
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

async function buildCopyOpenings(input: {
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
  const rOmegaX = rXY.scaleCoeffsX(omegaMIInv);
  const rOmegaXOmegaY = rOmegaX.scaleCoeffsY(omegaSMaxInv);
  const xMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 2, 1);
  const yMonomial = BivariatePolynomialBuffer.fromCoeffs(field, [field.zero, field.one], 1, 2);
  const theta2 = constantPolynomialBuffer(field, thetas[2]);
  const fXY = linearCombinationBuffer(field, [
    [field.one, BivariatePolynomialBuffer.fromDense(state.witness.bXY)],
    [thetas[0], BivariatePolynomialBuffer.fromDense(state.instance.s0XY)],
    [thetas[1], BivariatePolynomialBuffer.fromDense(state.instance.s1XY)],
    [field.one, theta2],
  ]);
  const gXY = linearCombinationBuffer(field, [
    [field.one, BivariatePolynomialBuffer.fromDense(state.witness.bXY)],
    [thetas[0], xMonomial],
    [thetas[1], yMonomial],
    [field.one, theta2],
  ]);
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
    [field.sub(smallREval, field.one), prove2.lagrangeKlXY],
    [field.mul(kappa0, field.sub(chi, field.one)), term5],
    [field.mul(kappa0Sq, lagrangeK0Eval), term6],
    [field.neg(tMiEval), prove2.q2XY],
    [field.neg(tSMaxEval), prove2.q3XY],
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
    [field.mul(field.sub(chi, field.one), rD1Eval), prove0.termBZk],
    [field.one, mulByOneMinusX(rD1Term9PlusTerm10)],
    [field.sub(chi, field.one), term10],
  ]);
  const rD2Term9 = mulByTerm9(rD2, state.mixer.rB_X, state.mixer.rB_Y, tMiEval, tSMaxEval);
  const rD2Term9PlusTerm10 = rD2Term9.add(term10);
  const lhsZk2Product = await lagrangeK0XY.mul(rD2Term9PlusTerm10);
  const lhsZk2 = linearCombinationBuffer(field, [
    [field.mul(lagrangeK0Eval, rD2Eval), prove0.termBZk],
    [lagrangeK0Eval, term10],
    [field.neg(field.one), lhsZk2Product],
  ]);
  const rMinusEval = RXY.sub(constantPolynomialBuffer(field, proof3.R_eval));
  const lhsForCopy = linearCombinationBuffer(field, [
    [kappa1Sq, pCXY],
    [field.mul(kappa1Sq, kappa0), lhsZk1],
    [field.mul(field.mul(kappa1Sq, kappa0Sq), field.one), lhsZk2],
    [kappa1Cube, rMinusEval],
  ]);
  const division = lhsForCopy.divByRuffini(chi, zeta);

  return {
    Pi_CX: await encodePolynomialBufferWithSigma1(runtime, crs, state.setup, division.quotientX),
    Pi_CY: await encodePolynomialBufferWithSigma1(runtime, crs, state.setup, division.quotientY),
  };
}

async function buildLagrangeK0(field: CurveRuntime["Fr"], mI: number): Promise<BivariatePolynomialBuffer> {
  const k0Evals = field.createZeroBuffer(mI);
  field.writeBufferElement(k0Evals, 0, field.one);
  return BivariatePolynomialBuffer.fromRouEvals(field, k0Evals, mI, 1);
}

function mulByOneMinusX(polynomial: BivariatePolynomialBuffer): BivariatePolynomialBuffer {
  return polynomial.sub(polynomial.mulMonomial(1, 0));
}

function mulByTerm9(
  polynomial: BivariatePolynomialBuffer,
  rB_X: readonly FieldElement[],
  rB_Y: readonly FieldElement[],
  tMiEval: FieldElement,
  tSMaxEval: FieldElement,
): BivariatePolynomialBuffer {
  if (rB_X.length !== 2 || rB_Y.length !== 2) {
    throw new Error("term9 requires two X blinding coefficients and two Y blinding coefficients.");
  }

  const field = polynomial.field;
  const constant = field.add(field.mul(tMiEval, rB_X[0]), field.mul(tSMaxEval, rB_Y[0]));
  const xCoeff = field.mul(tMiEval, rB_X[1]);
  const yCoeff = field.mul(tSMaxEval, rB_Y[1]);
  return polynomial
    .scale(constant)
    .add(polynomial.mulMonomial(1, 0).scale(xCoeff))
    .add(polynomial.mulMonomial(0, 1).scale(yCoeff));
}

function constantPolynomial(field: CurveRuntime["Fr"], value: FieldElement): DensePolynomialExt {
  return DensePolynomialExt.fromCoeffs(field, [value], 1, 1);
}

function constantPolynomialBuffer(field: CurveRuntime["Fr"], value: FieldElement): BivariatePolynomialBuffer {
  return BivariatePolynomialBuffer.fromCoeffs(field, [value], 1, 1);
}

function linearCombinationBuffer(
  field: CurveRuntime["Fr"],
  terms: readonly (readonly [FieldElement, BivariatePolynomialBuffer])[],
): BivariatePolynomialBuffer {
  let xSize = 1;
  let ySize = 1;
  for (const [, polynomial] of terms) {
    xSize = Math.max(xSize, polynomial.xSize);
    ySize = Math.max(ySize, polynomial.ySize);
  }

  const accumulator = BivariatePolynomialBuffer.zero(field).resize(xSize, ySize);
  for (const [scalar, polynomial] of terms) {
    accumulator.addScaledPrefixAssign(polynomial, scalar);
  }

  return accumulator;
}
