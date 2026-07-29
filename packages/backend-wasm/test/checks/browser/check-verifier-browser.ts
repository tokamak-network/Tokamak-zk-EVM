import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { chromium } from "playwright";
import { startIsolatedFileServer } from "../../support/browser/static-file-server.js";

const OUTPUT_DIR = "tmp/browser/verifier";
const BUNDLE_PATH = path.join(OUTPUT_DIR, "verifier-entry.js");

async function main(): Promise<void> {
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await build({
    entryPoints: ["test/browser/verifier-entry.ts"],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    outfile: BUNDLE_PATH,
    sourcemap: false,
  });

  const server = await startIsolatedFileServer(resolveFile);

  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const unsupportedResponse = await fetch(`${server.origin}/unsupported`);
    if (unsupportedResponse.status !== 404) {
      throw new Error(`Static server returned ${unsupportedResponse.status} for an unsupported path.`);
    }
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });

    await page.goto(`${server.origin}/browser/verifier.html`, {
      waitUntil: "networkidle",
    });
    const result = await page.waitForFunction(() => {
      return window.__tokamakVerifierResult?.status !== "pending" ? window.__tokamakVerifierResult : undefined;
    }, undefined, { timeout: 120_000 });
    const value = await result.jsonValue() as BrowserVerifierResult;

    if (value.status !== "ok" || value.valid !== true) {
      throw new Error(`Browser verifier failed: ${value.error ?? JSON.stringify(value)}.`);
    }

    if (errors.length > 0) {
      throw new Error(`Browser verifier emitted console/page errors:\n${errors.join("\n")}`);
    }
  } finally {
    await browser?.close();
    await server.close();
  }

  console.log("Checked verifier named binary input path in Chromium");
}

interface BrowserVerifierResult {
  readonly status: "pending" | "ok" | "error";
  readonly valid?: boolean;
  readonly error?: string;
}

function resolveFile(pathname: string): string | undefined {
  if (pathname === "/browser/verifier.html") {
    return "test/browser/verifier.html";
  }
  if (pathname === "/browser/verifier-entry.js") {
    return BUNDLE_PATH;
  }
  return pathname.startsWith("/fixtures/") ? pathname.slice(1) : undefined;
}

const entrypoint = fileURLToPath(import.meta.url);

if (process.argv[1] === entrypoint) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Browser verifier check failed: ${message}`);
    process.exitCode = 1;
  });
}
