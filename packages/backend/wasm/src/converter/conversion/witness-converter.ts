import { createBinaryArtifactFile } from "../../artifacts/binary/binary-artifact-file.js";
import { BACKEND_WASM_PACKAGE_VERSION } from "../../version.js";
import { SYNTHESIZER_BROWSER_ARTIFACT_CONTRACT } from "../../generated/synthesizer-browser-artifact-contract.generated.js";
import { PROVER_PLACEMENT_VARIABLES_V1_SPEC } from "../../generated/browser-artifact-contracts.generated.js";
import type { CurveRuntime } from "../../runtime/curve/curve.js";
import {
  isRecord,
  parseU32,
} from "./conversion-utils.js";
import { withCurveRuntime } from "./conversion-runtime.js";
import {
  requireProducerSourceField,
  requireProducerSourceFields,
} from "./producer-artifact-contract.js";

const PLACEMENT_ARTIFACT_NAME = "prover_placement_variables";
const placementSourceFields = requireProducerSourceFields(
  SYNTHESIZER_BROWSER_ARTIFACT_CONTRACT,
  PLACEMENT_ARTIFACT_NAME,
);
const placementSubcircuitIdField = requireProducerSourceField(
  placementSourceFields,
  "subcircuitId",
  PLACEMENT_ARTIFACT_NAME,
);
const placementVariablesField = requireProducerSourceField(
  placementSourceFields,
  "variables",
  PLACEMENT_ARTIFACT_NAME,
);
const [subcircuitIdsSectionSpec, variableOffsetsSectionSpec, variablesSectionSpec] =
  PROVER_PLACEMENT_VARIABLES_V1_SPEC.sections;

interface NativePlacementVariablesSource {
  readonly subcircuitId: number;
  readonly variables: readonly unknown[];
}

export async function convertWitness(witness: unknown): Promise<Uint8Array> {
  return withCurveRuntime((runtime) =>
    createProverPlacementVariablesArtifact(runtime, witness, BACKEND_WASM_PACKAGE_VERSION));
}

async function createProverPlacementVariablesArtifact(
  runtime: CurveRuntime,
  raw: unknown,
  sourcePackageVersion: string,
): Promise<Uint8Array> {
  const placementVariables = parseNativePlacementVariablesSource(raw);
  const subcircuitIds = new Uint32Array(placementVariables.length);
  const variableOffsets = new Uint32Array(placementVariables.length + 1);
  let variableCount = 0;

  for (let index = 0; index < placementVariables.length; index += 1) {
    const placement = placementVariables[index];
    subcircuitIds[index] = placement.subcircuitId;
    variableCount += placement.variables.length;
    variableOffsets[index + 1] = variableCount;
  }

  const variables = new Uint8Array(variableCount * runtime.Fr.byteLength);
  let variableIndex = 0;
  for (let placementIndex = 0; placementIndex < placementVariables.length; placementIndex += 1) {
    const sourceVariables = placementVariables[placementIndex].variables;
    for (let localIndex = 0; localIndex < sourceVariables.length; localIndex += 1) {
      const value = parseHex(
        sourceVariables[localIndex],
        `placementVariables[${placementIndex}].variables[${localIndex}]`,
      );
      variables.set(runtime.Fr.fromHex(value), variableIndex * runtime.Fr.byteLength);
      variableIndex += 1;
    }
  }

  return createBinaryArtifactFile({
    kind: PROVER_PLACEMENT_VARIABLES_V1_SPEC.kind,
    sourcePackageVersion,
    sections: [
      {
        ...subcircuitIdsSectionSpec,
        elementCount: subcircuitIds.length,
        elementByteLength: 4,
        data: bytesOf(subcircuitIds),
      },
      {
        ...variableOffsetsSectionSpec,
        elementCount: variableOffsets.length,
        elementByteLength: 4,
        data: bytesOf(variableOffsets),
      },
      {
        ...variablesSectionSpec,
        elementCount: variableCount,
        elementByteLength: runtime.Fr.byteLength,
        data: variables,
      },
    ],
  });
}

function parseNativePlacementVariablesSource(raw: unknown): readonly NativePlacementVariablesSource[] {
  if (!Array.isArray(raw)) {
    throw new Error("Native placementVariables JSON must be an array.");
  }

  return raw.map((entry, index): NativePlacementVariablesSource => {
    if (!isRecord(entry)) {
      throw new Error(`Native placementVariables entry ${index} must be an object.`);
    }

    if (!Array.isArray(entry[placementVariablesField])) {
      throw new Error(`placementVariables[${index}].${placementVariablesField} must be an array.`);
    }

    return {
      subcircuitId: parseU32(
        entry[placementSubcircuitIdField],
        `placementVariables[${index}].${placementSubcircuitIdField}`,
      ),
      variables: entry[placementVariablesField],
    };
  });
}

function parseHex(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]*$/.test(value)) {
    throw new Error(`${label} must be a 0x-prefixed hexadecimal string.`);
  }

  return value;
}

function bytesOf(values: Uint32Array): Uint8Array {
  return new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
}
