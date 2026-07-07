import { DensePolynomialExt } from "../libs/polynomial/dense-polynomial.js";
import type { CurveRuntime } from "../libs/runtime/curve.js";
import type { FieldElement } from "../libs/runtime/field.js";
import type { ProverCrsRuntime } from "./binary-input.js";
import { encodePolynomialWithSigma1 } from "./prove0.js";
import type { ProverState } from "./state.js";

export interface Prove2Output {
  readonly Q_CX: Uint8Array;
  readonly Q_CY: Uint8Array;
}

export interface Prove2Computation {
  readonly proof2: Prove2Output;
  readonly q2XY: DensePolynomialExt;
  readonly q3XY: DensePolynomialExt;
  readonly lagrangeKlXY: DensePolynomialExt;
}

export async function prove2(input: {
  readonly runtime: CurveRuntime;
  readonly crs: ProverCrsRuntime;
  readonly state: ProverState;
  readonly rXY: DensePolynomialExt;
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
  const rOmegaX = rXY.scaleCoeffsX(field.inv(omegaMI));
  const rOmegaXOmegaY = rOmegaX.scaleCoeffsY(field.inv(omegaSMax));
  const xMonomial = DensePolynomialExt.fromCoeffs(field, [field.zero, field.one], 2, 1);
  const yMonomial = DensePolynomialExt.fromCoeffs(field, [field.zero, field.one], 1, 2);
  const theta2 = constantPolynomial(field, thetas[2]);
  const fXY = linearCombination(field, [
    [field.one, state.witness.bXY],
    [thetas[0], state.instance.s0XY],
    [thetas[1], state.instance.s1XY],
  ]).add(theta2);
  const gXY = linearCombination(field, [
    [field.one, state.witness.bXY],
    [thetas[0], xMonomial],
    [thetas[1], yMonomial],
  ]).add(theta2);
  const lagrangeKlXY = await buildLagrangeKl(field, mI, sMax);
  const lagrangeK0XY = await buildLagrangeK0(field, mI);
  const rGXY = rXY.mul(gXY);
  const p1XY = rXY.sub(constantPolynomial(field, field.one)).mul(lagrangeKlXY);
  const p2Input = rGXY.sub(rOmegaX.mul(fXY));
  const p2XY = mulByXMinusOne(p2Input);
  const p3XY = lagrangeK0XY.mul(rGXY.sub(rOmegaXOmegaY.mul(fXY)));
  const pCombined = linearCombination(field, [
    [field.one, p1XY],
    [kappa0, p2XY],
    [kappa0Sq, p3XY],
  ]);
  const { quotientX: q2XY, quotientY: q3XY } = pCombined.divByVanishingOpt(mI, sMax);
  const rD1 = rXY.sub(rOmegaX);
  const rD2 = rXY.sub(rOmegaXOmegaY);
  const gD = gXY.sub(fXY);
  const qCxXY = linearCombination(field, [
    [field.one, q2XY],
    [state.mixer.rR_X, lagrangeKlXY],
    [
      kappa0,
      mulByXMinusOne(
        mulByLinearX(rD1, state.mixer.rB_X).add(gD.scale(state.mixer.rR_X)),
      ),
    ],
    [
      kappa0Sq,
      lagrangeK0XY.mul(mulByLinearX(rD2, state.mixer.rB_X).add(gD.scale(state.mixer.rR_X))),
    ],
  ]);
  const qCyXY = linearCombination(field, [
    [field.one, q3XY],
    [state.mixer.rR_Y, lagrangeKlXY],
    [
      kappa0,
      mulByXMinusOne(
        mulByLinearY(rD1, state.mixer.rB_Y).add(gD.scale(state.mixer.rR_Y)),
      ),
    ],
    [
      kappa0Sq,
      lagrangeK0XY.mul(mulByLinearY(rD2, state.mixer.rB_Y).add(gD.scale(state.mixer.rR_Y))),
    ],
  ]);

  return {
    proof2: {
      Q_CX: await encodePolynomialWithSigma1(runtime, crs, state.setup, qCxXY),
      Q_CY: await encodePolynomialWithSigma1(runtime, crs, state.setup, qCyXY),
    },
    q2XY,
    q3XY,
    lagrangeKlXY,
  };
}

async function buildLagrangeKl(
  field: CurveRuntime["Fr"],
  mI: number,
  sMax: number,
): Promise<DensePolynomialExt> {
  const kEvals = Array.from({ length: mI }, () => field.zero);
  kEvals[mI - 1] = field.one;
  const lagrangeKXY = await DensePolynomialExt.fromRouEvals(field, kEvals, mI, 1);
  const lEvals = Array.from({ length: sMax }, () => field.zero);
  lEvals[sMax - 1] = field.one;
  const lagrangeLXY = await DensePolynomialExt.fromRouEvals(field, lEvals, 1, sMax);
  return lagrangeKXY.mul(lagrangeLXY);
}

async function buildLagrangeK0(field: CurveRuntime["Fr"], mI: number): Promise<DensePolynomialExt> {
  const k0Evals = Array.from({ length: mI }, () => field.zero);
  k0Evals[0] = field.one;
  return DensePolynomialExt.fromRouEvals(field, k0Evals, mI, 1);
}

function mulByXMinusOne(polynomial: DensePolynomialExt): DensePolynomialExt {
  return polynomial.mulMonomial(1, 0).sub(polynomial);
}

function mulByLinearX(
  polynomial: DensePolynomialExt,
  coefficients: readonly FieldElement[],
): DensePolynomialExt {
  if (coefficients.length !== 2) {
    throw new Error("X-linear multiplier requires exactly two coefficients.");
  }

  return polynomial.scale(coefficients[0]).add(polynomial.mulMonomial(1, 0).scale(coefficients[1]));
}

function mulByLinearY(
  polynomial: DensePolynomialExt,
  coefficients: readonly FieldElement[],
): DensePolynomialExt {
  if (coefficients.length !== 2) {
    throw new Error("Y-linear multiplier requires exactly two coefficients.");
  }

  return polynomial.scale(coefficients[0]).add(polynomial.mulMonomial(0, 1).scale(coefficients[1]));
}

function constantPolynomial(field: CurveRuntime["Fr"], value: FieldElement): DensePolynomialExt {
  return DensePolynomialExt.fromCoeffs(field, [value], 1, 1);
}

function linearCombination(
  field: CurveRuntime["Fr"],
  terms: readonly (readonly [FieldElement, DensePolynomialExt])[],
): DensePolynomialExt {
  let accumulator = DensePolynomialExt.zero(field);
  for (const [scalar, polynomial] of terms) {
    accumulator = accumulator.add(polynomial.scale(scalar));
  }

  return accumulator;
}
