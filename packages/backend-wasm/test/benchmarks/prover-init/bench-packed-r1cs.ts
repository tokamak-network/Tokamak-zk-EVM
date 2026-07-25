import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BivariatePolynomialBuffer,
  createCurveRuntime,
  loadRuntimeArtifactFile,
  parseProverPlacementVariables,
  type FieldRuntime,
} from "../../../src/index.js";
import {
  GENERATED_PROVER_PACKED_R1CS,
  GENERATED_PROVER_SETUP_PARAMS,
} from "../../../src/prover/generated/subcircuit-library.generated.js";
import type {
  ProverPlacementVariables,
} from "../../../src/prover/internal/witness.js";
import {
  unpackPackedSparseR1cs,
  type ProverSparseMatrix,
  type ProverSparseSubcircuitR1cs,
} from "./legacy-sparse-r1cs.js";

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

interface CandidateRun {
  readonly name: string;
  readonly outputs: readonly [Uint8Array, Uint8Array, Uint8Array];
  readonly packMs: number;
  readonly activeVariableMs: number;
  readonly sparseDotMs: number;
  readonly totalMs: number;
  readonly packedBytesConstructed: number;
}

async function main(): Promise<void> {
  const runtime = await createCurveRuntime();
  try {
    const placementArtifact = await loadRuntimeArtifactFile(
      await readFile("fixtures/small/runtime/prover-proof-witness-input/placement.bin"),
    );
    const placements = parseProverPlacementVariables(runtime, placementArtifact);
    const sparse = unpackPackedSparseR1cs(GENERATED_PROVER_PACKED_R1CS);
    const packed = GENERATED_PROVER_PACKED_R1CS;
    const oneTimePackMs = 0;
    const oracleCurrent = await runCurrent(runtime.Fr, placements, sparse);
    const oracleCandidate = await runCached(runtime.Fr, placements, packed, oneTimePackMs);
    assertOutputsEqual(oracleCurrent.outputs, oracleCandidate.outputs);
    await assertPolynomialParity(runtime.Fr, oracleCurrent.outputs, oracleCandidate.outputs);
    const currentRuns: CandidateRun[] = [];
    const candidateRuns: CandidateRun[] = [];
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const current = await runCurrent(runtime.Fr, placements, sparse);
      const candidate = await runCached(runtime.Fr, placements, packed, oneTimePackMs);
      assertOutputsEqual(current.outputs, candidate.outputs);
      currentRuns.push(current);
      candidateRuns.push(candidate);
    }
    const summaries = [
      summarize("current-repack-per-placement", currentRuns),
      summarize("cached-packed-csr", candidateRuns),
    ];

    const report = {
      generatedAt: new Date().toISOString(),
      fixture: "fixtures/small/runtime/prover-proof-witness-input/placement.bin",
      placementCount: placements.length,
      matrixCount: packed.length * 3,
      rowObjectCount: countRows(sparse),
      entryObjectCount: countEntries(sparse),
      oneTimeCachedPackMs: oneTimePackMs,
      oneTimeCachedPackedBytes: packedBytes(packed),
      parity: "pass",
      summaries,
    };
    console.table(report.summaries.map((result) => ({
      candidate: result.name,
      "median ms": result.medianMs.toFixed(3),
      "min ms": result.minMs.toFixed(3),
      "max ms": result.maxMs.toFixed(3),
      "pack ms": result.medianPhases.packMs.toFixed(3),
      "active vars ms": result.medianPhases.activeVariableMs.toFixed(3),
      "sparse dot ms": result.medianPhases.sparseDotMs.toFixed(3),
      "packed MiB": (result.packedBytesConstructed / 2 ** 20).toFixed(3),
    })));
    console.log(
      `one-time cached CSR construction: ${oneTimePackMs.toFixed(3)} ms, `
        + `${(packedBytes(packed) / 2 ** 20).toFixed(3)} MiB`,
    );

    const outputPath = path.resolve("tmp/timing/packed-r1cs.json");
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);
  } finally {
    await runtime.terminate();
  }
}

