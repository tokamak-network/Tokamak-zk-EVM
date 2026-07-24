import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import path from "node:path";

import {
  RuntimeArtifactFileRole,
  createCurveRuntime,
  loadProverRuntimeWitnessInputParts,
  loadRuntimeArtifactFile,
  parseRuntimeArtifactBundleManifest,
  type CurveRuntime,
  type FieldElement,
  type ProverPlacementVariables,
  type ProverSubcircuitInfo,
  type RuntimeArtifactBundleManifest,
} from "../../../src/index.js";
import {
  GENERATED_PROVER_SETUP_PARAMS,
  GENERATED_PROVER_SUBCIRCUIT_INFOS,
} from "../../../src/prover/generated/subcircuit-library.generated.js";

const G1_AFFINE_BYTES = 96;

type Candidate = "per-scalar" | "batch-montgomery";
type BindingLabel = "O_pub_free" | "O_mid" | "O_prv";

interface BenchmarkOptions {
  readonly runtimeDir: string;
  readonly iterations: number;
  readonly warmup: number;
  readonly singleThread: boolean;
  readonly jsonPath?: string;
}

interface BindingInput {
  readonly label: BindingLabel;
  readonly bases: readonly Uint8Array[];
  readonly scalars: readonly FieldElement[];
}

interface RunMetrics {
  readonly result: Uint8Array;
  readonly basePreparationMs: number;
  readonly scalarPreparationMs: number;
  readonly msmMs: number;
  readonly totalMs: number;
  readonly explicitTemporaryBytes: number;
}

interface Summary {
  readonly median: number;
  readonly min: number;
  readonly max: number;
}

interface TimingRow {
  readonly label: BindingLabel;
  readonly candidate: Candidate;
  readonly scalarCount: number;
  readonly workerCount: number;
  readonly basePreparationMs: Summary;
  readonly scalarPreparationMs: Summary;
  readonly msmMs: Summary;
  readonly totalMs: Summary;
  readonly explicitTemporaryBytes: number;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const runtime = await createCurveRuntime({ singleThread: options.singleThread });

  try {
    const placementVariables = await loadPlacementVariables(runtime, options.runtimeDir);
    const scalarSets = collectBindingScalars(
      placementVariables,
      GENERATED_PROVER_SUBCIRCUIT_INFOS,
    );
    const rows: TimingRow[] = [];
    for (const [label, scalars] of scalarSets) {
      const input: BindingInput = {
        label,
        bases: splitAffineBases(buildPatternedAffineBases(runtime, scalars.length)),
        scalars,
      };
      rows.push(...await benchmarkInput(runtime, input, options));
    }

    printRows(rows, options);
    if (options.jsonPath !== undefined) {
      await writeJsonReport(options.jsonPath, options, rows);
    }
  } finally {
    await runtime.terminate();
  }
}

async function benchmarkInput(
  runtime: CurveRuntime,
  input: BindingInput,
  options: BenchmarkOptions,
): Promise<TimingRow[]> {
  const parity = new Map<Candidate, RunMetrics>();
  for (const candidate of candidates) {
    parity.set(candidate, await runCandidate(runtime, input, candidate));
  }
  const expected = parity.get("per-scalar");
  const actual = parity.get("batch-montgomery");
  if (expected === undefined || actual === undefined || !runtime.G1.eq(expected.result, actual.result)) {
    throw new Error(`${input.label}: binding scalar conversion candidate changed the G1 result.`);
  }

  for (let iteration = 0; iteration < options.warmup; iteration += 1) {
    for (const candidate of candidates) {
      await runCandidate(runtime, input, candidate);
    }
  }

  const samples = new Map<Candidate, RunMetrics[]>(
    candidates.map((candidate) => [candidate, []]),
  );
  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    const order = iteration % 2 === 0 ? candidates : [...candidates].reverse();
    for (const candidate of order) {
      samples.get(candidate)?.push(await runCandidate(runtime, input, candidate));
    }
  }

  return candidates.map((candidate) => {
    const values = samples.get(candidate);
    if (values === undefined || values.length === 0) {
      throw new Error(`${input.label}: no binding benchmark samples for ${candidate}.`);
    }
    return {
      label: input.label,
      candidate,
      scalarCount: input.scalars.length,
      workerCount: options.singleThread ? 1 : Math.min(64, Math.max(2, cpus().length)),
      basePreparationMs: summarize(values.map((value) => value.basePreparationMs)),
      scalarPreparationMs: summarize(values.map((value) => value.scalarPreparationMs)),
      msmMs: summarize(values.map((value) => value.msmMs)),
      totalMs: summarize(values.map((value) => value.totalMs)),
      explicitTemporaryBytes: values[0].explicitTemporaryBytes,
    };
  });
}

