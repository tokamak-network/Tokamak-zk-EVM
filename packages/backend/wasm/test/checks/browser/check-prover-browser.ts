import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { chromium } from "playwright";
import { startIsolatedFileServer } from "../../support/browser/static-file-server.js";

const OUTPUT_DIR = "tmp/browser/prover";
const BUNDLE_PATH = path.join(OUTPUT_DIR, "prover-entry.js");
const DEFAULT_TIMEOUT_MS = 1_800_000;

interface BrowserProverResult {
  readonly status: "pending" | "ok" | "error";
  readonly valid?: boolean;
  readonly proofBytes?: number;
  readonly timings?: readonly { readonly label: string; readonly ms: number }[];
  readonly error?: string;
}

async function main(): Promise<void> {
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await build({
    entryPoints: ["test/browser/prover-entry.ts"],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    outfile: BUNDLE_PATH,
  });
  const server = await startIsolatedFileServer(resolveFile);
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.stack ?? error.message));
    page.on("console", message => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(`${server.origin}/browser/prover.html`, { waitUntil: "networkidle" });
    const handle = await page.waitForFunction(
      () => window.__tokamakProverResult?.status !== "pending" ? window.__tokamakProverResult : undefined,
      undefined,
      { timeout: parseTimeoutMs(process.env.BACKEND_WASM_BROWSER_PROVER_TIMEOUT_MS) },
    );
    const result = await handle.jsonValue() as BrowserProverResult;
    if (result.status !== "ok" || result.valid !== true) {
      throw new Error(`Browser workflow failed: ${result.error ?? JSON.stringify(result)}.`);
    }
    if (errors.length > 0) throw new Error(`Browser workflow emitted errors:\n${errors.join("\n")}`);
    for (const timing of result.timings ?? []) console.log(`${timing.label}: ${timing.ms.toFixed(2)} ms`);
    const resultPath = process.env.BACKEND_WASM_BROWSER_RESULT_PATH?.trim();
    if (resultPath) {
      await writeFile(path.resolve(resultPath), `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        browserVersion: browser.version(),
        result,
      }, null, 2)}\n`);
    }
  } finally {
    await browser?.close();
    await server.close();
  }
  console.log("Checked direct univariate preprocess -> prove -> verify workflow in Chromium");
}

function resolveFile(pathname: string): string | undefined {
  if (pathname === "/browser/prover.html") return "test/browser/prover.html";
  if (pathname === "/browser/prover-entry.js") return BUNDLE_PATH;
  return pathname.startsWith("/fixtures/") ? pathname.slice(1) : undefined;
}

function parseTimeoutMs(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_TIMEOUT_MS;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`BACKEND_WASM_BROWSER_PROVER_TIMEOUT_MS must be a positive integer: ${raw}`);
  }
  return value;
}

const entrypoint = fileURLToPath(import.meta.url);
if (process.argv[1] === entrypoint) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
