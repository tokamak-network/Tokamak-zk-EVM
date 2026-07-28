import { execFile } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { marked } from "marked";
import { chromium } from "playwright";

const execFileAsync = promisify(execFile);
const DOCUMENTS = ["README.md", "CONTRIBUTING.md"] as const;
const EXPECTED_UNPUBLISHED_NPM_URL =
  "https://www.npmjs.com/package/@tokamak-zk-evm/snark-browser-compat";

interface PackageFile {
  readonly path: string;
}

interface PackResult {
  readonly filename: string;
  readonly files: readonly PackageFile[];
}

interface PackageManifest {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly exports: Record<string, unknown>;
}

async function main(): Promise<void> {
  const sources = new Map<string, string>();
  for (const document of DOCUMENTS) {
    sources.set(document, await readFile(document, "utf8"));
  }

  for (const [document, source] of sources) {
    checkMarkdownStructure(document, source);
  }
  await checkLinks(sources);

  const readme = sources.get("README.md");
  if (readme === undefined) {
    throw new Error("README.md was not loaded.");
  }
  checkPublicApiReference(readme);
  checkQualifiedClaims(readme);
  await checkRenderedReadme(readme);
  await checkPackedPackage();

  console.log("Checked publication documentation, links, rendering, API coverage, and package boundary");
}

