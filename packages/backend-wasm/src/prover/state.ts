import { DensePolynomialExt } from "../libs/polynomial/dense-polynomial.js";
import type { CurveRuntime } from "../libs/runtime/curve.js";
import type { FieldElement, FieldRuntime } from "../libs/runtime/field.js";
import type { ProverSetupParams, WitnessPolynomials } from "./witness.js";

export interface ProverInstancePolynomials {
  readonly aFreeX: DensePolynomialExt;
  readonly tN: DensePolynomialExt;
  readonly tMi: DensePolynomialExt;
  readonly tSMax: DensePolynomialExt;
}

export interface ProverMixer {
  readonly rU_X: FieldElement;
  readonly rU_Y: FieldElement;
  readonly rV_X: FieldElement;
  readonly rV_Y: FieldElement;
  readonly rW_X: readonly FieldElement[];
  readonly rW_Y: readonly FieldElement[];
  readonly rB_X: readonly FieldElement[];
  readonly rB_Y: readonly FieldElement[];
  readonly rR_X: FieldElement;
  readonly rR_Y: FieldElement;
  readonly rO_mid: FieldElement;
}

export interface ProverQuotients {
  readonly q0XY: DensePolynomialExt;
  readonly q1XY: DensePolynomialExt;
  readonly q2XY: DensePolynomialExt;
  readonly q3XY: DensePolynomialExt;
  readonly q4XY: DensePolynomialExt;
  readonly q5XY: DensePolynomialExt;
  readonly q6XY: DensePolynomialExt;
  readonly q7XY: DensePolynomialExt;
}

export interface ProverCache {
  wZk?: DensePolynomialExt;
  termBZk?: DensePolynomialExt;
  lagrangeKlXY?: DensePolynomialExt;
}

export interface ProverState {
  readonly setup: ProverSetupParams;
  readonly instance: ProverInstancePolynomials;
  readonly witness: WitnessPolynomials;
  readonly mixer: ProverMixer;
  readonly quotients: ProverQuotients;
  readonly cache: ProverCache;
}

export async function buildProverInstancePolynomials(
  field: FieldRuntime,
  setup: ProverSetupParams,
  publicInstance: readonly FieldElement[],
): Promise<ProverInstancePolynomials> {
  if (publicInstance.length !== setup.l_free) {
    throw new Error(`Prover public instance length must equal setup.l_free (${setup.l_free}).`);
  }

  const mI = setup.l_D - setup.l;

  return {
    aFreeX: await DensePolynomialExt.fromRouEvals(field, publicInstance, setup.l_free, 1),
    tN: vanishingPolynomialX(field, setup.n),
    tMi: vanishingPolynomialX(field, mI),
    tSMax: vanishingPolynomialY(field, setup.s_max),
  };
}

export async function createProverMixer(runtime: CurveRuntime): Promise<ProverMixer> {
  return {
    rU_X: await runtime.randomScalar(),
    rU_Y: await runtime.randomScalar(),
    rV_X: await runtime.randomScalar(),
    rV_Y: await runtime.randomScalar(),
    rW_X: [await runtime.randomScalar(), await runtime.randomScalar(), await runtime.randomScalar(), runtime.Fr.zero],
    rW_Y: [await runtime.randomScalar(), await runtime.randomScalar(), await runtime.randomScalar(), runtime.Fr.zero],
    rB_X: [await runtime.randomScalar(), await runtime.randomScalar()],
    rB_Y: [await runtime.randomScalar(), await runtime.randomScalar()],
    rO_mid: await runtime.randomScalar(),
    rR_X: await runtime.randomScalar(),
    rR_Y: await runtime.randomScalar(),
  };
}

export function createEmptyProverQuotients(field: FieldRuntime): ProverQuotients {
  return {
    q0XY: DensePolynomialExt.zero(field),
    q1XY: DensePolynomialExt.zero(field),
    q2XY: DensePolynomialExt.zero(field),
    q3XY: DensePolynomialExt.zero(field),
    q4XY: DensePolynomialExt.zero(field),
    q5XY: DensePolynomialExt.zero(field),
    q6XY: DensePolynomialExt.zero(field),
    q7XY: DensePolynomialExt.zero(field),
  };
}

export async function createProverState(input: {
  readonly runtime: CurveRuntime;
  readonly setup: ProverSetupParams;
  readonly publicInstance: readonly FieldElement[];
  readonly witness: WitnessPolynomials;
}): Promise<ProverState> {
  return {
    setup: input.setup,
    instance: await buildProverInstancePolynomials(input.runtime.Fr, input.setup, input.publicInstance),
    witness: input.witness,
    mixer: await createProverMixer(input.runtime),
    quotients: createEmptyProverQuotients(input.runtime.Fr),
    cache: {},
  };
}

function vanishingPolynomialX(field: FieldRuntime, degree: number): DensePolynomialExt {
  const coefficients = Array.from({ length: degree * 2 }, () => field.zero);
  coefficients[0] = field.neg(field.one);
  coefficients[degree] = field.one;
  return DensePolynomialExt.fromCoeffs(field, coefficients, degree * 2, 1);
}

function vanishingPolynomialY(field: FieldRuntime, degree: number): DensePolynomialExt {
  const coefficients = Array.from({ length: degree * 2 }, () => field.zero);
  coefficients[0] = field.neg(field.one);
  coefficients[degree] = field.one;
  return DensePolynomialExt.fromCoeffs(field, coefficients, 1, degree * 2);
}
