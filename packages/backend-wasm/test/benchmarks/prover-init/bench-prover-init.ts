import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BivariatePolynomialBuffer,
  buildWitnessPolynomials,
  createCurveRuntime,
  createProverState,
  loadProverInputFromRuntimeBundles,
  parseRuntimeArtifactBundleManifest,
  type CurveRuntime,
  type FieldElement,
  type FieldRuntime,
  type ProverRuntimeInput,
  type RuntimeArtifactBundleManifest,
} from "../../../src/index.js";
import type {
  ProverPermutationEntry,
  ProverPlacementVariables,
  ProverSetupParams,
  ProverSparseMatrix,
  ProverSparseSubcircuitR1cs,
  ProverSubcircuitInfo,
  WitnessPolynomials,
} from "../../../src/prover/internal/witness.js";
import type {
  ProverInstancePolynomials,
  ProverMixer,
  ProverState,
} from "../../../src/prover/internal/state.js";

interface BenchmarkOptions {
  readonly runtimeDir: string;
  readonly jsonPath: string;
  readonly markdownPath: string;
}

interface TimingEvent {
  readonly name: string;
  readonly durationMs: number;
}

interface TimingTotal {
  readonly name: string;
  readonly durationMs: number;
  readonly count: number;
}

interface InitBenchmarkReport {
  readonly generatedAt: string;
  readonly runtimeDir: string;
  readonly productionInitMs: number;
  readonly profiledInitMs: number;
  readonly phaseTotals: readonly TimingTotal[];
  readonly parityChecks: readonly string[];
  readonly flatBufferCandidate: InitCandidateReport;
  readonly directSparseCandidate: InitCandidateReport;
  readonly rowMajorUvwCandidate: InitCandidateReport;
  readonly parallelRouCandidate: InitCandidateReport;
}

interface InitCandidateReport {
  readonly totalMs: number;
  readonly phaseTotals: readonly TimingTotal[];
  readonly parityChecks: readonly string[];
}

class TimingCollector {
  readonly events: TimingEvent[] = [];

  async span<T>(name: string, callback: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await callback();
    } finally {
      this.record(name, performance.now() - start);
    }
  }

  spanSync<T>(name: string, callback: () => T): T {
    const start = performance.now();
    try {
      return callback();
    } finally {
      this.record(name, performance.now() - start);
    }
  }

  private record(name: string, durationMs: number): void {
    this.events.push({ name, durationMs });
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const runtime = await createCurveRuntime();

  try {
    const proverInput = await loadPreparedProverInput(runtime, options.runtimeDir);
    const productionTiming = new TimingCollector();
    const production = await productionTiming.span("production.init", async () => {
      const witness = await buildWitnessPolynomials(runtime.Fr, proverInput.witness);
      const state = await createProverState({
        runtime,
        setup: proverInput.witness.setup,
        publicInstance: proverInput.publicInstance,
        permutation: proverInput.permutation,
        witness,
      });

      return { witness, state };
    });

    const profiledTiming = new TimingCollector();
    const profiled = await profiledTiming.span("profiled.init", async () => {
      const witness = await buildWitnessPolynomialsProfiled(runtime.Fr, proverInput, profiledTiming);
      const state = await createProverStateProfiled(runtime, proverInput, witness, profiledTiming);

      return { witness, state };
    });
    const flatTiming = new TimingCollector();
    const flat = await flatTiming.span("flat-buffer-candidate.init", async () => {
      const witness = await buildWitnessPolynomialsFlatProfiled(runtime.Fr, proverInput, flatTiming);
      const state = await createProverStateFlatProfiled(runtime, proverInput, witness, flatTiming);

      return { witness, state };
    });
    const directSparseTiming = new TimingCollector();
    const directSparse = await directSparseTiming.span("direct-sparse-candidate.init", async () => {
      const witness = await buildWitnessPolynomialsDirectSparseProfiled(runtime.Fr, proverInput, directSparseTiming);
      const state = await createProverStateFlatProfiled(runtime, proverInput, witness, directSparseTiming);

      return { witness, state };
    });
    const rowMajorUvwTiming = new TimingCollector();
    const rowMajorUvw = await rowMajorUvwTiming.span("row-major-uvw-candidate.init", async () => {
      const witness = await buildWitnessPolynomialsRowMajorUvwProfiled(runtime.Fr, proverInput, rowMajorUvwTiming);
      const state = await createProverStateFlatProfiled(runtime, proverInput, witness, rowMajorUvwTiming);

      return { witness, state };
    });
    const parallelRouTiming = new TimingCollector();
    const parallelRou = await parallelRouTiming.span("parallel-rou-candidate.init", async () => {
      const witness = await buildWitnessPolynomialsParallelRouProfiled(runtime.Fr, proverInput, parallelRouTiming);
      const state = await createProverStateParallelRouProfiled(runtime, proverInput, witness, parallelRouTiming);

      return { witness, state };
    });

    const parityChecks = [
      ...assertWitnessParity(production.witness, profiled.witness),
      ...assertInstanceParity(production.state.instance, profiled.state.instance),
      assertMixerShape(profiled.state.mixer),
    ];
    const report: InitBenchmarkReport = {
      generatedAt: new Date().toISOString(),
      runtimeDir: path.relative(process.cwd(), options.runtimeDir),
      productionInitMs: sumEvents(productionTiming.events, "production.init"),
      profiledInitMs: sumEvents(profiledTiming.events, "profiled.init"),
      phaseTotals: summarizeEvents(profiledTiming.events.filter((event) => event.name !== "profiled.init")),
      parityChecks,
      flatBufferCandidate: {
        totalMs: sumEvents(flatTiming.events, "flat-buffer-candidate.init"),
        phaseTotals: summarizeEvents(
          flatTiming.events.filter((event) => event.name !== "flat-buffer-candidate.init"),
        ),
        parityChecks: [
          ...assertWitnessParity(production.witness, flat.witness),
          ...assertInstanceParity(production.state.instance, flat.state.instance),
          assertMixerShape(flat.state.mixer),
        ],
      },
      directSparseCandidate: {
        totalMs: sumEvents(directSparseTiming.events, "direct-sparse-candidate.init"),
        phaseTotals: summarizeEvents(
          directSparseTiming.events.filter((event) => event.name !== "direct-sparse-candidate.init"),
        ),
        parityChecks: [
          ...assertWitnessParity(production.witness, directSparse.witness),
          ...assertInstanceParity(production.state.instance, directSparse.state.instance),
          assertMixerShape(directSparse.state.mixer),
        ],
      },
      rowMajorUvwCandidate: {
        totalMs: sumEvents(rowMajorUvwTiming.events, "row-major-uvw-candidate.init"),
        phaseTotals: summarizeEvents(
          rowMajorUvwTiming.events.filter((event) => event.name !== "row-major-uvw-candidate.init"),
        ),
        parityChecks: [
          ...assertWitnessParity(production.witness, rowMajorUvw.witness),
          ...assertInstanceParity(production.state.instance, rowMajorUvw.state.instance),
          assertMixerShape(rowMajorUvw.state.mixer),
        ],
      },
      parallelRouCandidate: {
        totalMs: sumEvents(parallelRouTiming.events, "parallel-rou-candidate.init"),
        phaseTotals: summarizeEvents(
          parallelRouTiming.events.filter((event) => event.name !== "parallel-rou-candidate.init"),
        ),
        parityChecks: [
          ...assertWitnessParity(production.witness, parallelRou.witness),
          ...assertInstanceParity(production.state.instance, parallelRou.state.instance),
          assertMixerShape(parallelRou.state.mixer),
        ],
      },
    };

    await writeReport(options, report);
    printReport(report);
  } finally {
    await runtime.terminate();
  }
}

