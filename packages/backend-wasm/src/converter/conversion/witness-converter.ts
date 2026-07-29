import { createBinaryArtifactFile } from "../../artifacts/binary/binary-artifact-file.js";
import {
  BinaryArtifactFileKind,
  BinarySectionEncoding,
  BinarySectionType,
} from "../../artifacts/binary/binary-format.js";
import { BACKEND_WASM_PACKAGE_VERSION } from "../../version.js";
import type { CurveRuntime } from "../../runtime/curve/curve.js";
import {
  isRecord,
  parseU32,
} from "./conversion-utils.js";
import { withCurveRuntime } from "./conversion-runtime.js";

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
    kind: BinaryArtifactFileKind.ProverPlacementVariables,
    sourcePackageVersion,
    sections: [
      {
        type: BinarySectionType.Placement,
        encoding: BinarySectionEncoding.Bytes,
        label: "placement.subcircuit_ids",
        elementCount: subcircuitIds.length,
        elementByteLength: 4,
        data: bytesOf(subcircuitIds),
      },
      {
        type: BinarySectionType.Placement,
        encoding: BinarySectionEncoding.Bytes,
        label: "placement.variable_offsets",
        elementCount: variableOffsets.length,
        elementByteLength: 4,
        data: bytesOf(variableOffsets),
      },
      {
        type: BinarySectionType.Placement,
        encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
        label: "placement.variables",
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

    if (!Array.isArray(entry.variables)) {
      throw new Error(`placementVariables[${index}].variables must be an array.`);
    }

    return {
      subcircuitId: parseU32(entry.subcircuitId, `placementVariables[${index}].subcircuitId`),
      variables: entry.variables,
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
