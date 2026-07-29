import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  NATIVE_BACKEND_VERSION,
  SUBCIRCUIT_LIBRARY_PACKAGE_VERSION,
} from "../../src/generated/setup.generated.js";
import { BACKEND_WASM_PACKAGE_VERSION } from "../../src/version.js";
import {
  isPathInside,
  resolveFixtureWorkDirectory,
} from "./fixture-paths.js";

interface CopyManifest {
  readonly schemaVersion: 2;
  readonly suite: string;
  readonly workDirectory: string;
  readonly sources: readonly CopySourceEntry[];
}

interface CopySourceEntry {
  readonly source: string;
  readonly destination: string;
}

interface CopyArguments {
  readonly manifestPath: string;
  readonly sourceRepositoryRoot?: string;
}

async function main(argv: readonly string[]): Promise<void> {
  const args = parseArguments(argv);
  const manifestPath = path.resolve(args.manifestPath);
  const manifestDirectory = path.dirname(manifestPath);
  const backendWasmRoot = path.resolve(manifestDirectory, "../..");
  const destinationRepositoryRoot = path.resolve(backendWasmRoot, "../..");
  const sourceRepositoryRoot = args.sourceRepositoryRoot === undefined
    ? destinationRepositoryRoot
    : path.resolve(args.sourceRepositoryRoot);
  const manifest = parseManifest(JSON.parse(await readFile(manifestPath, "utf8")) as unknown);
  const workDirectory = resolveFixtureWorkDirectory(
    destinationRepositoryRoot,
    backendWasmRoot,
    manifest.workDirectory,
  );
  const copies = await Promise.all(manifest.sources.map(async (source) => {
    const sourcePath = resolveSourcePath(sourceRepositoryRoot, source.source);
    const destinationPath = resolveDestinationPath(workDirectory, source.destination);

    await assertSourceFile(sourcePath, source.source);
    const bytes = await readFile(sourcePath);
    return {
      source,
      destinationPath,
      bytes,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }));

  for (const copy of copies) {
    const { destinationPath, bytes } = copy;
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await writeFile(destinationPath, bytes);
  }

  await writeFile(
    path.join(workDirectory, "source-metadata.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      suite: manifest.suite,
      packageVersions: {
        backendWasm: BACKEND_WASM_PACKAGE_VERSION,
        nativeBackend: NATIVE_BACKEND_VERSION,
        subcircuitLibrary: SUBCIRCUIT_LIBRARY_PACKAGE_VERSION,
      },
      files: copies.map(({ source, bytes, sha256 }) => ({
        source: source.source,
        destination: source.destination,
        byteLength: bytes.byteLength,
        sha256,
      })),
    }, null, 2)}\n`,
  );

  console.log(
    `Copied ${manifest.sources.length} fixture source file(s) for suite '${manifest.suite}' into ${path.relative(
      process.cwd(),
      workDirectory,
    )}.`,
  );
}

function parseArguments(argv: readonly string[]): CopyArguments {
  if (argv.length === 1) {
    return { manifestPath: argv[0] };
  }

  if (argv.length === 3 && argv[1] === "--source-repository-root") {
    return {
      manifestPath: argv[0],
      sourceRepositoryRoot: argv[2],
    };
  }

  throw new Error(
    "Usage: copy-fixtures <copy-manifest.json> [--source-repository-root <repository-root>]",
  );
}

function parseManifest(raw: unknown): CopyManifest {
  if (!isRecord(raw)) {
    throw new Error("Copy manifest must be a JSON object.");
  }

  if (raw.schemaVersion !== 2) {
    throw new Error("Copy manifest schemaVersion must be 2.");
  }

  if (typeof raw.suite !== "string" || raw.suite.trim() === "") {
    throw new Error("Copy manifest suite must be a non-empty string.");
  }

  const workDirectory = assertSafeRelativePath(raw.workDirectory, "Copy manifest workDirectory");

  if (!Array.isArray(raw.sources) || raw.sources.length === 0) {
    throw new Error("Copy manifest sources must be a non-empty array.");
  }

  return {
    schemaVersion: 2,
    suite: raw.suite,
    workDirectory,
    sources: raw.sources.map((entry, index): CopySourceEntry => {
      if (!isRecord(entry)) {
        throw new Error(`Copy manifest source at index ${index} must be an object.`);
      }

      return {
        source: assertSafeRelativePath(entry.source, `Copy manifest source at index ${index} source`),
        destination: assertSafeRelativePath(entry.destination, `Copy manifest source at index ${index} destination`),
      };
    }),
  };
}

function resolveSourcePath(sourceRepositoryRoot: string, source: string): string {
  const sourcePath = path.resolve(sourceRepositoryRoot, source);
  const packagesRoot = path.resolve(sourceRepositoryRoot, "packages");
  const sourceBackendWasmRoot = path.resolve(packagesRoot, "backend-wasm");
  const backendWasmTmpRoot = path.resolve(sourceBackendWasmRoot, "tmp");
  const backendWasmFixturesRoot = path.resolve(sourceBackendWasmRoot, "fixtures");

  if (!isPathInside(sourcePath, packagesRoot)) {
    throw new Error(`Fixture source must be under the repository packages/ directory: ${source}`);
  }

  if (isPathInside(sourcePath, backendWasmTmpRoot)) {
    throw new Error(`Fixture source must not point into backend-wasm tmp: ${source}`);
  }

  if (isPathInside(sourcePath, backendWasmFixturesRoot)) {
    throw new Error(`Fixture source must not point into backend-wasm fixtures: ${source}`);
  }

  return sourcePath;
}

function resolveDestinationPath(workDirectory: string, destination: string): string {
  const destinationPath = path.resolve(workDirectory, destination);

  if (!isPathInside(destinationPath, workDirectory)) {
    throw new Error(`Fixture source copy destination must stay under the fixture work directory: ${destination}`);
  }

  return destinationPath;
}

async function assertSourceFile(sourcePath: string, sourceLabel: string): Promise<void> {
  try {
    const sourceStat = await stat(sourcePath);
    if (!sourceStat.isFile()) {
      throw new Error("not a file");
    }
  } catch {
    throw new Error(
      `Required fixture source artifact is missing: ${sourceLabel}. Prepare that existing package output before running fixtures:copy.`,
    );
  }
}

function assertSafeRelativePath(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }

  if (path.isAbsolute(value)) {
    throw new Error(`${label} must be relative.`);
  }

  const normalized = path.normalize(value);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    throw new Error(`${label} must not traverse outside its root.`);
  }

  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const entrypoint = fileURLToPath(import.meta.url);

if (process.argv[1] === entrypoint) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Fixture copy failed: ${message}`);
    process.exitCode = 1;
  });
}
