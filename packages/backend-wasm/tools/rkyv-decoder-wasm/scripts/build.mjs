import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = dirname(scriptDir);
const outDir = join(packageRoot, "pkg");
const wasmFile = join(
  packageRoot,
  "target",
  "wasm32-unknown-unknown",
  "release",
  "backend_wasm_rkyv_decoder.wasm",
);

const checkOnly = process.argv.includes("--check-tools");

assertCommand("cargo", ["--version"]);
assertCommand("rustc", ["--version"]);
assertCommand("wasm-bindgen", ["--version"]);
assertWasmTarget();

if (checkOnly) {
  console.log("rkyv decoder WASM build tools are available.");
  process.exit(0);
}

run("cargo", ["build", "--target", "wasm32-unknown-unknown", "--release"]);

if (!existsSync(wasmFile)) {
  throw new Error(`cargo build did not produce the expected WASM file: ${wasmFile}`);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

run("wasm-bindgen", [
  "--target",
  "web",
  "--out-dir",
  outDir,
  "--out-name",
  "backend_wasm_rkyv_decoder",
  wasmFile,
]);

function assertCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `${command} is required to build the rkyv decoder WASM package. Install it and rerun this script.`,
    );
  }
}

function assertWasmTarget() {
  const result = spawnSync("rustc", ["--print", "target-libdir", "--target", "wasm32-unknown-unknown"], {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.error !== undefined || result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(
      [
        "Rust target wasm32-unknown-unknown is required to build the rkyv decoder WASM package.",
        detail,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: packageRoot,
    stdio: "inherit",
  });

  if (result.error !== undefined) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
  }
}