async function buildWitnessPolynomialsFlatProfiled(
  field: FieldRuntime,
  input: ProverRuntimeInput,
  timing: TimingCollector,
): Promise<WitnessPolynomials> {
  const setup = input.witness.setup;
  await timing.span("validate.setup", async () => validateSetupParams(setup));
  await timing.span("validate.subcircuits", async () => validateSubcircuitInfos(input.witness.subcircuitInfos));
  await timing.span("validate.placements", async () =>
    validatePlacements(input.witness.placementVariables, input.witness.subcircuitInfos, setup),
  );
  const r1csBySubcircuit = await timing.span("r1cs.index", async () =>
    indexSparseR1cs(input.witness.r1csBySubcircuit, input.witness.subcircuitInfos, setup),
  );
  const bXY = await genBXYFlatProfiled(
    field,
    input.witness.placementVariables,
    input.witness.subcircuitInfos,
    setup,
    timing,
  );
  const { uXY, vXY, wXY } = await genUvwXYFlatProfiled(
    field,
    input.witness.placementVariables,
    r1csBySubcircuit,
    setup,
    timing,
  );

  return {
    bXY,
    uXY,
    vXY,
    wXY,
    rXY: BivariatePolynomialBuffer.zero(field),
  };
}

async function buildWitnessPolynomialsDirectSparseProfiled(
  field: FieldRuntime,
  input: ProverRuntimeInput,
  timing: TimingCollector,
): Promise<WitnessPolynomials> {
  const setup = input.witness.setup;
  await timing.span("validate.setup", async () => validateSetupParams(setup));
  await timing.span("validate.subcircuits", async () => validateSubcircuitInfos(input.witness.subcircuitInfos));
  await timing.span("validate.placements", async () =>
    validatePlacements(input.witness.placementVariables, input.witness.subcircuitInfos, setup),
  );
  const r1csBySubcircuit = await timing.span("r1cs.index", async () =>
    indexSparseR1cs(input.witness.r1csBySubcircuit, input.witness.subcircuitInfos, setup),
  );
  const bXY = await genBXYFlatProfiled(
    field,
    input.witness.placementVariables,
    input.witness.subcircuitInfos,
    setup,
    timing,
  );
  const { uXY, vXY, wXY } = await genUvwXYDirectSparseProfiled(
    field,
    input.witness.placementVariables,
    r1csBySubcircuit,
    setup,
    timing,
  );

  return {
    bXY,
    uXY,
    vXY,
    wXY,
    rXY: BivariatePolynomialBuffer.zero(field),
  };
}

async function buildWitnessPolynomialsRowMajorUvwProfiled(
  field: FieldRuntime,
  input: ProverRuntimeInput,
  timing: TimingCollector,
): Promise<WitnessPolynomials> {
  const setup = input.witness.setup;
  await timing.span("validate.setup", async () => validateSetupParams(setup));
  await timing.span("validate.subcircuits", async () => validateSubcircuitInfos(input.witness.subcircuitInfos));
  await timing.span("validate.placements", async () =>
    validatePlacements(input.witness.placementVariables, input.witness.subcircuitInfos, setup),
  );
  const r1csBySubcircuit = await timing.span("r1cs.index", async () =>
    indexSparseR1cs(input.witness.r1csBySubcircuit, input.witness.subcircuitInfos, setup),
  );
  const bXY = await genBXYFlatProfiled(
    field,
    input.witness.placementVariables,
    input.witness.subcircuitInfos,
    setup,
    timing,
  );
  const { uXY, vXY, wXY } = await genUvwXYRowMajorProfiled(
    field,
    input.witness.placementVariables,
    r1csBySubcircuit,
    setup,
    timing,
  );

  return {
    bXY,
    uXY,
    vXY,
    wXY,
    rXY: BivariatePolynomialBuffer.zero(field),
  };
}

async function buildWitnessPolynomialsParallelRouProfiled(
  field: FieldRuntime,
  input: ProverRuntimeInput,
  timing: TimingCollector,
): Promise<WitnessPolynomials> {
  const setup = input.witness.setup;
  await timing.span("validate.setup", async () => validateSetupParams(setup));
  await timing.span("validate.subcircuits", async () => validateSubcircuitInfos(input.witness.subcircuitInfos));
  await timing.span("validate.placements", async () =>
    validatePlacements(input.witness.placementVariables, input.witness.subcircuitInfos, setup),
  );
  const r1csBySubcircuit = await timing.span("r1cs.index", async () =>
    indexSparseR1cs(input.witness.r1csBySubcircuit, input.witness.subcircuitInfos, setup),
  );
  const bXYEvals = materializeBXYFlatEvals(
    field,
    input.witness.placementVariables,
    input.witness.subcircuitInfos,
    setup,
    timing,
  );
  const { uEvals, vEvals, wEvals } = materializeUvwRowMajorEvals(
    field,
    input.witness.placementVariables,
    r1csBySubcircuit,
    setup,
    timing,
  );
  const mI = setup.l_D - setup.l;
  const [bXY, uXY, vXY, wXY] = await timing.span("witness.from_rou_evals.parallel", async () =>
    Promise.all([
      BivariatePolynomialBuffer.fromRouEvals(field, bXYEvals, mI, setup.s_max),
      BivariatePolynomialBuffer.fromRouEvals(field, uEvals, setup.n, setup.s_max),
      BivariatePolynomialBuffer.fromRouEvals(field, vEvals, setup.n, setup.s_max),
      BivariatePolynomialBuffer.fromRouEvals(field, wEvals, setup.n, setup.s_max),
    ]),
  );

  return {
    bXY,
    uXY,
    vXY,
    wXY,
    rXY: BivariatePolynomialBuffer.zero(field),
  };
}

async function buildWitnessPolynomialsProfiled(
  field: FieldRuntime,
  input: ProverRuntimeInput,
  timing: TimingCollector,
): Promise<WitnessPolynomials> {
  const setup = input.witness.setup;
  await timing.span("validate.setup", async () => validateSetupParams(setup));
  await timing.span("validate.subcircuits", async () => validateSubcircuitInfos(input.witness.subcircuitInfos));
  await timing.span("validate.placements", async () =>
    validatePlacements(input.witness.placementVariables, input.witness.subcircuitInfos, setup),
  );
  const r1csBySubcircuit = await timing.span("r1cs.index", async () =>
    indexSparseR1cs(input.witness.r1csBySubcircuit, input.witness.subcircuitInfos, setup),
  );
  const bXY = await genBXYProfiled(field, input.witness.placementVariables, input.witness.subcircuitInfos, setup, timing);
  const { uXY, vXY, wXY } = await genUvwXYProfiled(field, input.witness.placementVariables, r1csBySubcircuit, setup, timing);

  return {
    bXY,
    uXY,
    vXY,
    wXY,
    rXY: BivariatePolynomialBuffer.zero(field),
  };
}

