import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, copyFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import { prepareFixedVerifier } from "../../../scripts/generate/verifier-fixed.js";
import { GENERATED_FREE_PUBLIC_LENGTH, GENERATED_SETUP_PARAMS } from "../../../src/generated/active/setup.generated.js";
import { encodePoint } from "../../../src/univariate/artifact-points.js";

const directory = path.resolve(process.argv[2]!);
const key = path.join(directory, "verifier_keys.rkyv");
const canonical = new Uint8Array(execFileSync(path.resolve("../target/release/export-verifier"), [key]));
const runtime = await createCurveRuntime();
try {
  const fixed = prepareFixedVerifier(runtime, canonical, GENERATED_SETUP_PARAMS, GENERATED_FREE_PUBLIC_LENGTH);
  assert.equal(fixed.g1Tables.length, 3);
  assert.equal(fixed.preparedG2.length, 4);
  assert.equal(fixed.g1Tables[0]!.length, 64 * 15);
  assert.throws(() => prepareFixedVerifier(runtime, canonical.subarray(1), GENERATED_SETUP_PARAMS, GENERATED_FREE_PUBLIC_LENGTH), /length/);
  for(const [start, width] of [[0, 96], [288, 192]] as const) {
    const zero = canonical.slice(); zero.fill(0, start, start + width);
    assert.throws(() => prepareFixedVerifier(runtime, zero, GENERATED_SETUP_PARAMS, GENERATED_FREE_PUBLIC_LENGTH), /nonzero/);
    const noncanonical = canonical.slice(); noncanonical.fill(255, start, start + 48);
    assert.throws(() => prepareFixedVerifier(runtime, noncanonical, GENERATED_SETUP_PARAMS, GENERATED_FREE_PUBLIC_LENGTH), /Noncanonical/);
  }
  const wrongGroup = canonical.slice(); wrongGroup.fill(0, 0, 96); wrongGroup[48] = 2;
  assert.throws(() => prepareFixedVerifier(runtime, wrongGroup, GENERATED_SETUP_PARAMS, GENERATED_FREE_PUBLIC_LENGTH), /subgroup/);
  for(let base = 0; base < 3; base++) {
    assert.deepEqual(encodePoint(runtime, fixed.g1Tables[base]![0]!), canonical.subarray(base * 96, (base + 1) * 96));
  }
} finally { await runtime.terminate(); }
const keyOnly = await mkdtemp(path.join(os.tmpdir(), "tokamak-wasm-key-only-"));
await copyFile(key, path.join(keyOnly, "verifier_keys.rkyv"));
const environment = { ...process.env };
delete environment.BACKEND_WASM_VERIFIER_CRS_DIR;
assert.throws(() => execFileSync(process.execPath, ["--import", "tsx", "scripts/generate/generate-verifier.ts"], { env: environment, stdio: "pipe" }), error => {
  return String((error as { stderr?: Buffer }).stderr).includes("Set BACKEND_WASM_VERIFIER_CRS_DIR");
});
execFileSync(process.execPath, ["--import", "tsx", "scripts/generate/generate-verifier.ts"], { env: { ...environment, BACKEND_WASM_VERIFIER_CRS_DIR: keyOnly }, stdio: "pipe" });
assert((await readFile("src/verifier/generated/active/verifier.generated.ts", "utf8")).includes("preparedG2"));
console.log("Build-bound key: malformed/noncanonical/subgroup/identity rejection, missing-key failure and key-only development build pass.");
