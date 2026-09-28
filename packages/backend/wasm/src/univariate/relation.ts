import type { SetupParams } from "../artifacts/setup/setup-params.js";
import {
  isInternalPadding,
  isWiringPadding,
  wireRange,
} from "../prover/protocol/subcircuit-library-validation.js";
import { PublicWireLayout } from "../prover/protocol/public-wire-layout.js";
import type { ProverSubcircuitInfo } from "../prover/protocol/witness.js";
import type { FieldElement, FieldRuntime } from "../runtime/field/field-types.js";
import { arithmeticIndex, connectionIndex, type UnivariateDomainShape } from "./domain.js";

/** Packed sparse R1CS rows used by the U6/U8 relation builder. */
export interface UnivariateSparseMatrix {
  readonly activeWires: readonly number[];
  readonly rowOffsets: Uint8Array;
  readonly columns: Uint8Array;
  readonly coefficients: Uint8Array;
  readonly rowCount: number;
}

/** Fixed library data required for one selected subcircuit. */
export interface UnivariateSubcircuit {
  readonly id: number;
  readonly info: ProverSubcircuitInfo;
  readonly A: UnivariateSparseMatrix;
  readonly B: UnivariateSparseMatrix;
  readonly C: UnivariateSparseMatrix;
}

/** The local assignment attached to one active placement slot. */
export interface UnivariateSlotWitness {
  readonly subcircuitId: number;
  readonly values: Uint8Array;
}

/** The sparse `permutation.json` coordinate convention. */
export interface UnivariatePermutationEntry {
  readonly row: number;
  readonly col: number;
  readonly X: number;
  readonly Y: number;
}

/** A polynomial together with the domain values from which it was interpolated. */
export interface DenseDomainPolynomial {
  readonly evaluations: Uint8Array;
  readonly coefficients: Uint8Array;
}

/** U8's four assignment maps. */
export interface WitnessMaps {
  readonly uA: DenseDomainPolynomial;
  readonly vA: DenseDomainPolynomial;
  readonly wA: DenseDomainPolynomial;
  readonly bC: DenseDomainPolynomial;
}

export type R1csMatrixName = "A" | "B" | "C";

/** Builds one U6 arithmetic lift for a tagged local wire. */
export async function buildArithmeticWireLift(
  field: FieldRuntime,
  domain: UnivariateDomainShape,
  setup: SetupParams,
  placementIndex: number,
  subcircuit: UnivariateSubcircuit,
  localWireIndex: number,
  matrixName: R1csMatrixName,
): Promise<DenseDomainPolynomial> {
  if (!Number.isSafeInteger(placementIndex) || placementIndex < 0 || placementIndex >= setup.s) {
    throw new Error(`Placement index ${placementIndex} is outside the placement capacity.`);
  }
  if (!Number.isSafeInteger(localWireIndex) || localWireIndex < 0 || localWireIndex >= setup.m) {
    throw new Error(`Subcircuit ${subcircuit.id} local wire ${localWireIndex} is outside its wire range.`);
  }
  const matrix = subcircuit[matrixName];
  if (matrix.rowCount > setup.n) {
    throw new Error(`Subcircuit ${subcircuit.id} ${matrixName} rows exceed n.`);
  }
  const activeValues = field.createZeroBuffer(matrix.activeWires.length);
  for (let index = 0; index < matrix.activeWires.length; index += 1) {
    if (matrix.activeWires[index] === localWireIndex) {
      field.writeBufferElement(activeValues, index, field.one);
    }
  }
  const rows = await field.sparseRowDotBuffer(
    matrix.rowOffsets,
    matrix.columns,
    matrix.coefficients,
    activeValues,
    matrix.rowCount,
  );
  const evaluations = field.createZeroBuffer(domain.arithmeticSize);
  for (let row = 0; row < matrix.rowCount; row += 1) {
    field.writeBufferElement(
      evaluations,
      arithmeticIndex(domain, setup, placementIndex, subcircuit.id, row),
      field.readBufferElement(rows, row),
    );
  }
  return { evaluations, coefficients: await field.ifftBuffer(evaluations) };
}

/** Builds one U7 connection lift, including the required zero polynomial. */
export async function buildConnectionWireLift(
  field: FieldRuntime,
  domain: UnivariateDomainShape,
  setup: SetupParams,
  placementIndex: number,
  subcircuit: UnivariateSubcircuit,
  localWireIndex: number,
): Promise<DenseDomainPolynomial> {
  if (!Number.isSafeInteger(placementIndex) || placementIndex < 0 || placementIndex >= setup.s) {
    throw new Error(`Placement index ${placementIndex} is outside the placement capacity.`);
  }
  if (!Number.isSafeInteger(localWireIndex) || localWireIndex < 0 || localWireIndex >= setup.m) {
    throw new Error(`Subcircuit ${subcircuit.id} local wire ${localWireIndex} is outside its wire range.`);
  }
  const evaluations = field.createZeroBuffer(domain.connectionSize);
  if (localWireIndex < setup.m_b && !isWiringPadding(subcircuit.info, setup, localWireIndex)) {
    field.writeBufferElement(
      evaluations,
      connectionIndex(setup, placementIndex, localWireIndex),
      field.one,
    );
  }
  return { evaluations, coefficients: await field.ifftBuffer(evaluations) };
}

