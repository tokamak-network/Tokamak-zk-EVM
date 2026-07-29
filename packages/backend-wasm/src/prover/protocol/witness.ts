import { BivariatePolynomialBuffer } from "../../runtime/polynomial/bivariate-polynomial-buffer.js";
import type { FieldElement, FieldRuntime } from "../../runtime/field/field-runtime.js";
import type { PermutationEntry } from "../../runtime/polynomial/permutation-polynomials.js";
import type { SetupParams } from "../../artifacts/setup/setup-params.js";

export interface ProverSubcircuitInfo {
  readonly id: number;
  readonly name: string;
  readonly Nwires: number;
  readonly Nconsts: number;
  readonly Out_idx: readonly number[];
  readonly In_idx: readonly number[];
  readonly flattenMap: readonly number[];
}

export interface ProverPlacementVariables {
  readonly subcircuitIds: Uint32Array;
  readonly variableOffsets: Uint32Array;
  readonly variables: Uint8Array;
  readonly fieldByteLength: number;
}

export type ProverPermutationEntry = PermutationEntry;

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

export interface ProverWitnessInput {
  readonly setup: SetupParams;
  readonly subcircuitInfos: readonly ProverSubcircuitInfo[];
  readonly placementVariables: ProverPlacementVariables;
  readonly r1csBySubcircuit: readonly ProverPackedSparseSubcircuitR1cs[];
}

export interface WitnessPolynomials {
  readonly bXY: BivariatePolynomialBuffer;
  readonly uXY: BivariatePolynomialBuffer;
  readonly vXY: BivariatePolynomialBuffer;
  readonly wXY: BivariatePolynomialBuffer;
  readonly rXY: BivariatePolynomialBuffer;
}

export async function buildWitnessPolynomials(
  field: FieldRuntime,
  input: ProverWitnessInput,
): Promise<WitnessPolynomials> {
  validateSetupParams(input.setup);
  validateSubcircuitInfos(input.subcircuitInfos);
  validatePlacements(input.placementVariables, input.subcircuitInfos, input.setup);
  const r1csBySubcircuit = indexPackedSparseR1cs(
    input.r1csBySubcircuit,
    input.subcircuitInfos,
    input.setup,
  );

  const bXY = await genBXY(field, input.placementVariables, input.subcircuitInfos, input.setup);
  const { uXY, vXY, wXY } = await genUvwXY(
    field,
    input.placementVariables,
    r1csBySubcircuit,
    input.setup,
  );

  return {
    bXY,
    uXY,
    vXY,
    wXY,
    rXY: BivariatePolynomialBuffer.zero(field),
  };
}

export async function genBXY(
  field: FieldRuntime,
  placementVariables: ProverPlacementVariables,
  subcircuitInfos: readonly ProverSubcircuitInfo[],
  setup: SetupParams,
): Promise<BivariatePolynomialBuffer> {
  validateSetupParams(setup);
  validateSubcircuitInfos(subcircuitInfos);
  validatePlacements(placementVariables, subcircuitInfos, setup);

  const mI = setup.l_D - setup.l;
  const evals = field.createZeroBuffer(mI * setup.s_max);

  for (let placementIndex = 0; placementIndex < placementCount(placementVariables); placementIndex += 1) {
    const subcircuitInfo = subcircuitInfos[placementSubcircuitId(placementVariables, placementIndex)];
    const variableCount = placementVariableCount(placementVariables, placementIndex);

    for (let localIndex = 0; localIndex < variableCount; localIndex += 1) {
      const globalIndex = subcircuitInfo.flattenMap[localIndex];
      const value = placementVariableAt(placementVariables, placementIndex, localIndex);
      if (globalIndex >= setup.l && globalIndex < setup.l_D && !field.isZero(value)) {
        const outputIndex = (globalIndex - setup.l) * setup.s_max + placementIndex;
        evals.set(value, outputIndex * field.byteLength);
      }
    }
  }

  return BivariatePolynomialBuffer.fromRouEvals(field, evals, mI, setup.s_max);
}

