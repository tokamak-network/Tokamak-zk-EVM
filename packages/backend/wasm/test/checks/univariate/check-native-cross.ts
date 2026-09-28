import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import * as converter from "../../../src/converter/index.js";
import * as verifier from "../../../src/verifier/index.js";
import * as preprocess from "../../../src/preprocess/index.js";
import * as prover from "../../../src/prover/index.js";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import { decodeUnivariateProof, encodeUnivariateProof } from "../../../src/univariate/proof.js";
import { loadVerifierInputFromBinaryInput } from "../../../src/verifier/api/binary-input.js";
import { verifyUnivariateReference } from "../../../src/univariate/reference-verifier.js";
const run = path.resolve(process.argv[2]!);
const crsDirectory = path.resolve(process.argv[3]!);
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"));
const fixture = path.join(run, "inputs/synthesizer");
const instance = await converter.convertInstance(await json(path.join(fixture, "instance.json")));
const selector = await converter.convertSelector(await json(path.join(fixture, "selector.json")));
const permutation = await converter.convertPermutation(await json(path.join(fixture, "permutation.json")));
const witness = await converter.convertWitness(await json(path.join(fixture, "placementVariables.json")));
const runtime = await createCurveRuntime();
const nativeProof = await readFile(path.join(run, "prove/univariate_proof.bin"));
const nativePreprocess = await readFile(path.join(run, "preprocess/univariate_verifier_preprocess.bin"));
const crs = {
  manifest: await json(path.join(crsDirectory, "univariate-crs-manifest.json")),
  loadChunk: async (name: string) => new Uint8Array(await readFile(path.join(crsDirectory, name)))
};
const output = path.join(run, "wasm");
await mkdir(output, { recursive: true });
const timings: Record<string, number> = {};
async function timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const value = await fn();
  timings[name] = performance.now() - start;
  console.log(name, timings[name], "ms");
  return value;
}
try {
  await verifier.install();
  assert.equal(await timed("native proof -> WASM verify", () => verifier.verify({ proof: nativeProof, instance, verifierPreprocess: nativePreprocess })), true);
  const input = { proof: nativeProof, instance, verifierPreprocess: nativePreprocess };
  for(let index = 0; index < 10; index++) {
    const proof = new Uint8Array(nativeProof);
    proof.fill(0, index * 96, (index + 1) * 96);
    assert.equal(await verifier.verify({ ...input, proof }), false, "Tampered proof point " + index);
  }
  const decoded = decodeUnivariateProof(runtime, nativeProof);
  for(let index = 0; index < 7; index++) {
    const evaluations = [...decoded.evaluations];
    evaluations[index] = runtime.Fr.add(evaluations[index]!, runtime.Fr.one);
    const proof = await encodeUnivariateProof(runtime, { ...decoded, evaluations: evaluations as unknown as typeof decoded.evaluations });
    assert.equal(await verifier.verify({ ...input, proof }), false, "Tampered evaluation " + index);
  }
  for(const [start, length] of [[0, 96], [96, 96], [192, 192]]) {
    const verifierPreprocess = new Uint8Array(nativePreprocess);
    verifierPreprocess.fill(0, start!, start! + length!);
    assert.equal(await verifier.verify({ ...input, verifierPreprocess }), false, "Tampered preprocess at " + start);
  }
  const admitted = await loadVerifierInputFromBinaryInput(runtime, input);
  const publicInputs = [...admitted.publicInputs];
  publicInputs[0] = runtime.Fr.add(publicInputs[0]!, runtime.Fr.one);
  assert.equal(await verifyUnivariateReference(runtime, { ...admitted, publicInputs }), false, "Tampered public input");
  const noncanonical = new Uint8Array(nativeProof);
  noncanonical.fill(255, 960, 992);
  const wrongGroup = new Uint8Array(nativeProof);
  wrongGroup.fill(0, 0, 96);
  wrongGroup[48] = 2;
  for(const proof of [nativeProof.subarray(1), new Uint8Array([...nativeProof, 0]), noncanonical, wrongGroup]) {
    await assert.rejects(() => verifier.verify({ ...input, proof }), { code: "INVALID_INPUT" });
  }
  console.log("All 10 proof points, 7 evaluations, 3 preprocess operands and changed public input are rejected; malformed encodings fail admission.");
  if(!process.argv.includes("--verify-only")) {
    await preprocess.install();
    const result = await timed("WASM preprocess", () => preprocess.preprocess({ instance, selector, permutation, preprocessCrs: crs }));
    assert.deepEqual(result, new Uint8Array(nativePreprocess), "Native/WASM preprocess bytes differ.");
    await writeFile(path.join(output, "univariate_verifier_preprocess.bin"), result);
    await prover.install();
    const proof = await timed("WASM prove", () => prover.prove({ instance, selector, permutation, witness, proverCrs: crs }));
    await writeFile(path.join(output, "univariate_proof.bin"), proof);
    assert.equal(await timed("WASM proof -> WASM verify", () => verifier.verify({ proof, instance, verifierPreprocess: result })), true);
  }
  await writeFile(path.join(output, process.argv.includes("--verify-only") ? "verification-timings.json" : "timings.json"), JSON.stringify(timings, null, 2) + "\n");
}
finally {
  await runtime.terminate();
}
