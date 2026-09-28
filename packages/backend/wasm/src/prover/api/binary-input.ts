import { requireBinaryArtifactSection } from "../../artifacts/binary/binary-artifact-file.js";
import type { BinaryArtifactFileView } from "../../artifacts/binary/binary-format.js";
import { assertBinaryArtifactCompatibility } from "../../artifacts/binary/compatibility.js";
import { admitRuntimeBinaryArtifact } from "../../artifacts/binary/runtime-admission.js";
import {
  INSTANCE_V1_SPEC,
  PROVER_PERMUTATION_V1_SPEC,
  PROVER_PLACEMENT_VARIABLES_V1_SPEC,
  PROVER_SELECTOR_V1_SPEC,
} from "../../generated/browser-artifact-contracts.generated.js";
import {
  GENERATED_PUBLIC_INPUT_LENGTH,
  GENERATED_SETUP_PARAMS,
} from "../../generated/active/setup.generated.js";
import type { CurveRuntime } from "../../runtime/curve/curve.js";
import type { FieldElement } from "../../runtime/field/field-types.js";
import { parseUnivariateProverCrs, type UnivariateCrsChunkInput, type UnivariateProverCrsRuntime } from "../../univariate/crs.js";
import type { UnivariateSubcircuit } from "../../univariate/relation.js";
import {
  GENERATED_PROVER_PACKED_R1CS,
  GENERATED_PROVER_SUBCIRCUIT_INFOS,
} from "../generated/active/subcircuit-library.generated.js";
import type { ProverPlacementVariables } from "../protocol/witness.js";
import type { ProverSubcircuitInfo } from "../protocol/witness.js";

export interface ProverBinaryInput {
  readonly witness: Uint8Array;
  readonly selector: Uint8Array;
  readonly permutation: Uint8Array;
  readonly instance: Uint8Array;
  readonly proverCrs: UnivariateCrsChunkInput;
}

export interface UnivariateProverRuntimeInput {
  readonly selector: readonly (number | null)[];
  readonly permutation: readonly { readonly row: number; readonly col: number; readonly X: number; readonly Y: number }[];
  readonly placements: ProverPlacementVariables;
  readonly publicInputs: readonly FieldElement[];
  readonly subcircuitInfos: readonly ProverSubcircuitInfo[];
  readonly subcircuits: readonly UnivariateSubcircuit[];
  readonly crs: UnivariateProverCrsRuntime;
}

export async function loadProverInputFromBinaryInput(
  runtime: CurveRuntime,
  input: ProverBinaryInput,
  checkDigests = false,
): Promise<UnivariateProverRuntimeInput> {
  const [witness, selector, permutation, instance] = await Promise.all([
    admitRuntimeBinaryArtifact(input.witness, PROVER_PLACEMENT_VARIABLES_V1_SPEC.kind, PROVER_PLACEMENT_VARIABLES_V1_SPEC),
    admitRuntimeBinaryArtifact(input.selector, PROVER_SELECTOR_V1_SPEC.kind, PROVER_SELECTOR_V1_SPEC),
    admitRuntimeBinaryArtifact(input.permutation, PROVER_PERMUTATION_V1_SPEC.kind, PROVER_PERMUTATION_V1_SPEC),
    admitRuntimeBinaryArtifact(input.instance, INSTANCE_V1_SPEC.kind, INSTANCE_V1_SPEC),
  ]);
  for (const artifact of [witness, selector, permutation, instance]) {
    assertBinaryArtifactCompatibility(artifact);
  }
  return {
    selector: parseSelector(selector),
    permutation: parsePermutation(permutation),
    placements: parsePlacements(runtime, witness),
    publicInputs: parsePublicInputs(runtime, instance),
    subcircuitInfos: GENERATED_PROVER_SUBCIRCUIT_INFOS,
    subcircuits: currentSubcircuits(),
    crs: await parseUnivariateProverCrs(input.proverCrs, checkDigests),
  };
}

