import { createReadStream } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { build } from "esbuild";
import { chromium } from "playwright";

const OUTPUT_DIR = "tmp/benchmarks/binary-digest";
const BUNDLE_PATH = path.join(OUTPUT_DIR, "browser-entry.js");
const DEFAULT_ARTIFACT_PATH = "fixtures/small/runtime/prover-crs.bin";
const DEFAULT_TIMEOUT_MS = 1_800_000;

async function main(): Promise<void> {
  const artifactPath = process.argv[2] ?? DEFAULT_ARTIFACT_PATH;
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await build({
    entryPoints: ["test/benchmarks/binary-digest/benchmark-browser-entry.ts"],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    outfile: BUNDLE_PATH,
    sourcemap: false,
  });

  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      if (pathname === "/") {
        await serveBytes(response, "<script type=\"module\" src=\"/entry.js\"></script>", "text/html; charset=utf-8");
        return;
      }
      if (pathname === "/entry.js") {
        await serveBytes(response, await readFile(BUNDLE_PATH), "text/javascript; charset=utf-8");
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
    throw new Error("Binary digest browser benchmark failed to bind a local port.");
  }

  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"],
    });
    const page = await browser.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    await page.goto(`http://127.0.0.1:${address.port}/`);
    const handle = await page.waitForFunction(
      () => window.__binaryDigestBenchmark?.status !== "pending"
        ? window.__binaryDigestBenchmark
        : undefined,
      undefined,
      { timeout: DEFAULT_TIMEOUT_MS },
    );
    const result = await handle.jsonValue();
    if (
      typeof result !== "object"
      || result === null
      || !("status" in result)
      || result.status !== "ok"
    ) {
      throw new Error(`Browser digest benchmark failed: ${JSON.stringify(result)}.`);
    }
    if (pageErrors.length > 0) {
      throw new Error(`Browser digest benchmark emitted page errors:\n${pageErrors.join("\n")}`);
    }
    console.log(JSON.stringify({ runtime: "chromium", artifactPath, ...result }, null, 2));
  } finally {
    await browser?.close();
    server.close();
  }
}

async function serveBytes(
  response: ServerResponse,
  bytes: string | Uint8Array,
  contentType: string,
): Promise<void> {
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
