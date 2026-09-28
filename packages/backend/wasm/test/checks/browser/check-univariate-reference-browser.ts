import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { build } from "esbuild";
import { chromium } from "playwright";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { startIsolatedFileServer } from "../../support/browser/static-file-server.js";
import { convertInstance, convertWitness, convertSelector, convertPermutation } from "../../../src/converter/index.js";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
const run = path.resolve(process.argv[2]!);
const output = path.join(run, "browser");
await mkdir(output, { recursive: true });
const fixture = path.join(run, "inputs/synthesizer");
for(const [name, convert] of [["instance", convertInstance], ["placementVariables", convertWitness], ["selector", convertSelector], ["permutation", convertPermutation]] as const) {
  const value = JSON.parse(await readFile(path.join(fixture, name + ".json"), "utf8"));
  await writeFile(path.join(output, (name === "placementVariables" ? "witness" : name) + ".bin"), await convert(value));
}
await (await createCurveRuntime()).terminate();
const bundle = path.join(output, "entry.js");
await build({ entryPoints: ["test/browser/univariate-reference-entry.ts"], bundle: true, minify: true, format: "esm", platform: "browser", target: "es2022", outfile: bundle });
const server = await startIsolatedFileServer(url => {
  if(url === "/browser/reference.html")
    return "test/browser/prover.html";
  if(url === "/browser/prover-entry.js")
    return bundle;
  if(url === "/p8/native-proof.bin")
    return path.join(run, "prove/univariate_proof.bin");
  if(url === "/p8/native-preprocess.bin")
    return path.join(run, "preprocess/univariate_verifier_preprocess.bin");
  if(/^\/p8\/(instance|witness|selector|permutation)\.bin$/.test(url))
    return path.join(output, url.slice(4));
  if(url.startsWith("/p8/crs/") && !url.split("/").includes(".."))
    return path.join(run, "chunks", url.slice(8));
  return undefined;
});
console.log("Browser harness:", server.origin + "/browser/reference.html");
if(process.argv.includes("--serve"))
  await new Promise(() => { });
else {
  const browser = await chromium.launch({ headless: true });
  const cdp = await browser.newBrowserCDPSession();
  const exec = promisify(execFile);
  let sampling = true, peakProcessRssBytes = 0;
  const samples = (async () => {
    while(sampling) {
      const { processInfo } = await cdp.send("SystemInfo.getProcessInfo");
      const ids = processInfo.map(process => process.id).join(",");
      const { stdout } = await exec("ps", ["-o", "rss=", "-p", ids]);
      const bytes = stdout.trim().split(/\s+/).reduce((total, rss) => total + Number(rss) * 1024, 0);
      peakProcessRssBytes = Math.max(peakProcessRssBytes, bytes);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  })();
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.stack ?? e.message));
    await page.goto(server.origin + "/browser/reference.html");
    const handle = await page.waitForFunction(() => window.__tokamakUnivariateReferenceResult?.status !== "pending" ? window.__tokamakUnivariateReferenceResult : undefined, undefined, { timeout: 1800000 });
    const result = await handle.jsonValue() as {
      status: string;
      valid?: boolean;
      proof?: number[];
      preprocess?: number[];
      error?: string;
      timings?: unknown;
    };
    assert.equal(result.status, "ok", result.error);
    assert.equal(result.valid, true);
    assert.deepEqual(errors, []);
    await writeFile(path.join(output, "univariate_proof.bin"), Uint8Array.from(result.proof!));
    await writeFile(path.join(output, "univariate_verifier_preprocess.bin"), Uint8Array.from(result.preprocess!));
    sampling = false;
    await samples;
    const memory = { peakProcessRssBytes, method: "Maximum sampled sum of Chromium process RSS, one-second interval; not an exact peak." };
    await writeFile(path.join(output, "result.json"), JSON.stringify({ browser: browser.version(), memory, ...result }, null, 2) + "\n");
    console.log(JSON.stringify({ browser: browser.version(), timings: result.timings, memory }));
  }
  finally {
    sampling = false;
    await samples;
    await browser.close();
    await server.close();
  }
}
