import { DensePolynomialExt } from "../libs/polynomial/dense-polynomial.js";
import type { CurveRuntime } from "../libs/runtime/curve.js";
import type { FieldElement, FieldRuntime } from "../libs/runtime/field.js";
import type { ProverPermutationEntry, ProverSetupParams, WitnessPolynomials } from "./witness.js";

export interface ProverInstancePolynomials {
  readonly aFreeX: DensePolynomialExt;
  readonly tN: DensePolynomialExt;
  readonly tMi: DensePolynomialExt;
  readonly tSMax: DensePolynomialExt;
  readonly s0XY: DensePolynomialExt;
  readonly s1XY: DensePolynomialExt;
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
  permutation: readonly ProverPermutationEntry[],
): Promise<ProverInstancePolynomials> {
  if (publicInstance.length !== setup.l_free) {
    throw new Error(`Prover public instance length must equal setup.l_free (${setup.l_free}).`);
  }

  const mI = setup.l_D - setup.l;

  const [s0XY, s1XY] = await buildPermutationPolynomials(field, setup, permutation);

  return {
    aFreeX: await DensePolynomialExt.fromRouEvals(field, publicInstance, setup.l_free, 1),
    tN: vanishingPolynomialX(field, setup.n),
    tMi: vanishingPolynomialX(field, mI),
    tSMax: vanishingPolynomialY(field, setup.s_max),
    s0XY,
    s1XY,
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
  readonly permutation: readonly ProverPermutationEntry[];
  readonly witness: WitnessPolynomials;
}): Promise<ProverState> {
  return {
    setup: input.setup,
    instance: await buildProverInstancePolynomials(
      input.runtime.Fr,
      input.setup,
      input.publicInstance,
      input.permutation,
    ),
    witness: input.witness,
    mixer: await createProverMixer(input.runtime),
    quotients: createEmptyProverQuotients(input.runtime.Fr),
    cache: {},
  };
}

async function buildPermutationPolynomials(
  field: FieldRuntime,
  setup: ProverSetupParams,
  permutation: readonly ProverPermutationEntry[],
): Promise<readonly [DensePolynomialExt, DensePolynomialExt]> {
  const mI = setup.l_D - setup.l;
  const omegaMI = field.rootOfUnity(mI);
  const omegaSMax = field.rootOfUnity(setup.s_max);
  const xPowers = powerTable(field, omegaMI, mI);
  const yPowers = powerTable(field, omegaSMax, setup.s_max);
  const s0Evals = Array.from({ length: mI * setup.s_max }, () => field.zero);
  const s1Evals = Array.from({ length: mI * setup.s_max }, () => field.zero);

  for (let row = 0; row < mI; row += 1) {
    const rowStart = row * setup.s_max;
    for (let col = 0; col < setup.s_max; col += 1) {
      s0Evals[rowStart + col] = xPowers[row];
      s1Evals[rowStart + col] = yPowers[col];
    }
  }

  for (const entry of permutation) {
    const index = entry.row * setup.s_max + entry.col;
    s0Evals[index] = xPowers[entry.X];
    s1Evals[index] = yPowers[entry.Y];
  }

  return [
    await DensePolynomialExt.fromRouEvals(field, s0Evals, mI, setup.s_max),
    await DensePolynomialExt.fromRouEvals(field, s1Evals, mI, setup.s_max),
  ];
}

function powerTable(field: FieldRuntime, base: FieldElement, length: number): FieldElement[] {
  const output = Array.from({ length }, () => field.one);
  for (let index = 1; index < length; index += 1) {
    output[index] = field.mul(output[index - 1], base);
  }

  return output;
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
