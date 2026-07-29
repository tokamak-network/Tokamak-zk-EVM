import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { chromium } from "playwright";
import { startIsolatedFileServer } from "../../support/browser/static-file-server.js";

const OUTPUT_DIR = "tmp/browser/preprocess";
const BUNDLE_PATH = path.join(OUTPUT_DIR, "preprocess-entry.js");
const TIMEOUT_MS = 300_000;

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const { chunkSizeExponent } = options;
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await build({
    entryPoints: ["test/browser/preprocess-entry.ts"],
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
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });

    const searchParams = new URLSearchParams();
    if (chunkSizeExponent !== undefined) {
      searchParams.set("chunkSizeExponent", String(chunkSizeExponent));
    }
    await page.goto(`${server.origin}/browser/preprocess.html?${searchParams}`, {
      waitUntil: "networkidle",
    });
    const result = await page.waitForFunction(() => {
      const value = window.__tokamakPreprocessResult;
      return value?.status !== "pending" ? value : undefined;
    }, undefined, { timeout: TIMEOUT_MS });
    const value = await result.jsonValue() as BrowserPreprocessResult;

    if (
      value.status !== "ok"
      || value.nativeParity !== true
      || value.verifierAccepted !== true
      || value.chunkSizeExponent !== chunkSizeExponent
    ) {
      throw new Error(`Browser preprocess failed: ${value.error ?? JSON.stringify(value)}.`);
    }
    if (errors.length > 0) {
      throw new Error(`Browser preprocess emitted console/page errors:\n${errors.join("\n")}`);
    }

    console.log(JSON.stringify({
      nativeParity: value.nativeParity,
      verifierAccepted: value.verifierAccepted,
      preprocessMs: value.preprocessMs,
      chunkSizeExponent,
    }));
  } finally {
    await browser?.close();
    await server.close();
  }

  console.log("Checked preprocess native parity and verifier acceptance in Chromium");
}

interface BrowserPreprocessResult {
  readonly status: "pending" | "ok" | "error";
  readonly nativeParity?: boolean;
  readonly verifierAccepted?: boolean;
  readonly preprocessMs?: number;
  readonly chunkSizeExponent?: number;
  readonly error?: string;
}

interface BrowserPreprocessOptions {
  readonly chunkSizeExponent?: number;
}

function parseOptions(argv: readonly string[]): BrowserPreprocessOptions {
  if (argv.length === 0) {
    return {};
  }
  if (
    argv.length === 2
    && argv[0] === "--chunk-size-exponent"
  ) {
    const chunkSizeExponent = Number(argv[1]);
    if (
      Number.isInteger(chunkSizeExponent)
      && chunkSizeExponent >= 10
      && chunkSizeExponent <= 19
    ) {
      return { chunkSizeExponent };
    }
  }
  throw new Error(
    "Usage: check-preprocess-browser [--chunk-size-exponent <10..19>]",
  );
}

function resolveFile(pathname: string): string | undefined {
  if (pathname === "/browser/preprocess.html") {
    return "test/browser/preprocess.html";
  }
  if (pathname === "/browser/preprocess-entry.js") {
    return BUNDLE_PATH;
  }
  return pathname.startsWith("/fixtures/") ? pathname.slice(1) : undefined;
}

const entrypoint = fileURLToPath(import.meta.url);

if (process.argv[1] === entrypoint) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Browser preprocess check failed: ${message}`);
    process.exitCode = 1;
  });
}
