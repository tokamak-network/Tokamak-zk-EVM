import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BivariatePolynomialBuffer,
  buildWitnessPolynomials,
  createCurveRuntime,
  type FieldElement,
  type FieldRuntime,
} from "../../../src/index.js";
import type {
  ProverPlacementVariables,
  ProverSetupParams,
  ProverSubcircuitInfo,
  WitnessPolynomials,
} from "../../../src/prover/protocol/witness.js";
import { loadPreparedProverInput } from "../support/prepared-prover-context.js";
import {
  type LegacyProverWitnessInput,
  type ProverSparseMatrix,
  type ProverSparseSubcircuitR1cs,
  withLegacySparseR1cs,
} from "./legacy-sparse-r1cs.js";

type Candidate = "current-object-transpose" | "flat-direct-output" | "packed-flat-combined";

interface PackedMatrix {
  readonly activeWires: readonly number[];
  readonly rowOffsets: Uint8Array;
  readonly columns: Uint8Array;
  readonly coefficients: Uint8Array;
  readonly rowCount: number;
}

interface PackedSubcircuit {
  readonly subcircuitId: number;
  readonly A: PackedMatrix;
  readonly B: PackedMatrix;
  readonly C: PackedMatrix;
}

interface PhaseTotals {
  allocationMs: number;
  fillMs: number;
  transposeMs: number;
  materializationMs: number;
}

interface RunResult {
  readonly candidate: Candidate;
  readonly witness?: WitnessPolynomials;
  readonly totalMs: number;
  readonly phases: PhaseTotals;
  readonly javascriptArrayEntries: number;
  readonly copiedBytes: number;
  readonly peakHeapDeltaBytes: number;
  readonly peakRssDeltaBytes: number;
}

interface Summary {
  readonly candidate: Candidate;
  readonly medianMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly medianPhases: PhaseTotals;
  readonly javascriptArrayEntries: number;
  readonly copiedBytes: number;
  readonly peakHeapDeltaBytes: number;
  readonly peakRssDeltaBytes: number;
}

class MemoryTracker {
  private readonly baseline = process.memoryUsage();
  private peakHeapUsed = this.baseline.heapUsed;
  private peakRss = this.baseline.rss;

  sample(): void {
    const usage = process.memoryUsage();
    this.peakHeapUsed = Math.max(this.peakHeapUsed, usage.heapUsed);
    this.peakRss = Math.max(this.peakRss, usage.rss);
  }

  result(): { readonly peakHeapDeltaBytes: number; readonly peakRssDeltaBytes: number } {
    return {
      peakHeapDeltaBytes: this.peakHeapUsed - this.baseline.heapUsed,
      peakRssDeltaBytes: this.peakRss - this.baseline.rss,
    };
  }
}

