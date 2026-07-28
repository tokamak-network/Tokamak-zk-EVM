import { readFile, rm } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { chromium } from "playwright";

const OUTPUT_DIR = "tmp/browser/preprocess";
const BUNDLE_PATH = path.join(OUTPUT_DIR, "preprocess-entry.js");
const TIMEOUT_MS = 300_000;

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
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

  const server = createServer(handleRequest);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Browser preprocess check failed to bind a local HTTP port.");
  }

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

    await page.goto(`http://127.0.0.1:${address.port}/browser/preprocess.html?mode=${mode}`, {
      waitUntil: "networkidle",
    });
    const result = await page.waitForFunction(() => {
      const value = window.__tokamakPreprocessResult;
      return value?.status !== "pending" ? value : undefined;
    }, undefined, { timeout: TIMEOUT_MS });
    const value = await result.jsonValue() as BrowserPreprocessResult;

    if (
      value.status !== "ok"
      || value.mode !== mode
      || value.nativeParity !== true
      || value.verifierAccepted !== true
    ) {
      throw new Error(`Browser preprocess failed: ${value.error ?? JSON.stringify(value)}.`);
    }
    if (errors.length > 0) {
      throw new Error(`Browser preprocess emitted console/page errors:\n${errors.join("\n")}`);
    }

    console.log(JSON.stringify({
      mode,
      nativeParity: value.nativeParity,
      verifierAccepted: value.verifierAccepted,
      preprocessMs: value.preprocessMs,
    }));
  } finally {
    await browser?.close();
    server.close();
  }

  console.log("Checked preprocess native parity and verifier acceptance in Chromium");
}

interface BrowserPreprocessResult {
  readonly status: "pending" | "ok" | "error";
  readonly mode?: BrowserPreprocessMode;
  readonly nativeParity?: boolean;
  readonly verifierAccepted?: boolean;
  readonly preprocessMs?: number;
  readonly error?: string;
}

type BrowserPreprocessMode =
  | "production"
  | "legacy-baseline"
  | "selected-candidate";

function parseMode(argv: readonly string[]): BrowserPreprocessMode {
  if (argv.length === 0) {
    return "production";
  }
  if (argv.length === 2 && argv[0] === "--mode") {
    const mode = argv[1];
    if (
      mode === "production"
      || mode === "legacy-baseline"
      || mode === "selected-candidate"
    ) {
      return mode;
    }
  }
  throw new Error(
    "Usage: check-preprocess-browser [--mode <production|legacy-baseline|selected-candidate>]",
  );
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === "/browser/preprocess.html") {
      await serveFile(response, "test/browser/preprocess.html", "text/html; charset=utf-8");
      return;
    }
    if (pathname === "/browser/preprocess-entry.js") {
      await serveFile(response, BUNDLE_PATH, "text/javascript; charset=utf-8");
      return;
    }
    if (pathname.startsWith("/fixtures/")) {
      await serveFile(response, pathname.slice(1), "application/octet-stream");
      return;
    }

    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.stack ?? error.message : String(error));
  }
}

async function serveFile(
  response: ServerResponse,
  filePath: string,
  contentType: string,
): Promise<void> {
  const bytes = await readFile(filePath);
  response.writeHead(200, {
    "content-type": contentType,
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-embedder-policy": "require-corp",
  });
  response.end(bytes);
}

const entrypoint = fileURLToPath(import.meta.url);

if (process.argv[1] === entrypoint) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Browser preprocess check failed: ${message}`);
    process.exitCode = 1;
  });
}
