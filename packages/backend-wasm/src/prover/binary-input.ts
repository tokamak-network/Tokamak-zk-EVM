import { requireRuntimeSection } from "../libs/artifact-loaders/loaders.js";
import type { RuntimeArtifactFile } from "../libs/artifact-loaders/types.js";
import type { CurveRuntime } from "../libs/runtime/curve.js";
import type { FieldElement } from "../libs/runtime/field.js";
import { BinarySectionEncoding, BinarySectionType } from "../libs/serialization/binary-format.js";
import {
  GENERATED_PROVER_SETUP_PARAMS,
  GENERATED_PROVER_SPARSE_R1CS,
  GENERATED_PROVER_SUBCIRCUIT_INFOS,
  NATIVE_BACKEND_VERSION,
  SUBCIRCUIT_LIBRARY_PACKAGE_VERSION,
} from "./generated/subcircuit-library.generated.js";
import type {
  ProverPlacementVariables,
  ProverSetupParams,
  ProverWitnessInput,
} from "./witness.js";

export interface ProverRuntimeArtifactFiles {
  readonly setupParams: RuntimeArtifactFile;
  readonly placementVariables: RuntimeArtifactFile;
  readonly instance: RuntimeArtifactFile;
}

export interface ProverRuntimeWitnessInputParts {
  readonly setup: ProverSetupParams;
  readonly placementVariables: readonly ProverPlacementVariables[];
  readonly publicInstance: readonly FieldElement[];
}

export { NATIVE_BACKEND_VERSION, SUBCIRCUIT_LIBRARY_PACKAGE_VERSION };

export function loadProverRuntimeWitnessInputParts(
  runtime: CurveRuntime,
  artifacts: ProverRuntimeArtifactFiles,
): ProverRuntimeWitnessInputParts {
  const setup = parseProverSetupParams(artifacts.setupParams);

  return {
    setup,
    placementVariables: parseProverPlacementVariables(runtime, artifacts.placementVariables),
    publicInstance: parseProverPublicInstance(runtime, artifacts.instance),
  };
}

export function buildProverWitnessInputFromRuntimeArtifacts(
  runtime: CurveRuntime,
  artifacts: ProverRuntimeArtifactFiles,
): ProverWitnessInput {
  const parts = loadProverRuntimeWitnessInputParts(runtime, artifacts);
  assertSetupMatchesGeneratedSubcircuitLibrary(parts.setup);

  return {
    setup: parts.setup,
    placementVariables: parts.placementVariables,
    subcircuitInfos: GENERATED_PROVER_SUBCIRCUIT_INFOS,
    r1csBySubcircuit: GENERATED_PROVER_SPARSE_R1CS,
  };
}

export function parseProverSetupParams(setupParamsFile: RuntimeArtifactFile): ProverSetupParams {
  const section = requireRuntimeSection(setupParamsFile, {
    type: BinarySectionType.SetupParams,
    encoding: BinarySectionEncoding.Bytes,
    label: "setup.params",
  });
  const view = new DataView(section.data.buffer, section.data.byteOffset, section.data.byteLength);

  return {
    l_free: view.getUint32(0, true),
    l_user_out: view.getUint32(4, true),
    l_user: view.getUint32(8, true),
    l: view.getUint32(12, true),
    l_D: view.getUint32(16, true),
    m_D: view.getUint32(20, true),
    n: view.getUint32(24, true),
    s_D: view.getUint32(28, true),
    s_max: view.getUint32(32, true),
  };
}

export function parseProverPlacementVariables(
  runtime: CurveRuntime,
  placementFile: RuntimeArtifactFile,
): readonly ProverPlacementVariables[] {
  const idsSection = requireRuntimeSection(placementFile, {
    type: BinarySectionType.Placement,
    encoding: BinarySectionEncoding.Bytes,
    label: "placement.subcircuit_ids",
  });
  const offsetsSection = requireRuntimeSection(placementFile, {
    type: BinarySectionType.Placement,
    encoding: BinarySectionEncoding.Bytes,
    label: "placement.variable_offsets",
  });
  const variablesSection = requireRuntimeSection(placementFile, {
    type: BinarySectionType.Placement,
    encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
    label: "placement.variables",
  });
  const subcircuitIds = readU32List(idsSection.data, "placement.subcircuit_ids");
  const variableOffsets = readU32List(offsetsSection.data, "placement.variable_offsets");
  const variables = splitFieldElements(runtime, variablesSection.data, "placement.variables");

  if (variableOffsets.length !== subcircuitIds.length + 1) {
    throw new Error("placement.variable_offsets length must be placement.subcircuit_ids length plus one.");
  }

  if (variableOffsets[0] !== 0) {
    throw new Error("placement.variable_offsets must start at zero.");
  }

  if (variableOffsets[variableOffsets.length - 1] !== variables.length) {
    throw new Error("placement.variable_offsets final value must equal placement.variables element count.");
  }

  return subcircuitIds.map((subcircuitId, index): ProverPlacementVariables => {
    const start = variableOffsets[index];
    const end = variableOffsets[index + 1];
    if (end < start) {
      throw new Error(`placement.variable_offsets must be monotonic at index ${index}.`);
    }

    return {
      subcircuitId,
      variables: variables.slice(start, end),
    };
  });
}

export function parseProverPublicInstance(
  runtime: CurveRuntime,
  instanceFile: RuntimeArtifactFile,
): readonly FieldElement[] {
  const section = requireRuntimeSection(instanceFile, {
    type: BinarySectionType.Instance,
    encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
    label: "instance.public",
  });

  return splitFieldElements(runtime, section.data, "instance.public");
}

function readU32List(data: Uint8Array, label: string): number[] {
  if (data.byteLength % 4 !== 0) {
    throw new Error(`${label} byte length must be divisible by 4.`);
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const output: number[] = [];
  for (let offset = 0; offset < data.byteLength; offset += 4) {
    output.push(view.getUint32(offset, true));
  }

  return output;
}

function splitFieldElements(runtime: CurveRuntime, data: Uint8Array, label: string): FieldElement[] {
  if (data.byteLength % runtime.Fr.byteLength !== 0) {
    throw new Error(`${label} byte length is not divisible by the field element width.`);
  }

  const output: FieldElement[] = [];
  for (let offset = 0; offset < data.byteLength; offset += runtime.Fr.byteLength) {
    output.push(data.subarray(offset, offset + runtime.Fr.byteLength));
  }

  return output;
}

function assertSetupMatchesGeneratedSubcircuitLibrary(setup: ProverSetupParams): void {
  const fields: readonly (keyof ProverSetupParams)[] = [
    "l_free",
    "l_user_out",
    "l_user",
    "l",
    "l_D",
    "m_D",
    "n",
    "s_D",
    "s_max",
  ];

  for (const field of fields) {
    if (setup[field] !== GENERATED_PROVER_SETUP_PARAMS[field]) {
      throw new Error(
        `Prover setup params do not match the baked subcircuit library: ${field}=${setup[field]}, expected ${GENERATED_PROVER_SETUP_PARAMS[field]}.`,
      );
    }
  }
}