async function main(): Promise<void> {
  const runtime = await createCurveRuntime();
  try {
    const input = await loadPreparedProverInput(runtime, {
      onProgress: (message) => console.log(message),
    });
    const legacyInput = withLegacySparseR1cs(input.witness);
    await assertSmallFixtureParity(runtime.Fr);
    const packedStarted = performance.now();
    const packed = packAll(runtime.Fr, legacyInput.r1csBySubcircuit, legacyInput.setup.n);
    const oneTimePackMs = performance.now() - packedStarted;

    console.log("Checking prepared-fixture parity");
    let currentOracle: RunResult | undefined = await runCandidate(
      runtime.Fr,
      legacyInput,
      "current-object-transpose",
      undefined,
      true,
    );
    let flatOracle: RunResult | undefined = await runCandidate(
      runtime.Fr,
      legacyInput,
      "flat-direct-output",
      undefined,
      true,
    );
    let combinedOracle: RunResult | undefined = await runCandidate(
      runtime.Fr,
      legacyInput,
      "packed-flat-combined",
      packed,
      true,
    );
    const productionWitness = await buildWitnessPolynomials(runtime.Fr, input.witness);
    assertWitnessEqual(requireWitness(currentOracle), requireWitness(flatOracle), "flat candidate");
    assertWitnessEqual(requireWitness(currentOracle), requireWitness(combinedOracle), "combined candidate");
    assertWitnessEqual(requireWitness(currentOracle), productionWitness, "production packed/direct-flat witness");
    currentOracle = undefined;
    flatOracle = undefined;
    combinedOracle = undefined;
    collectGarbage();

    const candidates: readonly Candidate[] = [
      "current-object-transpose",
      "flat-direct-output",
      "packed-flat-combined",
    ];
    console.log("Warming candidates");
    for (const candidate of candidates) {
      await runCandidate(runtime.Fr, legacyInput, candidate, packed, false);
      collectGarbage();
    }

    const samples = new Map<Candidate, RunResult[]>(candidates.map((candidate) => [candidate, []]));
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const order = iteration % 2 === 0 ? candidates : [...candidates].reverse();
      for (const candidate of order) {
        console.log(`Measuring ${candidate}, iteration ${iteration + 1}`);
        const run = await runCandidate(runtime.Fr, legacyInput, candidate, packed, false);
        samples.get(candidate)?.push(run);
        collectGarbage();
      }
    }
    const summaries = candidates.map((candidate) => summarize(candidate, samples.get(candidate) ?? []));
    console.table(summaries.map((summary) => ({
      candidate: summary.candidate,
      "median ms": summary.medianMs.toFixed(3),
      "allocate ms": summary.medianPhases.allocationMs.toFixed(3),
      "fill ms": summary.medianPhases.fillMs.toFixed(3),
      "transpose ms": summary.medianPhases.transposeMs.toFixed(3),
      "materialize ms": summary.medianPhases.materializationMs.toFixed(3),
      "JS array entries": summary.javascriptArrayEntries,
      "copied MiB": (summary.copiedBytes / 2 ** 20).toFixed(3),
      "peak heap MiB": (summary.peakHeapDeltaBytes / 2 ** 20).toFixed(3),
      "peak RSS MiB": (summary.peakRssDeltaBytes / 2 ** 20).toFixed(3),
    })));

    const report = {
      generatedAt: new Date().toISOString(),
      fixture: "fixtures/small/runtime",
      iterations: 3,
      warmup: 1,
      parity: {
        deterministicSmall: "pass",
        preparedFixture: "pass",
        productionPackedDirectFlat: "pass",
        fields: ["bXY", "uXY", "vXY", "wXY"],
      },
      oneTimePackedCsrMs: oneTimePackMs,
      oneTimePackedCsrBytes: packedBytes(packed),
      summaries,
    };
    const outputPath = path.resolve("tmp/timing/flat-witness.json");
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);
  } finally {
    await runtime.terminate();
  }
}

async function runCandidate(
  field: FieldRuntime,
  input: LegacyProverWitnessInput,
  candidate: Candidate,
  packedEntries: readonly PackedSubcircuit[] | undefined,
  retainWitness: boolean,
): Promise<RunResult> {
  collectGarbage();
  const tracker = new MemoryTracker();
  const phases: PhaseTotals = {
    allocationMs: 0,
    fillMs: 0,
    transposeMs: 0,
    materializationMs: 0,
  };
  const started = performance.now();
  const bXY = candidate === "current-object-transpose"
    ? await buildBCurrent(field, input, phases, tracker)
    : await buildBFlat(field, input, phases, tracker);
  const packed = candidate === "packed-flat-combined"
    ? requirePacked(packedEntries)
    : undefined;
  const uvw = candidate === "current-object-transpose"
    ? await buildUvwCurrent(field, input, phases, tracker)
    : await buildUvwFlat(field, input, phases, tracker, packed);
  const witness: WitnessPolynomials = {
    bXY,
    ...uvw,
    rXY: BivariatePolynomialBuffer.zero(field),
  };
  tracker.sample();
  const elementCount = input.setup.n * input.setup.s_max;
  const bElementCount = (input.setup.l_D - input.setup.l) * input.setup.s_max;
  const javascriptArrayEntries = candidate === "current-object-transpose"
    ? bElementCount + 6 * elementCount
    : 0;
  const copiedBytes = candidate === "current-object-transpose"
    ? (bElementCount + 6 * elementCount) * field.byteLength
    : 3 * input.placementVariables.length * input.setup.n * field.byteLength;
  return {
    candidate,
    witness: retainWitness ? witness : undefined,
    totalMs: performance.now() - started,
    phases,
    javascriptArrayEntries,
    copiedBytes,
    ...tracker.result(),
  };
}

