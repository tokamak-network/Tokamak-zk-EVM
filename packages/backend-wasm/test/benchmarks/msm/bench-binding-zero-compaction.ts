import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  createCurveRuntime,
  type CurveRuntime,
  type FieldElement,
  type ProverRuntimeInput,
  type ProverSubcircuitInfo,
} from "../../../src/index.js";
import {
  encodeOMidNoZk,
  encodeOPrvNoZk,
} from "../../../src/prover/internal/initial-relation.js";
import { proverCrsG1PointAt } from "../../../src/prover/api/binary-input.js";
import { loadPreparedProverInput } from "../prover-operations/prepared-prover-context.js";

const G1_AFFINE_BYTES = 96;

type Candidate = "current-all-scalars" | "zero-compacted";
type EntryVisitor = (base: Uint8Array, scalar: FieldElement) => void;

interface BindingSource {
  readonly label: string;
  readonly maxCount: number;
  visit(visitor: EntryVisitor): void;
}

interface RunResult {
  readonly result: Uint8Array;
  readonly selectedCount: number;
  readonly nonzeroCount: number;
  readonly scanAndCopyMs: number;
  readonly scalarConversionMs: number;
  readonly msmMs: number;
  readonly totalMs: number;
  readonly explicitTemporaryBytes: number;
}

interface Summary {
  readonly label: string;
  readonly candidate: Candidate;
  readonly inputCount: number;
  readonly selectedCount: number;
  readonly nonzeroCount: number;
  readonly density: number;
  readonly medianMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly medianPhases: Omit<RunResult, "result">;
}

async function main(): Promise<void> {
  const runtime = await createCurveRuntime();
  try {
    const input = await loadPreparedProverInput(runtime, (message) => console.log(message));
    const midSource = createStatementSource(
      input,
      "O_mid",
      input.witness.setup.l,
      input.witness.setup.l_D,
    );
    const privateSource = createStatementSource(
      input,
      "O_prv",
      input.witness.setup.l_D,
      input.witness.setup.m_D,
    );
    const sources = [
      midSource,
      privateSource,
      ...createSyntheticSources(runtime),
    ];
    await assertProductionStatementParity(runtime, input, midSource, privateSource);
    const summaries: Summary[] = [];
    for (const source of sources) {
      console.log(`Benchmarking ${source.label} (${source.maxCount} inputs)`);
      summaries.push(...await benchmarkSource(runtime, source));
    }

    console.table(summaries.map((summary) => ({
      label: summary.label,
      candidate: summary.candidate,
      inputs: summary.inputCount,
      selected: summary.selectedCount,
      nonzero: summary.nonzeroCount,
      density: summary.density.toFixed(3),
      "median ms": summary.medianMs.toFixed(3),
      "scan/copy ms": summary.medianPhases.scanAndCopyMs.toFixed(3),
      "convert ms": summary.medianPhases.scalarConversionMs.toFixed(3),
      "MSM ms": summary.medianPhases.msmMs.toFixed(3),
      "temporary MiB": (summary.medianPhases.explicitTemporaryBytes / 2 ** 20).toFixed(3),
    })));
    const report = {
      generatedAt: new Date().toISOString(),
      fixture: "fixtures/small/runtime",
      iterations: 3,
      warmup: 1,
      parity: "pass",
      scope: "O_mid and O_prv production regression with synthetic density parity",
      summaries,
    };
    const outputPath = path.resolve("tmp/timing/binding-zero-compaction.json");
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);
  } finally {
    await runtime.terminate();
  }
}

async function assertProductionStatementParity(
  runtime: CurveRuntime,
  input: ProverRuntimeInput,
  midSource: BindingSource,
  privateSource: BindingSource,
): Promise<void> {
  const [expectedMid, expectedPrivate] = await Promise.all([
    runCandidate(runtime, midSource, "current-all-scalars"),
    runCandidate(runtime, privateSource, "current-all-scalars"),
  ]);
  const productionMid = await encodeOMidNoZk(
    runtime,
    input.crs,
    input.witness.setup,
    input.witness.placementVariables,
    input.witness.subcircuitInfos,
  );
  const productionPrivate = await encodeOPrvNoZk(
    runtime,
    input.crs,
    input.witness.setup,
    input.witness.placementVariables,
    input.witness.subcircuitInfos,
  );
  if (!runtime.G1.eq(productionMid, expectedMid.result)) {
    throw new Error("Production O_mid zero compaction changed the G1 result.");
  }
  if (!runtime.G1.eq(productionPrivate, expectedPrivate.result)) {
    throw new Error("Production O_prv zero compaction changed the G1 result.");
  }
}

