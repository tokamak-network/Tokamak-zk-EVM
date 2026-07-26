import path from "node:path";

import {
  BivariatePolynomialBuffer,
  buildWitnessPolynomials,
  createCurveRuntime,
  genBXY,
  type FieldRuntime,
  type ProverRuntimeInput,
} from "../../../src/index.js";
import type {
  WitnessPolynomials,
} from "../../../src/prover/internal/witness.js";
import {
  unpackPackedSparseR1cs,
  type ProverSparseMatrix,
  type ProverSparseSubcircuitR1cs,
} from "./legacy-sparse-r1cs.js";
import { loadPreparedProverInput } from "../support/prepared-prover-context.js";

interface CandidateResult {
  readonly name: string;
  readonly accumulationMs: number;
  readonly witnessMs: number;
  readonly parity: readonly string[];
}

async function main(): Promise<void> {
  const runtimeDir = parseRuntimeDir(process.argv.slice(2));
  const runtime = await createCurveRuntime();

  try {
    const input = await loadPreparedProverInput(runtime, { runtimeDir });
    const productionStart = performance.now();
    const production = await buildWitnessPolynomials(runtime.Fr, input.witness);
    const productionMs = performance.now() - productionStart;
    const oracle = await runScalarOracle(runtime.Fr, input, production);

    console.log("Sparse witness accumulation benchmark completed.");
    console.log(`production witness: ${formatDuration(productionMs)}`);
    console.log(
      `${oracle.name}: accumulation ${formatDuration(oracle.accumulationMs)}, `
        + `complete witness ${formatDuration(oracle.witnessMs)}`,
    );
    for (const check of oracle.parity) {
      console.log(`  ${check}`);
    }
  } finally {
    await runtime.terminate();
  }
}

async function runScalarOracle(
  field: FieldRuntime,
  input: ProverRuntimeInput,
  production: WitnessPolynomials,
): Promise<CandidateResult> {
  let accumulationMs = 0;
  const witnessStart = performance.now();
  const bXY = await genBXY(
    field,
    input.witness.placementVariables,
    input.witness.subcircuitInfos,
    input.witness.setup,
  );
  const r1csBySubcircuit = indexR1cs(
    unpackPackedSparseR1cs(input.witness.r1csBySubcircuit),
    input.witness.subcircuitInfos.length,
  );
  const setup = input.witness.setup;
  const uEvals = field.createZeroBuffer(setup.n * setup.s_max);
  const vEvals = field.createZeroBuffer(setup.n * setup.s_max);
  const wEvals = field.createZeroBuffer(setup.n * setup.s_max);

  for (let placementIndex = 0; placementIndex < input.witness.placementVariables.length; placementIndex += 1) {
    const placement = input.witness.placementVariables[placementIndex];
    const r1cs = r1csBySubcircuit[placement.subcircuitId];
    if (r1cs === undefined) {
      throw new Error(`Missing sparse R1CS for subcircuit ${placement.subcircuitId}.`);
    }

    const start = performance.now();
    const uRows = evaluateSparseRowsScalar(field, placement, r1cs.A, setup.n);
    const vRows = evaluateSparseRowsScalar(field, placement, r1cs.B, setup.n);
    const wRows = evaluateSparseRowsScalar(field, placement, r1cs.C, setup.n);
    accumulationMs += performance.now() - start;
    writePlacementColumn(field, uRows, uEvals, placementIndex, setup.n, setup.s_max);
    writePlacementColumn(field, vRows, vEvals, placementIndex, setup.n, setup.s_max);
    writePlacementColumn(field, wRows, wEvals, placementIndex, setup.n, setup.s_max);
  }

  const [uXY, vXY, wXY] = await Promise.all([
    BivariatePolynomialBuffer.fromRouEvals(field, uEvals, setup.n, setup.s_max),
    BivariatePolynomialBuffer.fromRouEvals(field, vEvals, setup.n, setup.s_max),
    BivariatePolynomialBuffer.fromRouEvals(field, wEvals, setup.n, setup.s_max),
  ]);
  const candidate: WitnessPolynomials = {
    bXY,
    uXY,
    vXY,
    wXY,
    rXY: BivariatePolynomialBuffer.zero(field),
  };

  return {
    name: "independent-scalar-oracle",
    accumulationMs,
    witnessMs: performance.now() - witnessStart,
    parity: assertWitnessParity(production, candidate),
  };
}