async function genBXYProfiled(
  field: FieldRuntime,
  placementVariables: readonly ProverPlacementVariables[],
  subcircuitInfos: readonly ProverSubcircuitInfo[],
  setup: ProverSetupParams,
  timing: TimingCollector,
): Promise<BivariatePolynomialBuffer> {
  const mI = setup.l_D - setup.l;
  const evals = timing.spanSync("bXY.allocate_evals", () =>
    Array.from({ length: mI * setup.s_max }, () => field.zero),
  );

  timing.spanSync("bXY.fill_evals", () => {
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
  });

  const evalBuffer = timing.spanSync("bXY.materialize_field_buffer", () => field.concat(evals));

  return timing.span("bXY.from_rou_evals", () =>
    BivariatePolynomialBuffer.fromRouEvals(field, evalBuffer, mI, setup.s_max),
  );
}

async function genBXYFlatProfiled(
  field: FieldRuntime,
  placementVariables: readonly ProverPlacementVariables[],
  subcircuitInfos: readonly ProverSubcircuitInfo[],
  setup: ProverSetupParams,
  timing: TimingCollector,
): Promise<BivariatePolynomialBuffer> {
  const mI = setup.l_D - setup.l;
  const evalBuffer = timing.spanSync("bXY.allocate_evals", () => field.createZeroBuffer(mI * setup.s_max));

  timing.spanSync("bXY.fill_evals", () => {
    for (let placementIndex = 0; placementIndex < placementVariables.length; placementIndex += 1) {
      const placement = placementVariables[placementIndex];
      const subcircuitInfo = subcircuitInfos[placement.subcircuitId];

      for (let localIndex = 0; localIndex < placement.variables.length; localIndex += 1) {
        const globalIndex = subcircuitInfo.flattenMap[localIndex];
        const value = placement.variables[localIndex];
        if (globalIndex >= setup.l && globalIndex < setup.l_D && !field.isZero(value)) {
          field.writeBufferElement(evalBuffer, (globalIndex - setup.l) * setup.s_max + placementIndex, value);
        }
      }
    }
  });

  return timing.span("bXY.from_rou_evals", () =>
    BivariatePolynomialBuffer.fromRouEvals(field, evalBuffer, mI, setup.s_max),
  );
}

function materializeBXYFlatEvals(
  field: FieldRuntime,
  placementVariables: readonly ProverPlacementVariables[],
  subcircuitInfos: readonly ProverSubcircuitInfo[],
  setup: ProverSetupParams,
  timing: TimingCollector,
): Uint8Array {
  const mI = setup.l_D - setup.l;
  const evalBuffer = timing.spanSync("bXY.allocate_evals", () => field.createZeroBuffer(mI * setup.s_max));

  timing.spanSync("bXY.fill_evals", () => {
    for (let placementIndex = 0; placementIndex < placementVariables.length; placementIndex += 1) {
      const placement = placementVariables[placementIndex];
      const subcircuitInfo = subcircuitInfos[placement.subcircuitId];

      for (let localIndex = 0; localIndex < placement.variables.length; localIndex += 1) {
        const globalIndex = subcircuitInfo.flattenMap[localIndex];
        const value = placement.variables[localIndex];
        if (globalIndex >= setup.l && globalIndex < setup.l_D && !field.isZero(value)) {
          field.writeBufferElement(evalBuffer, (globalIndex - setup.l) * setup.s_max + placementIndex, value);
        }
      }
    }
  });

  return evalBuffer;
}

async function genUvwXYProfiled(
  field: FieldRuntime,
  placementVariables: readonly ProverPlacementVariables[],
  r1csBySubcircuit: readonly (ProverSparseSubcircuitR1cs | undefined)[],
  setup: ProverSetupParams,
  timing: TimingCollector,
): Promise<{
  readonly uXY: BivariatePolynomialBuffer;
  readonly vXY: BivariatePolynomialBuffer;
  readonly wXY: BivariatePolynomialBuffer;
}> {
  if (placementVariables.length > setup.s_max) {
    throw new Error("placementVariables length exceeds s_max.");
  }

  const { uByPlacement, vByPlacement, wByPlacement } = timing.spanSync("uvw.allocate_eval_buffers", () => ({
    uByPlacement: Array.from({ length: setup.s_max * setup.n }, () => field.zero),
    vByPlacement: Array.from({ length: setup.s_max * setup.n }, () => field.zero),
    wByPlacement: Array.from({ length: setup.s_max * setup.n }, () => field.zero),
  }));

  timing.spanSync("uvw.sparse_eval", () => {
    for (let placementIndex = 0; placementIndex < placementVariables.length; placementIndex += 1) {
      const placement = placementVariables[placementIndex];
      const r1cs = r1csBySubcircuit[placement.subcircuitId];
      if (r1cs === undefined) {
        throw new Error(`Missing sparse R1CS for subcircuit ${placement.subcircuitId}.`);
      }

      evaluateSparseMatrixRows(field, placement.variables, r1cs.A, setup.n, uByPlacement, placementIndex * setup.n);
      evaluateSparseMatrixRows(field, placement.variables, r1cs.B, setup.n, vByPlacement, placementIndex * setup.n);
      evaluateSparseMatrixRows(field, placement.variables, r1cs.C, setup.n, wByPlacement, placementIndex * setup.n);
    }
  });

  const { uEvals, vEvals, wEvals } = timing.spanSync("uvw.transpose", () => ({
    uEvals: transposePlacementMajorToRowMajor(uByPlacement, setup.s_max, setup.n),
    vEvals: transposePlacementMajorToRowMajor(vByPlacement, setup.s_max, setup.n),
    wEvals: transposePlacementMajorToRowMajor(wByPlacement, setup.s_max, setup.n),
  }));

  const [uXY, vXY, wXY] = await timing.span("uvw.from_rou_evals", async () => [
    await BivariatePolynomialBuffer.fromRouEvals(field, field.concat(uEvals), setup.n, setup.s_max),
    await BivariatePolynomialBuffer.fromRouEvals(field, field.concat(vEvals), setup.n, setup.s_max),
    await BivariatePolynomialBuffer.fromRouEvals(field, field.concat(wEvals), setup.n, setup.s_max),
  ]);

  return { uXY, vXY, wXY };
}