function checkMarkdownStructure(document: string, source: string): void {
  const headings = [...source.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((match) => ({
    depth: match[1].length,
    label: match[2].trim(),
  }));
  if (headings.length === 0 || headings[0].depth !== 1) {
    throw new Error(`${document} must begin its heading hierarchy with one H1.`);
  }
  if (headings.filter(({ depth }) => depth === 1).length !== 1) {
    throw new Error(`${document} must contain exactly one H1.`);
  }
  for (let index = 1; index < headings.length; index += 1) {
    if (headings[index].depth > headings[index - 1].depth + 1) {
      throw new Error(
        `${document} skips a heading level before "${headings[index].label}".`,
      );
    }
  }

  const fences = [...source.matchAll(/^```/gm)];
  if (fences.length % 2 !== 0) {
    throw new Error(`${document} contains an unclosed code fence.`);
  }

  const anchors = new Set<string>();
  for (const heading of headings) {
    const anchor = githubAnchor(heading.label);
    if (anchors.has(anchor)) {
      throw new Error(`${document} contains the duplicate heading anchor #${anchor}.`);
    }
    anchors.add(anchor);
  }

  for (const match of source.matchAll(/\[[^\]]+\]\(#([^)]+)\)/g)) {
    if (!anchors.has(match[1])) {
      throw new Error(`${document} links to missing anchor #${match[1]}.`);
    }
  }
}

async function checkLinks(sources: ReadonlyMap<string, string>): Promise<void> {
  const externalUrls = new Set<string>();
  for (const [document, source] of sources) {
    for (const match of source.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
      const label = match[1].trim();
      const target = match[2].trim();
      if (label.length === 0) {
        throw new Error(`${document} contains a link without a label.`);
      }
      if (target.startsWith("#")) {
        continue;
      }
      if (/^https?:\/\//.test(target)) {
        externalUrls.add(target);
        continue;
      }
      const localPath = target.split("#", 1)[0];
      if (localPath.length === 0) {
        continue;
      }
      const resolved = path.resolve(path.dirname(document), localPath);
      try {
        await stat(resolved);
      } catch {
        throw new Error(`${document} links to missing local file ${target}.`);
      }
    }
  }

  const failures: string[] = [];
  for (const url of externalUrls) {
    const status = await externalLinkStatus(url);
    if (
      status >= 400 &&
      !(url === EXPECTED_UNPUBLISHED_NPM_URL && status === 404) &&
      !(status === 404 && await isCurrentPackageMainLink(url))
    ) {
      failures.push(`${status} ${url}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`External link validation failed:\n${failures.join("\n")}`);
  }
}

async function externalLinkStatus(url: string): Promise<number> {
  const parsed = new URL(url);
  if (parsed.hostname === "www.npmjs.com" && parsed.pathname.startsWith("/package/")) {
    const packageName = decodeURIComponent(parsed.pathname.slice("/package/".length));
    return fetchStatus(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`);
  }
  return fetchStatus(url);
}

async function fetchStatus(url: string): Promise<number> {
  const response = await fetch(url, {
    headers: { "user-agent": "backend-wasm-publication-check/1.0" },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  await response.body?.cancel();
  return response.status;
}

async function isCurrentPackageMainLink(url: string): Promise<boolean> {
  const prefix =
    "https://github.com/tokamak-network/Tokamak-zk-EVM/";
  if (!url.startsWith(prefix)) {
    return false;
  }
  const repositoryPath = new URL(url).pathname;
  const match = repositoryPath.match(
    /^\/tokamak-network\/Tokamak-zk-EVM\/(?:blob|tree)\/main\/packages\/backend-wasm(?:\/(.*))?$/,
  );
  if (match === null) {
    return false;
  }
  const localPath = path.resolve(match[1] ?? ".");
  try {
    await stat(localPath);
    return true;
  } catch {
    return false;
  }
}

function checkPublicApiReference(readme: string): void {
  const reference = section(readme, "## Public API reference");
  const exactEntries = [
    "prover.install(options?)",
    "prover.prove(input)",
    "prover.begin(input)",
    "ProverSession.proveArithmetic()",
    "ProverSession.proveCopy()",
    "ProverSession.proveBinding()",
    "ProverSession.finalize()",
    "ProverSession.dispose()",
    "verifier.install()",
    "verifier.verify(input)",
    "preprocess.install(options?)",
    "preprocess.preprocess(input)",
    "convertWitness(value)",
    "convertPermutation(value)",
    "convertInstance(value)",
    "convertVerifierPreprocess(value)",
    "convertProof(input)",
    "convertCrs(bytes)",
    "inspectBinary(bytes, options?)",
    "validateBinary(bytes)",
  ] as const;
  for (const entry of exactEntries) {
    const count = countLiteral(reference, `\`${entry}\``);
    if (count !== 1) {
      throw new Error(`Public API reference must document ${entry} exactly once; found ${count}.`);
    }
  }

  const publicTypes = [
    "ProverInput",
    "ProverInstallOptions",
    "ProverInstallationInfo",
    "ProverSession",
    "VerifierInput",
    "VerifierInstallationInfo",
    "PreprocessInput",
    "PreprocessInstallOptions",
    "PreprocessInstallationInfo",
    "BinaryArtifactInspection",
    "BinaryInspectionOptions",
    "BinarySectionInspection",
    "ConvertedCrs",
    "ConverterArtifactJson",
    "ConvertProofBinaryInput",
    "ConvertProofInput",
    "ConvertProofJsonInput",
    "RuntimeArtifactFileValidationResult",
    "BackendWasmError",
    "BackendWasmErrorCode",
  ] as const;
  for (const type of publicTypes) {
    if (!reference.includes(`\`${type}\``)) {
      throw new Error(`Public API reference does not document ${type}.`);
    }
  }

  const workflows = readme.slice(reference.length);
  for (const entry of ["install(", "preprocess(", "verify(", "prove(", "begin(", "convert", "inspectBinary(", "validateBinary("]) {
    if (!workflows.includes(entry)) {
      throw new Error(`README workflows do not use or select ${entry}.`);
    }
  }
}

function checkQualifiedClaims(readme: string): void {
  const normalized = readme.replace(/\s+/g, " ");
  const requiredStatements = [
    "Firefox or Safari | Not yet verified",
    "Webpack consumer build | Requires compatible ESM/Worker asset handling; not yet verified",
    "not minimum requirements",
    "does not authenticate the producer",
    "does not silently fall back",
    "This information is not legal advice.",
  ] as const;
  for (const statement of requiredStatements) {
    if (!normalized.includes(statement)) {
      throw new Error(`README is missing required qualification: ${statement}`);
    }
  }
}

async function checkRenderedReadme(readme: string): Promise<void> {
  const html = await marked.parse(readme, { gfm: true });
  const renderedDocument = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      body { color: #1f2328; font: 16px/1.5 system-ui, sans-serif; margin: 0 auto; max-width: 980px; padding: 24px; }
      img { max-width: 100%; }
      pre, table { display: block; max-width: 100%; overflow-x: auto; }
      code { overflow-wrap: anywhere; }
      table { border-collapse: collapse; }
      td, th { border: 1px solid #d0d7de; padding: 6px 13px; text-align: left; }
    </style>
  </head>
  <body>${html}</body>
</html>`;

  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setContent(renderedDocument);
      const result = await page.evaluate(() => ({
        h1: document.querySelectorAll("h1").length,
        tables: document.querySelectorAll("table").length,
        codeBlocks: document.querySelectorAll("pre").length,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      }));
      if (result.h1 !== 1 || result.tables === 0 || result.codeBlocks === 0 || result.overflow) {
        throw new Error(`README render check failed at ${width}px: ${JSON.stringify(result)}.`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

async function checkPackedPackage(): Promise<void> {
  const temporaryDirectory = await realpath(
    await mkdtemp(path.join(tmpdir(), "backend-wasm-publication-check-")),
  );
  try {
    const { stdout } = await execFileAsync(
      "npm",
      ["pack", "--ignore-scripts", "--json", "--pack-destination", temporaryDirectory],
      { cwd: process.cwd(), maxBuffer: 8 * 1024 * 1024 },
    );
    const results = JSON.parse(stdout) as readonly PackResult[];
    if (results.length !== 1) {
      throw new Error(`Expected one npm package, received ${results.length}.`);
    }
    const result = results[0];
    const files = new Set(result.files.map((file) => file.path));
    const required = [
      "package.json",
      "README.md",
      "CONTRIBUTING.md",
      "LICENSE-MIT",
      "LICENSE-APACHE",
      "THIRD_PARTY_NOTICES.md",
      "dist/prover/index.js",
      "dist/prover/index.d.ts",
      "dist/preprocess/index.js",
      "dist/preprocess/index.d.ts",
      "dist/verifier/index.js",
      "dist/verifier/index.d.ts",
      "dist/converter/index.js",
      "dist/converter/index.d.ts",
      "dist/converter/worker/crs-converter-worker.js",
      "dist/converter/worker/backend_wasm_rkyv_decoder_bg.wasm",
      "dist/verifier/generated/sigma-verify.generated.js",
      "examples/browser/src/main.ts",
    ] as const;
    for (const file of required) {
      if (!files.has(file)) {
        throw new Error(`Packed package is missing ${file}.`);
      }
    }

    const excludedPrefixes = [
      "test/",
      "scripts/",
      "fixtures/",
      "tools/",
      "tmp/",
      "docs/",
      "node_modules/",
    ] as const;
    for (const file of files) {
      const prefix = excludedPrefixes.find((candidate) => file.startsWith(candidate));
      if (prefix !== undefined) {
        throw new Error(`Packed package unexpectedly contains ${file}.`);
      }
    }

    const archive = path.join(temporaryDirectory, result.filename);
    const { stdout: manifestSource } = await execFileAsync(
      "tar",
      ["-xOf", archive, "package/package.json"],
      { maxBuffer: 1024 * 1024 },
    );
    const manifest = JSON.parse(manifestSource) as PackageManifest;
    if (
      manifest.name !== "@tokamak-zk-evm/snark-browser-compat" ||
      manifest.version !== "2.1.3" ||
      manifest.license !== "MIT OR Apache-2.0"
    ) {
      throw new Error(`Packed package metadata is inconsistent: ${manifestSource}`);
    }
    const exports = Object.keys(manifest.exports).sort();
    const expectedExports = ["./converter", "./preprocess", "./prover", "./verifier"];
    if (JSON.stringify(exports) !== JSON.stringify(expectedExports)) {
      throw new Error(`Packed public exports changed: ${exports.join(", ")}.`);
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function section(source: string, heading: string): string {
  const start = source.indexOf(heading);
  if (start < 0) {
    throw new Error(`README is missing ${heading}.`);
  }
  const rest = source.slice(start + heading.length);
  const end = rest.search(/^##\s+/m);
  return end < 0 ? source.slice(start) : source.slice(start, start + heading.length + end);
}

function countLiteral(source: string, value: string): number {
  return source.split(value).length - 1;
}

function githubAnchor(label: string): string {
  return label
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

const entrypoint = fileURLToPath(import.meta.url);

if (process.argv[1] === entrypoint) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
