import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  convertInstance,
  convertPermutation,
  convertProof,
  convertVerifierPreprocess,
  convertWitness,
} from "../../src/converter/index.js";
import {
  convertCombinedSigmaRkyvToProverCrsBinary,
  createCombinedSigmaRkyvPayloadDecoder,
} from "../../src/converter/conversion/rkyv-to-binary.js";
import { BACKEND_WASM_PACKAGE_VERSION } from "../../src/version.js";
import { loadCombinedSigmaPayloadDecoder } from "../../tools/rkyv-decoder-wasm/src/node.js";

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
  const payloadDecoder = await loadCombinedSigmaPayloadDecoder();
  const instance = await readJson(path.join(sourceRoot, "synthesizer", "instance.json"));
  const outputs: Readonly<Record<string, Uint8Array>> = {
    "witness.bin": await convertWitness(
      await readJson(path.join(sourceRoot, "synthesizer", "placementVariables.json")),
    ),
    "permutation.bin": await convertPermutation(
      await readJson(path.join(sourceRoot, "synthesizer", "permutation.json")),
    ),
    "instance.bin": await convertInstance(instance),
    "prover-crs.bin": await convertCombinedSigmaRkyvToProverCrsBinary(
      await readBinary(path.join(sourceRoot, "setup", "combined_sigma.rkyv")),
      {
        sourcePackageVersion: BACKEND_WASM_PACKAGE_VERSION,
        decoder: createCombinedSigmaRkyvPayloadDecoder(payloadDecoder.decodeCombinedSigmaPayload),
      },
    ),
    "proof.bin": await convertProof({
      sourceFormat: "json",
      proof: await readJson(path.join(sourceRoot, "prove", "proof.json")),
    }),
    "verifier-preprocess.bin": await convertVerifierPreprocess(
      await readJson(path.join(sourceRoot, "preprocess", "preprocess.json")),
    ),
  };

  await rm(runtimeRoot, { recursive: true, force: true });
  await mkdir(runtimeRoot, { recursive: true });
  await Promise.all(Object.entries(outputs).map(([fileName, bytes]) =>
    writeFile(path.join(runtimeRoot, fileName), bytes),
  ));
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
  const allowedRoot = path.resolve(backendWasmRoot, "tmp", "fixtures");

  if (!isPathInside(workDirectoryPath, allowedRoot)) {
    throw new Error(`Copy manifest workDirectory must stay under packages/backend-wasm/tmp/fixtures: ${workDirectory}`);
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

async function readBinary(filePath: string): Promise<Uint8Array> {
  try {
    return new Uint8Array(await readFile(filePath));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read copied fixture source ${filePath}: ${message}`);
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
