import { spawn } from "node:child_process";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

import { build } from "esbuild";
import { chromium } from "playwright";

const OUTPUT_DIRECTORY = "tmp/benchmarks/digest-policy";
const ENTRY_PATH = path.join(OUTPUT_DIRECTORY, "browser-entry.js");
const DEFAULT_SOURCE_PATH = "tmp/fixtures/small/source/setup/combined_sigma.rkyv";
const DEFAULT_ARTIFACT_PATH = "fixtures/small/runtime/prover-crs.bin";
const DEFAULT_TIMEOUT_MS = 1_800_000;
const POLICIES = ["speed-first", "hybrid", "memory-first"] as const;

interface BrowserPolicyResult {
  readonly policy: string;
  readonly elapsedMs: number;
  readonly parity: true;
  readonly peakProcessTreeRssBytes: number;
}

async function main(): Promise<void> {
  const sourcePath = path.resolve(process.argv[2] ?? DEFAULT_SOURCE_PATH);
  const artifactPath = path.resolve(process.argv[3] ?? DEFAULT_ARTIFACT_PATH);
  await prepareBrowserEntry();
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      if (pathname === "/") {
        serveBytes(
          response,
          "<script type=\"module\" src=\"/entry.js\"></script>",
          "text/html; charset=utf-8",
        );
        return;
      }
      if (pathname === "/entry.js") {
        serveBytes(response, await readFile(ENTRY_PATH), "text/javascript; charset=utf-8");
        return;
      }
      if (pathname === "/source.rkyv") {
        response.writeHead(200, crossOriginHeaders("application/octet-stream"));
        createReadStream(sourcePath).pipe(response);
        return;
      }
      if (pathname === "/artifact.bin") {
        response.writeHead(200, crossOriginHeaders("application/octet-stream"));
        createReadStream(artifactPath).pipe(response);
        return;
      }
      response.writeHead(404);
      response.end();
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.stack ?? error.message : String(error));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Digest policy browser benchmark failed to bind a local port.");
  }

  try {
    const results: BrowserPolicyResult[] = [];
    for (const policy of POLICIES) {
      results.push(
        await runPolicy(`http://127.0.0.1:${address.port}/?policy=${policy}`, policy),
      );
    }
    console.log(JSON.stringify({
      runtime: "chromium",
      sourcePath,
      artifactPath,
      results,
    }, null, 2));
  } finally {
    server.close();
  }
}

async function prepareBrowserEntry(): Promise<void> {
  await rm(OUTPUT_DIRECTORY, { recursive: true, force: true });
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await build({
    entryPoints: [
      "test/benchmarks/binary-digest/benchmark-policy-browser-entry.ts",
    ],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    outfile: ENTRY_PATH,
    sourcemap: false,
  });
}

async function runPolicy(
  url: string,
  expectedPolicy: string,
): Promise<BrowserPolicyResult> {
  const browser = await chromium.launch({
    headless: true,
    args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"],
  });
  let peakProcessTreeRssBytes = await readProcessTreeRss(process.pid);
  const sampleTimer = setInterval(async () => {
    peakProcessTreeRssBytes = Math.max(
      peakProcessTreeRssBytes,
      await readProcessTreeRss(process.pid),
    );
  }, 20);
  try {
    const page = await browser.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    await page.goto(url);
    const handle = await page.waitForFunction(
      () => {
        const result = (window as unknown as {
          __digestPolicyBenchmark?: { readonly status: string };
        }).__digestPolicyBenchmark;
        return result?.status !== "pending" ? result : undefined;
      },
      undefined,
      { timeout: DEFAULT_TIMEOUT_MS },
    );
    const result = await handle.jsonValue() as
      | {
        readonly status: "ok";
        readonly policy: string;
        readonly elapsedMs: number;
        readonly parity: true;
      }
      | { readonly status: "error"; readonly error: string };
    if (result.status !== "ok") {
      throw new Error(`${expectedPolicy} browser digest failed: ${result.error}`);
    }
    if (result.policy !== expectedPolicy || !result.parity || pageErrors.length > 0) {
      throw new Error(
        `${expectedPolicy} browser digest returned an invalid result: `
        + `${JSON.stringify(result)} ${pageErrors.join("\n")}`,
      );
    }
    peakProcessTreeRssBytes = Math.max(
      peakProcessTreeRssBytes,
      await readProcessTreeRss(process.pid),
    );
    return { ...result, peakProcessTreeRssBytes };
  } finally {
    clearInterval(sampleTimer);
    await browser.close();
  }
}

async function readProcessTreeRss(rootPid: number): Promise<number> {
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

function serveBytes(
  response: ServerResponse,
  bytes: string | Uint8Array,
  contentType: string,
): void {
  response.writeHead(200, crossOriginHeaders(contentType));
  response.end(bytes);
}

function crossOriginHeaders(contentType: string): Record<string, string> {
  return {
    "content-type": contentType,
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-embedder-policy": "require-corp",
  };
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
