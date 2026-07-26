import {
  createBinaryArtifactFile,
  requireBinaryArtifactSection,
} from "../../../src/artifacts/binary/binary-artifact-file.js";
import type { BinaryArtifactFileView } from "../../../src/artifacts/binary/binary-format.js";
import {
  BinaryArtifactFileKind,
  BinarySectionEncoding,
  BinarySectionType,
} from "../../../src/artifacts/binary/binary-format.js";
import type { CurveRuntime } from "../../../src/runtime/curve/curve.js";
import { BACKEND_WASM_PACKAGE_VERSION } from "../../../src/version.js";

interface PlacementSource {
  readonly subcircuitId: number;
  readonly variables: readonly unknown[];
}

export interface FlatPlacementVariables {
  readonly subcircuitIds: Uint32Array;
  readonly variableOffsets: Uint32Array;
  readonly variables: Uint8Array;
  readonly fieldByteLength: number;
}

export async function convertWitnessDirect(
  runtime: CurveRuntime,
  raw: unknown,
): Promise<Uint8Array> {
  const placements = parsePlacementsWithoutVariableCopies(raw);
  const ids = new Uint32Array(placements.length);
  const offsets = new Uint32Array(placements.length + 1);
  let variableCount = 0;

  for (let index = 0; index < placements.length; index += 1) {
    const placement = placements[index];
    ids[index] = placement.subcircuitId;
    variableCount += placement.variables.length;
    offsets[index + 1] = variableCount;
  }

  const variables = new Uint8Array(variableCount * runtime.Fr.byteLength);
  let variableIndex = 0;
  for (let placementIndex = 0; placementIndex < placements.length; placementIndex += 1) {
    const sourceVariables = placements[placementIndex].variables;
    for (let localIndex = 0; localIndex < sourceVariables.length; localIndex += 1) {
      const value = parseHex(
        sourceVariables[localIndex],
        `placementVariables[${placementIndex}].variables[${localIndex}]`,
      );
      variables.set(runtime.Fr.fromHex(value), variableIndex * runtime.Fr.byteLength);
      variableIndex += 1;
    }
  }

  return await createBinaryArtifactFile({
    kind: BinaryArtifactFileKind.ProverPlacementVariables,
    sourcePackageVersion: BACKEND_WASM_PACKAGE_VERSION,
    sections: [
      {
        type: BinarySectionType.Placement,
        encoding: BinarySectionEncoding.Bytes,
        label: "placement.subcircuit_ids",
        elementCount: ids.length,
        elementByteLength: 4,
        data: bytesOf(ids),
      },
      {
        type: BinarySectionType.Placement,
        encoding: BinarySectionEncoding.Bytes,
        label: "placement.variable_offsets",
        elementCount: offsets.length,
        elementByteLength: 4,
        data: bytesOf(offsets),
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

export function loadFlatPlacementVariables(
  placementFile: BinaryArtifactFileView,
  fieldByteLength: number,
): FlatPlacementVariables {
  const idsSection = requireBinaryArtifactSection(placementFile, {
    type: BinarySectionType.Placement,
    encoding: BinarySectionEncoding.Bytes,
    label: "placement.subcircuit_ids",
  });
  const offsetsSection = requireBinaryArtifactSection(placementFile, {
    type: BinarySectionType.Placement,
    encoding: BinarySectionEncoding.Bytes,
    label: "placement.variable_offsets",
  });
  const variablesSection = requireBinaryArtifactSection(placementFile, {
    type: BinarySectionType.Placement,
    encoding: BinarySectionEncoding.FfjsFrMontgomeryLe32,
    label: "placement.variables",
  });
  const subcircuitIds = readU32Array(idsSection.data, "placement.subcircuit_ids");
  const variableOffsets = readU32Array(
    offsetsSection.data,
    "placement.variable_offsets",
  );

  if (variablesSection.data.byteLength % fieldByteLength !== 0) {
    throw new Error("placement.variables is not aligned to the field width.");
  }
  if (variableOffsets.length !== subcircuitIds.length + 1) {
    throw new Error(
      "placement.variable_offsets length must be placement.subcircuit_ids length plus one.",
    );
  }
  if (variableOffsets[0] !== 0) {
    throw new Error("placement.variable_offsets must start at zero.");
  }
  const variableCount = variablesSection.data.byteLength / fieldByteLength;
  if (variableOffsets[variableOffsets.length - 1] !== variableCount) {
    throw new Error(
      "placement.variable_offsets final value must equal placement.variables element count.",
    );
  }
  for (let index = 0; index < variableOffsets.length - 1; index += 1) {
    if (variableOffsets[index + 1] < variableOffsets[index]) {
      throw new Error(`placement.variable_offsets must be monotonic at index ${index}.`);
    }
  }

  return {
    subcircuitIds,
    variableOffsets,
    variables: variablesSection.data,
    fieldByteLength,
  };
}

export function flatPlacementVariableAt(
  placements: FlatPlacementVariables,
  placementIndex: number,
  localIndex: number,
): Uint8Array {
  const start = placements.variableOffsets[placementIndex];
  const end = placements.variableOffsets[placementIndex + 1];
  const variableIndex = start + localIndex;
  if (localIndex < 0 || variableIndex >= end) {
    throw new Error("Flat placement variable index is out of bounds.");
  }
  const byteOffset = variableIndex * placements.fieldByteLength;
  return placements.variables.subarray(
    byteOffset,
    byteOffset + placements.fieldByteLength,
  );
}

function parsePlacementsWithoutVariableCopies(raw: unknown): readonly PlacementSource[] {
  if (!Array.isArray(raw)) {
    throw new Error("Native placementVariables JSON must be an array.");
  }

  return raw.map((entry, index): PlacementSource => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`Native placementVariables entry ${index} must be an object.`);
    }
    const record = entry as Record<string, unknown>;
    if (
      typeof record.subcircuitId !== "number"
      || !Number.isSafeInteger(record.subcircuitId)
      || record.subcircuitId < 0
      || record.subcircuitId > 0xffffffff
    ) {
      throw new Error(
        `placementVariables[${index}].subcircuitId must be an unsigned 32-bit integer.`,
      );
    }
    if (!Array.isArray(record.variables)) {
      throw new Error(`placementVariables[${index}].variables must be an array.`);
    }
    return {
      subcircuitId: record.subcircuitId,
      variables: record.variables,
    };
  });
}

function parseHex(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]*$/.test(value)) {
    throw new Error(`${label} must be a 0x-prefixed hexadecimal string.`);
  }
  return value;
}

function readU32Array(data: Uint8Array, label: string): Uint32Array {
  if (data.byteLength % 4 !== 0) {
    throw new Error(`${label} byte length must be divisible by 4.`);
  }
  const output = new Uint32Array(data.byteLength / 4);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = view.getUint32(index * 4, true);
  }
  return output;
}

function bytesOf(values: Uint32Array): Uint8Array {
  return new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
}