async function benchmarkSource(runtime: CurveRuntime, source: BindingSource): Promise<Summary[]> {
  const candidates: readonly Candidate[] = ["current-all-scalars", "zero-compacted"];
  const oracle = new Map<Candidate, RunResult>();
  for (const candidate of candidates) {
    oracle.set(candidate, await runCandidate(runtime, source, candidate));
  }
  if (!runtime.G1.eq(requireResult(oracle, candidates[0]).result, requireResult(oracle, candidates[1]).result)) {
    throw new Error(`${source.label}: compacted binding MSM changed the G1 result.`);
  }
  for (const candidate of candidates) {
    await runCandidate(runtime, source, candidate);
  }
  const samples = new Map<Candidate, RunResult[]>(candidates.map((candidate) => [candidate, []]));
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const order = iteration % 2 === 0 ? candidates : [...candidates].reverse();
    for (const candidate of order) {
      samples.get(candidate)?.push(await runCandidate(runtime, source, candidate));
    }
  }
  return candidates.map((candidate) => summarize(source, candidate, samples.get(candidate) ?? []));
}

async function runCandidate(
  runtime: CurveRuntime,
  source: BindingSource,
  candidate: Candidate,
): Promise<RunResult> {
  const totalStarted = performance.now();
  const scanStarted = performance.now();
  let rawBases: Uint8Array;
  let montgomeryScalars: Uint8Array;
  let selectedCount = 0;
  let nonzeroCount = 0;
  if (candidate === "current-all-scalars") {
    const bases: Uint8Array[] = [];
    const scalars: FieldElement[] = [];
    source.visit((base, scalar) => {
      bases.push(base);
      scalars.push(scalar);
      if (!runtime.Fr.isZero(scalar)) {
        nonzeroCount += 1;
      }
    });
    selectedCount = scalars.length;
    rawBases = concatBytes(bases);
    montgomeryScalars = concatBytes(scalars);
  } else {
    const baseCapacity = new Uint8Array(source.maxCount * G1_AFFINE_BYTES);
    const scalarCapacity = new Uint8Array(source.maxCount * runtime.Fr.byteLength);
    source.visit((base, scalar) => {
      if (runtime.Fr.isZero(scalar)) {
        return;
      }
      nonzeroCount += 1;
      baseCapacity.set(base, selectedCount * G1_AFFINE_BYTES);
      scalarCapacity.set(scalar, selectedCount * runtime.Fr.byteLength);
      selectedCount += 1;
    });
    rawBases = baseCapacity.subarray(0, selectedCount * G1_AFFINE_BYTES);
    montgomeryScalars = scalarCapacity.subarray(0, selectedCount * runtime.Fr.byteLength);
  }
  const scanAndCopyMs = performance.now() - scanStarted;
  const conversionStarted = performance.now();
  const rawScalars = selectedCount === 0
    ? new Uint8Array()
    : await runtime.Fr.batchFromMontgomeryBuffer(montgomeryScalars);
  const scalarConversionMs = performance.now() - conversionStarted;
  const msmStarted = performance.now();
  const result = selectedCount === 0
    ? runtime.G1.zero
    : await runtime.G1.msmAffineRaw(rawBases, rawScalars);
  const msmMs = performance.now() - msmStarted;

  return {
    result,
    selectedCount,
    nonzeroCount,
    scanAndCopyMs,
    scalarConversionMs,
    msmMs,
    totalMs: performance.now() - totalStarted,
    explicitTemporaryBytes:
      candidate === "current-all-scalars"
        ? rawBases.byteLength + montgomeryScalars.byteLength + rawScalars.byteLength
        : source.maxCount * (G1_AFFINE_BYTES + runtime.Fr.byteLength) + rawScalars.byteLength,
  };
}

