import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";

const DEFAULT_SOURCE_PATH = "tmp/fixtures/small/source/setup/combined_sigma.rkyv";
const DEFAULT_ARTIFACT_PATH = "fixtures/small/runtime/prover-crs.bin";
const POLICIES = ["speed-first", "hybrid", "memory-first"] as const;

interface PolicyResult {
  readonly policy: string;
  readonly elapsedMs: number;
  readonly peakProcessTreeRssBytes: number;
  readonly parity: true;
}

async function main(): Promise<void> {
  const sourcePath = path.resolve(process.argv[2] ?? DEFAULT_SOURCE_PATH);
  const artifactPath = path.resolve(process.argv[3] ?? DEFAULT_ARTIFACT_PATH);
  const results: PolicyResult[] = [];

  for (const policy of POLICIES) {
    results.push(await runPolicy(policy, sourcePath, artifactPath));
  }

  console.log(JSON.stringify({
    runtime: "node",
    sourcePath,
    artifactPath,
    results,
  }, null, 2));
}

async function runPolicy(
  policy: (typeof POLICIES)[number],
  sourcePath: string,
  artifactPath: string,
): Promise<PolicyResult> {
  const child = spawn(
    process.execPath,
    [
      "--expose-gc",
      "--import",
      "tsx",
      "test/benchmarks/binary-digest/benchmark-policy-case.ts",
      policy,
      sourcePath,
      artifactPath,
    ],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  let peakProcessTreeRssBytes = 0;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const sampleTimer = setInterval(async () => {
    peakProcessTreeRssBytes = Math.max(
      peakProcessTreeRssBytes,
      await readProcessTreeRss(child.pid),
    );
  }, 20);
  const [exitCode] = await once(child, "exit") as [number | null];
  clearInterval(sampleTimer);

  if (exitCode !== 0) {
    throw new Error(`${policy} digest policy failed:\n${stderr || stdout}`);
  }
  const line = stdout.trim().split("\n").at(-1);
  if (line === undefined) {
    throw new Error(`${policy} digest policy returned no result.`);
  }
  return {
    ...(JSON.parse(line) as Omit<PolicyResult, "peakProcessTreeRssBytes">),
    peakProcessTreeRssBytes,
  };
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