function evaluateSparseRowsScalar(
  field: FieldRuntime,
  placement: ProverRuntimeInput["witness"]["placementVariables"][number],
  matrix: ProverSparseMatrix,
  rowCount: number,
): Uint8Array {
  const variables = matrix.activeWires.map((localIndex) => {
    if (!Number.isSafeInteger(localIndex) || localIndex < 0 || localIndex >= placement.variables.length) {
      throw new Error(`Sparse R1CS active wire ${localIndex} is outside the placement variable range.`);
    }
    return placement.variables[localIndex];
  });
  const output = field.createZeroBuffer(rowCount);
  for (let row = 0; row < matrix.sparseRows.length; row += 1) {
    if (row >= rowCount) {
      throw new Error(`Sparse R1CS row ${row} exceeds the expected row count ${rowCount}.`);
    }
    let accumulator = field.zero;
    for (const entry of matrix.sparseRows[row]) {
      if (!Number.isSafeInteger(entry.column) || entry.column < 0 || entry.column >= variables.length) {
        throw new Error(`Sparse R1CS column ${entry.column} is outside the active wire range.`);
      }
      accumulator = field.add(accumulator, field.mul(entry.coefficient, variables[entry.column]));
    }
    field.writeBufferElement(output, row, accumulator);
  }
  return output;
}

function writePlacementColumn(
  field: FieldRuntime,
  rows: Uint8Array,
  output: Uint8Array,
  placementIndex: number,
  rowCount: number,
  placementCount: number,
): void {
  for (let row = 0; row < rowCount; row += 1) {
    field.writeBufferElement(
      output,
      row * placementCount + placementIndex,
      field.readBufferElement(rows, row),
    );
  }
}

function indexR1cs(
  entries: readonly ProverSparseSubcircuitR1cs[],
  subcircuitCount: number,
): readonly (ProverSparseSubcircuitR1cs | undefined)[] {
  const indexed: (ProverSparseSubcircuitR1cs | undefined)[] = Array.from({ length: subcircuitCount });
  for (const entry of entries) {
    if (indexed[entry.subcircuitId] !== undefined) {
      throw new Error(`Duplicate sparse R1CS for subcircuit ${entry.subcircuitId}.`);
    }
    indexed[entry.subcircuitId] = entry;
  }
  return indexed;
}

function assertWitnessParity(expected: WitnessPolynomials, actual: WitnessPolynomials): string[] {
  return [
    assertPolynomial("b", expected.bXY, actual.bXY),
    assertPolynomial("u", expected.uXY, actual.uXY),
    assertPolynomial("v", expected.vXY, actual.vXY),
    assertPolynomial("w", expected.wXY, actual.wXY),
    assertPolynomial("r", expected.rXY, actual.rXY),
  ];
}

function assertPolynomial(
  label: string,
  expected: BivariatePolynomialBuffer,
  actual: BivariatePolynomialBuffer,
): string {
  if (
    expected.xSize !== actual.xSize
    || expected.ySize !== actual.ySize
    || !bytesEqual(expected.coefficients, actual.coefficients)
  ) {
    throw new Error(`${label} witness polynomial mismatch.`);
  }
  return `${label}: exact`;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function parseRuntimeDir(args: readonly string[]): string {
  let runtimeDir = path.resolve("fixtures/small/runtime");
  for (const arg of args) {
    if (!arg.startsWith("--runtime-dir=")) {
      throw new Error(`Unknown sparse witness benchmark option: ${arg}`);
    }
    runtimeDir = path.resolve(arg.slice("--runtime-dir=".length));
  }
  return runtimeDir;
}

function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(3)} ms`;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
