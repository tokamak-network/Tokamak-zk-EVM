import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  BivariatePolynomialBuffer,
  buildWitnessPolynomials,
  createCurveRuntime,
  genBXY,
  loadProverInputFromRuntimeBundles,
  parseRuntimeArtifactBundleManifest,
  type CurveRuntime,
  type FieldRuntime,
  type ProverRuntimeInput,
  type RuntimeArtifactBundleManifest,
} from "../../../src/index.js";
import type {
  WitnessPolynomials,
} from "../../../src/prover/internal/witness.js";
import {
  createSparseBenchmarkRuntimes,
  evaluateSparseRowsCallerWasm,
  evaluateSparseRowsOneWorker,
  evaluateSparseRowsWorkers,
  type SparseBenchmarkRuntimes,
} from "./sparse-wasm-benchmark-support.js";
import {
  unpackPackedSparseR1cs,
  type ProverSparseMatrix,
  type ProverSparseSubcircuitR1cs,
} from "./legacy-sparse-r1cs.js";

type SparseEvaluator = (
  runtimes: SparseBenchmarkRuntimes,
  placement: ProverRuntimeInput["witness"]["placementVariables"][number],
  matrix: ProverSparseMatrix,
  rowCount: number,
) => Promise<Uint8Array>;

interface CandidateResult {
  readonly name: string;
  readonly accumulationMs: number;
  readonly witnessMs: number;
  readonly parity: readonly string[];
}

async function main(): Promise<void> {
  const runtimeDir = parseRuntimeDir(process.argv.slice(2));
  const benchmarkRuntimes = await createSparseBenchmarkRuntimes();
  const productionRuntime = await createCurveRuntime();

  try {
    const input = await loadPreparedProverInput(productionRuntime, runtimeDir);
    const productionStart = performance.now();
    const production = await buildWitnessPolynomials(productionRuntime.Fr, input.witness);
    const productionMs = performance.now() - productionStart;
    const candidates = [
      await runCandidate("current-js", benchmarkRuntimes, input, production, evaluateSparseRowsJs),
      await runCandidate("caller-wasm", benchmarkRuntimes, input, production, evaluateSparseRowsCallerWasm),
      await runCandidate("one-worker", benchmarkRuntimes, input, production, evaluateSparseRowsOneWorker),
      await runCandidate("row-sharded-workers", benchmarkRuntimes, input, production, evaluateSparseRowsWorkers),
    ];

    console.log("Sparse witness accumulation benchmark completed.");
    console.log(`worker count: ${benchmarkRuntimes.workerCount}`);
    console.log(`production witness: ${formatDuration(productionMs)}`);
    for (const candidate of candidates) {
      console.log(
        `${candidate.name}: accumulation ${formatDuration(candidate.accumulationMs)}, `
          + `complete witness ${formatDuration(candidate.witnessMs)}`,
      );
      for (const check of candidate.parity) {
        console.log(`  ${check}`);
      }
    }
  } finally {
    await Promise.all([productionRuntime.terminate(), benchmarkRuntimes.terminate()]);
  }
}