async function genUvwXYFlatProfiled(
  field: FieldRuntime,
  placementVariables: readonly ProverPlacementVariables[],
  r1csBySubcircuit: readonly (ProverSparseSubcircuitR1cs | undefined)[],
  setup: ProverSetupParams,
  timing: TimingCollector,
): Promise<{
  readonly uXY: BivariatePolynomialBuffer;
  readonly vXY: BivariatePolynomialBuffer;
  readonly wXY: BivariatePolynomialBuffer;
}> {
  if (placementVariables.length > setup.s_max) {
    throw new Error("placementVariables length exceeds s_max.");
  }

  const { uByPlacement, vByPlacement, wByPlacement } = timing.spanSync("uvw.allocate_eval_buffers", () => ({
    uByPlacement: field.createZeroBuffer(setup.s_max * setup.n),
    vByPlacement: field.createZeroBuffer(setup.s_max * setup.n),
    wByPlacement: field.createZeroBuffer(setup.s_max * setup.n),
  }));

  timing.spanSync("uvw.sparse_eval", () => {
    for (let placementIndex = 0; placementIndex < placementVariables.length; placementIndex += 1) {
      const placement = placementVariables[placementIndex];
      const r1cs = r1csBySubcircuit[placement.subcircuitId];
      if (r1cs === undefined) {
        throw new Error(`Missing sparse R1CS for subcircuit ${placement.subcircuitId}.`);
      }

      evaluateSparseMatrixRowsToBuffer(field, placement.variables, r1cs.A, setup.n, uByPlacement, placementIndex * setup.n);
      evaluateSparseMatrixRowsToBuffer(field, placement.variables, r1cs.B, setup.n, vByPlacement, placementIndex * setup.n);
      evaluateSparseMatrixRowsToBuffer(field, placement.variables, r1cs.C, setup.n, wByPlacement, placementIndex * setup.n);
    }
  });

  const { uEvals, vEvals, wEvals } = timing.spanSync("uvw.transpose", () => ({
    uEvals: transposePlacementMajorBufferToRowMajor(field, uByPlacement, setup.s_max, setup.n),
    vEvals: transposePlacementMajorBufferToRowMajor(field, vByPlacement, setup.s_max, setup.n),
    wEvals: transposePlacementMajorBufferToRowMajor(field, wByPlacement, setup.s_max, setup.n),
  }));

  const [uXY, vXY, wXY] = await timing.span("uvw.from_rou_evals", async () => [
    await BivariatePolynomialBuffer.fromRouEvals(field, uEvals, setup.n, setup.s_max),
    await BivariatePolynomialBuffer.fromRouEvals(field, vEvals, setup.n, setup.s_max),
    await BivariatePolynomialBuffer.fromRouEvals(field, wEvals, setup.n, setup.s_max),
  ]);

  return { uXY, vXY, wXY };
}

async function genUvwXYDirectSparseProfiled(
  field: FieldRuntime,
  placementVariables: readonly ProverPlacementVariables[],
  r1csBySubcircuit: readonly (ProverSparseSubcircuitR1cs | undefined)[],
  setup: ProverSetupParams,
  timing: TimingCollector,
): Promise<{
  readonly uXY: BivariatePolynomialBuffer;
  readonly vXY: BivariatePolynomialBuffer;
  readonly wXY: BivariatePolynomialBuffer;
}> {
  if (placementVariables.length > setup.s_max) {
    throw new Error("placementVariables length exceeds s_max.");
  }

  const { uByPlacement, vByPlacement, wByPlacement } = timing.spanSync("uvw.allocate_eval_buffers", () => ({
    uByPlacement: field.createZeroBuffer(setup.s_max * setup.n),
    vByPlacement: field.createZeroBuffer(setup.s_max * setup.n),
    wByPlacement: field.createZeroBuffer(setup.s_max * setup.n),
  }));

  timing.spanSync("uvw.sparse_eval", () => {
    for (let placementIndex = 0; placementIndex < placementVariables.length; placementIndex += 1) {
      const placement = placementVariables[placementIndex];
      const r1cs = r1csBySubcircuit[placement.subcircuitId];
      if (r1cs === undefined) {
        throw new Error(`Missing sparse R1CS for subcircuit ${placement.subcircuitId}.`);
      }

      evaluateSparseMatrixRowsToBufferDirect(
        field,
        placement.variables,
        r1cs.A,
        setup.n,
        uByPlacement,
        placementIndex * setup.n,
      );
      evaluateSparseMatrixRowsToBufferDirect(
        field,
        placement.variables,
        r1cs.B,
        setup.n,
        vByPlacement,
        placementIndex * setup.n,
      );
      evaluateSparseMatrixRowsToBufferDirect(
        field,
        placement.variables,
        r1cs.C,
        setup.n,
        wByPlacement,
        placementIndex * setup.n,
      );
    }
  });

  const { uEvals, vEvals, wEvals } = timing.spanSync("uvw.transpose", () => ({
    uEvals: transposePlacementMajorBufferToRowMajor(field, uByPlacement, setup.s_max, setup.n),
    vEvals: transposePlacementMajorBufferToRowMajor(field, vByPlacement, setup.s_max, setup.n),
    wEvals: transposePlacementMajorBufferToRowMajor(field, wByPlacement, setup.s_max, setup.n),
  }));

  const [uXY, vXY, wXY] = await timing.span("uvw.from_rou_evals", async () => [
    await BivariatePolynomialBuffer.fromRouEvals(field, uEvals, setup.n, setup.s_max),
    await BivariatePolynomialBuffer.fromRouEvals(field, vEvals, setup.n, setup.s_max),
    await BivariatePolynomialBuffer.fromRouEvals(field, wEvals, setup.n, setup.s_max),
  ]);

  return { uXY, vXY, wXY };
}

async function genUvwXYRowMajorProfiled(
  field: FieldRuntime,
  placementVariables: readonly ProverPlacementVariables[],
  r1csBySubcircuit: readonly (ProverSparseSubcircuitR1cs | undefined)[],
  setup: ProverSetupParams,
  timing: TimingCollector,
): Promise<{
  readonly uXY: BivariatePolynomialBuffer;
  readonly vXY: BivariatePolynomialBuffer;
  readonly wXY: BivariatePolynomialBuffer;
}> {
  if (placementVariables.length > setup.s_max) {
    throw new Error("placementVariables length exceeds s_max.");
  }

  const { uEvals, vEvals, wEvals } = timing.spanSync("uvw.allocate_eval_buffers", () => ({
    uEvals: field.createZeroBuffer(setup.s_max * setup.n),
    vEvals: field.createZeroBuffer(setup.s_max * setup.n),
    wEvals: field.createZeroBuffer(setup.s_max * setup.n),
  }));

  timing.spanSync("uvw.sparse_eval", () => {
    for (let placementIndex = 0; placementIndex < placementVariables.length; placementIndex += 1) {
      const placement = placementVariables[placementIndex];
      const r1cs = r1csBySubcircuit[placement.subcircuitId];
      if (r1cs === undefined) {
        throw new Error(`Missing sparse R1CS for subcircuit ${placement.subcircuitId}.`);
      }

      evaluateSparseMatrixRowsToRowMajorBuffer(
        field,
        placement.variables,
        r1cs.A,
        setup.n,
        setup.s_max,
        placementIndex,
        uEvals,
      );
      evaluateSparseMatrixRowsToRowMajorBuffer(
        field,
        placement.variables,
        r1cs.B,
        setup.n,
        setup.s_max,
        placementIndex,
        vEvals,
      );
      evaluateSparseMatrixRowsToRowMajorBuffer(
        field,
        placement.variables,
        r1cs.C,
        setup.n,
        setup.s_max,
        placementIndex,
        wEvals,
      );
    }
  });

  timing.spanSync("uvw.transpose", () => undefined);

  const [uXY, vXY, wXY] = await timing.span("uvw.from_rou_evals", async () => [
    await BivariatePolynomialBuffer.fromRouEvals(field, uEvals, setup.n, setup.s_max),
    await BivariatePolynomialBuffer.fromRouEvals(field, vEvals, setup.n, setup.s_max),
    await BivariatePolynomialBuffer.fromRouEvals(field, wEvals, setup.n, setup.s_max),
  ]);

  return { uXY, vXY, wXY };
}