/**
 * Builds U8 directly in the U1 and U4 flat evaluation domains. The caller
 * supplies one selector-capacity-length witness array, so inactive slots do
 * not inherit the compact witness-list position used by the legacy protocol.
 */
export async function buildWitnessMaps(
  field: FieldRuntime,
  domain: UnivariateDomainShape,
  setup: SetupParams,
  selector: readonly (number | null)[],
  witnessesBySlot: readonly (UnivariateSlotWitness | null)[],
  subcircuits: readonly UnivariateSubcircuit[],
): Promise<WitnessMaps> {
  assertRelationInputs(domain, setup, selector, witnessesBySlot, subcircuits);
  const uEvaluations = field.createZeroBuffer(domain.arithmeticSize);
  const vEvaluations = field.createZeroBuffer(domain.arithmeticSize);
  const wEvaluations = field.createZeroBuffer(domain.arithmeticSize);
  const bEvaluations = field.createZeroBuffer(domain.connectionSize);

  for (let placementIndex = 0; placementIndex < setup.s; placementIndex += 1) {
    const subcircuitId = selector[placementIndex];
    const witness = witnessesBySlot[placementIndex];
    if (subcircuitId === null && witness === null) {
      continue;
    }
    if (subcircuitId === null || witness === null || witness.subcircuitId !== subcircuitId) {
      throw new Error(`Selector slot ${placementIndex} and witness slot disagree.`);
    }
    if (subcircuitId < 0 || subcircuitId >= subcircuits.length) {
      throw new Error(`Selector subcircuit id ${subcircuitId} is outside the library range.`);
    }
    const subcircuit = subcircuits[subcircuitId];
    if (subcircuit === undefined || subcircuit.id !== subcircuitId) {
      throw new Error(`Missing subcircuit metadata for selected id ${subcircuitId}.`);
    }
    const variableCount = field.bufferElementCount(witness.values);
    if (variableCount !== setup.m) {
      throw new Error(`Subcircuit ${subcircuitId} witness width does not match m.`);
    }
    validateNormalizedWitness(field, setup, subcircuit.info, witness.values);

    await writeArithmeticMatrix(
      field,
      uEvaluations,
      domain,
      setup,
      placementIndex,
      subcircuitId,
      subcircuit.A,
      witness.values,
      "A",
    );
    await writeArithmeticMatrix(
      field,
      vEvaluations,
      domain,
      setup,
      placementIndex,
      subcircuitId,
      subcircuit.B,
      witness.values,
      "B",
    );
    await writeArithmeticMatrix(
      field,
      wEvaluations,
      domain,
      setup,
      placementIndex,
      subcircuitId,
      subcircuit.C,
      witness.values,
      "C",
    );
    writeConnectionAssignment(
      field,
      bEvaluations,
      setup,
      placementIndex,
      subcircuit,
      witness.values,
    );
  }

  const [uCoefficients, vCoefficients, wCoefficients, bCoefficients] = await Promise.all([
    field.ifftBuffer(uEvaluations),
    field.ifftBuffer(vEvaluations),
    field.ifftBuffer(wEvaluations),
    field.ifftBuffer(bEvaluations),
  ]);
  return {
    uA: { evaluations: uEvaluations, coefficients: uCoefficients },
    vA: { evaluations: vEvaluations, coefficients: vCoefficients },
    wA: { evaluations: wEvaluations, coefficients: wCoefficients },
    bC: { evaluations: bEvaluations, coefficients: bCoefficients },
  };
}

/**
 * Builds U12. Omitted sparse entries preserve the identity mapping, which is
 * the physical `permutation.json` convention.
 */