async function runCandidate(
  name: string,
  runtimes: SparseBenchmarkRuntimes,
  input: ProverRuntimeInput,
  production: WitnessPolynomials,
  evaluator: SparseEvaluator,
): Promise<CandidateResult> {
  let accumulationMs = 0;
  const witnessStart = performance.now();
  const bXY = await genBXY(
    runtimes.field,
    input.witness.placementVariables,
    input.witness.subcircuitInfos,
    input.witness.setup,
  );
  const r1csBySubcircuit = indexR1cs(
    unpackPackedSparseR1cs(input.witness.r1csBySubcircuit),
    input.witness.subcircuitInfos.length,
  );
  const setup = input.witness.setup;
  const uEvals = runtimes.field.createZeroBuffer(setup.n * setup.s_max);
  const vEvals = runtimes.field.createZeroBuffer(setup.n * setup.s_max);
  const wEvals = runtimes.field.createZeroBuffer(setup.n * setup.s_max);

  for (let placementIndex = 0; placementIndex < input.witness.placementVariables.length; placementIndex += 1) {
    const placement = input.witness.placementVariables[placementIndex];
    const r1cs = r1csBySubcircuit[placement.subcircuitId];
    if (r1cs === undefined) {
      throw new Error(`Missing sparse R1CS for subcircuit ${placement.subcircuitId}.`);
    }

    const start = performance.now();
    const uRows = await evaluator(runtimes, placement, r1cs.A, setup.n);
    const vRows = await evaluator(runtimes, placement, r1cs.B, setup.n);
    const wRows = await evaluator(runtimes, placement, r1cs.C, setup.n);
    accumulationMs += performance.now() - start;
    writePlacementColumn(runtimes, uRows, uEvals, placementIndex, setup.n, setup.s_max);
    writePlacementColumn(runtimes, vRows, vEvals, placementIndex, setup.n, setup.s_max);
    writePlacementColumn(runtimes, wRows, wEvals, placementIndex, setup.n, setup.s_max);
  }

  const [uXY, vXY, wXY] = await Promise.all([
    BivariatePolynomialBuffer.fromRouEvals(runtimes.field, uEvals, setup.n, setup.s_max),
    BivariatePolynomialBuffer.fromRouEvals(runtimes.field, vEvals, setup.n, setup.s_max),
    BivariatePolynomialBuffer.fromRouEvals(runtimes.field, wEvals, setup.n, setup.s_max),
  ]);
  const candidate: WitnessPolynomials = {
    bXY,
    uXY,
    vXY,
    wXY,
    rXY: BivariatePolynomialBuffer.zero(runtimes.field),
  };

  return {
    name,
    accumulationMs,
    witnessMs: performance.now() - witnessStart,
    parity: assertWitnessParity(production, candidate),
  };
}

async function evaluateSparseRowsJs(
  runtimes: SparseBenchmarkRuntimes,
  placement: ProverRuntimeInput["witness"]["placementVariables"][number],
  matrix: ProverSparseMatrix,
  rowCount: number,
): Promise<Uint8Array> {
  return evaluateSparseRowsJsWithField(runtimes.field, placement, matrix, rowCount);
}

function evaluateSparseRowsJsWithField(
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
  runtimes: SparseBenchmarkRuntimes,
  rows: Uint8Array,
  output: Uint8Array,
  placementIndex: number,
  rowCount: number,
  placementCount: number,
): void {
  for (let row = 0; row < rowCount; row += 1) {
    runtimes.field.writeBufferElement(
      output,
      row * placementCount + placementIndex,
      runtimes.field.readBufferElement(rows, row),
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

async function loadPreparedProverInput(
  runtime: CurveRuntime,
  runtimeDir: string,
): Promise<ProverRuntimeInput> {
  const proofWitness = await readManifest(runtimeDir, "prover-proof-witness-input/manifest.json");
  const crsPrepared = await readManifest(runtimeDir, "prover-crs-prepared-data/manifest.json");
  return loadProverInputFromRuntimeBundles(
    runtime,
    proofWitness,
    crsPrepared,
    (artifactPath) => readRuntimeFile(runtimeDir, artifactPath),
  );
}

async function readManifest(
  runtimeDir: string,
  artifactPath: string,
): Promise<RuntimeArtifactBundleManifest> {
  const bytes = await readRuntimeFile(runtimeDir, artifactPath);
  return parseRuntimeArtifactBundleManifest(JSON.parse(new TextDecoder().decode(bytes)));
}

async function readRuntimeFile(runtimeDir: string, artifactPath: string): Promise<Uint8Array> {
  if (path.isAbsolute(artifactPath) || artifactPath.includes("\\") || artifactPath.split("/").includes("..")) {
    throw new Error(`Runtime fixture path must be a safe relative POSIX path: ${artifactPath}`);
  }
  const filePath = path.resolve(runtimeDir, artifactPath);
  const relative = path.relative(runtimeDir, filePath);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Runtime fixture path escapes the fixture directory: ${artifactPath}`);
  }
  return readFile(filePath);
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