async function runCandidate(
  runtime: CurveRuntime,
  input: BindingInput,
  candidate: Candidate,
): Promise<RunMetrics> {
  const totalStart = performance.now();

  let start = performance.now();
  const rawBases = concatBytes(input.bases);
  const basePreparationMs = performance.now() - start;

  start = performance.now();
  const rawScalars = candidate === "per-scalar"
    ? concatBytes(input.scalars.map((scalar) => runtime.Fr.toRawLittleEndian(scalar)))
    : await runtime.Fr.batchFromMontgomeryBuffer(concatBytes(input.scalars));
  const scalarPreparationMs = performance.now() - start;

  start = performance.now();
  const result = input.scalars.length === 0
    ? runtime.G1.zero
    : await runtime.G1.msmAffineRaw(rawBases, rawScalars);
  const msmMs = performance.now() - start;

  return {
    result,
    basePreparationMs,
    scalarPreparationMs,
    msmMs,
    totalMs: performance.now() - totalStart,
    explicitTemporaryBytes:
      rawBases.byteLength
      + rawScalars.byteLength
      + (candidate === "per-scalar" ? input.scalars.length * runtime.Fr.byteLength : rawScalars.byteLength),
  };
}

async function loadPlacementVariables(
  runtime: CurveRuntime,
  runtimeDir: string,
): Promise<readonly ProverPlacementVariables[]> {
  const manifestPath = path.join(runtimeDir, "prover-proof-witness-input", "manifest.json");
  const manifest = parseRuntimeArtifactBundleManifest(
    JSON.parse(await readFile(manifestPath, "utf8")) as unknown,
  );
  const artifacts = {
    placementVariables: await loadBundleFile(manifest, RuntimeArtifactFileRole.PlacementVariables, runtimeDir),
    permutation: await loadBundleFile(manifest, RuntimeArtifactFileRole.Permutation, runtimeDir),
    instance: await loadBundleFile(manifest, RuntimeArtifactFileRole.Instance, runtimeDir),
  };
  return loadProverRuntimeWitnessInputParts(runtime, artifacts).placementVariables;
}

async function loadBundleFile(
  manifest: RuntimeArtifactBundleManifest,
  role: RuntimeArtifactFileRole,
  runtimeDir: string,
) {
  const matches = manifest.files.filter((file) => file.role === role);
  if (matches.length !== 1) {
    throw new Error(`${manifest.kind} must contain exactly one '${role}' file.`);
  }
  return loadRuntimeArtifactFile(await readFile(resolveRuntimePath(runtimeDir, matches[0].path)));
}

