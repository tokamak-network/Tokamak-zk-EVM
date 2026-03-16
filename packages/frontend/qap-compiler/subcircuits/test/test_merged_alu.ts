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

type UnaryBinaryCase = {
  name: string;
  selector: bigint;
  inputs: bigint[];
  expected: bigint;
};

const builder = builderModule as (code: Uint8Array, options?: unknown) => Promise<WitnessCalculator>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAX_UINT256 = (1n << 256n) - 1n;

const toWord = (value: bigint): bigint => BigInt.asUintN(256, value);
const normalizeWitnessValue = (value: WitnessValue): bigint => BigInt(value.toString());

const loadWitnessCalculator = async (name: "ALU1" | "ALU2"): Promise<WitnessCalculator> => {
  const subcircuitInfoPath = path.join(__dirname, "../library/subcircuitInfo.json");
  const subcircuitInfo = JSON.parse(readFileSync(subcircuitInfoPath, "utf8")) as Array<{ id: number; name: string }>;
  const targetInfo = subcircuitInfo.find((entry) => entry.name === name);
  if (targetInfo === undefined) {
    throw new Error(`${name} subcircuit was not found in subcircuitInfo.json`);
  }

  const wasmPath = path.join(__dirname, `../library/wasm/subcircuit${targetInfo.id}.wasm`);
  return builder(readFileSync(wasmPath));
};

const encodeAlu1Input = (selector: bigint, in1: bigint, in2: bigint): bigint[] => {
  return [selector, ...split256BitInteger(in1), ...split256BitInteger(in2)];
};

const encodeAlu2Input = (selector: bigint, in1: bigint, in2: bigint, in3: bigint): bigint[] => {
  return [selector, ...split256BitInteger(in1), ...split256BitInteger(in2), ...split256BitInteger(in3)];
};

const assertWitnessMatches = (witness: WitnessValue[], expected: bigint, label: string): void => {
  const [expectedLo, expectedHi] = split256BitInteger(expected);
  assert.equal(normalizeWitnessValue(witness[1]), expectedLo, `low limb mismatch for ${label}`);
  assert.equal(normalizeWitnessValue(witness[2]), expectedHi, `high limb mismatch for ${label}`);
};

