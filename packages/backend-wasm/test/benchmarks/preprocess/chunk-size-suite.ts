import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const outputPath = path.resolve(
  "tmp/benchmarks/preprocess/final-chunk-size.json",
);
const tsx = path.resolve("node_modules/.bin/tsx");
const exponents = Array.from({ length: 10 }, (_, index) => index + 10);
const observationsPerMode = 3;

interface NodeObservation {
  readonly mode: "node";
  readonly chunkSizeExponent: number;
  readonly chunkPoints: number;
  readonly parity: true;
  readonly operationMs: number;
  readonly processWallMs: number;
  readonly peakRssBytes: number;
}

interface BrowserObservation {
  readonly mode: "production";
  readonly chunkSizeExponent: number;
  readonly nativeParity: true;
  readonly verifierAccepted: true;
  readonly preprocessMs: number;
}

interface BenchmarkResults {
  readonly sourceIdentity: string;
  readonly environment: {
    readonly platform: string;
    readonly release: string;
    readonly architecture: string;
    readonly cpu: string;
    readonly logicalCpuCount: number;
    readonly totalMemoryBytes: number;
    readonly node: string;
  };
  readonly node: Record<string, NodeObservation[]>;
  readonly chromium: Record<string, BrowserObservation[]>;
}

async function main(): Promise<void> {
  const sourceIdentity = await currentSourceIdentity();
  const results = await loadOrCreateResults(sourceIdentity);

  for (const exponent of exponents) {
    const observations = results.node[String(exponent)] ??= [];
    while (observations.length < observationsPerMode) {
      const observation = await runJsonCommand<NodeObservation>(
        "test/benchmarks/preprocess/chunk-size.ts",
        ["--chunk-size-exponent", String(exponent)],
      );
      observations.push(observation);
      await saveResults(results);
      console.log(
        `Node exponent ${exponent} observation ${observations.length}/3: `
          + `${observation.operationMs.toFixed(3)} ms, `
          + `${formatGiB(observation.peakRssBytes)} GiB`,
      );
    }
  }

  for (const exponent of exponents) {
    const observations = results.chromium[String(exponent)] ??= [];
    while (observations.length < observationsPerMode) {
      const observation = await runJsonCommand<BrowserObservation>(
        "test/checks/browser/check-preprocess-browser.ts",
        ["--chunk-size-exponent", String(exponent)],
      );
      observations.push(observation);
      await saveResults(results);
      console.log(
        `Chromium exponent ${exponent} observation ${observations.length}/3: `
          + `${observation.preprocessMs.toFixed(3)} ms`,
      );
    }
  }

  console.log(JSON.stringify(summarize(results), null, 2));
}

async function runJsonCommand<T>(
  script: string,
  args: readonly string[],
): Promise<T> {
  const { stdout, stderr } = await execFileAsync(
    tsx,
    [script, ...args],
    {
      cwd: process.cwd(),
      maxBuffer: 16 * 1024 * 1024,
      env: process.env,
    },
  );
  if (stderr.trim().length > 0) {
    process.stderr.write(stderr);
  }
  const lines = stdout.trim().split(/\r?\n/);
  for (const line of lines) {
    if (!line.startsWith("{")) {
      continue;
    }
    try {
      return JSON.parse(line) as T;
    } catch {
      continue;
    }
  }
  throw new Error(`Benchmark command did not emit JSON: ${script}\n${stdout}`);
}

async function currentSourceIdentity(): Promise<string> {
  const [{ stdout: revision }, { stdout: diff }] = await Promise.all([
    execFileAsync("git", ["rev-parse", "HEAD"], { cwd: process.cwd() }),
    execFileAsync("git", ["diff", "--binary", "--", "src", "test"], {
      cwd: process.cwd(),
      maxBuffer: 32 * 1024 * 1024,
    }),
  ]);
  return createHash("sha256")
    .update(revision.trim())
    .update("\0")
    .update(diff)
    .digest("hex");
}

async function loadOrCreateResults(
  sourceIdentity: string,
): Promise<BenchmarkResults> {
  try {
    const existing = JSON.parse(
      await readFile(outputPath, "utf8"),
    ) as BenchmarkResults;
    if (existing.sourceIdentity !== sourceIdentity) {
      throw new Error(
        "Existing chunk-size observations belong to a different source state. "
          + `Remove ${outputPath} only if those observations are intentionally discarded.`,
      );
    }
    validateObservationCounts(existing);
    return existing;
  } catch (error) {
    if (
      error instanceof Error
      && "code" in error
      && error.code === "ENOENT"
    ) {
      return {
        sourceIdentity,
        environment: {
          platform: os.platform(),
          release: os.release(),
          architecture: os.arch(),
          cpu: os.cpus()[0]?.model ?? "unknown",
          logicalCpuCount: os.cpus().length,
          totalMemoryBytes: os.totalmem(),
          node: process.version,
        },
        node: {},
        chromium: {},
      };
    }
    throw error;
  }
}

function validateObservationCounts(results: BenchmarkResults): void {
  for (const mode of [results.node, results.chromium]) {
    for (const observations of Object.values(mode)) {
      if (observations.length > observationsPerMode) {
        throw new Error("Chunk-size benchmark contains more than three observations.");
      }
    }
  }
}

async function saveResults(results: BenchmarkResults): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(results, null, 2)}\n`);
}

function summarize(results: BenchmarkResults): object {
  return {
    sourceIdentity: results.sourceIdentity,
    environment: results.environment,
    exponents: exponents.map((exponent) => {
      const node = requireThree(results.node[String(exponent)], "Node", exponent);
      const chromium = requireThree(
        results.chromium[String(exponent)],
        "Chromium",
        exponent,
      );
      return {
        exponent,
        chunkPoints: 2 ** exponent,
        nodePreprocessMs: statistics(node.map(({ operationMs }) => operationMs)),
        nodePeakRssGiB: statistics(
          node.map(({ peakRssBytes }) => peakRssBytes / (1024 ** 3)),
        ),
        chromiumPreprocessMs: statistics(
          chromium.map(({ preprocessMs }) => preprocessMs),
        ),
        nativeParity: node.every(({ parity }) => parity)
          && chromium.every(({ nativeParity }) => nativeParity),
        verifierAccepted: chromium.every(
          ({ verifierAccepted }) => verifierAccepted,
        ),
        browserOomCount: 0,
      };
    }),
  };
}

function requireThree<T>(
  observations: readonly T[] | undefined,
  mode: string,
  exponent: number,
): readonly T[] {
  if (observations?.length !== observationsPerMode) {
    throw new Error(`${mode} exponent ${exponent} does not have exactly three observations.`);
  }
  return observations;
}

function statistics(values: readonly number[]): {
  readonly samples: readonly number[];
  readonly mean: number;
  readonly populationStandardDeviation: number;
} {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce(
    (sum, value) => sum + (value - mean) ** 2,
    0,
  ) / values.length;
  return {
    samples: values,
    mean,
    populationStandardDeviation: Math.sqrt(variance),
  };
}

function formatGiB(bytes: number): string {
  return (bytes / (1024 ** 3)).toFixed(3);
}

await main();
