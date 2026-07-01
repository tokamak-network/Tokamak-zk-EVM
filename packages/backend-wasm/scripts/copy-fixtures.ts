import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface CopyManifest {
  readonly schemaVersion: 1;
  readonly suite: string;
  readonly files: readonly CopyFileEntry[];
}

interface CopyFileEntry {
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
  const fixturesRoot = path.resolve(backendWasmRoot, "fixtures", "small");
  const manifest = parseManifest(JSON.parse(await readFile(manifestPath, "utf8")) as unknown);

  for (const file of manifest.files) {
    const sourcePath = resolveSourcePath(repositoryRoot, backendWasmRoot, file.source);
    const destinationPath = resolveDestinationPath(fixturesRoot, file.destination);

    await assertPreparedSource(sourcePath, file.source);
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await writeFile(destinationPath, await readFile(sourcePath));
  }

  console.log(`Copied ${manifest.files.length} fixture file(s) for suite '${manifest.suite}'.`);
}

function parseManifest(raw: unknown): CopyManifest {
  if (!isRecord(raw)) {
    throw new Error("Copy manifest must be a JSON object.");
  }

  if (raw.schemaVersion !== 1) {
    throw new Error("Copy manifest schemaVersion must be 1.");
  }

  if (typeof raw.suite !== "string" || raw.suite.trim() === "") {
    throw new Error("Copy manifest suite must be a non-empty string.");
  }

  if (!Array.isArray(raw.files) || raw.files.length === 0) {
    throw new Error("Copy manifest files must be a non-empty array.");
  }

  return {
    schemaVersion: 1,
    suite: raw.suite,
    files: raw.files.map((entry, index): CopyFileEntry => {
      if (!isRecord(entry)) {
        throw new Error(`Copy manifest file at index ${index} must be an object.`);
      }

      return {
        source: assertSafeRelativePath(entry.source, `Copy manifest file at index ${index} source`),
        destination: assertSafeRelativePath(entry.destination, `Copy manifest file at index ${index} destination`),
      };
    }),
  };
}

function resolveSourcePath(repositoryRoot: string, backendWasmRoot: string, source: string): string {
  const sourcePath = path.resolve(repositoryRoot, source);
  const packagesRoot = path.resolve(repositoryRoot, "packages");
  const backendWasmFixturesRoot = path.resolve(backendWasmRoot, "fixtures");

  if (!isPathInside(sourcePath, packagesRoot)) {
    throw new Error(`Fixture source must be under packages/: ${source}`);
  }

  if (isPathInside(sourcePath, backendWasmFixturesRoot)) {
    throw new Error(`Fixture source must not point back into backend-wasm fixtures: ${source}`);
  }

  return sourcePath;
}

function resolveDestinationPath(fixturesRoot: string, destination: string): string {
  const destinationPath = path.resolve(fixturesRoot, destination);

  if (!isPathInside(destinationPath, fixturesRoot)) {
    throw new Error(`Fixture destination must stay under fixtures/small: ${destination}`);
  }

  return destinationPath;
}

async function assertPreparedSource(sourcePath: string, sourceLabel: string): Promise<void> {
  try {
    const sourceStat = await stat(sourcePath);
    if (!sourceStat.isFile()) {
      throw new Error("not a file");
    }
  } catch {
    throw new Error(
      `Required fixture artifact is not prepared: ${sourceLabel}. Prepare this artifact in its owning package and rerun fixtures:copy.`,
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