const main = async (): Promise<void> => {
  const alu1WitnessCalculator = await loadWitnessCalculator("ALU1");
  const alu2WitnessCalculator = await loadWitnessCalculator("ALU2");

  const a = (1n << 200n) + 12345n;
  const b = (1n << 180n) + 67890n;
  const c = (1n << 160n) + 13579n;
  const negativeA = toWord(-12345n);
  const negativeB = toWord(-77n);

  const alu1Cases: UnaryBinaryCase[] = [
    { name: "ADD", selector: 1n << 1n, inputs: [a, b], expected: ArithmeticOperations.add([a, b]) },
    { name: "MUL", selector: 1n << 2n, inputs: [123456n, 789n], expected: ArithmeticOperations.mul([123456n, 789n]) },
    { name: "SUB", selector: 1n << 3n, inputs: [a, b], expected: ArithmeticOperations.sub([a, b]) },
    { name: "LT", selector: 1n << 16n, inputs: [123n, 456n], expected: ArithmeticOperations.lt([123n, 456n]) },
    { name: "GT", selector: 1n << 17n, inputs: [456n, 123n], expected: ArithmeticOperations.gt([456n, 123n]) },
    { name: "SLT", selector: 1n << 18n, inputs: [negativeA, 5n], expected: ArithmeticOperations.slt([negativeA, 5n]) },
    { name: "SGT", selector: 1n << 19n, inputs: [5n, negativeA], expected: ArithmeticOperations.sgt([5n, negativeA]) },
    { name: "EQ", selector: 1n << 20n, inputs: [a, a], expected: ArithmeticOperations.eq([a, a]) },
    { name: "ISZERO", selector: 1n << 21n, inputs: [0n, 0n], expected: ArithmeticOperations.iszero([0n]) },
    { name: "AND", selector: 1n << 22n, inputs: [a, b], expected: ArithmeticOperations.and([a, b]) },
    { name: "OR", selector: 1n << 23n, inputs: [a, b], expected: ArithmeticOperations.or([a, b]) },
    { name: "XOR", selector: 1n << 24n, inputs: [a, b], expected: ArithmeticOperations.xor([a, b]) },
    { name: "NOT", selector: 1n << 25n, inputs: [c, 0n], expected: ArithmeticOperations.not([c]) },
  ];

  const alu2Cases: Array<UnaryBinaryCase & { third: bigint }> = [
    { name: "DIV", selector: 1n << 4n, inputs: [1000n, 7n], third: 0n, expected: ArithmeticOperations.div([1000n, 7n]) },
    { name: "SDIV", selector: 1n << 5n, inputs: [toWord(-1000n), 7n], third: 0n, expected: ArithmeticOperations.sdiv([toWord(-1000n), 7n]) },
    { name: "MOD", selector: 1n << 6n, inputs: [1000n, 7n], third: 0n, expected: ArithmeticOperations.mod([1000n, 7n]) },
    { name: "SMOD", selector: 1n << 7n, inputs: [toWord(-1000n), 7n], third: 0n, expected: ArithmeticOperations.smod([toWord(-1000n), 7n]) },
    { name: "ADDMOD", selector: 1n << 8n, inputs: [a, b], third: 97n, expected: ArithmeticOperations.addmod([a, b, 97n]) },
    { name: "MULMOD", selector: 1n << 9n, inputs: [123456n, 789n], third: 97n, expected: ArithmeticOperations.mulmod([123456n, 789n, 97n]) },
    { name: "SIGNEXTEND", selector: 1n << 11n, inputs: [0n, 0x80n], third: 0n, expected: ArithmeticOperations.signextend([0n, 0x80n]) },
    { name: "BYTE", selector: 1n << 26n, inputs: [3n, a], third: 0n, expected: ArithmeticOperations.byte([3n, a]) },
    { name: "SHL", selector: 1n << 27n, inputs: [5n, b], third: 0n, expected: ArithmeticOperations.shl([5n, b]) },
    { name: "SHR", selector: 1n << 28n, inputs: [5n, b], third: 0n, expected: ArithmeticOperations.shr([5n, b]) },
    { name: "SAR", selector: 1n << 29n, inputs: [5n, negativeB], third: 0n, expected: ArithmeticOperations.sar([5n, negativeB]) },
  ];

  for (const testCase of alu1Cases) {
    const [in1, in2] = testCase.inputs;
    const witness = await alu1WitnessCalculator.calculateWitness(
      { in: encodeAlu1Input(testCase.selector, in1, in2) },
      true,
    );
    assertWitnessMatches(witness, testCase.expected, `ALU1 ${testCase.name}`);
    console.log(`ALU1 ${testCase.name} passed`);
  }

  for (const testCase of alu2Cases) {
    const [in1, in2] = testCase.inputs;
    const witness = await alu2WitnessCalculator.calculateWitness(
      { in: encodeAlu2Input(testCase.selector, in1, in2, testCase.third) },
      true,
    );
    assertWitnessMatches(witness, testCase.expected, `ALU2 ${testCase.name}`);
    console.log(`ALU2 ${testCase.name} passed`);
  }

  const invalidShiftWitness = await alu2WitnessCalculator.calculateWitness(
    { in: encodeAlu2Input(1n << 28n, 300n, b, 0n) },
    true,
  ).then(
    () => false,
    () => true,
  );
  assert.equal(invalidShiftWitness, true, "ALU2 invalid shift test was expected to fail");
  console.log("ALU2 invalid shift test passed");

  const outOfRangeByteWitness = await alu2WitnessCalculator.calculateWitness(
    { in: encodeAlu2Input(1n << 26n, 40n, a, 0n) },
    true,
  );
  assertWitnessMatches(outOfRangeByteWitness, 0n, "ALU2 BYTE out-of-range");
  console.log("ALU2 BYTE out-of-range test passed");

  const invalidNotExpectation = ArithmeticOperations.not([c]);
  assert.equal(invalidNotExpectation <= MAX_UINT256, true, "sanity check on NOT expectation failed");
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
