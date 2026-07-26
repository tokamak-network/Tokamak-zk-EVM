import type { FieldElement } from "../../../src/runtime/field/field.js";
import type {
  ProverPackedSparseSubcircuitR1cs,
  ProverWitnessInput,
} from "../../../src/prover/protocol/witness.js";

export interface ProverSparseRowEntry {
  readonly column: number;
  readonly coefficient: FieldElement;
}

export interface ProverSparseMatrix {
  readonly activeWires: readonly number[];
  readonly sparseRows: readonly (readonly ProverSparseRowEntry[])[];
}

export interface ProverSparseSubcircuitR1cs {
  readonly subcircuitId: number;
  readonly A: ProverSparseMatrix;
  readonly B: ProverSparseMatrix;
  readonly C: ProverSparseMatrix;
}

export type LegacyProverWitnessInput = Omit<ProverWitnessInput, "r1csBySubcircuit"> & {
  readonly r1csBySubcircuit: readonly ProverSparseSubcircuitR1cs[];
};

export function withLegacySparseR1cs(input: ProverWitnessInput): LegacyProverWitnessInput {
  return {
    ...input,
    r1csBySubcircuit: unpackPackedSparseR1cs(input.r1csBySubcircuit),
  };
}

export function unpackPackedSparseR1cs(
  entries: readonly ProverPackedSparseSubcircuitR1cs[],
): readonly ProverSparseSubcircuitR1cs[] {
  return entries.map((entry) => ({
    subcircuitId: entry.subcircuitId,
    A: unpackMatrix(entry.A),
    B: unpackMatrix(entry.B),
    C: unpackMatrix(entry.C),
  }));
}

function unpackMatrix(
  matrix: ProverPackedSparseSubcircuitR1cs["A"],
): ProverSparseMatrix {
  const rowOffsets = new DataView(
    matrix.rowOffsets.buffer,
    matrix.rowOffsets.byteOffset,
    matrix.rowOffsets.byteLength,
  );
  const columns = new DataView(
    matrix.columns.buffer,
    matrix.columns.byteOffset,
    matrix.columns.byteLength,
  );

  return {
    activeWires: matrix.activeWires,
    sparseRows: Array.from({ length: matrix.rowCount }, (_unused, row) => {
      const start = rowOffsets.getUint32(row * 4, true);
      const end = rowOffsets.getUint32((row + 1) * 4, true);
      return Array.from({ length: end - start }, (_entry, localIndex) => {
        const entryIndex = start + localIndex;
        return {
          column: columns.getUint32(entryIndex * 4, true),
          coefficient: matrix.coefficients.subarray(entryIndex * 32, (entryIndex + 1) * 32),
        };
      });
    }),
  };
}