function materializeUvwRowMajorEvals(
  field: FieldRuntime,
  placementVariables: readonly ProverPlacementVariables[],
  r1csBySubcircuit: readonly (ProverSparseSubcircuitR1cs | undefined)[],
  setup: ProverSetupParams,
  timing: TimingCollector,
): { readonly uEvals: Uint8Array; readonly vEvals: Uint8Array; readonly wEvals: Uint8Array } {
  if (placementVariables.length > setup.s_max) {
    throw new Error("placementVariables length exceeds s_max.");
  }

  const { uEvals, vEvals, wEvals } = timing.spanSync("uvw.allocate_eval_buffers", () => ({
    uEvals: field.createZeroBuffer(setup.s_max * setup.n),
    vEvals: field.createZeroBuffer(setup.s_max * setup.n),
    wEvals: field.createZeroBuffer(setup.s_max * setup.n),
  }));

  timing.spanSync("uvw.sparse_eval", () => {
    for (let placementIndex = 0; placementIndex < placementVariables.length; placementIndex += 1) {
      const placement = placementVariables[placementIndex];
      const r1cs = r1csBySubcircuit[placement.subcircuitId];
      if (r1cs === undefined) {
        throw new Error(`Missing sparse R1CS for subcircuit ${placement.subcircuitId}.`);
      }

      evaluateSparseMatrixRowsToRowMajorBuffer(
        field,
        placement.variables,
        r1cs.A,
        setup.n,
        setup.s_max,
        placementIndex,
        uEvals,
      );
      evaluateSparseMatrixRowsToRowMajorBuffer(
        field,
        placement.variables,
        r1cs.B,
        setup.n,
        setup.s_max,
        placementIndex,
        vEvals,
      );
      evaluateSparseMatrixRowsToRowMajorBuffer(
        field,
        placement.variables,
        r1cs.C,
        setup.n,
        setup.s_max,
        placementIndex,
        wEvals,
      );
    }
  });
  timing.spanSync("uvw.transpose", () => undefined);

  return { uEvals, vEvals, wEvals };
}

async function createProverStateProfiled(
  runtime: CurveRuntime,
  input: ProverRuntimeInput,
  witness: WitnessPolynomials,
  timing: TimingCollector,
): Promise<ProverState> {
  const instance = await buildProverInstancePolynomialsProfiled(
    runtime.Fr,
    input.witness.setup,
    input.publicInstance,
    input.permutation,
    timing,
  );

  return {
    setup: input.witness.setup,
    instance,
    instanceBuffers: instance,
    witness,
    witnessBuffers: witness,
    mixer: await createProverMixerProfiled(runtime, timing),
  };
}

async function createProverStateFlatProfiled(
  runtime: CurveRuntime,
  input: ProverRuntimeInput,
  witness: WitnessPolynomials,
  timing: TimingCollector,
): Promise<ProverState> {
  const instance = await buildProverInstancePolynomialsFlatProfiled(
    runtime.Fr,
    input.witness.setup,
    input.publicInstance,
    input.permutation,
    timing,
  );

  return {
    setup: input.witness.setup,
    instance,
    instanceBuffers: instance,
    witness,
    witnessBuffers: witness,
    mixer: await createProverMixerProfiled(runtime, timing),
  };
}

async function createProverStateParallelRouProfiled(
  runtime: CurveRuntime,
  input: ProverRuntimeInput,
  witness: WitnessPolynomials,
  timing: TimingCollector,
): Promise<ProverState> {
  const instance = await buildProverInstancePolynomialsParallelRouProfiled(
    runtime.Fr,
    input.witness.setup,
    input.publicInstance,
    input.permutation,
    timing,
  );

  return {
    setup: input.witness.setup,
    instance,
    instanceBuffers: instance,
    witness,
    witnessBuffers: witness,
    mixer: await createProverMixerProfiled(runtime, timing),
  };
}

async function buildProverInstancePolynomialsProfiled(
  field: FieldRuntime,
  setup: ProverSetupParams,
  publicInstance: readonly FieldElement[],
  permutation: readonly ProverPermutationEntry[],
  timing: TimingCollector,
): Promise<ProverInstancePolynomials> {
  if (publicInstance.length !== setup.l_free) {
    throw new Error(`Prover public instance length must equal setup.l_free (${setup.l_free}).`);
  }

  const mI = setup.l_D - setup.l;
  const [s0XY, s1XY] = await buildPermutationPolynomialsProfiled(field, setup, permutation, timing);
  const aFreeX = await timing.span("instance.aFreeX.from_rou_evals", () =>
    BivariatePolynomialBuffer.fromRouEvals(field, field.concat(publicInstance), setup.l_free, 1),
  );
  const { tN, tMi, tSMax } = timing.spanSync("vanishing.polynomials", () => ({
    tN: vanishingPolynomialX(field, setup.n),
    tMi: vanishingPolynomialX(field, mI),
    tSMax: vanishingPolynomialY(field, setup.s_max),
  }));

  return { aFreeX, tN, tMi, tSMax, s0XY, s1XY };
}

async function buildProverInstancePolynomialsFlatProfiled(
  field: FieldRuntime,
  setup: ProverSetupParams,
  publicInstance: readonly FieldElement[],
  permutation: readonly ProverPermutationEntry[],
  timing: TimingCollector,
): Promise<ProverInstancePolynomials> {
  if (publicInstance.length !== setup.l_free) {
    throw new Error(`Prover public instance length must equal setup.l_free (${setup.l_free}).`);
  }

  const mI = setup.l_D - setup.l;
  const [s0XY, s1XY] = await buildPermutationPolynomialsFlatProfiled(field, setup, permutation, timing);
  const aFreeX = await timing.span("instance.aFreeX.from_rou_evals", () =>
    BivariatePolynomialBuffer.fromRouEvals(field, field.concat(publicInstance), setup.l_free, 1),
  );
  const { tN, tMi, tSMax } = timing.spanSync("vanishing.polynomials", () => ({
    tN: vanishingPolynomialX(field, setup.n),
    tMi: vanishingPolynomialX(field, mI),
    tSMax: vanishingPolynomialY(field, setup.s_max),
  }));

  return { aFreeX, tN, tMi, tSMax, s0XY, s1XY };
}

async function buildProverInstancePolynomialsParallelRouProfiled(
  field: FieldRuntime,
  setup: ProverSetupParams,
  publicInstance: readonly FieldElement[],
  permutation: readonly ProverPermutationEntry[],
  timing: TimingCollector,
): Promise<ProverInstancePolynomials> {
  if (publicInstance.length !== setup.l_free) {
    throw new Error(`Prover public instance length must equal setup.l_free (${setup.l_free}).`);
  }

  const mI = setup.l_D - setup.l;
  const { s0Evals, s1Evals } = materializePermutationFlatEvals(field, setup, permutation, timing);
  const publicInstanceEvals = timing.spanSync("instance.aFreeX.materialize_field_buffer", () =>
    field.concat(publicInstance),
  );
  const [s0XY, s1XY, aFreeX] = await timing.span("instance.from_rou_evals.parallel", async () =>
    Promise.all([
      BivariatePolynomialBuffer.fromRouEvals(field, s0Evals, mI, setup.s_max),
      BivariatePolynomialBuffer.fromRouEvals(field, s1Evals, mI, setup.s_max),
      BivariatePolynomialBuffer.fromRouEvals(field, publicInstanceEvals, setup.l_free, 1),
    ]),
  );
  const { tN, tMi, tSMax } = timing.spanSync("vanishing.polynomials", () => ({
    tN: vanishingPolynomialX(field, setup.n),
    tMi: vanishingPolynomialX(field, mI),
    tSMax: vanishingPolynomialY(field, setup.s_max),
  }));

  return { aFreeX, tN, tMi, tSMax, s0XY, s1XY };
}