function parseSelector(file: BinaryArtifactFileView): readonly (number | null)[] {
  const [spec] = PROVER_SELECTOR_V1_SPEC.sections;
  const section = requireBinaryArtifactSection(file, spec);
  if (section.elementCount !== GENERATED_SETUP_PARAMS.s || section.elementByteLength !== 4) {
    throw new Error("Selector section does not match the active setup capacity.");
  }
  const view = new DataView(section.data.buffer, section.data.byteOffset, section.data.byteLength);
  return Array.from({ length: section.elementCount }, (_, index) => {
    const id = view.getInt32(index * 4, true);
    if (id === -1) return null;
    if (id < 0 || id >= GENERATED_PROVER_SUBCIRCUIT_INFOS.length) throw new Error(`Selector subcircuit ID ${id} is outside the active library.`);
    return id;
  });
}

function parsePermutation(file: BinaryArtifactFileView): readonly { readonly row: number; readonly col: number; readonly X: number; readonly Y: number }[] {
  const [spec] = PROVER_PERMUTATION_V1_SPEC.sections;
  const section = requireBinaryArtifactSection(file, spec);
  if (section.elementByteLength !== 16 || section.data.byteLength !== section.elementCount * 16) {
    throw new Error("Permutation section has an invalid entry layout.");
  }
  const view = new DataView(section.data.buffer, section.data.byteOffset, section.data.byteLength);
  return Array.from({ length: section.elementCount }, (_, index) => {
    const entry = {
      row: view.getUint32(index * 16, true),
      col: view.getUint32(index * 16 + 4, true),
      X: view.getUint32(index * 16 + 8, true),
      Y: view.getUint32(index * 16 + 12, true),
    };
    if (entry.row >= GENERATED_SETUP_PARAMS.m_b || entry.X >= GENERATED_SETUP_PARAMS.m_b
      || entry.col >= GENERATED_SETUP_PARAMS.s || entry.Y >= GENERATED_SETUP_PARAMS.s) {
      throw new Error("Permutation entry is outside the normalized wiring grid.");
    }
    return entry;
  });
}

function parsePlacements(runtime: CurveRuntime, file: BinaryArtifactFileView): ProverPlacementVariables {
  const [idsSpec, offsetsSpec, valuesSpec] = PROVER_PLACEMENT_VARIABLES_V1_SPEC.sections;
  const ids = readU32(requireBinaryArtifactSection(file, idsSpec).data, idsSpec.label);
  const offsets = readU32(requireBinaryArtifactSection(file, offsetsSpec).data, offsetsSpec.label);
  const values = requireBinaryArtifactSection(file, valuesSpec).data;
  if (offsets.length !== ids.length + 1 || offsets[0] !== 0 || offsets[offsets.length - 1] !== runtime.Fr.bufferElementCount(values)) {
    throw new Error("Placement variable offsets do not describe the witness value section.");
  }
  for (let index = 1; index < offsets.length; index += 1) {
    if (offsets[index]! < offsets[index - 1]!) throw new Error("Placement variable offsets are not monotonic.");
  }
  return { subcircuitIds: ids, variableOffsets: offsets, variables: values, fieldByteLength: runtime.Fr.byteLength };
}

function parsePublicInputs(runtime: CurveRuntime, file: BinaryArtifactFileView): readonly FieldElement[] {
  const [publicSpec, functionSpec] = INSTANCE_V1_SPEC.sections;
  const values = [
    ...runtime.Fr.split(requireBinaryArtifactSection(file, publicSpec).data),
    ...runtime.Fr.split(requireBinaryArtifactSection(file, functionSpec).data),
  ];
  if (values.length !== GENERATED_PUBLIC_INPUT_LENGTH) {
    throw new Error(`Public instance length is ${values.length}, expected ${GENERATED_PUBLIC_INPUT_LENGTH}.`);
  }
  return values;
}

function currentSubcircuits(): readonly UnivariateSubcircuit[] {
  const r1csById = new Map(GENERATED_PROVER_PACKED_R1CS.map(r1cs => [r1cs.subcircuitId, r1cs]));
  return GENERATED_PROVER_SUBCIRCUIT_INFOS.map(info => {
    const r1cs = r1csById.get(info.id);
    if (r1cs === undefined) throw new Error(`Active library is missing R1CS for subcircuit ${info.id}.`);
    return { id: info.id, info, A: r1cs.A, B: r1cs.B, C: r1cs.C };
  });
}

function readU32(data: Uint8Array, label: string): Uint32Array {
  if (data.byteLength % 4 !== 0) throw new Error(`${label} is not a u32 array.`);
  const values = new Uint32Array(data.byteLength / 4);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let index = 0; index < values.length; index += 1) values[index] = view.getUint32(index * 4, true);
  return values;
}
