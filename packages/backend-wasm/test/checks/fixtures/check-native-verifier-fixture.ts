import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface CopyManifest {
  readonly schemaVersion: 2;
  readonly suite: string;
  readonly workDirectory: string;
}

interface NativeVerifierReport {
  readonly suite: string;
  readonly command: readonly string[];
  readonly sourceRoot: string;
  readonly subcircuitLibrary: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly accepted: boolean | null;
}

async function main(argv: readonly string[]): Promise<void> {
  if (argv.length !== 1) {
    throw new Error("Usage: check-native-verifier-fixture <copy-manifest.json>");
  }

  const manifestPath = path.resolve(argv[0]);
  const manifestDirectory = path.dirname(manifestPath);
  const backendWasmRoot = path.resolve(manifestDirectory, "../..");
  const repositoryRoot = path.resolve(backendWasmRoot, "../..");
  const backendRoot = path.join(repositoryRoot, "packages", "backend");
  const manifest = parseCopyManifest(JSON.parse(await readFile(manifestPath, "utf8")) as unknown);
  const sourceRoot = resolveWorkDirectory(repositoryRoot, backendWasmRoot, manifest.workDirectory);
  const subcircuitLibrary = path.join(
    backendWasmRoot,
    "node_modules",
    "@tokamak-zk-evm",
    "subcircuit-library",
    "subcircuits",
    "library",
  );
  const args = [
    "run",
    "--manifest-path",
    path.join(backendRoot, "Cargo.toml"),
    "-p",
    "verify",
    "--",
    "--subcircuit-library",
    subcircuitLibrary,
    "--crs",
    path.join(sourceRoot, "setup"),
    "--synthesizer-stat",
    path.join(sourceRoot, "synthesizer"),
    "--preprocess",
    path.join(sourceRoot, "preprocess"),
    "--proof",
    path.join(sourceRoot, "prove"),
  ];
  const result = await runCommand("cargo", args, backendWasmRoot);
  const report: NativeVerifierReport = {
    suite: manifest.suite,
    command: ["cargo", ...args],
    sourceRoot: path.relative(process.cwd(), sourceRoot),
    subcircuitLibrary: path.relative(process.cwd(), subcircuitLibrary),
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    accepted: parseVerifierResult(result.stdout),
  };

  console.log(`${JSON.stringify(report, null, 2)}\n`);

  if (report.accepted !== true) {
    throw new Error(
      report.accepted === false
        ? "Native verifier rejected the copied fixture."
        : "Native verifier did not print a parseable boolean result.",
    );
  }
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

function parseVerifierResult(stdout: string): boolean | null {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index] === "true") {
      return true;
    }

    if (lines[index] === "false") {
      return false;
    }
  }

  return null;
}

async function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<{ readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");

      if (code !== 0) {
        reject(
          new Error(
            [
              `${command} ${args.join(" ")} failed with exit code ${code}.`,
              stdout.trim() === "" ? undefined : `stdout:\n${stdout.trim()}`,
              stderr.trim() === "" ? undefined : `stderr:\n${stderr.trim()}`,
            ]
              .filter(Boolean)
              .join("\n"),
          ),
        );
        return;
      }

      resolve({ stdout, stderr });
    });
  });
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
    console.error(`Native verifier fixture check failed: ${message}`);
    process.exitCode = 1;
  });
}