async function buildBCurrent(
  field: FieldRuntime,
  input: LegacyProverWitnessInput,
  phases: PhaseTotals,
  tracker: MemoryTracker,
): Promise<BivariatePolynomialBuffer> {
  const { setup, placementVariables, subcircuitInfos } = input;
  const mI = setup.l_D - setup.l;
  const allocationStarted = performance.now();
  const evals = Array.from({ length: mI * setup.s_max }, () => field.zero);
  phases.allocationMs += performance.now() - allocationStarted;
  tracker.sample();
  const fillStarted = performance.now();
  fillBValues(field, evals, undefined, placementVariables, subcircuitInfos, setup);
  phases.fillMs += performance.now() - fillStarted;
  tracker.sample();
  const materializationStarted = performance.now();
  const result = await BivariatePolynomialBuffer.fromRouEvals(
    field,
    field.concat(evals),
    mI,
    setup.s_max,
  );
  phases.materializationMs += performance.now() - materializationStarted;
  tracker.sample();
  return result;
}

async function buildBFlat(
  field: FieldRuntime,
  input: LegacyProverWitnessInput,
  phases: PhaseTotals,
  tracker: MemoryTracker,
): Promise<BivariatePolynomialBuffer> {
  const { setup, placementVariables, subcircuitInfos } = input;
  const mI = setup.l_D - setup.l;
  const allocationStarted = performance.now();
  const evals = field.createZeroBuffer(mI * setup.s_max);
  phases.allocationMs += performance.now() - allocationStarted;
  tracker.sample();
  const fillStarted = performance.now();
  fillBValues(field, undefined, evals, placementVariables, subcircuitInfos, setup);
  phases.fillMs += performance.now() - fillStarted;
  tracker.sample();
  const materializationStarted = performance.now();
  const result = await BivariatePolynomialBuffer.fromRouEvals(field, evals, mI, setup.s_max);
  phases.materializationMs += performance.now() - materializationStarted;
  tracker.sample();
  return result;
}

function fillBValues(
  field: FieldRuntime,
  objectOutput: FieldElement[] | undefined,
  flatOutput: Uint8Array | undefined,
  placements: readonly ProverPlacementVariables[],
  infos: readonly ProverSubcircuitInfo[],
  setup: ProverSetupParams,
): void {
  for (let placementIndex = 0; placementIndex < placements.length; placementIndex += 1) {
    const placement = placements[placementIndex];
    const info = requireEntry(infos, placement.subcircuitId);
    for (let localIndex = 0; localIndex < placement.variables.length; localIndex += 1) {
      const globalIndex = info.flattenMap[localIndex];
      const value = placement.variables[localIndex];
      if (globalIndex < setup.l || globalIndex >= setup.l_D || field.isZero(value)) {
        continue;
      }
      const index = (globalIndex - setup.l) * setup.s_max + placementIndex;
      if (objectOutput !== undefined) {
        objectOutput[index] = value.slice();
      } else {
        requireFlat(flatOutput).set(value, index * field.byteLength);
      }
    }
  }
}