async function buildPermutationPolynomialsProfiled(
  field: FieldRuntime,
  setup: ProverSetupParams,
  permutation: readonly ProverPermutationEntry[],
  timing: TimingCollector,
): Promise<readonly [BivariatePolynomialBuffer, BivariatePolynomialBuffer]> {
  const mI = setup.l_D - setup.l;
  const { xPowers, yPowers } = timing.spanSync("permutation.power_tables", () => ({
    xPowers: powerTable(field, field.rootOfUnity(mI), mI),
    yPowers: powerTable(field, field.rootOfUnity(setup.s_max), setup.s_max),
  }));
  const { s0Evals, s1Evals } = timing.spanSync("permutation.allocate_and_fill_identity", () => {
    const s0 = Array.from({ length: mI * setup.s_max }, () => field.zero);
    const s1 = Array.from({ length: mI * setup.s_max }, () => field.zero);
    for (let row = 0; row < mI; row += 1) {
      const rowStart = row * setup.s_max;
      for (let col = 0; col < setup.s_max; col += 1) {
        s0[rowStart + col] = xPowers[row];
        s1[rowStart + col] = yPowers[col];
      }
    }

    return { s0Evals: s0, s1Evals: s1 };
  });

  timing.spanSync("permutation.apply_entries", () => {
    for (const entry of permutation) {
      const index = entry.row * setup.s_max + entry.col;
      s0Evals[index] = xPowers[entry.X];
      s1Evals[index] = yPowers[entry.Y];
    }
  });

  return timing.span("permutation.from_rou_evals", async () => [
    await BivariatePolynomialBuffer.fromRouEvals(field, field.concat(s0Evals), mI, setup.s_max),
    await BivariatePolynomialBuffer.fromRouEvals(field, field.concat(s1Evals), mI, setup.s_max),
  ]);
}

async function buildPermutationPolynomialsFlatProfiled(
  field: FieldRuntime,
  setup: ProverSetupParams,
  permutation: readonly ProverPermutationEntry[],
  timing: TimingCollector,
): Promise<readonly [BivariatePolynomialBuffer, BivariatePolynomialBuffer]> {
  const mI = setup.l_D - setup.l;
  const { xPowers, yPowers } = timing.spanSync("permutation.power_tables", () => ({
    xPowers: powerTable(field, field.rootOfUnity(mI), mI),
    yPowers: powerTable(field, field.rootOfUnity(setup.s_max), setup.s_max),
  }));
  const { s0Evals, s1Evals } = timing.spanSync("permutation.allocate_and_fill_identity", () => {
    const s0 = field.createZeroBuffer(mI * setup.s_max);
    const s1 = field.createZeroBuffer(mI * setup.s_max);
    for (let row = 0; row < mI; row += 1) {
      const rowStart = row * setup.s_max;
      for (let col = 0; col < setup.s_max; col += 1) {
        field.writeBufferElement(s0, rowStart + col, xPowers[row]);
        field.writeBufferElement(s1, rowStart + col, yPowers[col]);
      }
    }

    return { s0Evals: s0, s1Evals: s1 };
  });

  timing.spanSync("permutation.apply_entries", () => {
    for (const entry of permutation) {
      const index = entry.row * setup.s_max + entry.col;
      field.writeBufferElement(s0Evals, index, xPowers[entry.X]);
      field.writeBufferElement(s1Evals, index, yPowers[entry.Y]);
    }
  });

  return timing.span("permutation.from_rou_evals", async () => [
    await BivariatePolynomialBuffer.fromRouEvals(field, s0Evals, mI, setup.s_max),
    await BivariatePolynomialBuffer.fromRouEvals(field, s1Evals, mI, setup.s_max),
  ]);
}

function materializePermutationFlatEvals(
  field: FieldRuntime,
  setup: ProverSetupParams,
  permutation: readonly ProverPermutationEntry[],
  timing: TimingCollector,
): { readonly s0Evals: Uint8Array; readonly s1Evals: Uint8Array } {
  const mI = setup.l_D - setup.l;
  const { xPowers, yPowers } = timing.spanSync("permutation.power_tables", () => ({
    xPowers: powerTable(field, field.rootOfUnity(mI), mI),
    yPowers: powerTable(field, field.rootOfUnity(setup.s_max), setup.s_max),
  }));
  const { s0Evals, s1Evals } = timing.spanSync("permutation.allocate_and_fill_identity", () => {
    const s0 = field.createZeroBuffer(mI * setup.s_max);
    const s1 = field.createZeroBuffer(mI * setup.s_max);
    for (let row = 0; row < mI; row += 1) {
      const rowStart = row * setup.s_max;
      for (let col = 0; col < setup.s_max; col += 1) {
        field.writeBufferElement(s0, rowStart + col, xPowers[row]);
        field.writeBufferElement(s1, rowStart + col, yPowers[col]);
      }
    }

    return { s0Evals: s0, s1Evals: s1 };
  });

  timing.spanSync("permutation.apply_entries", () => {
    for (const entry of permutation) {
      const index = entry.row * setup.s_max + entry.col;
      field.writeBufferElement(s0Evals, index, xPowers[entry.X]);
      field.writeBufferElement(s1Evals, index, yPowers[entry.Y]);
    }
  });

  return { s0Evals, s1Evals };
}

async function createProverMixerProfiled(runtime: CurveRuntime, timing: TimingCollector): Promise<ProverMixer> {
  return timing.span("mixer.random_scalars", async () => ({
    rU_X: await runtime.randomScalar(),
    rU_Y: await runtime.randomScalar(),
    rV_X: await runtime.randomScalar(),
    rV_Y: await runtime.randomScalar(),
    rW_X: [await runtime.randomScalar(), await runtime.randomScalar(), await runtime.randomScalar(), runtime.Fr.zero],
    rW_Y: [await runtime.randomScalar(), await runtime.randomScalar(), await runtime.randomScalar(), runtime.Fr.zero],
    rB_X: [await runtime.randomScalar(), await runtime.randomScalar()],
    rB_Y: [await runtime.randomScalar(), await runtime.randomScalar()],
    rO_mid: await runtime.randomScalar(),
    rR_X: await runtime.randomScalar(),
    rR_Y: await runtime.randomScalar(),
  }));
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

function evaluateSparseMatrixRowsToBuffer(
  field: FieldRuntime,
  variables: readonly FieldElement[],
  matrix: ProverSparseMatrix,
  rowCount: number,
  output: Uint8Array,
  outputOffset: number,
): void {
  const dVec = matrix.activeWires.map((localIndex) => {
    if (!Number.isSafeInteger(localIndex) || localIndex < 0 || localIndex >= variables.length) {
      throw new Error(`Sparse R1CS active wire ${localIndex} is outside the placement variable range.`);
    }

    return variables[localIndex];
  });

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

    field.writeBufferElement(output, outputOffset + rowIndex, accumulator);
  }
}

