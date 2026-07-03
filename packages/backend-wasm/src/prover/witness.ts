import { DensePolynomialExt } from "../libs/polynomial/dense-polynomial.js";
import type { FieldElement, FieldRuntime } from "../libs/runtime/field.js";

export interface ProverSetupParams {
  readonly l_free: number;
  readonly l: number;
  readonly l_user_out: number;
  readonly l_user: number;
  readonly l_D: number;
  readonly m_D: number;
  readonly n: number;
  readonly s_D: number;
  readonly s_max: number;
}

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
  readonly subcircuitId: number;
  readonly variables: readonly FieldElement[];
}

export interface ProverSparseRowEntry {
  readonly column: number;
  readonly coefficient: FieldElement;
}

export type ProverSparseRows = readonly (readonly ProverSparseRowEntry[])[];

export interface ProverSparseMatrix {
  readonly activeWires: readonly number[];
  readonly sparseRows: ProverSparseRows;
}

export interface ProverSparseSubcircuitR1cs {
  readonly subcircuitId: number;
  readonly A: ProverSparseMatrix;
  readonly B: ProverSparseMatrix;
  readonly C: ProverSparseMatrix;
}

export interface ProverWitnessInput {
  readonly setup: ProverSetupParams;
  readonly subcircuitInfos: readonly ProverSubcircuitInfo[];
  readonly placementVariables: readonly ProverPlacementVariables[];
  readonly r1csBySubcircuit: readonly ProverSparseSubcircuitR1cs[];
}

export interface WitnessPolynomials {
  readonly bXY: DensePolynomialExt;
  readonly uXY: DensePolynomialExt;
  readonly vXY: DensePolynomialExt;
  readonly wXY: DensePolynomialExt;
  readonly rXY: DensePolynomialExt;
}

export async function buildWitnessPolynomials(
  field: FieldRuntime,
  input: ProverWitnessInput,
): Promise<WitnessPolynomials> {
  validateSetupParams(input.setup);
  validateSubcircuitInfos(input.subcircuitInfos);
  validatePlacements(input.placementVariables, input.subcircuitInfos, input.setup);
  const r1csBySubcircuit = indexSparseR1cs(input.r1csBySubcircuit, input.subcircuitInfos, input.setup);

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
    rXY: DensePolynomialExt.zero(field),
  };
}

export async function genBXY(
  field: FieldRuntime,
  placementVariables: readonly ProverPlacementVariables[],
  subcircuitInfos: readonly ProverSubcircuitInfo[],
  setup: ProverSetupParams,
): Promise<DensePolynomialExt> {
  validateSetupParams(setup);
  validateSubcircuitInfos(subcircuitInfos);
  validatePlacements(placementVariables, subcircuitInfos, setup);

  const mI = setup.l_D - setup.l;
  const evals = Array.from({ length: mI * setup.s_max }, () => field.zero);

  for (let placementIndex = 0; placementIndex < placementVariables.length; placementIndex += 1) {
    const placement = placementVariables[placementIndex];
    const subcircuitInfo = subcircuitInfos[placement.subcircuitId];

    for (let localIndex = 0; localIndex < placement.variables.length; localIndex += 1) {
      const globalIndex = subcircuitInfo.flattenMap[localIndex];
      const value = placement.variables[localIndex];
      if (globalIndex >= setup.l && globalIndex < setup.l_D && !field.isZero(value)) {
        evals[(globalIndex - setup.l) * setup.s_max + placementIndex] = value.slice();
      }
    }
  }

  return DensePolynomialExt.fromRouEvals(field, evals, mI, setup.s_max);
}

export async function genUvwXY(
  field: FieldRuntime,
  placementVariables: readonly ProverPlacementVariables[],
  r1csBySubcircuit: readonly (ProverSparseSubcircuitR1cs | undefined)[],
  setup: ProverSetupParams,
): Promise<{
  readonly uXY: DensePolynomialExt;
  readonly vXY: DensePolynomialExt;
  readonly wXY: DensePolynomialExt;
}> {
  validateSetupParams(setup);
  if (placementVariables.length > setup.s_max) {
    throw new Error("placementVariables length exceeds s_max.");
  }

  const uByPlacement = Array.from({ length: setup.s_max * setup.n }, () => field.zero);
  const vByPlacement = Array.from({ length: setup.s_max * setup.n }, () => field.zero);
  const wByPlacement = Array.from({ length: setup.s_max * setup.n }, () => field.zero);

  for (let placementIndex = 0; placementIndex < placementVariables.length; placementIndex += 1) {
    const placement = placementVariables[placementIndex];
    const r1cs = r1csBySubcircuit[placement.subcircuitId];
    if (r1cs === undefined) {
      throw new Error(`Missing sparse R1CS for subcircuit ${placement.subcircuitId}.`);
    }

    evaluateSparseMatrixRows(
      field,
      placement.variables,
      r1cs.A,
      setup.n,
      uByPlacement,
      placementIndex * setup.n,
    );
    evaluateSparseMatrixRows(
      field,
      placement.variables,
      r1cs.B,
      setup.n,
      vByPlacement,
      placementIndex * setup.n,
    );
    evaluateSparseMatrixRows(
      field,
      placement.variables,
      r1cs.C,
      setup.n,
      wByPlacement,
      placementIndex * setup.n,
    );
  }

  const uEvals = transposePlacementMajorToRowMajor(uByPlacement, setup.s_max, setup.n);
  const vEvals = transposePlacementMajorToRowMajor(vByPlacement, setup.s_max, setup.n);
  const wEvals = transposePlacementMajorToRowMajor(wByPlacement, setup.s_max, setup.n);

  return {
    uXY: await DensePolynomialExt.fromRouEvals(field, uEvals, setup.n, setup.s_max),
    vXY: await DensePolynomialExt.fromRouEvals(field, vEvals, setup.n, setup.s_max),
    wXY: await DensePolynomialExt.fromRouEvals(field, wEvals, setup.n, setup.s_max),
  };
}

