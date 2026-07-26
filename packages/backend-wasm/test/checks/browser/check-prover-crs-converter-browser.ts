import { createServer, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const TEST_PAGE = `<!doctype html>
<html lang="en">
  <body>
    <script type="module">
      import { convertProverCrs } from "/dist/converter/conversion/prover-crs-converter.js";

      const input = new Uint8Array([1, 2, 3, 4]);
      try {
        await convertProverCrs(input);
        window.__converterResult = { status: "unexpected-success" };
      } catch (error) {
        window.__converterResult = {
          status: "ok",
          detached: input.byteLength === 0 && input.buffer.byteLength === 0,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    </script>
  </body>
</html>`;

interface ConverterResult {
  readonly status: "ok" | "unexpected-success";
  readonly detached?: boolean;
  readonly message?: string;
}

async function main(): Promise<void> {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(TEST_PAGE);
        return;
      }

      if (!url.pathname.startsWith("/dist/")) {
        response.writeHead(404);
        response.end();
        return;
      }

      await serveDistFile(response, url.pathname.slice(1));
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.stack ?? error.message : String(error));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Converter browser check failed to bind a local HTTP port.");
  }

  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/`);
    const result = await page.waitForFunction(
      () => (window as unknown as { __converterResult?: ConverterResult }).__converterResult,
    );
    const value = await result.jsonValue() as ConverterResult;

    if (value.status !== "ok") {
      throw new Error("Invalid rkyv input unexpectedly converted successfully.");
    }
    if (value.detached !== true) {
      throw new Error("convertProverCrs did not transfer and detach its input buffer.");
    }
    if (!value.message?.includes("invalid archive shape")) {
      throw new Error(`Unexpected decoder failure: ${value.message ?? "missing error message"}.`);
    }
  } finally {
    await browser?.close();
    server.close();
  }

  console.log("Checked browser Prover CRS Worker loading, input transfer, and decoder errors");
}

async function serveDistFile(response: ServerResponse, filePath: string): Promise<void> {
  const bytes = await readFile(path.resolve(filePath));
  response.writeHead(200, {
    "content-type": contentTypeFor(filePath),
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-embedder-policy": "require-corp",
  });
  response.end(bytes);
}

function contentTypeFor(filePath: string): string {
  if (filePath.endsWith(".wasm")) {
    return "application/wasm";
  }
  if (filePath.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }
  return "application/octet-stream";
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`Browser Prover CRS converter check failed: ${message}`);
  process.exitCode = 1;
});