function evaluateSparseMatrixRowsToBufferDirect(
  field: FieldRuntime,
  variables: readonly FieldElement[],
  matrix: ProverSparseMatrix,
  rowCount: number,
  output: Uint8Array,
  outputOffset: number,
): void {
  for (const localIndex of matrix.activeWires) {
    if (!Number.isSafeInteger(localIndex) || localIndex < 0 || localIndex >= variables.length) {
      throw new Error(`Sparse R1CS active wire ${localIndex} is outside the placement variable range.`);
    }
  }

  for (let rowIndex = 0; rowIndex < matrix.sparseRows.length; rowIndex += 1) {
    if (rowIndex >= rowCount) {
      throw new Error(`Sparse R1CS row ${rowIndex} exceeds the expected row count ${rowCount}.`);
    }

    let accumulator = field.zero;
    for (const entry of matrix.sparseRows[rowIndex]) {
      if (!Number.isSafeInteger(entry.column) || entry.column < 0 || entry.column >= matrix.activeWires.length) {
        throw new Error(`Sparse R1CS column ${entry.column} is outside the active wire range.`);
      }

      accumulator = field.add(
        accumulator,
        field.mul(entry.coefficient, variables[matrix.activeWires[entry.column]]),
      );
    }

    field.writeBufferElement(output, outputOffset + rowIndex, accumulator);
  }
}

