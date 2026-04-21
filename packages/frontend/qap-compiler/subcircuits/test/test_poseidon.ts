import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

import builderModule from "./wasm/witness_calculator.js";
import { split256BitInteger } from "./helper_functions.js";
import { ArithmeticOperations } from "../../../synthesizer/src/synthesizer/dataStructure/arithmeticOperations.ts";

type WitnessValue = bigint | string | number;
type WitnessCalculator = {
  calculateWitness: (input: Record<string, bigint[]>, sanityCheck?: boolean) => Promise<WitnessValue[]>;
};

const builder = builderModule as (code: Uint8Array, options?: unknown) => Promise<WitnessCalculator>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SELECTOR_BY_INPUT_LEN: Record<number, bigint> = {
  2: 1n,
  3: 2n,
  4: 4n,
  5: 8n,
  6: 16n,
  7: 32n,
};

const loadWitnessCalculator = async (): Promise<WitnessCalculator> => {
  const subcircuitInfoPath = path.join(__dirname, "../library/subcircuitInfo.json");
  const subcircuitInfo = JSON.parse(readFileSync(subcircuitInfoPath, "utf8")) as Array<{ id: number; name: string }>;
  const poseidonInfo = subcircuitInfo.find((entry) => entry.name === "Poseidon");
  if (poseidonInfo === undefined) {
    throw new Error("Poseidon subcircuit was not found in subcircuitInfo.json");
  }

  const wasmPath = path.join(__dirname, `../library/wasm/subcircuit${poseidonInfo.id}.wasm`);
  return builder(readFileSync(wasmPath));
};

const normalizeWitnessValue = (value: WitnessValue): bigint => BigInt(value.toString());

const encodeCircuitInput = (selector: bigint, inVals: bigint[]): bigint[] => {
  const paddedInputs = inVals.concat(Array.from({ length: 7 - inVals.length }, () => 0n));
  return [selector, ...paddedInputs.flatMap((value) => split256BitInteger(value))];
};

const expectedHash = (inVals: bigint[]): bigint => {
  return inVals.length === 2
    ? ArithmeticOperations.poseidonN(inVals)
    : ArithmeticOperations.poseidonChainCompress(inVals);
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

  const baseInputs = [
    (1n << 200n) + 12345n,
    (1n << 180n) + 67890n,
    (1n << 160n) + 13579n,
    (1n << 140n) + 24680n,
    (1n << 120n) + 11111n,
    (1n << 100n) + 22222n,
    (1n << 80n) + 33333n,
  ];

  for (let inputLen = 2; inputLen <= 7; inputLen++) {
    const inVals = baseInputs.slice(0, inputLen);
    const selector = SELECTOR_BY_INPUT_LEN[inputLen];
    const encodedInput = encodeCircuitInput(selector, inVals);
    const witness = await witnessCalculator.calculateWitness({ in: encodedInput }, true);
    const expected = expectedHash(inVals);
    const [expectedLo, expectedHi] = split256BitInteger(expected);

    assert.equal(normalizeWitnessValue(witness[1]), expectedLo, `low limb mismatch for selector ${inputLen - 1}x`);
    assert.equal(normalizeWitnessValue(witness[2]), expectedHi, `high limb mismatch for selector ${inputLen - 1}x`);
    console.log(`Poseidon selector ${inputLen - 1}x passed`);
  }

  await expectWitnessFailure(
    witnessCalculator,
    encodeCircuitInput(3n, baseInputs.slice(0, 3)),
  );
  console.log("Poseidon invalid selector test passed");
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
