import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createCurveRuntime, type CurveRuntime, type FieldElement } from "../../../src/index.js";

const G1_AFFINE_BYTES = 96;

interface BenchmarkOptions {
  readonly seed: bigint;
  readonly lengths: readonly number[];
  readonly iterations: number;
  readonly warmup: number;
  readonly singleThread: boolean;
  readonly jsonPath?: string;
}

interface MsmJob {
  readonly index: number;
  readonly rawBases: Uint8Array;
  readonly rawScalars: Uint8Array;
}

interface ChildHandle {
  readonly child: ChildProcess;
  run(): Promise<Uint8Array>;
  terminate(): Promise<void>;
}

interface TimingRow {
  readonly jobCount: number;
  readonly totalPoints: number;
  readonly maxJobPoints: number;
  readonly sequentialMs: number;
  readonly sameRuntimePromiseAllMs: number;
  readonly processPerJobMs: number;
  readonly sameRuntimeSpeedup: number;
  readonly processSpeedup: number;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const runtime = await createCurveRuntime({ singleThread: options.singleThread });

  try {
    const jobs = buildJobs(runtime, options);
    await assertEqualResults(runtime, jobs, options);
    const row = await measureIndependentMsms(runtime, jobs, options);
    printRow(row, options);
    if (options.jsonPath !== undefined) {
      await writeJsonReport(options.jsonPath, options, row);
    }
  } finally {
    await runtime.terminate();
  }
}

function parseOptions(args: readonly string[]): BenchmarkOptions {
  const values = new Map<string, string>();
  for (const arg of args) {
    if (arg === "--multi-thread") {
      values.set("singleThread", "false");
      continue;
    }

    const match = /^--([a-zA-Z-]+)=(.+)$/.exec(arg);
    if (match === null) {
      throw new Error(`Unknown argument '${arg}'.`);
    }

    values.set(match[1], match[2]);
  }

  return {
    seed: parseSeed(values.get("seed") ?? "0x544f4b414d414b"),
    lengths: parseLengths(values.get("lengths") ?? "16384,16384,16384,32768,16384,16384"),
    iterations: parsePositiveInteger(values.get("iterations") ?? "2", "iterations"),
    warmup: parseNonNegativeInteger(values.get("warmup") ?? "1", "warmup"),
    singleThread: values.get("singleThread") !== "false",
    jsonPath: values.get("json"),
  };
}

function parseSeed(value: string): bigint {
  if (!/^(0x[0-9a-fA-F]+|[0-9]+)$/.test(value)) {
    throw new Error("Seed must be a decimal integer or 0x-prefixed hexadecimal integer.");
  }

  return BigInt(value);
}