function evaluateSparseMatrixRowsToRowMajorBuffer(
  field: FieldRuntime,
  variables: readonly FieldElement[],
  matrix: ProverSparseMatrix,
  rowCount: number,
  placementCount: number,
  placementIndex: number,
  output: Uint8Array,
): void {
  const dVec = matrix.activeWires.map((localIndex) => {
    if (!Number.isSafeInteger(localIndex) || localIndex < 0 || localIndex >= variables.length) {
      throw new Error(`Sparse R1CS active wire ${localIndex} is outside the placement variable range.`);
    }

    return variables[localIndex];
  });

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

    field.writeBufferElement(output, rowIndex * placementCount + placementIndex, accumulator);
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

function transposePlacementMajorBufferToRowMajor(
  field: FieldRuntime,
  values: Uint8Array,
  placementCount: number,
  rowCount: number,
): Uint8Array {
  if (field.bufferElementCount(values) !== placementCount * rowCount) {
    throw new Error("Cannot transpose a buffer whose length does not match its shape.");
  }

  const output = new Uint8Array(values.byteLength);
  for (let row = 0; row < rowCount; row += 1) {
    for (let placement = 0; placement < placementCount; placement += 1) {
      const sourceOffset = (placement * rowCount + row) * field.byteLength;
      const targetOffset = (row * placementCount + placement) * field.byteLength;
      output.set(values.subarray(sourceOffset, sourceOffset + field.byteLength), targetOffset);
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

function powerTable(field: FieldRuntime, base: FieldElement, length: number): FieldElement[] {
  const output = Array.from({ length }, () => field.one);
  for (let index = 1; index < length; index += 1) {
    output[index] = field.mul(output[index - 1], base);
  }

  return output;
}

function vanishingPolynomialX(field: FieldRuntime, degree: number): BivariatePolynomialBuffer {
  const coefficients = Array.from({ length: degree * 2 }, () => field.zero);
  coefficients[0] = field.neg(field.one);
  coefficients[degree] = field.one;
  return BivariatePolynomialBuffer.fromCoeffs(field, coefficients, degree * 2, 1);
}

function vanishingPolynomialY(field: FieldRuntime, degree: number): BivariatePolynomialBuffer {
  const coefficients = Array.from({ length: degree * 2 }, () => field.zero);
  coefficients[0] = field.neg(field.one);
  coefficients[degree] = field.one;
  return BivariatePolynomialBuffer.fromCoeffs(field, coefficients, 1, degree * 2);
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

async function loadPreparedProverInput(runtime: CurveRuntime, runtimeDir: string): Promise<ProverRuntimeInput> {
  const proverProofWitnessInput = await readPreparedRuntimeManifest(
    runtimeDir,
    "prover-proof-witness-input/manifest.json",
  );
  const proverCrsPreparedData = await readPreparedRuntimeManifest(
    runtimeDir,
    "prover-crs-prepared-data/manifest.json",
  );

  return loadProverInputFromRuntimeBundles(
    runtime,
    proverProofWitnessInput,
    proverCrsPreparedData,
    (artifactPath) => readPreparedRuntimeFile(runtimeDir, artifactPath),
  );
}

async function readPreparedRuntimeManifest(
  runtimeDir: string,
  artifactPath: string,
): Promise<RuntimeArtifactBundleManifest> {
  return parseRuntimeArtifactBundleManifest(await readPreparedRuntimeJson(runtimeDir, artifactPath));
}

async function readPreparedRuntimeJson<T>(runtimeDir: string, artifactPath: string): Promise<T> {
  const bytes = await readPreparedRuntimeFile(runtimeDir, artifactPath);

  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

async function readPreparedRuntimeFile(runtimeDir: string, artifactPath: string): Promise<Uint8Array> {
  const filePath = resolvePreparedRuntimePath(runtimeDir, artifactPath);

  try {
    return await readFile(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        `Required prepared runtime fixture file is missing: ${path.relative(process.cwd(), filePath)}.`,
        "Prepare owner package outputs, run npm run fixtures:copy, then run npm run fixtures:prepare.",
        `Original read error: ${message}`,
      ].join(" "),
    );
  }
}

function resolvePreparedRuntimePath(runtimeDir: string, artifactPath: string): string {
  if (path.isAbsolute(artifactPath) || artifactPath.includes("\\") || artifactPath.split("/").includes("..")) {
    throw new Error(`Prepared runtime artifact path must be a safe relative POSIX path: ${artifactPath}`);
  }

  const filePath = path.resolve(runtimeDir, artifactPath);
  const relative = path.relative(runtimeDir, filePath);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Prepared runtime artifact path escapes runtime fixture directory: ${artifactPath}`);
  }

  return filePath;
}

function assertWitnessParity(expected: WitnessPolynomials, actual: WitnessPolynomials): string[] {
  return [
    assertPolynomial("witness.bXY", expected.bXY, actual.bXY),
    assertPolynomial("witness.uXY", expected.uXY, actual.uXY),
    assertPolynomial("witness.vXY", expected.vXY, actual.vXY),
    assertPolynomial("witness.wXY", expected.wXY, actual.wXY),
    assertPolynomial("witness.rXY", expected.rXY, actual.rXY),
  ];
}

function assertInstanceParity(expected: ProverInstancePolynomials, actual: ProverInstancePolynomials): string[] {
  return [
    assertPolynomial("instance.aFreeX", expected.aFreeX, actual.aFreeX),
    assertPolynomial("instance.tN", expected.tN, actual.tN),
    assertPolynomial("instance.tMi", expected.tMi, actual.tMi),
    assertPolynomial("instance.tSMax", expected.tSMax, actual.tSMax),
    assertPolynomial("instance.s0XY", expected.s0XY, actual.s0XY),
    assertPolynomial("instance.s1XY", expected.s1XY, actual.s1XY),
  ];
}

function assertPolynomial(
  label: string,
  expected: BivariatePolynomialBuffer,
  actual: BivariatePolynomialBuffer,
): string {
  if (expected.xSize !== actual.xSize || expected.ySize !== actual.ySize) {
    throw new Error(
      `${label} shape mismatch: expected ${expected.xSize}x${expected.ySize}, got ${actual.xSize}x${actual.ySize}.`,
    );
  }

  if (!bytesEqual(expected.coefficients, actual.coefficients)) {
    throw new Error(`${label} coefficient buffer mismatch.`);
  }

  return `${label}: ok`;
}

function assertMixerShape(mixer: ProverMixer): string {
  if (mixer.rW_X.length !== 4 || mixer.rW_Y.length !== 4 || mixer.rB_X.length !== 2 || mixer.rB_Y.length !== 2) {
    throw new Error("profiled mixer shape mismatch.");
  }

  return "mixer.shape: ok";
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

function summarizeEvents(events: readonly TimingEvent[]): TimingTotal[] {
  const totals = new Map<string, { durationMs: number; count: number }>();
  for (const event of events) {
    const current = totals.get(event.name) ?? { durationMs: 0, count: 0 };
    current.durationMs += event.durationMs;
    current.count += 1;
    totals.set(event.name, current);
  }

  return Array.from(totals.entries()).map(([name, total]) => ({
    name,
    durationMs: total.durationMs,
    count: total.count,
  }));
}

function sumEvents(events: readonly TimingEvent[], name: string): number {
  return events.filter((event) => event.name === name).reduce((sum, event) => sum + event.durationMs, 0);
}

async function writeReport(options: BenchmarkOptions, report: InitBenchmarkReport): Promise<void> {
  await mkdir(path.dirname(options.jsonPath), { recursive: true });
  await mkdir(path.dirname(options.markdownPath), { recursive: true });
  await writeFile(options.jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(options.markdownPath, buildMarkdownReport(report));
}

function printReport(report: InitBenchmarkReport): void {
  console.log("Prover init benchmark completed.");
  console.log(`production init: ${formatDuration(report.productionInitMs)}`);
  console.log(`profiled init: ${formatDuration(report.profiledInitMs)}`);
  console.log(`flat-buffer candidate init: ${formatDuration(report.flatBufferCandidate.totalMs)}`);
  console.log(`direct-sparse candidate init: ${formatDuration(report.directSparseCandidate.totalMs)}`);
  console.log(`row-major UVW candidate init: ${formatDuration(report.rowMajorUvwCandidate.totalMs)}`);
  console.log(`parallel ROU candidate init: ${formatDuration(report.parallelRouCandidate.totalMs)}`);
  console.log("baseline profile phases:");
  for (const phase of report.phaseTotals) {
    console.log(`${phase.name}: ${formatDuration(phase.durationMs)} (${phase.count})`);
  }
  console.log("flat-buffer candidate phases:");
  for (const phase of report.flatBufferCandidate.phaseTotals) {
    console.log(`${phase.name}: ${formatDuration(phase.durationMs)} (${phase.count})`);
  }
  console.log("direct-sparse candidate phases:");
  for (const phase of report.directSparseCandidate.phaseTotals) {
    console.log(`${phase.name}: ${formatDuration(phase.durationMs)} (${phase.count})`);
  }
  console.log("row-major UVW candidate phases:");
  for (const phase of report.rowMajorUvwCandidate.phaseTotals) {
    console.log(`${phase.name}: ${formatDuration(phase.durationMs)} (${phase.count})`);
  }
  console.log("parallel ROU candidate phases:");
  for (const phase of report.parallelRouCandidate.phaseTotals) {
    console.log(`${phase.name}: ${formatDuration(phase.durationMs)} (${phase.count})`);
  }
}

function buildMarkdownReport(report: InitBenchmarkReport): string {
  const lines = [
    "# Prover Init Benchmark Report",
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    `Runtime fixture directory: \`${report.runtimeDir}\``,
    "",
    "## Summary",
    "",
    "| row | total |",
    "| --- | ---: |",
    `| production init | ${formatDuration(report.productionInitMs)} |`,
    `| baseline profiled init | ${formatDuration(report.profiledInitMs)} |`,
    `| flat-buffer candidate init | ${formatDuration(report.flatBufferCandidate.totalMs)} |`,
    `| direct-sparse candidate init | ${formatDuration(report.directSparseCandidate.totalMs)} |`,
    `| row-major UVW candidate init | ${formatDuration(report.rowMajorUvwCandidate.totalMs)} |`,
    `| parallel ROU candidate init | ${formatDuration(report.parallelRouCandidate.totalMs)} |`,
    "",
    "## Baseline Phase Totals",
    "",
    "| phase | total | count |",
    "| --- | ---: | ---: |",
    ...report.phaseTotals.map((phase) => `| ${phase.name} | ${formatDuration(phase.durationMs)} | ${phase.count} |`),
    "",
    "## Flat-Buffer Candidate Phase Totals",
    "",
    "| phase | total | count |",
    "| --- | ---: | ---: |",
    ...report.flatBufferCandidate.phaseTotals.map(
      (phase) => `| ${phase.name} | ${formatDuration(phase.durationMs)} | ${phase.count} |`,
    ),
    "",
    "## Direct-Sparse Candidate Phase Totals",
    "",
    "| phase | total | count |",
    "| --- | ---: | ---: |",
    ...report.directSparseCandidate.phaseTotals.map(
      (phase) => `| ${phase.name} | ${formatDuration(phase.durationMs)} | ${phase.count} |`,
    ),
    "",
    "## Row-Major UVW Candidate Phase Totals",
    "",
    "| phase | total | count |",
    "| --- | ---: | ---: |",
    ...report.rowMajorUvwCandidate.phaseTotals.map(
      (phase) => `| ${phase.name} | ${formatDuration(phase.durationMs)} | ${phase.count} |`,
    ),
    "",
    "## Parallel ROU Candidate Phase Totals",
    "",
    "| phase | total | count |",
    "| --- | ---: | ---: |",
    ...report.parallelRouCandidate.phaseTotals.map(
      (phase) => `| ${phase.name} | ${formatDuration(phase.durationMs)} | ${phase.count} |`,
    ),
    "",
    "## Parity Checks",
    "",
    ...report.parityChecks.map((check) => `- ${check}`),
    "",
    "## Flat-Buffer Candidate Parity Checks",
    "",
    ...report.flatBufferCandidate.parityChecks.map((check) => `- ${check}`),
    "",
    "## Direct-Sparse Candidate Parity Checks",
    "",
    ...report.directSparseCandidate.parityChecks.map((check) => `- ${check}`),
    "",
    "## Row-Major UVW Candidate Parity Checks",
    "",
    ...report.rowMajorUvwCandidate.parityChecks.map((check) => `- ${check}`),
    "",
    "## Parallel ROU Candidate Parity Checks",
    "",
    ...report.parallelRouCandidate.parityChecks.map((check) => `- ${check}`),
    "",
  ];

  return `${lines.join("\n")}\n`;
}

function parseOptions(args: readonly string[]): BenchmarkOptions {
  let runtimeDir = path.resolve("fixtures/small/runtime");
  let jsonPath = path.resolve("tmp/timing/prover-init-benchmark.json");
  let markdownPath = path.resolve("tmp/timing/prover-init-benchmark.md");

  for (const arg of args) {
    if (arg.startsWith("--runtime-dir=")) {
      runtimeDir = path.resolve(arg.slice("--runtime-dir=".length));
    } else if (arg.startsWith("--json=")) {
      jsonPath = path.resolve(arg.slice("--json=".length));
    } else if (arg.startsWith("--markdown=")) {
      markdownPath = path.resolve(arg.slice("--markdown=".length));
    } else {
      throw new Error(`Unknown prover init benchmark option: ${arg}`);
    }
  }

  return { runtimeDir, jsonPath, markdownPath };
}

function formatDuration(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)} s`;
  }

  return `${Math.round(ms)} ms`;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
