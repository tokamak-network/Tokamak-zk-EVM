import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

async function main(argv: readonly string[]): Promise<void> {
  if (argv.length !== 1) {
    throw new Error("Usage: copy-fixtures <copy-manifest.json>");
  }

  const manifestPath = path.resolve(argv[0]);
  const manifestDirectory = path.dirname(manifestPath);
  const backendWasmRoot = path.resolve(manifestDirectory, "../..");
  const repositoryRoot = path.resolve(backendWasmRoot, "../..");
  const manifest = parseManifest(JSON.parse(await readFile(manifestPath, "utf8")) as unknown);
  const workDirectory = resolveWorkDirectory(repositoryRoot, backendWasmRoot, manifest.workDirectory);

  for (const source of manifest.sources) {
    const sourcePath = resolveSourcePath(repositoryRoot, backendWasmRoot, source.source);
    const destinationPath = resolveDestinationPath(workDirectory, source.destination);

    await assertSourceFile(sourcePath, source.source);
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await writeFile(destinationPath, await readFile(sourcePath));
  }

  console.log(
    `Copied ${manifest.sources.length} fixture source file(s) for suite '${manifest.suite}' into ${path.relative(
      process.cwd(),
      workDirectory,
    )}.`,
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

function resolveSourcePath(repositoryRoot: string, backendWasmRoot: string, source: string): string {
  const sourcePath = path.resolve(repositoryRoot, source);
  const packagesRoot = path.resolve(repositoryRoot, "packages");
  const backendWasmTmpRoot = path.resolve(backendWasmRoot, "tmp");
  const backendWasmFixturesRoot = path.resolve(backendWasmRoot, "fixtures");

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

function resolveWorkDirectory(repositoryRoot: string, backendWasmRoot: string, workDirectory: string): string {
  const workDirectoryPath = path.resolve(repositoryRoot, workDirectory);
  const allowedRoot = path.resolve(backendWasmRoot, "tmp", "fixtures");

  if (!isPathInside(workDirectoryPath, allowedRoot)) {
    throw new Error(`Copy manifest workDirectory must stay under packages/backend-wasm/tmp/fixtures: ${workDirectory}`);
  }

  return workDirectoryPath;
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
    console.error(`Fixture copy failed: ${message}`);
    process.exitCode = 1;
  });
}