async function runCurrent(
  field: FieldRuntime,
  placements: readonly ProverPlacementVariables[],
  entries: readonly ProverSparseSubcircuitR1cs[],
): Promise<CandidateRun> {
  const indexed = indexR1cs(entries);
  const outputs = createOutputs(field);
  let packMs = 0;
  let activeVariableMs = 0;
  let sparseDotMs = 0;
  let packedBytesConstructed = 0;
  const started = performance.now();
  for (let placementIndex = 0; placementIndex < placements.length; placementIndex += 1) {
    const placement = placements[placementIndex];
    const r1cs = requireEntry(indexed, placement.subcircuitId);
    for (const [matrixIndex, matrix] of [r1cs.A, r1cs.B, r1cs.C].entries()) {
      const packStarted = performance.now();
      const packed = packMatrix(field, matrix, GENERATED_PROVER_SETUP_PARAMS.n);
      packMs += performance.now() - packStarted;
      packedBytesConstructed += packedMatrixBytes(packed);
      const activeStarted = performance.now();
      const activeVariables = gatherActiveVariables(field, placement, packed.activeWires);
      activeVariableMs += performance.now() - activeStarted;
      const dotStarted = performance.now();
      const rows = await field.sparseRowDotBuffer(
        packed.rowOffsets,
        packed.columns,
        packed.coefficients,
        activeVariables,
        packed.rowCount,
      );
      sparseDotMs += performance.now() - dotStarted;
      writePlacementColumn(outputs[matrixIndex], rows, placementIndex, field);
    }
  }
  return {
    name: "current-repack-per-placement",
    outputs,
    packMs,
    activeVariableMs,
    sparseDotMs,
    totalMs: performance.now() - started,
    packedBytesConstructed,
  };
}

async function runCached(
  field: FieldRuntime,
  placements: readonly ProverPlacementVariables[],
  entries: readonly PackedSubcircuit[],
  oneTimePackMs: number,
): Promise<CandidateRun> {
  const indexed = indexPacked(entries);
  const outputs = createOutputs(field);
  let activeVariableMs = 0;
  let sparseDotMs = 0;
  const started = performance.now();
  for (let placementIndex = 0; placementIndex < placements.length; placementIndex += 1) {
    const placement = placements[placementIndex];
    const r1cs = requireEntry(indexed, placement.subcircuitId);
    for (const [matrixIndex, matrix] of [r1cs.A, r1cs.B, r1cs.C].entries()) {
      const activeStarted = performance.now();
      const activeVariables = gatherActiveVariables(field, placement, matrix.activeWires);
      activeVariableMs += performance.now() - activeStarted;
      const dotStarted = performance.now();
      const rows = await field.sparseRowDotBuffer(
        matrix.rowOffsets,
        matrix.columns,
        matrix.coefficients,
        activeVariables,
        matrix.rowCount,
      );
      sparseDotMs += performance.now() - dotStarted;
      writePlacementColumn(outputs[matrixIndex], rows, placementIndex, field);
    }
  }
  return {
    name: "cached-packed-csr",
    outputs,
    packMs: oneTimePackMs,
    activeVariableMs,
    sparseDotMs,
    totalMs: performance.now() - started,
    packedBytesConstructed: packedBytes(entries),
  };
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

function gatherActiveVariables(
  field: FieldRuntime,
  placement: ProverPlacementVariables,
  activeWires: readonly number[],
): Uint8Array {
  const output = new Uint8Array(activeWires.length * field.byteLength);
  for (let index = 0; index < activeWires.length; index += 1) {
    const wire = activeWires[index];
    if (wire < 0 || wire >= placement.variables.length) {
      throw new Error(`Active wire ${wire} is outside placement ${placement.subcircuitId}.`);
    }
    output.set(placement.variables[wire], index * field.byteLength);
  }
  return output;
}

function createOutputs(field: FieldRuntime): [Uint8Array, Uint8Array, Uint8Array] {
  const elementCount = GENERATED_PROVER_SETUP_PARAMS.n * GENERATED_PROVER_SETUP_PARAMS.s_max;
  return [
    field.createZeroBuffer(elementCount),
    field.createZeroBuffer(elementCount),
    field.createZeroBuffer(elementCount),
  ];
}

function writePlacementColumn(
  output: Uint8Array,
  rows: Uint8Array,
  placementIndex: number,
  field: FieldRuntime,
): void {
  const rowCount = GENERATED_PROVER_SETUP_PARAMS.n;
  const placementCount = GENERATED_PROVER_SETUP_PARAMS.s_max;
  for (let row = 0; row < rowCount; row += 1) {
    const sourceOffset = row * field.byteLength;
    const targetOffset = (row * placementCount + placementIndex) * field.byteLength;
    output.set(rows.subarray(sourceOffset, sourceOffset + field.byteLength), targetOffset);
  }
}

async function assertPolynomialParity(
  field: FieldRuntime,
  current: readonly Uint8Array[],
  candidate: readonly Uint8Array[],
): Promise<void> {
  for (let index = 0; index < current.length; index += 1) {
    const currentPolynomial = await BivariatePolynomialBuffer.fromRouEvals(
      field,
      current[index],
      GENERATED_PROVER_SETUP_PARAMS.n,
      GENERATED_PROVER_SETUP_PARAMS.s_max,
    );
    const candidatePolynomial = await BivariatePolynomialBuffer.fromRouEvals(
      field,
      candidate[index],
      GENERATED_PROVER_SETUP_PARAMS.n,
      GENERATED_PROVER_SETUP_PARAMS.s_max,
    );
    assertBytesEqual(currentPolynomial.coefficients, candidatePolynomial.coefficients, `polynomial ${index}`);
  }
}

function assertOutputsEqual(current: readonly Uint8Array[], candidate: readonly Uint8Array[]): void {
  for (let index = 0; index < current.length; index += 1) {
    assertBytesEqual(current[index], candidate[index], `row evaluations ${index}`);
  }
}

function assertBytesEqual(left: Uint8Array, right: Uint8Array, label: string): void {
  if (left.byteLength !== right.byteLength) {
    throw new Error(`${label} length mismatch.`);
  }
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      throw new Error(`${label} mismatch at byte ${index}.`);
    }
  }
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