export async function genUvwXY(
  field: FieldRuntime,
  placementVariables: ProverPlacementVariables,
  r1csBySubcircuit: readonly (ProverPackedSparseSubcircuitR1cs | undefined)[],
  setup: SetupParams,
): Promise<{
  readonly uXY: BivariatePolynomialBuffer;
  readonly vXY: BivariatePolynomialBuffer;
  readonly wXY: BivariatePolynomialBuffer;
}> {
  validateSetupParams(setup);
  if (placementCount(placementVariables) > setup.s_max) {
    throw new Error("placementVariables length exceeds s_max.");
  }

  const rowMajor = [
    field.createZeroBuffer(setup.s_max * setup.n),
    field.createZeroBuffer(setup.s_max * setup.n),
    field.createZeroBuffer(setup.s_max * setup.n),
  ];

  for (let placementIndex = 0; placementIndex < placementCount(placementVariables); placementIndex += 1) {
    const subcircuitId = placementSubcircuitId(placementVariables, placementIndex);
    const r1cs = r1csBySubcircuit[subcircuitId];
    if (r1cs === undefined) {
      throw new Error(`Missing sparse R1CS for subcircuit ${subcircuitId}.`);
    }

    for (const [matrixIndex, matrix] of [r1cs.A, r1cs.B, r1cs.C].entries()) {
      const rows = await evaluatePackedSparseMatrixRows(
        field,
        placementVariables,
        placementIndex,
        matrix,
      );
      writePlacementColumn(
        rowMajor[matrixIndex],
        rows,
        placementIndex,
        setup.s_max,
        setup.n,
        field.byteLength,
      );
    }
  }

  return {
    uXY: await BivariatePolynomialBuffer.fromRouEvals(field, rowMajor[0], setup.n, setup.s_max),
    vXY: await BivariatePolynomialBuffer.fromRouEvals(field, rowMajor[1], setup.n, setup.s_max),
    wXY: await BivariatePolynomialBuffer.fromRouEvals(field, rowMajor[2], setup.n, setup.s_max),
  };
}

async function evaluatePackedSparseMatrixRows(
  field: FieldRuntime,
  placementVariables: ProverPlacementVariables,
  placementIndex: number,
  matrix: ProverPackedSparseMatrix,
): Promise<Uint8Array> {
  const variableCount = placementVariableCount(placementVariables, placementIndex);
  const activeVariables = new Uint8Array(matrix.activeWires.length * field.byteLength);
  for (let index = 0; index < matrix.activeWires.length; index += 1) {
    const localIndex = matrix.activeWires[index];
    if (!Number.isSafeInteger(localIndex) || localIndex < 0 || localIndex >= variableCount) {
      throw new Error(`Sparse R1CS active wire ${localIndex} is outside the placement variable range.`);
    }

    field.writeBufferElement(
      activeVariables,
      index,
      placementVariableAt(placementVariables, placementIndex, localIndex),
    );
  }

  return field.sparseRowDotBuffer(
    matrix.rowOffsets,
    matrix.columns,
    matrix.coefficients,
    activeVariables,
    matrix.rowCount,
  );
}

function writePlacementColumn(
  output: Uint8Array,
  rows: Uint8Array,
  placementIndex: number,
  placementCount: number,
  rowCount: number,
  fieldByteLength: number,
): void {
  if (rows.byteLength !== rowCount * fieldByteLength) {
    throw new Error("Sparse R1CS row result length does not match the expected row count.");
  }

  for (let row = 0; row < rowCount; row += 1) {
    const sourceOffset = row * fieldByteLength;
    const targetOffset = (row * placementCount + placementIndex) * fieldByteLength;
    output.set(rows.subarray(sourceOffset, sourceOffset + fieldByteLength), targetOffset);
  }
}

function indexPackedSparseR1cs(
  r1csEntries: readonly ProverPackedSparseSubcircuitR1cs[],
  subcircuitInfos: readonly ProverSubcircuitInfo[],
  setup: SetupParams,
): (ProverPackedSparseSubcircuitR1cs | undefined)[] {
  const indexed: (ProverPackedSparseSubcircuitR1cs | undefined)[] = Array.from({
    length: subcircuitInfos.length,
  });

  for (const entry of r1csEntries) {
    validatePackedSparseR1cs(entry, subcircuitInfos, setup);
    if (indexed[entry.subcircuitId] !== undefined) {
      throw new Error(`Duplicate sparse R1CS for subcircuit ${entry.subcircuitId}.`);
    }

    indexed[entry.subcircuitId] = entry;
  }

  return indexed;
}

function validateSetupParams(setup: SetupParams): void {
  const numericFields: readonly (keyof SetupParams)[] = [
    "l_free",
    "l",
    "l_user_out",
    "l_user",
    "l_D",
    "m_D",
    "n",
    "s_D",
    "s_max",
  ];

  for (const field of numericFields) {
    if (!Number.isSafeInteger(setup[field]) || setup[field] < 0) {
      throw new Error(`Invalid prover setup parameter '${field}'.`);
    }
  }

  if (setup.l_D <= setup.l) {
    throw new Error("Prover setup requires l_D > l so m_i is positive.");
  }

  if (setup.n <= 0 || setup.s_max <= 0) {
    throw new Error("Prover setup requires positive n and s_max.");
  }

  if (!isPowerOfTwo(setup.l_D - setup.l) || !isPowerOfTwo(setup.n) || !isPowerOfTwo(setup.s_max)) {
    throw new Error("Prover witness domains m_i, n, and s_max must be powers of two.");
  }
}