async function buildUvwCurrent(
  field: FieldRuntime,
  input: LegacyProverWitnessInput,
  phases: PhaseTotals,
  tracker: MemoryTracker,
): Promise<Pick<WitnessPolynomials, "uXY" | "vXY" | "wXY">> {
  const { setup, placementVariables } = input;
  const indexed = indexR1cs(input.r1csBySubcircuit);
  const elementCount = setup.s_max * setup.n;
  const allocationStarted = performance.now();
  const byPlacement = [
    Array.from({ length: elementCount }, () => field.zero),
    Array.from({ length: elementCount }, () => field.zero),
    Array.from({ length: elementCount }, () => field.zero),
  ];
  phases.allocationMs += performance.now() - allocationStarted;
  tracker.sample();
  const fillStarted = performance.now();
  for (let placementIndex = 0; placementIndex < placementVariables.length; placementIndex += 1) {
    const placement = placementVariables[placementIndex];
    const r1cs = requireEntry(indexed, placement.subcircuitId);
    for (const [matrixIndex, matrix] of [r1cs.A, r1cs.B, r1cs.C].entries()) {
      const rows = await evaluatePackedRows(field, placement, packMatrix(field, matrix, setup.n));
      for (let row = 0; row < setup.n; row += 1) {
        byPlacement[matrixIndex][placementIndex * setup.n + row] = field.readBufferElement(rows, row);
      }
    }
  }
  phases.fillMs += performance.now() - fillStarted;
  tracker.sample();
  const transposeStarted = performance.now();
  const rowMajor = byPlacement.map((values) =>
    transposePlacementMajorToRowMajor(values, setup.s_max, setup.n));
  phases.transposeMs += performance.now() - transposeStarted;
  tracker.sample();
  const materializationStarted = performance.now();
  const polynomials: BivariatePolynomialBuffer[] = [];
  for (const values of rowMajor) {
    polynomials.push(await BivariatePolynomialBuffer.fromRouEvals(
      field,
      field.concat(values),
      setup.n,
      setup.s_max,
    ));
  }
  phases.materializationMs += performance.now() - materializationStarted;
  tracker.sample();
  return { uXY: polynomials[0], vXY: polynomials[1], wXY: polynomials[2] };
}

async function buildUvwFlat(
  field: FieldRuntime,
  input: LegacyProverWitnessInput,
  phases: PhaseTotals,
  tracker: MemoryTracker,
  packedEntries: readonly PackedSubcircuit[] | undefined,
): Promise<Pick<WitnessPolynomials, "uXY" | "vXY" | "wXY">> {
  const { setup, placementVariables } = input;
  const indexedObjects = indexR1cs(input.r1csBySubcircuit);
  const indexedPacked = packedEntries === undefined ? undefined : indexPacked(packedEntries);
  const allocationStarted = performance.now();
  const rowMajor = [
    field.createZeroBuffer(setup.s_max * setup.n),
    field.createZeroBuffer(setup.s_max * setup.n),
    field.createZeroBuffer(setup.s_max * setup.n),
  ];
  phases.allocationMs += performance.now() - allocationStarted;
  tracker.sample();
  const fillStarted = performance.now();
  for (let placementIndex = 0; placementIndex < placementVariables.length; placementIndex += 1) {
    const placement = placementVariables[placementIndex];
    const matrices = indexedPacked === undefined
      ? requireEntry(indexedObjects, placement.subcircuitId)
      : requireEntry(indexedPacked, placement.subcircuitId);
    for (const [matrixIndex, matrix] of [matrices.A, matrices.B, matrices.C].entries()) {
      const packed = isPackedMatrix(matrix) ? matrix : packMatrix(field, matrix, setup.n);
      const rows = await evaluatePackedRows(field, placement, packed);
      writePlacementColumn(rowMajor[matrixIndex], rows, placementIndex, setup, field.byteLength);
    }
  }
  phases.fillMs += performance.now() - fillStarted;
  tracker.sample();
  const materializationStarted = performance.now();
  const polynomials: BivariatePolynomialBuffer[] = [];
  for (const values of rowMajor) {
    polynomials.push(
      await BivariatePolynomialBuffer.fromRouEvals(field, values, setup.n, setup.s_max),
    );
  }
  phases.materializationMs += performance.now() - materializationStarted;
  tracker.sample();
  return { uXY: polynomials[0], vXY: polynomials[1], wXY: polynomials[2] };
}

async function evaluatePackedRows(
  field: FieldRuntime,
  placement: ProverPlacementVariables,
  matrix: PackedMatrix,
): Promise<Uint8Array> {
  const active = new Uint8Array(matrix.activeWires.length * field.byteLength);
  for (let index = 0; index < matrix.activeWires.length; index += 1) {
    const wire = matrix.activeWires[index];
    const value = placement.variables[wire];
    if (value === undefined) {
      throw new Error(`Active wire ${wire} is outside placement ${placement.subcircuitId}.`);
    }
    active.set(value, index * field.byteLength);
  }
  return field.sparseRowDotBuffer(
    matrix.rowOffsets,
    matrix.columns,
    matrix.coefficients,
    active,
    matrix.rowCount,
  );
}

