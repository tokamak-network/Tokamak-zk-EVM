import { readFile } from "node:fs/promises";
import path from "node:path";

import { loadPreprocessInputFromBinaryInput } from "../../../src/preprocess/api/binary-input.js";
import { preprocessSnark } from "../../../src/preprocess/protocol/preprocess-snark.js";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import {
  install as installVerifier,
  verify,
} from "../../../src/verifier/api/public-api.js";

const fixtureRoot = path.resolve("fixtures/small/runtime");

async function main(): Promise<void> {
  const [permutation, instance, preprocessCrs, proof] = await Promise.all([
    readBinary("permutation.bin"),
    readBinary("instance.bin"),
    readBinary("preprocess-crs.bin"),
    readBinary("proof.bin"),
  ]);
  const preprocessRuntime = await createCurveRuntime();
  let verifierPreprocess: Uint8Array;
  try {
    const input = await loadPreprocessInputFromBinaryInput(preprocessRuntime, {
      permutation,
      instance,
      preprocessCrs,
    });
    verifierPreprocess = await preprocessSnark(preprocessRuntime, input);
  } finally {
    await preprocessRuntime.terminate();
  }

  await installVerifier();
  const accepted = await verify({ proof, instance, verifierPreprocess });
  if (!accepted) {
    throw new Error("WASM verifier rejected the native proof with parity-correct preprocess.");
  }
  console.log("WASM verifier accepted the native proof with parity-correct preprocess");
}

async function readBinary(fileName: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(fixtureRoot, fileName)));
}

await main();
process.exit(0);