function validateSubcircuitInfos(subcircuitInfos: readonly ProverSubcircuitInfo[]): void {
  for (let index = 0; index < subcircuitInfos.length; index += 1) {
    const info = subcircuitInfos[index];
    if (info.id !== index) {
      throw new Error(`Subcircuit info id ${info.id} does not match its index ${index}.`);
    }

    if (!Number.isSafeInteger(info.Nwires) || info.Nwires < 0) {
      throw new Error(`Invalid Nwires for subcircuit ${info.id}.`);
    }

    if (info.flattenMap.length !== info.Nwires) {
      throw new Error(`Subcircuit ${info.id} flattenMap length does not match Nwires.`);
    }
  }
}

function validatePlacements(
  placementVariables: ProverPlacementVariables,
  subcircuitInfos: readonly ProverSubcircuitInfo[],
  setup: SetupParams,
): void {
  if (placementVariables.fieldByteLength <= 0) {
    throw new Error("placementVariables fieldByteLength must be positive.");
  }
  if (placementVariables.variables.byteLength % placementVariables.fieldByteLength !== 0) {
    throw new Error("placementVariables data is not aligned to fieldByteLength.");
  }
  if (placementVariables.variableOffsets.length !== placementVariables.subcircuitIds.length + 1) {
    throw new Error("placementVariables offsets length must be placement count plus one.");
  }
  if (placementVariables.variableOffsets[0] !== 0) {
    throw new Error("placementVariables offsets must start at zero.");
  }
  if (
    placementVariables.variableOffsets[placementVariables.variableOffsets.length - 1]
    !== placementVariables.variables.byteLength / placementVariables.fieldByteLength
  ) {
    throw new Error("placementVariables final offset must match the variable count.");
  }
  if (placementCount(placementVariables) > setup.s_max) {
    throw new Error("placementVariables length exceeds s_max.");
  }

  for (let index = 0; index < placementCount(placementVariables); index += 1) {
    const subcircuitId = placementSubcircuitId(placementVariables, index);
    if (
      subcircuitId < 0 ||
      subcircuitId >= subcircuitInfos.length
    ) {
      throw new Error(`Invalid subcircuit id in placement ${index}.`);
    }

    const info = subcircuitInfos[subcircuitId];
    if (placementVariableCount(placementVariables, index) !== info.flattenMap.length) {
      throw new Error(`Placement ${index} variable count does not match subcircuit ${info.id}.`);
    }
  }
}

export function placementCount(placements: ProverPlacementVariables): number {
  return placements.subcircuitIds.length;
}

export function placementSubcircuitId(
  placements: ProverPlacementVariables,
  placementIndex: number,
): number {
  const subcircuitId = placements.subcircuitIds[placementIndex];
  if (subcircuitId === undefined) {
    throw new Error(`Placement index ${placementIndex} is out of bounds.`);
  }
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
  const variableIndex = start === undefined ? -1 : start + localIndex;
  if (
    end === undefined
    || !Number.isSafeInteger(localIndex)
    || localIndex < 0
    || variableIndex < 0
    || variableIndex >= end
  ) {
    throw new Error(`Placement variable index ${placementIndex}:${localIndex} is out of bounds.`);
  }

  const byteOffset = variableIndex * placements.fieldByteLength;
  return placements.variables.subarray(byteOffset, byteOffset + placements.fieldByteLength);
}

function validatePackedSparseR1cs(
  r1cs: ProverPackedSparseSubcircuitR1cs,
  subcircuitInfos: readonly ProverSubcircuitInfo[],
  setup: SetupParams,
): void {
  if (!Number.isSafeInteger(r1cs.subcircuitId) || r1cs.subcircuitId < 0 || r1cs.subcircuitId >= subcircuitInfos.length) {
    throw new Error(`Invalid sparse R1CS subcircuit id ${r1cs.subcircuitId}.`);
  }

  validatePackedSparseMatrix(r1cs.A, setup.n, `subcircuit ${r1cs.subcircuitId} A`);
  validatePackedSparseMatrix(r1cs.B, setup.n, `subcircuit ${r1cs.subcircuitId} B`);
  validatePackedSparseMatrix(r1cs.C, setup.n, `subcircuit ${r1cs.subcircuitId} C`);
}

function validatePackedSparseMatrix(
  matrix: ProverPackedSparseMatrix,
  rowCount: number,
  label: string,
): void {
  if (matrix.rowCount !== rowCount) {
    throw new Error(`${label} row count does not match n.`);
  }
  if (matrix.rowOffsets.byteLength !== (rowCount + 1) * 4) {
    throw new Error(`${label} row-offset byte length does not match n.`);
  }
  if (matrix.columns.byteLength % 4 !== 0) {
    throw new Error(`${label} column byte length is not divisible by four.`);
  }
  if (matrix.coefficients.byteLength !== (matrix.columns.byteLength / 4) * 32) {
    throw new Error(`${label} coefficient byte length does not match its columns.`);
  }
}

function isPowerOfTwo(value: number): boolean {
  if (!Number.isSafeInteger(value) || value <= 0) {
    return false;
  }

  let remaining = value;
  while (remaining % 2 === 0) {
    remaining /= 2;
  }

  return remaining === 1;
}
