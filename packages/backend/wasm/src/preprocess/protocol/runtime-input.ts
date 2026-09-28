import type { FieldElement } from '../../runtime/field/field-types.js';
import type { ProverSubcircuitInfo } from '../../prover/protocol/witness.js';import type { SetupParams } from '../../artifacts/setup/setup-params.js';
import type { UnivariatePermutationEntry } from '../../univariate/relation.js';
import type { UnivariatePreprocessCrsRuntime } from '../../univariate/crs.js';
export interface PreprocessRuntimeInput {
  readonly setup: SetupParams;
  readonly selector: readonly (number | null)[];
  readonly permutation: readonly UnivariatePermutationEntry[];
  readonly publicInputs: readonly FieldElement[];
  readonly subcircuitInfos: readonly ProverSubcircuitInfo[];
  readonly crs: UnivariatePreprocessCrsRuntime;
}
export interface PreprocessComputation {
  readonly cFix: Uint8Array;
  readonly eKappa: Uint8Array;
  readonly sC: Uint8Array;
}
