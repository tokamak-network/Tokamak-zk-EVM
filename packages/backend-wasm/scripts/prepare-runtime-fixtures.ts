import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { convertNativeVerifierJsonToBinary, type RuntimeArtifactBundleSetOutput } from "../src/index.js";

interface CopyManifest {
  readonly schemaVersion: 2;
  readonly suite: string;
  readonly workDirectory: string;
}

async function main(argv: readonly string[]): Promise<void> {
  if (argv.length !== 1) {
    throw new Error("Usage: prepare-runtime-fixtures <copy-manifest.json>");
  }

  const manifestPath = path.resolve(argv[0]);
  const manifestDirectory = path.dirname(manifestPath);
  const backendWasmRoot = path.resolve(manifestDirectory, "../..");
  const repositoryRoot = path.resolve(backendWasmRoot, "../..");
  const manifest = parseCopyManifest(JSON.parse(await readFile(manifestPath, "utf8")) as unknown);
  const sourceRoot = resolveWorkDirectory(repositoryRoot, backendWasmRoot, manifest.workDirectory);
  const runtimeRoot = path.join(backendWasmRoot, "fixtures", manifest.suite, "runtime");
  const rootPackageVersion = await readRootPackageVersion(repositoryRoot);

  const verifierOutput = await convertNativeVerifierJsonToBinary({
    sourcePackageVersion: rootPackageVersion,
    useGeneratedSetupParams: true,
    proof: await readJson(path.join(sourceRoot, "prove", "proof.json")),
    preprocess: await readJson(path.join(sourceRoot, "preprocess", "preprocess.json")),
    instance: await readJson(path.join(sourceRoot, "synthesizer", "instance.json")),
  });

  await writeRuntimeBundles(runtimeRoot, verifierOutput);
}

function parseCopyManifest(raw: unknown): CopyManifest {
  if (!isRecord(raw)) {
    throw new Error("Copy manifest must be a JSON object.");
  }

  if (raw.schemaVersion !== 2) {
    throw new Error("Copy manifest schemaVersion must be 2.");
  }

  if (typeof raw.suite !== "string" || raw.suite.trim() === "") {
    throw new Error("Copy manifest suite must be a non-empty string.");
  }

  if (typeof raw.workDirectory !== "string" || raw.workDirectory.trim() === "" || path.isAbsolute(raw.workDirectory)) {
    throw new Error("Copy manifest workDirectory must be a non-empty relative path.");
  }

  return {
    schemaVersion: 2,
    suite: raw.suite,
    workDirectory: path.normalize(raw.workDirectory),
  };
}

function resolveWorkDirectory(repositoryRoot: string, backendWasmRoot: string, workDirectory: string): string {
  const workDirectoryPath = path.resolve(repositoryRoot, workDirectory);
  const allowedRoot = path.resolve(backendWasmRoot, "tmp", "fixture-work");

  if (!isPathInside(workDirectoryPath, allowedRoot)) {
    throw new Error(`Copy manifest workDirectory must stay under packages/backend-wasm/tmp/fixture-work: ${workDirectory}`);
  }

  return workDirectoryPath;
}

async function readJson(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read copied fixture source ${filePath}: ${message}`);
  }
}

async function readRootPackageVersion(repositoryRoot: string): Promise<string> {
  const packageJson = await readJson(path.join(repositoryRoot, "package.json"));

  if (!isRecord(packageJson) || typeof packageJson.version !== "string" || packageJson.version.trim() === "") {
    throw new Error("Repository root package.json must define a non-empty version.");
  }

  return packageJson.version;
}

async function writeRuntimeBundles(runtimeRoot: string, output: RuntimeArtifactBundleSetOutput): Promise<void> {
  await rm(runtimeRoot, { recursive: true, force: true });

  for (const bundle of output.bundles) {
    const bundleRoot = path.join(runtimeRoot, runtimeBundleDirectory(bundle.manifest.kind));

    await mkdir(bundleRoot, { recursive: true });
    await writeFile(path.join(bundleRoot, "manifest.json"), `${JSON.stringify(bundle.manifest, null, 2)}\n`);

    for (const file of bundle.files) {
      const targetPath = path.join(runtimeRoot, file.path);

      if (!isPathInside(targetPath, runtimeRoot)) {
        throw new Error(`Runtime fixture output path escapes runtime root: ${file.path}`);
      }

      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, file.bytes);
    }
  }
}

function runtimeBundleDirectory(kind: string): string {
  switch (kind) {
    case "VerifierProofInput":
      return "verifier-proof-input";
    case "VerifierSetupInput":
      return "verifier-setup-input";
    default:
      throw new Error(`Unsupported runtime fixture bundle kind: ${kind}`);
  }
}

function isPathInside(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const entrypoint = fileURLToPath(import.meta.url);

if (process.argv[1] === entrypoint) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Runtime fixture preparation failed: ${message}`);
    process.exitCode = 1;
  });
}