function evaluateSparseMatrixRows(
  field: FieldRuntime,
  variables: readonly FieldElement[],
  matrix: ProverSparseMatrix,
  rowCount: number,
  output: FieldElement[],
  outputOffset: number,
): void {
  const dVec = matrix.activeWires.map((localIndex) => {
    if (!Number.isSafeInteger(localIndex) || localIndex < 0 || localIndex >= variables.length) {
      throw new Error(`Sparse R1CS active wire ${localIndex} is outside the placement variable range.`);
    }

    return variables[localIndex];
  });

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    output[outputOffset + rowIndex] = field.zero;
  }

  for (let rowIndex = 0; rowIndex < matrix.sparseRows.length; rowIndex += 1) {
    if (rowIndex >= rowCount) {
      throw new Error(`Sparse R1CS row ${rowIndex} exceeds the expected row count ${rowCount}.`);
    }

    let accumulator = field.zero;
    for (const entry of matrix.sparseRows[rowIndex]) {
      if (!Number.isSafeInteger(entry.column) || entry.column < 0 || entry.column >= dVec.length) {
        throw new Error(`Sparse R1CS column ${entry.column} is outside the active wire range.`);
      }

      accumulator = field.add(accumulator, field.mul(entry.coefficient, dVec[entry.column]));
    }

    output[outputOffset + rowIndex] = accumulator;
  }
}

function transposePlacementMajorToRowMajor(
  values: readonly FieldElement[],
  placementCount: number,
  rowCount: number,
): FieldElement[] {
  if (values.length !== placementCount * rowCount) {
    throw new Error("Cannot transpose a buffer whose length does not match its shape.");
  }

  const output: FieldElement[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    for (let placement = 0; placement < placementCount; placement += 1) {
      output.push(values[placement * rowCount + row]);
    }
  }

  return output;
}

function indexSparseR1cs(
  r1csEntries: readonly ProverSparseSubcircuitR1cs[],
  subcircuitInfos: readonly ProverSubcircuitInfo[],
  setup: ProverSetupParams,
): (ProverSparseSubcircuitR1cs | undefined)[] {
  const indexed: (ProverSparseSubcircuitR1cs | undefined)[] = Array.from({
    length: subcircuitInfos.length,
  });

  for (const entry of r1csEntries) {
    validateSparseR1cs(entry, subcircuitInfos, setup);
    if (indexed[entry.subcircuitId] !== undefined) {
      throw new Error(`Duplicate sparse R1CS for subcircuit ${entry.subcircuitId}.`);
    }

    indexed[entry.subcircuitId] = entry;
  }

  return indexed;
}

function validateSetupParams(setup: ProverSetupParams): void {
  const numericFields: readonly (keyof ProverSetupParams)[] = [
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
  placementVariables: readonly ProverPlacementVariables[],
  subcircuitInfos: readonly ProverSubcircuitInfo[],
  setup: ProverSetupParams,
): void {
  if (placementVariables.length > setup.s_max) {
    throw new Error("placementVariables length exceeds s_max.");
  }

  for (let index = 0; index < placementVariables.length; index += 1) {
    const placement = placementVariables[index];
    if (
      !Number.isSafeInteger(placement.subcircuitId) ||
      placement.subcircuitId < 0 ||
      placement.subcircuitId >= subcircuitInfos.length
    ) {
      throw new Error(`Invalid subcircuit id in placement ${index}.`);
    }

    const info = subcircuitInfos[placement.subcircuitId];
    if (placement.variables.length !== info.flattenMap.length) {
      throw new Error(`Placement ${index} variable count does not match subcircuit ${info.id}.`);
    }
  }
}

function validateSparseR1cs(
  r1cs: ProverSparseSubcircuitR1cs,
  subcircuitInfos: readonly ProverSubcircuitInfo[],
  setup: ProverSetupParams,
): void {
  if (!Number.isSafeInteger(r1cs.subcircuitId) || r1cs.subcircuitId < 0 || r1cs.subcircuitId >= subcircuitInfos.length) {
    throw new Error(`Invalid sparse R1CS subcircuit id ${r1cs.subcircuitId}.`);
  }

  validateSparseMatrix(r1cs.A, setup.n, `subcircuit ${r1cs.subcircuitId} A`);
  validateSparseMatrix(r1cs.B, setup.n, `subcircuit ${r1cs.subcircuitId} B`);
  validateSparseMatrix(r1cs.C, setup.n, `subcircuit ${r1cs.subcircuitId} C`);
}

function validateSparseMatrix(matrix: ProverSparseMatrix, rowCount: number, label: string): void {
  if (matrix.sparseRows.length > rowCount) {
    throw new Error(`${label} sparse row count exceeds n.`);
  }

  for (let rowIndex = 0; rowIndex < matrix.sparseRows.length; rowIndex += 1) {
    for (const entry of matrix.sparseRows[rowIndex]) {
      if (!Number.isSafeInteger(entry.column) || entry.column < 0 || entry.column >= matrix.activeWires.length) {
        throw new Error(`${label} sparse row ${rowIndex} has an invalid column index.`);
      }
    }
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
