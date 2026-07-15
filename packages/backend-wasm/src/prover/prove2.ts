import { BivariatePolynomialBuffer } from "../libs/polynomial/bivariate-polynomial-buffer.js";
import type { CurveRuntime } from "../libs/runtime/curve.js";
import type { FieldElement } from "../libs/runtime/field.js";
import type { ProverCrsRuntime } from "./binary-input.js";
import { encodePolynomialBufferWithSigma1 } from "./prove0.js";
import type { ProverState } from "./state.js";

export interface Prove2Output {
  readonly Q_CX: Uint8Array;
  readonly Q_CY: Uint8Array;
}

export interface Prove2Computation {
  readonly proof2: Prove2Output;
  readonly q2XY: BivariatePolynomialBuffer;
  readonly q3XY: BivariatePolynomialBuffer;
  readonly lagrangeKlXY: BivariatePolynomialBuffer;
}

export async function prove2(input: {
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
  const rOmegaX = rXY.scaleCoeffsX(field.inv(omegaMI));
  const rOmegaXOmegaY = rOmegaX.scaleCoeffsY(field.inv(omegaSMax));
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
  const lagrangeKlXY = await buildLagrangeKl(field, mI, sMax);
  const lagrangeK0XY = await buildLagrangeK0(field, mI);
  const rGXY = await rXY.mul(gXY);
  const p1XY = await rXY.sub(constantPolynomialBuffer(field, field.one)).mul(lagrangeKlXY);
  const p2Input = rGXY.sub(await rOmegaX.mul(fXY));
  const p2XY = mulByXMinusOne(p2Input);
  const p3XY = await lagrangeK0XY.mul(rGXY.sub(await rOmegaXOmegaY.mul(fXY)));
  const pCombined = linearCombinationBuffer(field, [
    [field.one, p1XY],
    [kappa0, p2XY],
    [kappa0Sq, p3XY],
  ]);
  const { quotientX: q2XY, quotientY: q3XY } = pCombined.divByVanishingOpt(mI, sMax);
  const rD1 = rXY.sub(rOmegaX);
  const rD2 = rXY.sub(rOmegaXOmegaY);
  const gD = gXY.sub(fXY);
  const qCxTerm2 = mulByXMinusOne(
    mulByLinearX(rD1, state.mixer.rB_X).add(gD.scale(state.mixer.rR_X)),
  );
  const qCxTerm3 = await lagrangeK0XY.mul(
    mulByLinearX(rD2, state.mixer.rB_X).add(gD.scale(state.mixer.rR_X)),
  );
  const qCxXY = linearCombinationBuffer(field, [
    [field.one, q2XY],
    [state.mixer.rR_X, lagrangeKlXY],
    [kappa0, qCxTerm2],
    [kappa0Sq, qCxTerm3],
  ]);
  const qCyTerm2 = mulByXMinusOne(
    mulByLinearY(rD1, state.mixer.rB_Y).add(gD.scale(state.mixer.rR_Y)),
  );
  const qCyTerm3 = await lagrangeK0XY.mul(
    mulByLinearY(rD2, state.mixer.rB_Y).add(gD.scale(state.mixer.rR_Y)),
  );
  const qCyXY = linearCombinationBuffer(field, [
    [field.one, q3XY],
    [state.mixer.rR_Y, lagrangeKlXY],
    [kappa0, qCyTerm2],
    [kappa0Sq, qCyTerm3],
  ]);

  return {
    proof2: {
      Q_CX: await encodePolynomialBufferWithSigma1(runtime, crs, state.setup, qCxXY),
      Q_CY: await encodePolynomialBufferWithSigma1(runtime, crs, state.setup, qCyXY),
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
): Promise<BivariatePolynomialBuffer> {
  const kEvals = field.createZeroBuffer(mI);
  field.writeBufferElement(kEvals, mI - 1, field.one);
  const lagrangeKXY = await BivariatePolynomialBuffer.fromRouEvals(field, kEvals, mI, 1);
  const lEvals = field.createZeroBuffer(sMax);
  field.writeBufferElement(lEvals, sMax - 1, field.one);
  const lagrangeLXY = await BivariatePolynomialBuffer.fromRouEvals(field, lEvals, 1, sMax);
  return await lagrangeKXY.mul(lagrangeLXY);
}

async function buildLagrangeK0(field: CurveRuntime["Fr"], mI: number): Promise<BivariatePolynomialBuffer> {
  const k0Evals = field.createZeroBuffer(mI);
  field.writeBufferElement(k0Evals, 0, field.one);
  return BivariatePolynomialBuffer.fromRouEvals(field, k0Evals, mI, 1);
}

function mulByXMinusOne(polynomial: BivariatePolynomialBuffer): BivariatePolynomialBuffer {
  return polynomial.mulMonomial(1, 0).sub(polynomial);
}

function mulByLinearX(
  polynomial: BivariatePolynomialBuffer,
  coefficients: readonly FieldElement[],
): BivariatePolynomialBuffer {
  if (coefficients.length !== 2) {
    throw new Error("X-linear multiplier requires exactly two coefficients.");
  }

  return polynomial.scale(coefficients[0]).add(polynomial.mulMonomial(1, 0).scale(coefficients[1]));
}

function mulByLinearY(
  polynomial: BivariatePolynomialBuffer,
  coefficients: readonly FieldElement[],
): BivariatePolynomialBuffer {
  if (coefficients.length !== 2) {
    throw new Error("Y-linear multiplier requires exactly two coefficients.");
  }

  return polynomial.scale(coefficients[0]).add(polynomial.mulMonomial(0, 1).scale(coefficients[1]));
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