function parseLengths(value: string): number[] {
  const lengths = value.split(",").map((entry) => parsePositiveInteger(entry.trim(), "length"));
  if (lengths.length === 0) {
    throw new Error("At least one benchmark length is required.");
  }
  return lengths;
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

function buildJobs(runtime: CurveRuntime, options: BenchmarkOptions): MsmJob[] {
  return options.lengths.map((length, index) => buildJob(runtime, length, index, options.seed));
}

function buildJob(runtime: CurveRuntime, length: number, index: number, seed: bigint): MsmJob {
  return {
    index,
    rawBases: buildSequentialAffineBases(runtime, length, index),
    rawScalars: buildRawScalars(runtime, length, seed + BigInt(index) * 0x100000001b3n),
  };
}

function buildSequentialAffineBases(runtime: CurveRuntime, length: number, offset: number): Uint8Array {
  const output = new Uint8Array(length * G1_AFFINE_BYTES);
  let point = runtime.G1.mulAffineScalar(runtime.G1.generator, runtime.Fr.fromBigInt(BigInt(offset + 1)));
  for (let index = 0; index < length; index += 1) {
    output.set(runtime.G1.toAffine(point), index * G1_AFFINE_BYTES);
    point = runtime.G1.add(point, runtime.G1.generator);
  }
  return output;
}

function buildRawScalars(runtime: CurveRuntime, length: number, seed: bigint): Uint8Array {
  const random = createSplitMix64(seed);
  const output = new Uint8Array(length * runtime.Fr.byteLength);
  for (let index = 0; index < length; index += 1) {
    output.set(runtime.Fr.toRawLittleEndian(randomFieldElement(runtime, random)), index * runtime.Fr.byteLength);
  }
  return output;
}

function createSplitMix64(seed: bigint): () => bigint {
  let state = seed & 0xffffffffffffffffn;

  return () => {
    state = (state + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
    let value = state;
    value = ((value ^ (value >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
    value = ((value ^ (value >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
    return value ^ (value >> 31n);
  };
}

function randomFieldElement(runtime: CurveRuntime, random: () => bigint): FieldElement {
  let value = 0n;
  for (let index = 0; index < 4; index += 1) {
    value = (value << 64n) | random();
  }

  return runtime.Fr.fromBigInt((value % (runtime.Fr.modulus - 1n)) + 1n);
}

async function assertEqualResults(
  runtime: CurveRuntime,
  jobs: readonly MsmJob[],
  options: BenchmarkOptions,
): Promise<void> {
  const sequential = await runSequential(runtime, jobs);
  const sameRuntime = await runSameRuntimePromiseAll(runtime, jobs);
  const child = await withChildHandles(options, (children) => runProcessPerJob(children));

  assertResultSetsEqual(runtime, sequential, sameRuntime, "same-runtime Promise.all");
  assertResultSetsEqual(runtime, sequential, child, "process-per-job");
}

async function measureIndependentMsms(
  runtime: CurveRuntime,
  jobs: readonly MsmJob[],
  options: BenchmarkOptions,
): Promise<TimingRow> {
  const sequentialMs = await measure(options, async () => {
    await runSequential(runtime, jobs);
  });
  const sameRuntimePromiseAllMs = await measure(options, async () => {
    await runSameRuntimePromiseAll(runtime, jobs);
  });
  const processPerJobMs = await withChildHandles(options, async (children) =>
    measure(options, async () => {
      await runProcessPerJob(children);
    }),
  );

  const totalPoints = jobs.reduce((sum, job) => sum + job.rawScalars.byteLength / 32, 0);
  const maxJobPoints = Math.max(...jobs.map((job) => job.rawScalars.byteLength / 32));

  return {
    jobCount: jobs.length,
    totalPoints,
    maxJobPoints,
    sequentialMs,
    sameRuntimePromiseAllMs,
    processPerJobMs,
    sameRuntimeSpeedup: sequentialMs / sameRuntimePromiseAllMs,
    processSpeedup: sequentialMs / processPerJobMs,
  };
}

async function runSequential(runtime: CurveRuntime, jobs: readonly MsmJob[]): Promise<Uint8Array[]> {
  const output: Uint8Array[] = [];
  for (const job of jobs) {
    output.push(await runtime.G1.msmAffineRaw(job.rawBases, job.rawScalars));
  }
  return output;
}

async function runSameRuntimePromiseAll(runtime: CurveRuntime, jobs: readonly MsmJob[]): Promise<Uint8Array[]> {
  return await Promise.all(jobs.map((job) => runtime.G1.msmAffineRaw(job.rawBases, job.rawScalars)));
}

async function runProcessPerJob(children: readonly ChildHandle[]): Promise<Uint8Array[]> {
  return await Promise.all(children.map((child) => child.run()));
}

async function withChildHandles<T>(
  options: BenchmarkOptions,
  callback: (children: readonly ChildHandle[]) => Promise<T>,
): Promise<T> {
  const children = await Promise.all(options.lengths.map((length, index) => createChildHandle(length, index, options)));
  try {
    return await callback(children);
  } finally {
    await Promise.all(children.map((child) => child.terminate()));
  }
}

async function createChildHandle(length: number, index: number, options: BenchmarkOptions): Promise<ChildHandle> {
  const child = fork(fileURLToPath(import.meta.url), ["--child-msm-worker"], {
    execArgv: process.execArgv,
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });

  await waitForBoot(child);
  await initChild(child, length, index, options);
  let nextId = 0;

  return {
    child,
    run() {
      const id = nextId;
      nextId += 1;
      return callChild(child, id);
    },
    async terminate() {
      if (!child.killed) {
        child.kill();
      }
    },
  };
}

function waitForBoot(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const onMessage = (message: unknown): void => {
      if (isChildBootMessage(message)) {
        cleanup();
        resolve();
      }
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const cleanup = (): void => {
      child.off("message", onMessage);
      child.off("error", onError);
    };

    child.on("message", onMessage);
    child.on("error", onError);
  });
}

function initChild(child: ChildProcess, length: number, index: number, options: BenchmarkOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const onMessage = (message: unknown): void => {
      if (isChildErrorMessage(message) && message.id === -1) {
        cleanup();
        reject(new Error(message.error));
        return;
      }
      if (isChildReadyMessage(message)) {
        cleanup();
        resolve();
      }
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const cleanup = (): void => {
      child.off("message", onMessage);
      child.off("error", onError);
    };

    child.on("message", onMessage);
    child.on("error", onError);
    child.send?.({
      command: "init",
      index,
      iterations: options.iterations,
      length,
      seed: formatSeed(options.seed),
      singleThread: options.singleThread,
    });
  });
}

function callChild(child: ChildProcess, id: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const onMessage = (message: unknown): void => {
      if (isChildErrorMessage(message) && message.id === id) {
        cleanup();
        reject(new Error(message.error));
        return;
      }
      if (!isChildResultMessage(message) || message.id !== id) {
        return;
      }
      cleanup();
      resolve(new Uint8Array(Buffer.from(message.resultBase64, "base64")));
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const cleanup = (): void => {
      child.off("message", onMessage);
      child.off("error", onError);
    };

    child.on("message", onMessage);
    child.on("error", onError);
    child.send?.({ id, command: "run" });
  });
}

function isChildBootMessage(message: unknown): message is { readonly boot: true } {
  return typeof message === "object" && message !== null && (message as { boot?: unknown }).boot === true;
}

function isChildReadyMessage(message: unknown): message is { readonly ready: true } {
  return typeof message === "object" && message !== null && (message as { ready?: unknown }).ready === true;
}

function isChildResultMessage(message: unknown): message is { readonly id: number; readonly resultBase64: string } {
  return (
    typeof message === "object" &&
    message !== null &&
    typeof (message as { id?: unknown }).id === "number" &&
    typeof (message as { resultBase64?: unknown }).resultBase64 === "string"
  );
}

function isChildErrorMessage(message: unknown): message is { readonly id: number; readonly error: string } {
  return (
    typeof message === "object" &&
    message !== null &&
    typeof (message as { id?: unknown }).id === "number" &&
    typeof (message as { error?: unknown }).error === "string"
  );
}

function assertResultSetsEqual(
  runtime: CurveRuntime,
  expected: readonly Uint8Array[],
  actual: readonly Uint8Array[],
  label: string,
): void {
  if (expected.length !== actual.length) {
    throw new Error(`${label} result count mismatch.`);
  }

  for (let index = 0; index < expected.length; index += 1) {
    if (!runtime.G1.eq(expected[index], actual[index])) {
      throw new Error(`${label} result ${index} mismatch.`);
    }
  }
}

async function measure(options: BenchmarkOptions, callback: () => Promise<void>): Promise<number> {
  for (let index = 0; index < options.warmup; index += 1) {
    await callback();
  }

  const start = performance.now();
  for (let index = 0; index < options.iterations; index += 1) {
    await callback();
  }

  return (performance.now() - start) / options.iterations;
}

function printRow(row: TimingRow, options: BenchmarkOptions): void {
  console.log(
    `Independent MSM parallel benchmark seed=${formatSeed(options.seed)} lengths=${options.lengths.join(",")} ` +
      `iterations=${options.iterations} warmup=${options.warmup} mode=${
        options.singleThread ? "single-thread" : "multi-thread"
      }`,
  );
  console.log(
    "jobs | total points | max job points | sequential ms | same runtime Promise.all ms | process/job ms | same runtime speedup | process speedup",
  );
  console.log("---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:");
  console.log(
    [
      row.jobCount.toString(),
      row.totalPoints.toString(),
      row.maxJobPoints.toString(),
      row.sequentialMs.toFixed(3),
      row.sameRuntimePromiseAllMs.toFixed(3),
      row.processPerJobMs.toFixed(3),
      `${row.sameRuntimeSpeedup.toFixed(2)}x`,
      `${row.processSpeedup.toFixed(2)}x`,
    ].join(" | "),
  );
}

async function writeJsonReport(jsonPath: string, options: BenchmarkOptions, row: TimingRow): Promise<void> {
  const resolved = path.resolve(jsonPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(
    resolved,
    `${JSON.stringify(
      {
        benchmark: "independent-msm-parallel",
        seed: formatSeed(options.seed),
        lengths: options.lengths,
        iterations: options.iterations,
        warmup: options.warmup,
        mode: options.singleThread ? "single-thread" : "multi-thread",
        row,
      },
      null,
      2,
    )}\n`,
  );
}

function formatSeed(seed: bigint): string {
  return `0x${seed.toString(16)}`;
}

async function childMain(): Promise<void> {
  let runtime: CurveRuntime | undefined;
  let job: MsmJob | undefined;
  process.send?.({ boot: true });
  process.on("message", (message: unknown) => {
    void handleChildMessage(message);
  });

  async function handleChildMessage(message: unknown): Promise<void> {
    if (!isCommandMessage(message)) {
      return;
    }
    if (message.command === "init") {
      try {
        runtime = await createCurveRuntime({ singleThread: Boolean(message.singleThread) });
        job = buildJob(
          runtime,
          requireSafeInteger(message.length, "child MSM length"),
          requireSafeInteger(message.index, "child MSM index"),
          parseSeed(requireString(message.seed, "child MSM seed")),
        );
        process.send?.({ ready: true });
      } catch (error) {
        process.send?.({ id: -1, error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }
    if (message.command === "run") {
      try {
        if (runtime === undefined || job === undefined) {
          throw new Error("Child MSM job was not initialized.");
        }
        const id = requireSafeInteger(message.id, "child MSM run id");
        const result = await runtime.G1.msmAffineRaw(job.rawBases, job.rawScalars);
        process.send?.({ id, resultBase64: Buffer.from(result).toString("base64") });
      } catch (error) {
        const id = typeof message.id === "number" ? message.id : -1;
        process.send?.({ id, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
}

function isCommandMessage(message: unknown): message is Record<string, unknown> & { readonly command: string } {
  return (
    typeof message === "object" &&
    message !== null &&
    typeof (message as { command?: unknown }).command === "string"
  );
}

function requireSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer.`);
  }
  return value as number;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }
  return value;
}

const entrypoint = process.argv.includes("--child-msm-worker") ? childMain : main;

entrypoint().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