function requireEntry<T>(entries: readonly (T | undefined)[], index: number): T {
  const entry = entries[index];
  if (entry === undefined) {
    throw new Error(`Missing R1CS entry ${index}.`);
  }
  return entry;
}

function uint32Bytes(values: Uint32Array): Uint8Array {
  return new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
}

function packedMatrixBytes(matrix: PackedMatrix): number {
  return matrix.rowOffsets.byteLength + matrix.columns.byteLength + matrix.coefficients.byteLength;
}

function packedBytes(entries: readonly PackedSubcircuit[]): number {
  return entries.reduce(
    (total, entry) =>
      total + packedMatrixBytes(entry.A) + packedMatrixBytes(entry.B) + packedMatrixBytes(entry.C),
    0,
  );
}

function countRows(entries: readonly ProverSparseSubcircuitR1cs[]): number {
  return entries.reduce(
    (total, entry) =>
      total + entry.A.sparseRows.length + entry.B.sparseRows.length + entry.C.sparseRows.length,
    0,
  );
}

function countEntries(entries: readonly ProverSparseSubcircuitR1cs[]): number {
  return entries.reduce(
    (total, entry) =>
      total
      + entry.A.sparseRows.reduce((sum, row) => sum + row.length, 0)
      + entry.B.sparseRows.reduce((sum, row) => sum + row.length, 0)
      + entry.C.sparseRows.reduce((sum, row) => sum + row.length, 0),
    0,
  );
}

function withoutOutputs(result: CandidateRun) {
  return {
    name: result.name,
    packMs: result.packMs,
    activeVariableMs: result.activeVariableMs,
    sparseDotMs: result.sparseDotMs,
    totalMs: result.totalMs,
    packedBytesConstructed: result.packedBytesConstructed,
  };
}

function summarize(name: string, runs: readonly CandidateRun[]) {
  const sorted = [...runs].sort((left, right) => left.totalMs - right.totalMs);
  const median = sorted[Math.floor(sorted.length / 2)];
  return {
    name,
    iterations: runs.length,
    medianMs: median.totalMs,
    minMs: sorted[0].totalMs,
    maxMs: sorted[sorted.length - 1].totalMs,
    medianPhases: withoutOutputs(median),
    packedBytesConstructed: median.packedBytesConstructed,
  };
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
