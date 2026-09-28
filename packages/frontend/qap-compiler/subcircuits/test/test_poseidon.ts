import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { poseidon_raw, poseidonChainCompress } from "tokamak-l2js";

import builderModule from "../library/witness_calculator.js";
import { split256BitInteger } from "./helper_functions.js";

type WitnessValue = bigint | string | number;
type WitnessCalculator = {
  calculateWitness: (input: Record<string, bigint[]>, sanityCheck?: boolean) => Promise<WitnessValue[]>;
};

const builder = builderModule as (code: Uint8Array, options?: unknown) => Promise<WitnessCalculator>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const libraryDir = path.join(__dirname, "../library");
const frontendConfigPath = path.join(libraryDir, "frontendCfg.json");
const frontendConfig = JSON.parse(readFileSync(frontendConfigPath, "utf8")) as { nPoseidonBatch: number };
const poseidonBatchSize = frontendConfig.nPoseidonBatch;

const loadWitnessCalculator = async (): Promise<WitnessCalculator> => {
  const subcircuitInfoPath = path.join(libraryDir, "subcircuitInfo.json");
  const subcircuitInfo = JSON.parse(readFileSync(subcircuitInfoPath, "utf8")) as Array<{ id: number; name: string }>;
  const poseidonInfo = subcircuitInfo.find((entry) => entry.name === "Poseidon");
  if (poseidonInfo === undefined) {
    throw new Error("Poseidon subcircuit was not found in subcircuitInfo.json");
  }

  const wasmPath = path.join(libraryDir, `wasm/subcircuit${poseidonInfo.id}.wasm`);
  return builder(readFileSync(wasmPath));
};

const normalizeWitnessValue = (value: WitnessValue): bigint => BigInt(value.toString());

const encodeCircuitInput = (inputCount: bigint, inVals: bigint[]): bigint[] => {
  const paddedInputs = inVals.concat(Array.from({ length: poseidonBatchSize + 1 - inVals.length }, () => 0n));
  return [inputCount, ...paddedInputs.flatMap((value) => split256BitInteger(value))];
};

const expectedHash = (inVals: bigint[]): bigint => {
  return inVals.length === 2
    ? poseidon_raw(inVals)
    : poseidonChainCompress(inVals);
};

const expectWitnessFailure = async (
  witnessCalculator: WitnessCalculator,
  encodedInput: bigint[],
): Promise<void> => {
  let failed = false;
  try {
    await witnessCalculator.calculateWitness({ in: encodedInput }, true);
  } catch {
    failed = true;
  }
  assert.equal(failed, true, "witness generation was expected to fail");
};

const main = async (): Promise<void> => {
  const witnessCalculator = await loadWitnessCalculator();

  const baseInputs = Array.from(
    { length: poseidonBatchSize + 1 },
    (_, index) => (1n << BigInt(80 + index)) + BigInt(index + 1),
  );

  for (let inputLen = 2; inputLen <= poseidonBatchSize + 1; inputLen++) {
    const inVals = baseInputs.slice(0, inputLen);
    const inputCount = 1n << BigInt(inputLen - 2);
    const encodedInput = encodeCircuitInput(inputCount, inVals);
    const witness = await witnessCalculator.calculateWitness({ in: encodedInput }, true);
    const expected = expectedHash(inVals);
    const [expectedLo, expectedHi] = split256BitInteger(expected);

    assert.equal(normalizeWitnessValue(witness[1]), expectedLo, `low limb mismatch for ${inputLen - 1} hash steps`);
    assert.equal(normalizeWitnessValue(witness[2]), expectedHi, `high limb mismatch for ${inputLen - 1} hash steps`);
    console.log(`Poseidon ${inputLen - 1} hash steps passed`);
  }

  await expectWitnessFailure(
    witnessCalculator,
    encodeCircuitInput(3n, baseInputs.slice(0, Math.min(3, baseInputs.length))),
  );
  console.log("Poseidon invalid input-count test passed");
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
