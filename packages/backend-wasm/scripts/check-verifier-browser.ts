import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { chromium } from "playwright";

const OUTPUT_DIR = "tmp/browser-verifier-check";
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

  const server = createServer(handleRequest);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Browser verifier check failed to bind a local HTTP port.");
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

    await page.goto(`http://127.0.0.1:${address.port}/browser/verifier.html`, { waitUntil: "networkidle" });
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
    server.close();
  }

  console.log("Checked verifier binary bundle path in Chromium");
}

interface BrowserVerifierResult {
  readonly status: "pending" | "ok" | "error";
  readonly valid?: boolean;
  readonly error?: string;
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === "/browser/verifier.html") {
      await serveFile(response, "test/browser/verifier.html", "text/html; charset=utf-8");
      return;
    }

    if (pathname === "/browser/verifier-entry.js") {
      await serveFile(response, BUNDLE_PATH, "text/javascript; charset=utf-8");
      return;
    }

    if (pathname.startsWith("/fixtures/")) {
      await serveFile(response, pathname.slice(1), contentTypeFor(pathname));
      return;
    }

    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.stack ?? error.message : String(error));
  }
}

async function serveFile(response: ServerResponse, filePath: string, contentType: string): Promise<void> {
  const bytes = await readFile(filePath);
  response.writeHead(200, {
    "content-type": contentType,
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-embedder-policy": "require-corp",
  });
  response.end(bytes);
}

function contentTypeFor(pathname: string): string {
  if (pathname.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }

  if (pathname.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }

  return "application/octet-stream";
}

const entrypoint = fileURLToPath(import.meta.url);

if (process.argv[1] === entrypoint) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Browser verifier check failed: ${message}`);
    process.exitCode = 1;
  });
}