function resolveRuntimePath(runtimeDir: string, artifactPath: string): string {
  if (path.isAbsolute(artifactPath) || artifactPath.includes("\\") || artifactPath.split("/").includes("..")) {
    throw new Error(`Runtime artifact path must be a safe relative POSIX path: ${artifactPath}`);
  }
  const resolved = path.resolve(runtimeDir, artifactPath);
  const relative = path.relative(path.resolve(runtimeDir), resolved);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Runtime artifact path escapes the runtime fixture directory: ${artifactPath}`);
  }
  return resolved;
}

function collectBindingScalars(
  placements: readonly ProverPlacementVariables[],
  subcircuits: readonly ProverSubcircuitInfo[],
): ReadonlyMap<BindingLabel, readonly FieldElement[]> {
  const pub: FieldElement[] = [];
  const mid: FieldElement[] = [];
  const prv: FieldElement[] = [];
  for (const placement of placements) {
    const info = subcircuits[placement.subcircuitId];
    if (info === undefined) {
      throw new Error(`Missing subcircuit info ${placement.subcircuitId}.`);
    }
    const publicRange = publicFreeRange(info);
    if (publicRange !== undefined) {
      pub.push(...placement.variables.slice(publicRange.start, publicRange.end));
    }
    for (let localIndex = 0; localIndex < info.Nwires; localIndex += 1) {
      const flattened = info.flattenMap[localIndex];
      if (
        flattened >= GENERATED_PROVER_SETUP_PARAMS.l
        && flattened < GENERATED_PROVER_SETUP_PARAMS.l_D
      ) {
        mid.push(placement.variables[localIndex]);
      } else if (
        flattened >= GENERATED_PROVER_SETUP_PARAMS.l_D
        && flattened < GENERATED_PROVER_SETUP_PARAMS.m_D
      ) {
        prv.push(placement.variables[localIndex]);
      }
    }
  }
  return new Map([
    ["O_pub_free", pub],
    ["O_mid", mid],
    ["O_prv", prv],
  ]);
}

function publicFreeRange(
  info: ProverSubcircuitInfo,
): { readonly start: number; readonly end: number } | undefined {
  if (info.name === "bufferPubOut") {
    return { start: info.Out_idx[0], end: info.Out_idx[0] + info.Out_idx[1] };
  }
  if (info.name === "bufferPubIn" || info.name === "bufferBlockIn") {
    return { start: info.In_idx[0], end: info.In_idx[0] + info.In_idx[1] };
  }
  return undefined;
}

function buildPatternedAffineBases(runtime: CurveRuntime, length: number): Uint8Array {
  const patternLength = Math.min(length, 256);
  const pattern: Uint8Array[] = [];
  let point = runtime.G1.generator;
  for (let index = 0; index < patternLength; index += 1) {
    pattern.push(runtime.G1.toAffine(point));
    point = runtime.G1.add(point, runtime.G1.generator);
  }
  const output = new Uint8Array(length * G1_AFFINE_BYTES);
  for (let index = 0; index < length; index += 1) {
    output.set(pattern[index % patternLength], index * G1_AFFINE_BYTES);
  }
  return output;
}

function splitAffineBases(buffer: Uint8Array): Uint8Array[] {
  return Array.from(
    { length: buffer.byteLength / G1_AFFINE_BYTES },
    (_, index) => buffer.subarray(index * G1_AFFINE_BYTES, (index + 1) * G1_AFFINE_BYTES),
  );
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function summarize(values: readonly number[]): Summary {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return {
    median: sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle],
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

function parseOptions(args: readonly string[]): BenchmarkOptions {
  const values = new Map<string, string>();
  for (const arg of args) {
    if (arg === "--single-thread") {
      values.set("single-thread", "true");
      continue;
    }
    const match = /^--([a-zA-Z-]+)=(.+)$/.exec(arg);
    if (match === null) {
      throw new Error(`Unknown argument '${arg}'.`);
    }
    values.set(match[1], match[2]);
  }
  return {
    runtimeDir: path.resolve(values.get("runtime-dir") ?? "fixtures/small/runtime"),
    iterations: parsePositiveInteger(values.get("iterations") ?? "3", "iterations"),
    warmup: parseNonNegativeInteger(values.get("warmup") ?? "1", "warmup"),
    singleThread: values.get("single-thread") === "true",
    jsonPath: values.get("json"),
  };
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = parseNonNegativeInteger(value, label);
  if (parsed <= 0) {
    throw new Error(`${label} must be positive.`);
  }
  return parsed;
}

function parseNonNegativeInteger(value: string, label: string): number {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${label} must be a safe integer.`);
  }
  return parsed;
}

function printRows(rows: readonly TimingRow[], options: BenchmarkOptions): void {
  console.log(
    `Binding scalar conversion benchmark: workers=${rows[0]?.workerCount ?? 0}, `
    + `iterations=${options.iterations}, warmup=${options.warmup}`,
  );
  console.table(rows.map((row) => ({
    binding: row.label,
    candidate: row.candidate,
    count: row.scalarCount,
    "base ms": row.basePreparationMs.median.toFixed(3),
    "scalar ms": row.scalarPreparationMs.median.toFixed(3),
    "MSM ms": row.msmMs.median.toFixed(3),
    "total ms": row.totalMs.median.toFixed(3),
    "temp MiB": (row.explicitTemporaryBytes / 2 ** 20).toFixed(2),
  })));
}

async function writeJsonReport(
  outputPath: string,
  options: BenchmarkOptions,
  rows: readonly TimingRow[],
): Promise<void> {
  const resolved = path.resolve(outputPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    runtimeDir: options.runtimeDir,
    iterations: options.iterations,
    warmup: options.warmup,
    singleThread: options.singleThread,
    rows,
  }, null, 2)}\n`);
}

const candidates = ["per-scalar", "batch-montgomery"] as const;

await main();