export async function buildConnectionPermutationPolynomial(
  field: FieldRuntime,
  domain: UnivariateDomainShape,
  setup: SetupParams,
  selector: readonly (number | null)[],
  permutation: readonly UnivariatePermutationEntry[],
  subcircuitInfos: readonly ProverSubcircuitInfo[],
): Promise<DenseDomainPolynomial> {
  if (selector.length !== setup.s) {
    throw new Error(`Selector capacity is ${selector.length}, expected ${setup.s}.`);
  }
  for (const [placementIndex, subcircuitId] of selector.entries()) {
    if (subcircuitId !== null && (subcircuitId < 0 || subcircuitId >= subcircuitInfos.length)) {
      throw new Error(`Selector placement ${placementIndex} subcircuit index is outside its admitted range.`);
    }
  }
  validateApplicationTopology(setup, selector, permutation, subcircuitInfos);
  const targets = new Uint32Array(domain.connectionSize);
  const explicitlyMapped = new Uint8Array(domain.connectionSize);
  for (let source = 0; source < domain.connectionSize; source += 1) {
    targets[source] = source;
  }

  for (const entry of permutation) {
    assertPermutationCoordinate(entry.row, entry.col, setup.m_b, setup.s);
    assertPermutationCoordinate(entry.X, entry.Y, setup.m_b, setup.s);
    if (selector[entry.col] === null) {
      throw new Error(`Permutation explicitly maps inactive placement slot ${entry.col}.`);
    }
    if (selector[entry.Y] === null) {
      throw new Error(`Permutation explicitly maps inactive placement slot ${entry.Y}.`);
    }
    if (isWiringPadding(subcircuitInfos[selector[entry.col]!]!, setup, entry.row)
      || isWiringPadding(subcircuitInfos[selector[entry.Y]!]!, setup, entry.X)) {
      throw new Error("Permutation explicitly maps producer-declared wiring padding.");
    }
    const source = connectionIndex(setup, entry.col, entry.row);
    const target = connectionIndex(setup, entry.Y, entry.X);
    if (explicitlyMapped[source] !== 0) {
      throw new Error(`Permutation has duplicate source coordinate ${source}.`);
    }
    explicitlyMapped[source] = 1;
    targets[source] = target;
  }

  const seenTargets = new Uint8Array(domain.connectionSize);
  for (const target of targets) {
    if (seenTargets[target] !== 0) {
      throw new Error(`Permutation maps more than one source to coordinate ${target}.`);
    }
    seenTargets[target] = 1;
  }

  const identities = field.createZeroBuffer(domain.connectionSize);
  identities.set(field.one);
  for (let filled = field.byteLength; filled < identities.byteLength; filled *= 2)
    identities.set(identities.subarray(0, Math.min(filled, identities.byteLength - filled)), filled);
  const powers = await field.batchApplyKeyBuffer(identities, field.one, domain.connectionRoot);
  const evaluations = field.createZeroBuffer(domain.connectionSize);
  for (let source = 0; source < domain.connectionSize; source += 1) {
    const offset = targets[source] * field.byteLength;
    evaluations.set(powers.subarray(offset, offset + field.byteLength), source * field.byteLength);
  }
  return { evaluations, coefficients: await field.ifftBuffer(evaluations) };
}

/** Builds U13 in coefficient form. */
export async function buildConnectionCopyFactors(
  field: FieldRuntime,
  bC: DenseDomainPolynomial,
  sC: DenseDomainPolynomial,
  beta: FieldElement,
  gammaC: FieldElement,
): Promise<readonly [Uint8Array, Uint8Array]> {
  if (bC.coefficients.byteLength !== sC.coefficients.byteLength || field.bufferElementCount(bC.coefficients) < 2) {
    throw new Error("Connection factors require matching coefficient buffers of length at least two.");
  }
  const fC = await field.batchAddScaledBuffer(bC.coefficients, sC.coefficients, beta);
  const gC = field.cloneBuffer(bC.coefficients);
  field.writeBufferElement(fC, 0, field.add(field.readBufferElement(fC, 0), gammaC));
  field.writeBufferElement(gC, 0, field.add(field.readBufferElement(gC, 0), gammaC));
  field.writeBufferElement(gC, 1, field.add(field.readBufferElement(gC, 1), beta));
  return [fC, gC];
}

async function writeArithmeticMatrix(
  field: FieldRuntime,
  evaluations: Uint8Array,
  domain: UnivariateDomainShape,
  setup: SetupParams,
  placementIndex: number,
  subcircuitId: number,
  matrix: UnivariateSparseMatrix,
  values: Uint8Array,
  matrixName: string,
): Promise<void> {
  if (matrix.rowCount > setup.n) {
    throw new Error(`Subcircuit ${subcircuitId} ${matrixName} rows exceed n.`);
  }
  const activeValues = field.createZeroBuffer(matrix.activeWires.length);
  const valueCount = field.bufferElementCount(values);
  for (let index = 0; index < matrix.activeWires.length; index += 1) {
    const localWire = matrix.activeWires[index];
    if (!Number.isSafeInteger(localWire) || localWire < 0 || localWire >= valueCount) {
      throw new Error(`Subcircuit ${subcircuitId} ${matrixName} references local wire ${localWire} outside its witness.`);
    }
    field.writeBufferElement(activeValues, index, field.readBufferElement(values, localWire));
  }
  const rows = await field.sparseRowDotBuffer(
    matrix.rowOffsets,
    matrix.columns,
    matrix.coefficients,
    activeValues,
    matrix.rowCount,
  );
  for (let row = 0; row < matrix.rowCount; row += 1) {
    field.writeBufferElement(
      evaluations,
      arithmeticIndex(domain, setup, placementIndex, subcircuitId, row),
      field.readBufferElement(rows, row),
    );
  }
}

