import { requireBinaryArtifactSection } from '../../artifacts/binary/binary-artifact-file.js';
import { type BinaryArtifactFileView } from '../../artifacts/binary/binary-format.js';
import { admitRuntimeBinaryArtifact } from '../../artifacts/binary/runtime-admission.js';
import { INSTANCE_V1_SPEC, PROVER_PERMUTATION_V1_SPEC, PROVER_SELECTOR_V1_SPEC, } from '../../generated/browser-artifact-contracts.generated.js';
import { assertBinaryArtifactCompatibility } from '../../artifacts/binary/compatibility.js';
import { GENERATED_PUBLIC_INPUT_LENGTH, GENERATED_SETUP_PARAMS } from '../../generated/active/setup.generated.js';
import { parseUnivariatePreprocessCrs, type UnivariateCrsChunkInput } from '../../univariate/crs.js';
import type { UnivariatePermutationEntry } from '../../univariate/relation.js';
import type { CurveRuntime } from '../../runtime/curve/curve.js';
import { GENERATED_PROVER_SUBCIRCUIT_INFOS } from '../../prover/generated/active/subcircuit-library.generated.js';
import type { PreprocessRuntimeInput } from '../protocol/runtime-input.js';
export type { PreprocessRuntimeInput } from '../protocol/runtime-input.js';

const PERMUTATION_ENTRY_BYTES = 16;
const [permutationSectionSpec] = PROVER_PERMUTATION_V1_SPEC.sections;
const [selectorSectionSpec] = PROVER_SELECTOR_V1_SPEC.sections;
export interface PreprocessBinaryInput {
  readonly instance: Uint8Array;
  readonly selector: Uint8Array;
  readonly permutation: Uint8Array;
  readonly preprocessCrs: UnivariateCrsChunkInput;
}
export async function loadPreprocessInputFromBinaryInput(runtime: CurveRuntime, input: PreprocessBinaryInput, checkDigests = false): Promise<PreprocessRuntimeInput> {
  const [selector, permutation, instance] = await Promise.all([
    admitRuntimeBinaryArtifact(input.selector, PROVER_SELECTOR_V1_SPEC.kind, PROVER_SELECTOR_V1_SPEC),
    admitRuntimeBinaryArtifact(input.permutation, PROVER_PERMUTATION_V1_SPEC.kind, PROVER_PERMUTATION_V1_SPEC),
    admitRuntimeBinaryArtifact(input.instance, INSTANCE_V1_SPEC.kind, INSTANCE_V1_SPEC),
  ]);
  const setup = GENERATED_SETUP_PARAMS;
  for(const artifact of [selector, permutation, instance]) {
    assertBinaryArtifactCompatibility(artifact);
  }
  return {
    setup,
    publicInputs: parsePublicInputs(runtime, instance),
    subcircuitInfos: GENERATED_PROVER_SUBCIRCUIT_INFOS,
    selector: parseSelector(selector, setup.s, GENERATED_PROVER_SUBCIRCUIT_INFOS.length),
    permutation: parsePermutation(permutation, setup.m_b, setup.s),
    crs: await parseUnivariatePreprocessCrs(input.preprocessCrs, checkDigests),
  };
}

function parsePublicInputs(runtime: CurveRuntime, instance: BinaryArtifactFileView) {
  const values = INSTANCE_V1_SPEC.sections.flatMap(spec => runtime.Fr.split(requireBinaryArtifactSection(instance, spec).data));
  if (values.length !== GENERATED_PUBLIC_INPUT_LENGTH) {
    throw new Error(`Public instance length is ${values.length}, expected ${GENERATED_PUBLIC_INPUT_LENGTH}.`);
  }
  return values;
}

function parseSelector(file: BinaryArtifactFileView, sMax: number, compiled: number): readonly (number | null)[] {
  const section = requireBinaryArtifactSection(file, selectorSectionSpec);
  if (section.elementCount !== sMax || section.elementByteLength !== 4 || section.data.byteLength !== sMax * 4) {
    throw new Error(`selector.entries must contain exactly ${sMax} i32 entries.`);
  }
  const view = new DataView(section.data.buffer, section.data.byteOffset, section.data.byteLength);
  return Array.from({ length: sMax }, (_, index) => {
    const value = view.getInt32(index * 4, true);
    if (value === -1) return null;
    if (value < 0 || value >= compiled) throw new Error(`Selector subcircuit ID ${value} is outside the active library.`);
    return value;
  });
}

function parsePermutation(file: BinaryArtifactFileView, wiringWidth: number, sMax: number): readonly UnivariatePermutationEntry[] {
  const section = requireBinaryArtifactSection(file, permutationSectionSpec);
  if (section.data.byteLength % PERMUTATION_ENTRY_BYTES !== 0) {
    throw new Error('permutation.entries byte length must be divisible by 16.');
  }

  const view = new DataView(section.data.buffer, section.data.byteOffset, section.data.byteLength);
  const entries: UnivariatePermutationEntry[] = [];
  for (let offset = 0; offset < section.data.byteLength; offset += PERMUTATION_ENTRY_BYTES) {
    const entry = {
      row: view.getUint32(offset, true),
      col: view.getUint32(offset + 4, true),
      X: view.getUint32(offset + 8, true),
      Y: view.getUint32(offset + 12, true),
    };
    assertIndex(entry.row, wiringWidth, 'row');
    assertIndex(entry.X, wiringWidth, 'X');
    assertIndex(entry.col, sMax, 'col');
    assertIndex(entry.Y, sMax, 'Y');
    entries.push(entry);
  }
  return entries;
}

function assertIndex(value: number, upperBound: number, name: string): void {
  if (value >= upperBound) {
    throw new Error(`Permutation ${name} index ${value} is outside [0, ${upperBound}).`);
  }
}