function packAll(
  field: FieldRuntime,
  entries: readonly ProverSparseSubcircuitR1cs[],
  rowCount: number,
): PackedSubcircuit[] {
  return entries.map((entry) => ({
    subcircuitId: entry.subcircuitId,
    A: packMatrix(field, entry.A, rowCount),
    B: packMatrix(field, entry.B, rowCount),
    C: packMatrix(field, entry.C, rowCount),
  }));
}

function packMatrix(field: FieldRuntime, matrix: ProverSparseMatrix, rowCount: number): PackedMatrix {
  const rowOffsets = new Uint32Array(rowCount + 1);
  let entryCount = 0;
  for (let row = 0; row < matrix.sparseRows.length; row += 1) {
    entryCount += matrix.sparseRows[row].length;
    rowOffsets[row + 1] = entryCount;
  }
  for (let row = matrix.sparseRows.length; row < rowCount; row += 1) {
    rowOffsets[row + 1] = entryCount;
  }
  const columns = new Uint32Array(entryCount);
  const coefficients = new Uint8Array(entryCount * field.byteLength);
  let entryIndex = 0;
  for (const row of matrix.sparseRows) {
    for (const entry of row) {
      columns[entryIndex] = entry.column;
      coefficients.set(entry.coefficient, entryIndex * field.byteLength);
      entryIndex += 1;
    }
  }
  return {
    activeWires: matrix.activeWires,
    rowOffsets: uint32Bytes(rowOffsets),
    columns: uint32Bytes(columns),
    coefficients,
    rowCount,
  };
}

function writePlacementColumn(
  output: Uint8Array,
  rows: Uint8Array,
  placementIndex: number,
  setup: ProverSetupParams,
  fieldByteLength: number,
): void {
  for (let row = 0; row < setup.n; row += 1) {
    const sourceOffset = row * fieldByteLength;
    const targetOffset = (row * setup.s_max + placementIndex) * fieldByteLength;
    output.set(rows.subarray(sourceOffset, sourceOffset + fieldByteLength), targetOffset);
  }
}

function transposePlacementMajorToRowMajor(
  values: readonly FieldElement[],
  placementCount: number,
  rowCount: number,
): FieldElement[] {
  const output: FieldElement[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    for (let placement = 0; placement < placementCount; placement += 1) {
      output.push(values[placement * rowCount + row]);
    }
  }
  return output;
}

function indexR1cs(
  entries: readonly ProverSparseSubcircuitR1cs[],
): readonly (ProverSparseSubcircuitR1cs | undefined)[] {
  const output: (ProverSparseSubcircuitR1cs | undefined)[] = [];
  for (const entry of entries) {
    output[entry.subcircuitId] = entry;
  }
  return output;
}

function indexPacked(
  entries: readonly PackedSubcircuit[],
): readonly (PackedSubcircuit | undefined)[] {
  const output: (PackedSubcircuit | undefined)[] = [];
  for (const entry of entries) {
    output[entry.subcircuitId] = entry;
  }
  return output;
}

function isPackedMatrix(matrix: ProverSparseMatrix | PackedMatrix): matrix is PackedMatrix {
  return "rowOffsets" in matrix && matrix.rowOffsets instanceof Uint8Array;
}

function packedBytes(entries: readonly PackedSubcircuit[]): number {
  let total = 0;
  for (const entry of entries) {
    for (const matrix of [entry.A, entry.B, entry.C]) {
      total += matrix.rowOffsets.byteLength + matrix.columns.byteLength + matrix.coefficients.byteLength;
    }
  }
  return total;
}

function uint32Bytes(values: Uint32Array): Uint8Array {
  return new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
}

async function assertSmallFixtureParity(field: FieldRuntime): Promise<void> {
  const input = createSmallInput(field);
  const packed = packAll(field, input.r1csBySubcircuit, input.setup.n);
  const current = await runCandidate(field, input, "current-object-transpose", undefined, true);
  const flat = await runCandidate(field, input, "flat-direct-output", undefined, true);
  const combined = await runCandidate(field, input, "packed-flat-combined", packed, true);
  assertWitnessEqual(requireWitness(current), requireWitness(flat), "small flat candidate");
  assertWitnessEqual(requireWitness(current), requireWitness(combined), "small combined candidate");
}

