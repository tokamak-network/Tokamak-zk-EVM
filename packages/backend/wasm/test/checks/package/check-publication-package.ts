import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { BACKEND_WASM_PACKAGE_VERSION } from "../../../src/version.js";
import {
  parseSubcircuitLibraryOrigin,
  type SubcircuitLibraryOrigin,
} from "../../../src/generated/crs-provenance-validator.generated.js";

const execFileAsync = promisify(execFile);
const PACKAGE_NAME = "@tokamak-zk-evm/snark-browser-compat";
const SUBCIRCUIT_LIBRARY_PACKAGE_NAME = "@tokamak-zk-evm/subcircuit-library";
const REQUIRED_FILES = [
  "dist/generated/active/setup.generated.js",
  "dist/generated/active/setup.generated.d.ts",
  "dist/prover/generated/active/subcircuit-library.generated.js",
  "dist/prover/generated/active/subcircuit-library.generated.d.ts",
] as const;
const EXPECTED_EXPORTS = ["./converter", "./preprocess", "./prover", "./verifier"];

interface PackedFile {
  readonly path: string;
}

interface PackResult {
  readonly filename: string;
  readonly files: readonly PackedFile[];
}

interface PackageManifest {
  readonly name: string;
  readonly version: string;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly exports: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

async function main(): Promise<void> {
  const expectedOrigin = parseExpectedOrigin(process.argv.slice(2));
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "backend-wasm-publication-check-"),
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
    const files = new Set(result.files.map(({ path: filePath }) => filePath));
    for (const file of REQUIRED_FILES) {
      if (!files.has(file)) {
        throw new Error(`Packed package is missing ${file}.`);
      }
    }

    const archivePath = path.join(temporaryDirectory, result.filename);
    const manifest = await readPackedJson<PackageManifest>(archivePath, "package/package.json");
    checkManifest(manifest, files);

    const setupSource = await readPackedFile(
      archivePath,
      "package/dist/generated/active/setup.generated.js",
    );
    checkProductionInputs(setupSource, manifest, expectedOrigin);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }

  console.log("Checked packed package exports and production subcircuit-library identity");
}

function checkManifest(manifest: PackageManifest, files: ReadonlySet<string>): void {
  if (
    manifest.name !== PACKAGE_NAME ||
    manifest.version !== BACKEND_WASM_PACKAGE_VERSION
  ) {
    throw new Error("Packed package name or version does not match this release.");
  }

  const exports = new Set(Object.keys(manifest.exports));
  const missingExports = EXPECTED_EXPORTS.filter((name) => !exports.has(name));
  if (missingExports.length > 0) {
    throw new Error(`Packed package is missing public exports: ${missingExports.join(", ")}.`);
  }

  for (const [exportName, targets] of Object.entries(manifest.exports)) {
    if (targets.import === undefined || targets.types === undefined) {
      throw new Error(`Packed export ${exportName} is missing its ESM or TypeScript target.`);
    }
    for (const target of Object.values(targets)) {
      if (!target.startsWith("./") || !files.has(target.slice(2))) {
        throw new Error(`Packed export ${exportName} points to missing file ${target}.`);
      }
    }
  }
}

function checkProductionInputs(
  setupSource: string,
  manifest: PackageManifest,
  expectedOrigin: SubcircuitLibraryOrigin,
): void {
  const originMatch = /SUBCIRCUIT_LIBRARY_ORIGIN = "([^"]+)";/u.exec(setupSource);
  const versionMatch = /SUBCIRCUIT_LIBRARY_PACKAGE_VERSION = "([^"]+)";/u.exec(setupSource);
  if (originMatch === null || versionMatch === null) {
    throw new Error("Packed setup does not identify its subcircuit-library inputs.");
  }

  const origin = parseSubcircuitLibraryOrigin(originMatch[1], "Packed subcircuit-library origin");
  const dependencyVersion = manifest.dependencies[SUBCIRCUIT_LIBRARY_PACKAGE_NAME];
  if (
    origin !== expectedOrigin ||
    dependencyVersion === undefined ||
    versionMatch[1] !== dependencyVersion
  ) {
    throw new Error(
      `Packed setup input ${origin}@${versionMatch[1]} does not match package dependency ${dependencyVersion ?? "<missing>"} and expected origin ${expectedOrigin}.`,
    );
  }
}

async function readPackedJson<T>(archivePath: string, member: string): Promise<T> {
  const source = await readPackedFile(archivePath, member);
  return JSON.parse(source) as T;
}

async function readPackedFile(archivePath: string, member: string): Promise<string> {
  const { stdout } = await execFileAsync("tar", ["-xOf", archivePath, member], {
    maxBuffer: 8 * 1024 * 1024,
  });
  return stdout;
}

function parseExpectedOrigin(args: readonly string[]): SubcircuitLibraryOrigin {
  if (args.length !== 1 || !args[0].startsWith("--expected-origin=")) {
    throw new Error("Usage: check-publication-package --expected-origin=<origin>.");
  }
  return parseSubcircuitLibraryOrigin(
    args[0].slice("--expected-origin=".length),
    "Expected packed subcircuit-library origin",
  );
}

const entrypoint = fileURLToPath(import.meta.url);
if (process.argv[1] === entrypoint) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