function createStatementSource(
  input: ProverRuntimeInput,
  label: string,
  globalStart: number,
  globalEnd: number,
): BindingSource {
  let maxCount = 0;
  for (const placement of input.witness.placementVariables) {
    const info = requireInfo(input, placement.subcircuitId);
    for (const flattened of info.flattenMap) {
      if (flattened >= globalStart && flattened < globalEnd) {
        maxCount += 1;
      }
    }
  }
  const bases = label === "O_mid"
    ? input.crs.sigma1.etaInvLiOInterAlpha4Kj
    : input.crs.sigma1.deltaInvLiOPrv;
  return {
    label,
    maxCount,
    visit(visitor) {
      for (let placementIndex = 0; placementIndex < input.witness.placementVariables.length; placementIndex += 1) {
        const placement = input.witness.placementVariables[placementIndex];
        const info = requireInfo(input, placement.subcircuitId);
        for (let localIndex = 0; localIndex < info.Nwires; localIndex += 1) {
          const flattened = info.flattenMap[localIndex];
          if (flattened >= globalStart && flattened < globalEnd) {
            const row = flattened - globalStart;
            const base = proverCrsG1PointAt(
              bases,
              row * input.witness.setup.s_max + placementIndex,
            );
            visitor(base, placement.variables[localIndex]);
          }
        }
      }
    },
  };
}

function createSyntheticSources(runtime: CurveRuntime): BindingSource[] {
  const length = 32_768;
  const bases = buildPatternedAffineBases(runtime, length);
  const cases = [
    { label: "synthetic-all-zero", isNonzero: (_index: number) => false },
    {
      label: "synthetic-first-last-nonzero",
      isNonzero: (index: number) => index === 0 || index === length - 1,
    },
    { label: "synthetic-density-0.25", isNonzero: (index: number) => index % 4 === 0 },
    { label: "synthetic-alternating", isNonzero: (index: number) => index % 2 === 0 },
    { label: "synthetic-density-0.75", isNonzero: (index: number) => index % 4 !== 3 },
    { label: "synthetic-all-nonzero", isNonzero: (_index: number) => true },
  ];
  return cases.map(({ label, isNonzero }) => ({
    label,
    maxCount: length,
    visit(visitor: EntryVisitor) {
      for (let index = 0; index < length; index += 1) {
        const scalar = isNonzero(index)
          ? runtime.Fr.fromBigInt(BigInt(index + 1))
          : runtime.Fr.zero;
        visitor(
          bases.subarray(index * G1_AFFINE_BYTES, (index + 1) * G1_AFFINE_BYTES),
          scalar,
        );
      }
    },
  }));
}

function buildPatternedAffineBases(runtime: CurveRuntime, length: number): Uint8Array {
  const pattern: Uint8Array[] = [];
  let point = runtime.G1.generator;
  for (let index = 0; index < 256; index += 1) {
    pattern.push(runtime.G1.toAffine(point));
    point = runtime.G1.add(point, runtime.G1.generator);
  }
  const output = new Uint8Array(length * G1_AFFINE_BYTES);
  for (let index = 0; index < length; index += 1) {
    output.set(pattern[index % pattern.length], index * G1_AFFINE_BYTES);
  }
  return output;
}

function requireInfo(input: ProverRuntimeInput, subcircuitId: number): ProverSubcircuitInfo {
  const info = input.witness.subcircuitInfos[subcircuitId];
  if (info === undefined) {
    throw new Error(`Missing subcircuit info ${subcircuitId}.`);
  }
  return info;
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function summarize(source: BindingSource, candidate: Candidate, runs: readonly RunResult[]): Summary {
  if (runs.length === 0) {
    throw new Error(`${source.label}: missing ${candidate} samples.`);
  }
  const sorted = [...runs].sort((left, right) => left.totalMs - right.totalMs);
  const median = sorted[Math.floor(sorted.length / 2)];
  return {
    label: source.label,
    candidate,
    inputCount: source.maxCount,
    selectedCount: median.selectedCount,
    nonzeroCount: median.nonzeroCount,
    density: median.nonzeroCount / source.maxCount,
    medianMs: median.totalMs,
    minMs: sorted[0].totalMs,
    maxMs: sorted[sorted.length - 1].totalMs,
    medianPhases: {
      selectedCount: median.selectedCount,
      nonzeroCount: median.nonzeroCount,
      scanAndCopyMs: median.scanAndCopyMs,
      scalarConversionMs: median.scalarConversionMs,
      msmMs: median.msmMs,
      totalMs: median.totalMs,
      explicitTemporaryBytes: median.explicitTemporaryBytes,
    },
  };
}

function requireResult(results: ReadonlyMap<Candidate, RunResult>, candidate: Candidate): RunResult {
  const result = results.get(candidate);
  if (result === undefined) {
    throw new Error(`Missing candidate result ${candidate}.`);
  }
  return result;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