function createSmallInput(field: FieldRuntime): LegacyProverWitnessInput {
  const setup: ProverSetupParams = {
    l_free: 1,
    l: 1,
    l_user_out: 0,
    l_user: 0,
    l_D: 5,
    m_D: 5,
    n: 4,
    s_D: 2,
    s_max: 4,
  };
  const info: ProverSubcircuitInfo = {
    id: 0,
    name: "small",
    Nwires: 5,
    Nconsts: 0,
    Out_idx: [0, 1],
    In_idx: [1, 1],
    flattenMap: [0, 1, 2, 3, 4],
  };
  const variables = (offset: number): FieldElement[] =>
    Array.from({ length: 5 }, (_unused, index) => field.fromBigInt(BigInt(offset + index)));
  const matrix = (coefficient: number): ProverSparseMatrix => ({
    activeWires: [0, 1, 2, 3, 4],
    sparseRows: [
      [{ column: 0, coefficient: field.fromBigInt(BigInt(coefficient)) }],
      [{ column: 1, coefficient: field.fromBigInt(BigInt(coefficient + 1)) }],
      [],
      [{ column: 4, coefficient: field.fromBigInt(BigInt(coefficient + 2)) }],
    ],
  });
  return {
    setup,
    subcircuitInfos: [info],
    placementVariables: [
      { subcircuitId: 0, variables: variables(1) },
      { subcircuitId: 0, variables: variables(11) },
    ],
    r1csBySubcircuit: [{
      subcircuitId: 0,
      A: matrix(2),
      B: matrix(5),
      C: matrix(8),
    }],
  };
}

function assertWitnessEqual(left: WitnessPolynomials, right: WitnessPolynomials, label: string): void {
  for (const key of ["bXY", "uXY", "vXY", "wXY"] as const) {
    assertBytesEqual(left[key].coefficients, right[key].coefficients, `${label} ${key}`);
  }
}

function assertBytesEqual(left: Uint8Array, right: Uint8Array, label: string): void {
  if (left.byteLength !== right.byteLength) {
    throw new Error(`${label}: byte length mismatch.`);
  }
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      throw new Error(`${label}: mismatch at byte ${index}.`);
    }
  }
}

function summarize(candidate: Candidate, runs: readonly RunResult[]): Summary {
  if (runs.length === 0) {
    throw new Error(`Missing ${candidate} samples.`);
  }
  const sorted = [...runs].sort((left, right) => left.totalMs - right.totalMs);
  const median = sorted[Math.floor(sorted.length / 2)];
  return {
    candidate,
    medianMs: median.totalMs,
    minMs: sorted[0].totalMs,
    maxMs: sorted[sorted.length - 1].totalMs,
    medianPhases: median.phases,
    javascriptArrayEntries: median.javascriptArrayEntries,
    copiedBytes: median.copiedBytes,
    peakHeapDeltaBytes: median.peakHeapDeltaBytes,
    peakRssDeltaBytes: median.peakRssDeltaBytes,
  };
}

function requireEntry<T>(entries: readonly (T | undefined)[], index: number): T {
  const entry = entries[index];
  if (entry === undefined) {
    throw new Error(`Missing indexed entry ${index}.`);
  }
  return entry;
}

function requireWitness(result: RunResult): WitnessPolynomials {
  if (result.witness === undefined) {
    throw new Error(`${result.candidate}: witness was not retained.`);
  }
  return result.witness;
}

function requirePacked(
  entries: readonly PackedSubcircuit[] | undefined,
): readonly PackedSubcircuit[] {
  if (entries === undefined) {
    throw new Error("Packed CSR entries are required for the combined candidate.");
  }
  return entries;
}

function requireFlat(value: Uint8Array | undefined): Uint8Array {
  if (value === undefined) {
    throw new Error("Flat output is required.");
  }
  return value;
}

function collectGarbage(): void {
  globalThis.gc?.();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
