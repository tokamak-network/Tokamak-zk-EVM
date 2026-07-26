import { createBinaryArtifactFile } from "../../artifacts/binary/binary-artifact-file.js";
import {
  BinaryArtifactFileKind,
  BinarySectionEncoding,
  BinarySectionType,
} from "../../artifacts/binary/binary-format.js";
import { BACKEND_WASM_PACKAGE_VERSION } from "../../prover/api/version.js";
import { createCurveRuntime, type CurveRuntime } from "../../runtime/curve/curve.js";
import {
  concatBytes,
  encodeU32List,
  isRecord,
  parseHexStringArray,
  parseU32,
} from "./conversion-utils.js";

interface NativePlacementVariablesJson {
  readonly subcircuitId: number;
  readonly variables: readonly string[];
}

export async function convertWitness(witness: unknown): Promise<Uint8Array> {
  const runtime = await createCurveRuntime();
  try {
    return createProverPlacementVariablesArtifact(runtime, witness, BACKEND_WASM_PACKAGE_VERSION);
  } finally {
    await runtime.terminate();
  }
}

async function createProverPlacementVariablesArtifact(
  runtime: CurveRuntime,
  raw: unknown,
  sourcePackageVersion: string,
): Promise<Uint8Array> {
  const placementVariables = parseNativePlacementVariablesJson(raw);
  const variableOffsets = placementVariableOffsets(placementVariables);
  const variables = placementVariables.flatMap((placement) =>
    placement.variables.map((value) => runtime.Fr.fromHex(value)),
  );

  return createBinaryArtifactFile({
    kind: BinaryArtifactFileKind.ProverPlacementVariables,
    sourcePackageVersion,
    sections: [
      {
        type: BinarySectionType.Placement,
        encoding: BinarySectionEncoding.Bytes,
        label: "placement.subcircuit_ids",
        elementCount: placementVariables.length,
        elementByteLength: 4,
        data: encodeU32List(placementVariables.map((placement) => placement.subcircuitId)),
      },
      {
        type: BinarySectionType.Placement,
        encoding: BinarySectionEncoding.Bytes,
        label: "placement.variable_offsets",
        elementCount: variableOffsets.length,
        elementByteLength: 4,
        data: encodeU32List(variableOffsets),
      },
      {
        type: BinarySectionType.Placement,
        encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
        label: "placement.variables",
        elementCount: variables.length,
        elementByteLength: runtime.Fr.byteLength,
        data: concatBytes(variables),
      },
    ],
  });
}

function parseNativePlacementVariablesJson(raw: unknown): readonly NativePlacementVariablesJson[] {
  if (!Array.isArray(raw)) {
    throw new Error("Native placementVariables JSON must be an array.");
  }

  return raw.map((entry, index): NativePlacementVariablesJson => {
    if (!isRecord(entry)) {
      throw new Error(`Native placementVariables entry ${index} must be an object.`);
    }

    return {
      subcircuitId: parseU32(entry.subcircuitId, `placementVariables[${index}].subcircuitId`),
      variables: parseHexStringArray(entry.variables, `placementVariables[${index}].variables`),
    };
  });
}

function placementVariableOffsets(placementVariables: readonly NativePlacementVariablesJson[]): number[] {
  const offsets = [0];

  for (const placement of placementVariables) {
    offsets.push(offsets[offsets.length - 1] + placement.variables.length);
  }

  return offsets;
}
