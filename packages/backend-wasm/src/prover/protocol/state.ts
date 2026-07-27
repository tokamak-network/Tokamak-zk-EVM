import { BivariatePolynomialBuffer } from "../../runtime/polynomial/bivariate-polynomial-buffer.js";
import { buildPermutationPolynomials } from "../../runtime/polynomial/permutation-polynomials.js";
import type { CurveRuntime } from "../../runtime/curve/curve.js";
import type { FieldElement, FieldRuntime } from "../../runtime/field/field-runtime.js";
import type { ProverPermutationEntry, ProverSetupParams, WitnessPolynomials } from "./witness.js";

export interface ProverInstancePolynomials {
  readonly aFreeX: BivariatePolynomialBuffer;
  readonly tN: BivariatePolynomialBuffer;
  readonly tMi: BivariatePolynomialBuffer;
  readonly tSMax: BivariatePolynomialBuffer;
  readonly s0XY: BivariatePolynomialBuffer;
  readonly s1XY: BivariatePolynomialBuffer;
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

export interface ProverState {
  readonly setup: ProverSetupParams;
  readonly instance: ProverInstancePolynomials;
  readonly witness: WitnessPolynomials;
  readonly mixer: ProverMixer;
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

  const [s0XY, s1XY] = await buildPermutationPolynomials(
    field,
    mI,
    setup.s_max,
    permutation,
  );

  return {
    aFreeX: await BivariatePolynomialBuffer.fromRouEvals(field, field.concat(publicInstance), setup.l_free, 1),
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

export async function createProverState(input: {
  readonly runtime: CurveRuntime;
  readonly setup: ProverSetupParams;
  readonly publicInstance: readonly FieldElement[];
  readonly permutation: readonly ProverPermutationEntry[];
  readonly witness: WitnessPolynomials;
}): Promise<ProverState> {
  const instance = await buildProverInstancePolynomials(
    input.runtime.Fr,
    input.setup,
    input.publicInstance,
    input.permutation,
  );

  return {
    setup: input.setup,
    instance,
    witness: input.witness,
    mixer: await createProverMixer(input.runtime),
  };
}

function vanishingPolynomialX(field: FieldRuntime, degree: number): BivariatePolynomialBuffer {
  const coefficients = Array.from({ length: degree * 2 }, () => field.zero);
  coefficients[0] = field.neg(field.one);
  coefficients[degree] = field.one;
  return BivariatePolynomialBuffer.fromCoeffs(field, coefficients, degree * 2, 1);
}

function vanishingPolynomialY(field: FieldRuntime, degree: number): BivariatePolynomialBuffer {
  const coefficients = Array.from({ length: degree * 2 }, () => field.zero);
  coefficients[0] = field.neg(field.one);
  coefficients[degree] = field.one;
  return BivariatePolynomialBuffer.fromCoeffs(field, coefficients, 1, degree * 2);
}
