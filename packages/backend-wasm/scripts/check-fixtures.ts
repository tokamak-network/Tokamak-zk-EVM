import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SUPPORTED_KINDS = new Set([
  "scalar-ops",
  "roots-of-unity",
  "ntt-1d",
  "ntt-2d",
  "coset-ntt",
  "polynomial-eval",
  "msm",
  "pairing",
  "transcript",
  "full-proof",
]);

interface FixtureManifest {
  readonly schemaVersion: 1;
  readonly suite: string;
  readonly description?: string;
  readonly cases: readonly FixtureCase[];
}

interface FixtureCase {
  readonly id: string;
  readonly kind: string;
  readonly description?: string;
  readonly input: string;
  readonly expected: string;
}

interface CliOptions {
  readonly manifestPath: string;
  readonly allowEmpty: boolean;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const args = [...argv];
  const allowEmptyIndex = args.indexOf("--allow-empty");
  const allowEmpty = allowEmptyIndex !== -1;

  if (allowEmpty) {
    args.splice(allowEmptyIndex, 1);
  }

  if (args.length !== 1) {
    throw new Error("Usage: check-fixtures [--allow-empty] <manifest.json>");
  }

  return {
    manifestPath: args[0],
    allowEmpty,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value;
}

function assertSafeRelativePath(value: unknown, label: string): string {
  const candidate = assertString(value, label);

  if (path.isAbsolute(candidate)) {
    throw new Error(`${label} must be relative to the manifest directory.`);
  }

  const normalized = path.normalize(candidate);

  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    throw new Error(`${label} must not traverse outside the manifest directory.`);
  }

  return normalized;
}

function parseManifest(raw: unknown): FixtureManifest {
  if (!isRecord(raw)) {
    throw new Error("Fixture manifest must be a JSON object.");
  }

  if (raw.schemaVersion !== 1) {
    throw new Error("Fixture manifest schemaVersion must be 1.");
  }

  const suite = assertString(raw.suite, "Fixture manifest suite");

  if (!Array.isArray(raw.cases)) {
    throw new Error("Fixture manifest cases must be an array.");
  }

  const seenIds = new Set<string>();
  const cases = raw.cases.map((entry, index): FixtureCase => {
    const label = `Fixture case at index ${index}`;

    if (!isRecord(entry)) {
      throw new Error(`${label} must be a JSON object.`);
    }

    const id = assertString(entry.id, `${label} id`);

    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      throw new Error(`${label} id must use lowercase letters, numbers, and hyphens.`);
    }

    if (seenIds.has(id)) {
      throw new Error(`Duplicate fixture case id: ${id}.`);
    }

    seenIds.add(id);

    const kind = assertString(entry.kind, `${label} kind`);

    if (!SUPPORTED_KINDS.has(kind)) {
      throw new Error(`${label} kind '${kind}' is not supported.`);
    }

    return {
      id,
      kind,
      description: typeof entry.description === "string" ? entry.description : undefined,
      input: assertSafeRelativePath(entry.input, `${label} input`),
      expected: assertSafeRelativePath(entry.expected, `${label} expected`),
    };
  });

  return {
    schemaVersion: 1,
    suite,
    description: typeof raw.description === "string" ? raw.description : undefined,
    cases,
  };
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, "utf8");

  try {
    return JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${filePath} is not valid JSON: ${message}`);
  }
}

async function assertJsonFileExists(filePath: string): Promise<void> {
  await access(filePath);
  await readJsonFile(filePath);
}

async function checkManifest(options: CliOptions): Promise<void> {
  const manifestPath = path.resolve(options.manifestPath);
  const manifestDirectory = path.dirname(manifestPath);
  const manifest = parseManifest(await readJsonFile(manifestPath));

  if (manifest.cases.length === 0 && !options.allowEmpty) {
    throw new Error(
      `Fixture suite '${manifest.suite}' has no cases. Add parity fixtures or run with --allow-empty for scaffold validation.`,
    );
  }

  for (const fixture of manifest.cases) {
    const inputPath = path.resolve(manifestDirectory, fixture.input);
    const expectedPath = path.resolve(manifestDirectory, fixture.expected);

    await assertJsonFileExists(inputPath);
    await assertJsonFileExists(expectedPath);
  }

  console.log(
    `Checked ${manifest.cases.length} fixture case(s) from ${path.relative(process.cwd(), manifestPath)}`,
  );
}

const entrypoint = fileURLToPath(import.meta.url);

if (process.argv[1] === entrypoint) {
  checkManifest(parseArgs(process.argv.slice(2))).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Fixture check failed: ${message}`);
    process.exitCode = 1;
  });
}
