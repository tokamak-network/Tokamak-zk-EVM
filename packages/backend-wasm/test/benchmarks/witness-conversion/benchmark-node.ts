import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";

const DEFAULT_SOURCE_PATH =
  "tmp/fixtures/small/source/synthesizer/placementVariables.json";
const DEFAULT_EXPECTED_PATH = "fixtures/small/runtime/witness.bin";
const CASES = [
  "convert-baseline",
  "convert-direct",
  "load-baseline",
  "load-flat",
] as const;

interface CaseResult {
  readonly benchmarkCase: string;
  readonly peakRssBytes: number;
  readonly [key: string]: string | number | boolean;
}

async function main(): Promise<void> {
  const sourcePath = path.resolve(process.argv[2] ?? DEFAULT_SOURCE_PATH);
  const expectedPath = path.resolve(process.argv[3] ?? DEFAULT_EXPECTED_PATH);
  const results: CaseResult[] = [];
  for (const benchmarkCase of CASES) {
    results.push(await runCase(benchmarkCase, sourcePath, expectedPath));
  }

  const baselineLoad = results.find(
    (result) => result.benchmarkCase === "load-baseline",
  );
  const flatLoad = results.find((result) => result.benchmarkCase === "load-flat");
  if (baselineLoad?.checksum !== flatLoad?.checksum) {
    throw new Error("Flat placement traversal checksum does not match the baseline.");
  }

  console.log(JSON.stringify({
    runtime: "node",
    sourcePath,
    expectedPath,
    results,
  }, null, 2));
}

async function runCase(
  benchmarkCase: (typeof CASES)[number],
  sourcePath: string,
  expectedPath: string,
): Promise<CaseResult> {
  const child = spawn(
    process.execPath,
    [
      "--expose-gc",
      "--import",
      "tsx",
      "test/benchmarks/witness-conversion/benchmark-case.ts",
      benchmarkCase,
      sourcePath,
      expectedPath,
    ],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  let peakRssBytes = 0;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const sampleTimer = setInterval(async () => {
    peakRssBytes = Math.max(peakRssBytes, await readProcessTreeRss(child.pid));
  }, 20);
  const [exitCode] = await once(child, "exit") as [number | null];
  clearInterval(sampleTimer);

  if (exitCode !== 0) {
    throw new Error(
      `${benchmarkCase} witness benchmark failed with exit ${exitCode}:\n${stderr || stdout}`,
    );
  }
  const line = stdout.trim().split("\n").at(-1);
  if (line === undefined) {
    throw new Error(`${benchmarkCase} witness benchmark returned no result.`);
  }
  return { ...(JSON.parse(line) as CaseResult), peakRssBytes };
}

async function readProcessTreeRss(rootPid: number | undefined): Promise<number> {
  if (rootPid === undefined) {
    return 0;
  }
  const ps = spawn("ps", ["-axo", "pid=,ppid=,rss="], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  let output = "";
  ps.stdout.setEncoding("utf8");
  ps.stdout.on("data", (chunk: string) => {
    output += chunk;
  });
  await once(ps, "exit");
  const rows = output.trim().split("\n").flatMap((line) => {
    const [pidText, parentPidText, rssText] = line.trim().split(/\s+/);
    const pid = Number(pidText);
    const parentPid = Number(parentPidText);
    const rssKiB = Number(rssText);
    return Number.isFinite(pid) && Number.isFinite(parentPid) && Number.isFinite(rssKiB)
      ? [{ pid, parentPid, rssKiB }]
      : [];
  });
  const descendants = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (!descendants.has(row.pid) && descendants.has(row.parentPid)) {
        descendants.add(row.pid);
        changed = true;
      }
    }
  }
  return rows
    .filter((row) => descendants.has(row.pid))
    .reduce((sum, row) => sum + row.rssKiB * 1024, 0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
