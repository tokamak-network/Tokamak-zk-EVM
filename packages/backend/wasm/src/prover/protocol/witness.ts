import type { FieldElement } from "../../runtime/field/field-types.js";

export interface ProverSubcircuitInfo {
  readonly id: number;
  readonly name: string;
  readonly Nwires: number;
  readonly NrealWires: number;
  readonly Nconsts: number;
  readonly Out_idx: readonly [number, number];
  readonly In_idx: readonly [number, number];
  readonly Wiring_idx: readonly [number, number];
  readonly Public_idx: readonly [number, number];
  readonly Internal_idx: readonly [number, number];
  readonly bufferDirection?: "in" | "out";
  readonly publicPhase?: string;
}

export interface ProverPlacementVariables {
  readonly subcircuitIds: Uint32Array;
  readonly variableOffsets: Uint32Array;
  readonly variables: Uint8Array;
  readonly fieldByteLength: number;
}

export interface ProverPackedSparseMatrix {
  readonly activeWires: readonly number[];
  readonly rowOffsets: Uint8Array;
  readonly columns: Uint8Array;
  readonly coefficients: Uint8Array;
  readonly rowCount: number;
}

export interface ProverPackedSparseSubcircuitR1cs {
  readonly subcircuitId: number;
  readonly A: ProverPackedSparseMatrix;
  readonly B: ProverPackedSparseMatrix;
  readonly C: ProverPackedSparseMatrix;
}

export function placementCount(placements: ProverPlacementVariables): number {
  return placements.subcircuitIds.length;
}

export function placementSubcircuitId(
  placements: ProverPlacementVariables,
  placementIndex: number,
): number {
  const subcircuitId = placements.subcircuitIds[placementIndex];
  if (subcircuitId === undefined) throw new Error(`Placement index ${placementIndex} is out of bounds.`);
  return subcircuitId;
}

export function placementVariableCount(
  placements: ProverPlacementVariables,
  placementIndex: number,
): number {
  const start = placements.variableOffsets[placementIndex];
  const end = placements.variableOffsets[placementIndex + 1];
  if (start === undefined || end === undefined || end < start) {
    throw new Error(`Placement variable range ${placementIndex} is invalid.`);
  }
  return end - start;
}

export function placementVariableAt(
  placements: ProverPlacementVariables,
  placementIndex: number,
  localIndex: number,
): FieldElement {
  const start = placements.variableOffsets[placementIndex];
  const end = placements.variableOffsets[placementIndex + 1];
  const valueIndex = start === undefined ? -1 : start + localIndex;
  if (
    end === undefined
    || !Number.isSafeInteger(localIndex)
    || localIndex < 0
    || valueIndex < 0
    || valueIndex >= end
  ) {
    throw new Error(`Placement variable index ${placementIndex}:${localIndex} is out of bounds.`);
  }
  const offset = valueIndex * placements.fieldByteLength;
  return placements.variables.subarray(offset, offset + placements.fieldByteLength);
}
