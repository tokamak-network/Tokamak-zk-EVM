import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildWitnessPolynomials,
  createCurveRuntime,
  createProverState,
} from "../../../src/index.js";
import { loadPreparedProverInput } from "../support/prepared-prover-context.js";

interface BenchmarkOptions {
  readonly runtimeDir: string;
  readonly jsonPath: string;
  readonly markdownPath: string;
}

interface TimingRow {
  readonly operation: "witness.build" | "state.build";
  readonly durationMs: number;
}

interface InitTimingReport {
  readonly generatedAt: string;
  readonly runtimeDir: string;
  readonly rows: readonly TimingRow[];
  readonly totalMs: number;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const runtime = await createCurveRuntime();

  try {
    const proverInput = await loadPreparedProverInput(runtime, {
      runtimeDir: options.runtimeDir,
    });
    const rows: TimingRow[] = [];

    let started = performance.now();
    const witness = await buildWitnessPolynomials(runtime.Fr, proverInput.witness);
    rows.push({
      operation: "witness.build",
      durationMs: performance.now() - started,
    });

    started = performance.now();
    await createProverState({
      runtime,
      setup: proverInput.witness.setup,
      publicInstance: proverInput.publicInstance,
      permutation: proverInput.permutation,
      witness,
    });
    rows.push({
      operation: "state.build",
      durationMs: performance.now() - started,
    });

    const report: InitTimingReport = {
      generatedAt: new Date().toISOString(),
      runtimeDir: path.relative(process.cwd(), options.runtimeDir),
      rows,
      totalMs: rows.reduce((sum, row) => sum + row.durationMs, 0),
    };
    await writeReport(options, report);
    printReport(report);
  } finally {
    await runtime.terminate();
  }
}

async function writeReport(options: BenchmarkOptions, report: InitTimingReport): Promise<void> {
  await mkdir(path.dirname(options.jsonPath), { recursive: true });
  await mkdir(path.dirname(options.markdownPath), { recursive: true });
  await writeFile(options.jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(options.markdownPath, buildMarkdownReport(report));
}

function printReport(report: InitTimingReport): void {
  console.log("Prover init timing completed.");
  console.table(report.rows.map((row) => ({
    operation: row.operation,
    total: formatDuration(row.durationMs),
  })));
  console.log(`total: ${formatDuration(report.totalMs)}`);
}

function buildMarkdownReport(report: InitTimingReport): string {
  const lines = [
    "# Prover Init Timing Report",
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    `Runtime fixture directory: \`${report.runtimeDir}\``,
    "",
    "| operation | total |",
    "| --- | ---: |",
    ...report.rows.map((row) => `| ${row.operation} | ${formatDuration(row.durationMs)} |`),
    `| total | ${formatDuration(report.totalMs)} |`,
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
      throw new Error(`Unknown prover init timing option: ${arg}`);
    }
  }
  return { runtimeDir, jsonPath, markdownPath };
}

function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(3)} ms`;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