function writeConnectionAssignment(
  field: FieldRuntime,
  evaluations: Uint8Array,
  setup: SetupParams,
  placementIndex: number,
  subcircuit: UnivariateSubcircuit,
  values: Uint8Array,
): void {
  // The destination starts at zero, so producer-declared wiring padding stays
  // implicit and incurs no per-coordinate decode or assignment work.
  for (let localIndex = 0; localIndex < wireRange(subcircuit.info.Wiring_idx).end; localIndex += 1) {
    field.writeBufferElement(
      evaluations,
      connectionIndex(setup, placementIndex, localIndex),
      field.readBufferElement(values, localIndex),
    );
  }
}

function assertRelationInputs(
  domain: UnivariateDomainShape,
  setup: SetupParams,
  selector: readonly (number | null)[],
  witnessesBySlot: readonly (UnivariateSlotWitness | null)[],
  subcircuits: readonly UnivariateSubcircuit[],
): void {
  if (selector.length !== setup.s || witnessesBySlot.length !== setup.s) {
    throw new Error("Selector and slot-witness arrays must have exactly s entries.");
  }
  if (subcircuits.length >= setup.t) {
    throw new Error("Subcircuit catalog does not reserve the virtual empty ID.");
  }
  if (domain.arithmeticSize < 1 || domain.connectionSize < 1) {
    throw new Error("Univariate domains must be nonempty.");
  }
}

function validateNormalizedWitness(
  field: FieldRuntime,
  setup: SetupParams,
  info: ProverSubcircuitInfo,
  values: Uint8Array,
): void {
  if (!field.eq(field.readBufferElement(values, 0), field.one)) {
    throw new Error("Selected local wire zero must equal one.");
  }
  for (let localWire = 0; localWire < setup.m; localWire += 1) {
    if ((isWiringPadding(info, setup, localWire) || isInternalPadding(info, setup, localWire))
      && !field.isZero(field.readBufferElement(values, localWire))) {
      throw new Error("Producer-declared witness padding must equal zero.");
    }
  }
}

function validateApplicationTopology(
  setup: SetupParams,
  selector: readonly (number | null)[],
  permutation: readonly UnivariatePermutationEntry[],
  subcircuitInfos: readonly ProverSubcircuitInfo[],
): void {
  const layout = PublicWireLayout.derive(setup, subcircuitInfos);
  const publicCoordinates = new Set<string>();
  for (const segment of layout.segments()) {
    for (let index = segment.start; index < segment.end; index += 1) {
      const source = layout.sourceForPublicWire(index);
      if (source !== undefined) publicCoordinates.add(coordinate(source.localWireIndex, segment.placementPhase));
    }
  }
  const edges = new Map(permutation.map(entry => [coordinate(entry.row, entry.col), coordinate(entry.X, entry.Y)]));
  const sparsePublic = [...edges.keys()].filter(key => publicCoordinates.has(key));
  if (sparsePublic.length !== 1) {
    throw new Error("Exactly one public coordinate must represent CIRCOM_CONST_ONE.");
  }
  const representative = sparsePublic[0]!;
  const expected = new Set<string>([representative]);
  for (const [placement, selected] of selector.entries()) {
    if (selected !== null) expected.add(coordinate(0, placement));
  }
  const actual = new Set<string>();
  let current = representative;
  while (!actual.has(current)) {
    actual.add(current);
    const next = edges.get(current);
    if (next === undefined) throw new Error("The CIRCOM_CONST_ONE cycle is incomplete.");
    current = next;
  }
  if (current !== representative || actual.size !== expected.size
    || [...actual].some(key => !expected.has(key))) {
    throw new Error("The CIRCOM_CONST_ONE cycle must contain only its public representative and wire zero of every actual placement.");
  }
}

function coordinate(row: number, placement: number): string {
  return `${row}:${placement}`;
}

function assertPermutationCoordinate(row: number, col: number, wiringWidth: number, placements: number): void {
  if (!Number.isSafeInteger(row) || !Number.isSafeInteger(col) || row < 0 || row >= wiringWidth || col < 0 || col >= placements) {
    throw new Error(`Permutation coordinate (${row}, ${col}) is outside the connection domain.`);
  }
}
