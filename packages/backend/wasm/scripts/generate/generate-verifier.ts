import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCurveRuntime } from "../../src/runtime/curve/curve.js";
import { prepareFixedVerifier, renderFixedVerifier } from "./verifier-fixed.js";
import {
  GENERATED_FREE_PUBLIC_LENGTH,
  GENERATED_SETUP_PARAMS,
  SUBCIRCUIT_LIBRARY_ORIGIN,
} from "../../src/generated/active/setup.generated.js";
import { parseCrsProvenance } from "../../src/generated/crs-provenance-validator.generated.js";
import { assertRuntimeLibraryCompatibility, validateCrsProvenanceCompatibility } from "../../src/artifacts/binary/compatibility.js";
import type { SetupParams } from "../../src/artifacts/setup/setup-params.js";
const setup: SetupParams = GENERATED_SETUP_PARAMS;
assertRuntimeLibraryCompatibility();
const backend = fileURLToPath(new URL("../../../", import.meta.url));
const directory = process.env.BACKEND_WASM_VERIFIER_CRS_DIR;
if(!directory)
  throw new Error("Set BACKEND_WASM_VERIFIER_CRS_DIR to trusted-setup output (development) or the supplied release-key directory (production).");
const keyPath = path.resolve(directory, "verifier_keys.rkyv");
if(String(SUBCIRCUIT_LIBRARY_ORIGIN) === "npmSnapshot") {
  const provenance = parseCrsProvenance(JSON.parse(await readFile(path.resolve(directory, "crs_provenance.json"), "utf8")));
  validateCrsProvenanceCompatibility(provenance);
  if(createHash("sha256").update(await readFile(keyPath)).digest("hex") !== provenance.artifacts["verifier_keys.rkyv"])
    throw new Error("Verifier key digest mismatch.");
}
execFileSync("cargo", ["build", "--locked", "--offline", "--release", "-p", "backend-wasm-univariate-crs-chunker", "--bin", "export-verifier"], { cwd: backend, stdio: "inherit" });
const canonical = new Uint8Array(execFileSync(path.join(backend, "target/release/export-verifier"), [keyPath]));
if(canonical.length !== 3 * 96 + 4 * 192)
  throw new Error("Invalid exported verifier key length.");
const runtime = await createCurveRuntime();
try {
  const source = renderFixedVerifier(prepareFixedVerifier(runtime, canonical, setup, GENERATED_FREE_PUBLIC_LENGTH));
  const output = path.join(backend, "wasm/src/verifier/generated/active/verifier.generated.ts");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, source);
  console.log("Generated build-bound verifier key and fixed field/group precomputation.");
}
finally {
  await runtime.terminate();
}
