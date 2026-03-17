import assert from "node:assert/strict";
import crypto from "node:crypto";
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

type Alu1Input = {
  in1: bigint;
  in2: bigint;
  expected: bigint;
};

type Alu2Input = {
  in1: bigint;
  in2: bigint;
  in3: bigint;
  expected: bigint;
};

type Alu1OpCase = {
  name: string;
  selector: bigint;
  edgeCases: Alu1Input[];
  sample: (iteration: number) => Alu1Input;
};

type Alu2OpCase = {
  name: string;
  selector: bigint;
  edgeCases: Alu2Input[];
  sample: (iteration: number) => Alu2Input;
};

const RANDOM_CASES = 500;
const builder = builderModule as (code: Uint8Array, options?: unknown) => Promise<WitnessCalculator>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAX_UINT256 = (1n << 256n) - 1n;
const MIN_INT256 = 1n << 255n;
const NEG_ONE = MAX_UINT256;

const randomNByteBigInt = (nBytes: number): bigint => {
  const buf = crypto.randomBytes(nBytes);
  let result = 0n;
  for (const byte of buf) {
    result = (result << 8n) + BigInt(byte);
  }
  return result;
};

const randomWord = (): bigint => randomNByteBigInt(32);
const randomSmall = (): bigint => randomNByteBigInt(1);
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

const expectWitnessFailure = async (
  runWitness: Promise<WitnessValue[]>,
  label: string,
): Promise<void> => {
  const didFail = await runWitness.then(
    () => false,
    () => true,
  );
  assert.equal(didFail, true, `${label} was expected to fail`);
};

const runAlu1Op = async (
  witnessCalculator: WitnessCalculator,
  opCase: Alu1OpCase,
): Promise<void> => {
  for (const [index, edgeCase] of opCase.edgeCases.entries()) {
    const witness = await witnessCalculator.calculateWitness(
      { in: encodeAlu1Input(opCase.selector, edgeCase.in1, edgeCase.in2) },
      true,
    );
    assertWitnessMatches(witness, edgeCase.expected, `ALU1 ${opCase.name} edge ${index}`);
  }
  for (let iteration = 0; iteration < RANDOM_CASES; iteration++) {
    const { in1, in2, expected } = opCase.sample(iteration);
    const witness = await witnessCalculator.calculateWitness(
      { in: encodeAlu1Input(opCase.selector, in1, in2) },
      true,
    );
    assertWitnessMatches(witness, expected, `ALU1 ${opCase.name} case ${iteration}`);
  }
  console.log(`ALU1 ${opCase.name} passed ${opCase.edgeCases.length} edge cases and ${RANDOM_CASES} randomized cases`);
};

const runAlu2Op = async (
  witnessCalculator: WitnessCalculator,
  opCase: Alu2OpCase,
): Promise<void> => {
  for (const [index, edgeCase] of opCase.edgeCases.entries()) {
    const witness = await witnessCalculator.calculateWitness(
      { in: encodeAlu2Input(opCase.selector, edgeCase.in1, edgeCase.in2, edgeCase.in3) },
      true,
    );
    assertWitnessMatches(witness, edgeCase.expected, `ALU2 ${opCase.name} edge ${index}`);
  }
  for (let iteration = 0; iteration < RANDOM_CASES; iteration++) {
    const { in1, in2, in3, expected } = opCase.sample(iteration);
    const witness = await witnessCalculator.calculateWitness(
      { in: encodeAlu2Input(opCase.selector, in1, in2, in3) },
      true,
    );
    assertWitnessMatches(witness, expected, `ALU2 ${opCase.name} case ${iteration}`);
  }
  console.log(`ALU2 ${opCase.name} passed ${opCase.edgeCases.length} edge cases and ${RANDOM_CASES} randomized cases`);
};

const main = async (): Promise<void> => {
  const alu1WitnessCalculator = await loadWitnessCalculator("ALU1");
  const alu2WitnessCalculator = await loadWitnessCalculator("ALU2");

  const alu1Cases: Alu1OpCase[] = [
    {
      name: "ADD",
      selector: 1n << 1n,
      edgeCases: [
        { in1: 0n, in2: 0n, expected: ArithmeticOperations.add([0n, 0n]) },
        { in1: MAX_UINT256, in2: 1n, expected: ArithmeticOperations.add([MAX_UINT256, 1n]) },
        { in1: MIN_INT256, in2: MIN_INT256, expected: ArithmeticOperations.add([MIN_INT256, MIN_INT256]) },
      ],
      sample: () => {
        const in1 = randomWord();
        const in2 = randomWord();
        return { in1, in2, expected: ArithmeticOperations.add([in1, in2]) };
      },
    },
    {
      name: "MUL",
      selector: 1n << 2n,
      edgeCases: [
        { in1: 0n, in2: MAX_UINT256, expected: ArithmeticOperations.mul([0n, MAX_UINT256]) },
        { in1: 1n, in2: MAX_UINT256, expected: ArithmeticOperations.mul([1n, MAX_UINT256]) },
        { in1: MIN_INT256, in2: 2n, expected: ArithmeticOperations.mul([MIN_INT256, 2n]) },
      ],
      sample: () => {
        const in1 = randomWord();
        const in2 = randomWord();
        return { in1, in2, expected: ArithmeticOperations.mul([in1, in2]) };
      },
    },
    {
      name: "SUB",
      selector: 1n << 3n,
      edgeCases: [
        { in1: 0n, in2: 1n, expected: ArithmeticOperations.sub([0n, 1n]) },
        { in1: MAX_UINT256, in2: MAX_UINT256, expected: ArithmeticOperations.sub([MAX_UINT256, MAX_UINT256]) },
        { in1: MIN_INT256, in2: 1n, expected: ArithmeticOperations.sub([MIN_INT256, 1n]) },
      ],
      sample: () => {
        const in1 = randomWord();
        const in2 = randomWord();
        return { in1, in2, expected: ArithmeticOperations.sub([in1, in2]) };
      },
    },
    {
      name: "LT",
      selector: 1n << 16n,
      edgeCases: [
        { in1: 0n, in2: 0n, expected: ArithmeticOperations.lt([0n, 0n]) },
        { in1: 0n, in2: 1n, expected: ArithmeticOperations.lt([0n, 1n]) },
        { in1: MAX_UINT256, in2: 0n, expected: ArithmeticOperations.lt([MAX_UINT256, 0n]) },
      ],
      sample: () => {
        const in1 = randomWord();
        const in2 = randomWord();
        return { in1, in2, expected: ArithmeticOperations.lt([in1, in2]) };
      },
    },
    {
      name: "GT",
      selector: 1n << 17n,
      edgeCases: [
        { in1: 0n, in2: 0n, expected: ArithmeticOperations.gt([0n, 0n]) },
        { in1: 1n, in2: 0n, expected: ArithmeticOperations.gt([1n, 0n]) },
        { in1: 0n, in2: MAX_UINT256, expected: ArithmeticOperations.gt([0n, MAX_UINT256]) },
      ],
      sample: () => {
        const in1 = randomWord();
        const in2 = randomWord();
        return { in1, in2, expected: ArithmeticOperations.gt([in1, in2]) };
      },
    },
    {
      name: "SLT",
      selector: 1n << 18n,
      edgeCases: [
        { in1: MIN_INT256, in2: 0n, expected: ArithmeticOperations.slt([MIN_INT256, 0n]) },
        { in1: NEG_ONE, in2: 0n, expected: ArithmeticOperations.slt([NEG_ONE, 0n]) },
        { in1: 0n, in2: NEG_ONE, expected: ArithmeticOperations.slt([0n, NEG_ONE]) },
      ],
      sample: () => {
        const in1 = randomWord();
        const in2 = randomWord();
        return { in1, in2, expected: ArithmeticOperations.slt([in1, in2]) };
      },
    },
    {
      name: "SGT",
      selector: 1n << 19n,
      edgeCases: [
        { in1: MIN_INT256, in2: 0n, expected: ArithmeticOperations.sgt([MIN_INT256, 0n]) },
        { in1: 0n, in2: NEG_ONE, expected: ArithmeticOperations.sgt([0n, NEG_ONE]) },
        { in1: NEG_ONE, in2: MIN_INT256, expected: ArithmeticOperations.sgt([NEG_ONE, MIN_INT256]) },
      ],
      sample: () => {
        const in1 = randomWord();
        const in2 = randomWord();
        return { in1, in2, expected: ArithmeticOperations.sgt([in1, in2]) };
      },
    },
    {
      name: "EQ",
      selector: 1n << 20n,
      edgeCases: [
        { in1: 0n, in2: 0n, expected: ArithmeticOperations.eq([0n, 0n]) },
        { in1: MAX_UINT256, in2: MAX_UINT256, expected: ArithmeticOperations.eq([MAX_UINT256, MAX_UINT256]) },
        { in1: 0n, in2: 1n, expected: ArithmeticOperations.eq([0n, 1n]) },
      ],
      sample: (iteration) => {
        const in1 = randomWord();
        const in2 = iteration % 10 === 0 ? in1 : randomWord();
        return { in1, in2, expected: ArithmeticOperations.eq([in1, in2]) };
      },
    },
    {
      name: "ISZERO",
      selector: 1n << 21n,
      edgeCases: [
        { in1: 0n, in2: 0n, expected: ArithmeticOperations.iszero([0n]) },
        { in1: 1n, in2: 0n, expected: ArithmeticOperations.iszero([1n]) },
        { in1: MAX_UINT256, in2: 0n, expected: ArithmeticOperations.iszero([MAX_UINT256]) },
      ],
      sample: (iteration) => {
        const in1 = iteration % 10 === 0 ? 0n : randomWord();
        return { in1, in2: 0n, expected: ArithmeticOperations.iszero([in1]) };
      },
    },
    {
      name: "AND",
      selector: 1n << 22n,
      edgeCases: [
        { in1: 0n, in2: MAX_UINT256, expected: ArithmeticOperations.and([0n, MAX_UINT256]) },
        { in1: MAX_UINT256, in2: MAX_UINT256, expected: ArithmeticOperations.and([MAX_UINT256, MAX_UINT256]) },
        { in1: MIN_INT256, in2: NEG_ONE, expected: ArithmeticOperations.and([MIN_INT256, NEG_ONE]) },
      ],
      sample: () => {
        const in1 = randomWord();
        const in2 = randomWord();
        return { in1, in2, expected: ArithmeticOperations.and([in1, in2]) };
      },
    },
    {
      name: "OR",
      selector: 1n << 23n,
      edgeCases: [
        { in1: 0n, in2: 0n, expected: ArithmeticOperations.or([0n, 0n]) },
        { in1: 0n, in2: MAX_UINT256, expected: ArithmeticOperations.or([0n, MAX_UINT256]) },
        { in1: MIN_INT256, in2: 1n, expected: ArithmeticOperations.or([MIN_INT256, 1n]) },
      ],
      sample: () => {
        const in1 = randomWord();
        const in2 = randomWord();
        return { in1, in2, expected: ArithmeticOperations.or([in1, in2]) };
      },
    },
    {
      name: "XOR",
      selector: 1n << 24n,
      edgeCases: [
        { in1: 0n, in2: 0n, expected: ArithmeticOperations.xor([0n, 0n]) },
        { in1: MAX_UINT256, in2: MAX_UINT256, expected: ArithmeticOperations.xor([MAX_UINT256, MAX_UINT256]) },
        { in1: MIN_INT256, in2: NEG_ONE, expected: ArithmeticOperations.xor([MIN_INT256, NEG_ONE]) },
      ],
      sample: () => {
        const in1 = randomWord();
        const in2 = randomWord();
        return { in1, in2, expected: ArithmeticOperations.xor([in1, in2]) };
      },
    },
    {
      name: "NOT",
      selector: 1n << 25n,
      edgeCases: [
        { in1: 0n, in2: 0n, expected: ArithmeticOperations.not([0n]) },
        { in1: MAX_UINT256, in2: 0n, expected: ArithmeticOperations.not([MAX_UINT256]) },
        { in1: MIN_INT256, in2: 0n, expected: ArithmeticOperations.not([MIN_INT256]) },
      ],
      sample: () => {
        const in1 = randomWord();
        return { in1, in2: 0n, expected: ArithmeticOperations.not([in1]) };
      },
    },
  ];

  const alu2Cases: Alu2OpCase[] = [
    {
      name: "DIV",
      selector: 1n << 4n,
      edgeCases: [
        { in1: 0n, in2: 0n, in3: 0n, expected: ArithmeticOperations.div([0n, 0n]) },
        { in1: MAX_UINT256, in2: 1n, in3: 0n, expected: ArithmeticOperations.div([MAX_UINT256, 1n]) },
        { in1: MAX_UINT256, in2: MAX_UINT256, in3: 0n, expected: ArithmeticOperations.div([MAX_UINT256, MAX_UINT256]) },
      ],
      sample: (iteration) => {
        const in1 = randomWord();
        const in2 = iteration % 10 === 0 ? 0n : randomWord();
        return { in1, in2, in3: 0n, expected: ArithmeticOperations.div([in1, in2]) };
      },
    },
    {
      name: "SDIV",
      selector: 1n << 5n,
      edgeCases: [
        { in1: MIN_INT256, in2: NEG_ONE, in3: 0n, expected: ArithmeticOperations.sdiv([MIN_INT256, NEG_ONE]) },
        { in1: NEG_ONE, in2: 1n, in3: 0n, expected: ArithmeticOperations.sdiv([NEG_ONE, 1n]) },
        { in1: 0n, in2: 0n, in3: 0n, expected: ArithmeticOperations.sdiv([0n, 0n]) },
      ],
      sample: (iteration) => {
        const in1 = randomWord();
        const in2 = iteration % 10 === 0 ? 0n : randomWord();
        return { in1, in2, in3: 0n, expected: ArithmeticOperations.sdiv([in1, in2]) };
      },
    },
    {
      name: "MOD",
      selector: 1n << 6n,
      edgeCases: [
        { in1: 0n, in2: 0n, in3: 0n, expected: ArithmeticOperations.mod([0n, 0n]) },
        { in1: MAX_UINT256, in2: 1n, in3: 0n, expected: ArithmeticOperations.mod([MAX_UINT256, 1n]) },
        { in1: MAX_UINT256, in2: MAX_UINT256, in3: 0n, expected: ArithmeticOperations.mod([MAX_UINT256, MAX_UINT256]) },
      ],
      sample: (iteration) => {
        const in1 = randomWord();
        const in2 = iteration % 10 === 0 ? 0n : randomWord();
        return { in1, in2, in3: 0n, expected: ArithmeticOperations.mod([in1, in2]) };
      },
    },
    {
      name: "SMOD",
      selector: 1n << 7n,
      edgeCases: [
        { in1: MIN_INT256, in2: NEG_ONE, in3: 0n, expected: ArithmeticOperations.smod([MIN_INT256, NEG_ONE]) },
        { in1: NEG_ONE, in2: 2n, in3: 0n, expected: ArithmeticOperations.smod([NEG_ONE, 2n]) },
        { in1: 0n, in2: 0n, in3: 0n, expected: ArithmeticOperations.smod([0n, 0n]) },
      ],
      sample: (iteration) => {
        const in1 = randomWord();
        const in2 = iteration % 10 === 0 ? 0n : randomWord();
        return { in1, in2, in3: 0n, expected: ArithmeticOperations.smod([in1, in2]) };
      },
    },
    {
      name: "ADDMOD",
      selector: 1n << 8n,
      edgeCases: [
        { in1: 0n, in2: 0n, in3: 0n, expected: ArithmeticOperations.addmod([0n, 0n, 0n]) },
        { in1: MAX_UINT256, in2: 1n, in3: MAX_UINT256, expected: ArithmeticOperations.addmod([MAX_UINT256, 1n, MAX_UINT256]) },
        { in1: MIN_INT256, in2: MIN_INT256, in3: 97n, expected: ArithmeticOperations.addmod([MIN_INT256, MIN_INT256, 97n]) },
      ],
      sample: (iteration) => {
        const in1 = randomWord();
        const in2 = randomWord();
        const in3 = iteration % 10 === 0 ? 0n : randomWord();
        return { in1, in2, in3, expected: ArithmeticOperations.addmod([in1, in2, in3]) };
      },
    },
    {
      name: "MULMOD",
      selector: 1n << 9n,
      edgeCases: [
        { in1: 0n, in2: MAX_UINT256, in3: 0n, expected: ArithmeticOperations.mulmod([0n, MAX_UINT256, 0n]) },
        { in1: MAX_UINT256, in2: 1n, in3: MAX_UINT256, expected: ArithmeticOperations.mulmod([MAX_UINT256, 1n, MAX_UINT256]) },
        { in1: MIN_INT256, in2: 2n, in3: 97n, expected: ArithmeticOperations.mulmod([MIN_INT256, 2n, 97n]) },
      ],
      sample: (iteration) => {
        const in1 = randomWord();
        const in2 = randomWord();
        const in3 = iteration % 10 === 0 ? 0n : randomWord();
        return { in1, in2, in3, expected: ArithmeticOperations.mulmod([in1, in2, in3]) };
      },
    },
    {
      name: "SIGNEXTEND",
      selector: 1n << 11n,
      edgeCases: [
        { in1: 0n, in2: 0x80n, in3: 0n, expected: ArithmeticOperations.signextend([0n, 0x80n]) },
        { in1: 30n, in2: MIN_INT256, in3: 0n, expected: ArithmeticOperations.signextend([30n, MIN_INT256]) },
        { in1: 31n, in2: MAX_UINT256, in3: 0n, expected: ArithmeticOperations.signextend([31n, MAX_UINT256]) },
        { in1: 32n, in2: MAX_UINT256, in3: 0n, expected: ArithmeticOperations.signextend([32n, MAX_UINT256]) },
        { in1: 255n, in2: 1n, in3: 0n, expected: ArithmeticOperations.signextend([255n, 1n]) },
      ],
      sample: () => {
        const in1 = randomSmall();
        const in2 = randomWord();
        return { in1, in2, in3: 0n, expected: ArithmeticOperations.signextend([in1, in2]) };
      },
    },
    {
      name: "BYTE",
      selector: 1n << 26n,
      edgeCases: [
        { in1: 0n, in2: MAX_UINT256, in3: 0n, expected: ArithmeticOperations.byte([0n, MAX_UINT256]) },
        { in1: 31n, in2: MAX_UINT256, in3: 0n, expected: ArithmeticOperations.byte([31n, MAX_UINT256]) },
        { in1: 32n, in2: MAX_UINT256, in3: 0n, expected: ArithmeticOperations.byte([32n, MAX_UINT256]) },
        { in1: 255n, in2: MAX_UINT256, in3: 0n, expected: ArithmeticOperations.byte([255n, MAX_UINT256]) },
      ],
      sample: () => {
        const in1 = randomSmall();
        const in2 = randomWord();
        return { in1, in2, in3: 0n, expected: ArithmeticOperations.byte([in1, in2]) };
      },
    },
    {
      name: "SHL",
      selector: 1n << 27n,
      edgeCases: [
        { in1: 0n, in2: 1n, in3: 0n, expected: ArithmeticOperations.shl([0n, 1n]) },
        { in1: 1n, in2: 1n, in3: 0n, expected: ArithmeticOperations.shl([1n, 1n]) },
        { in1: 127n, in2: 1n, in3: 0n, expected: ArithmeticOperations.shl([127n, 1n]) },
        { in1: 128n, in2: 1n, in3: 0n, expected: ArithmeticOperations.shl([128n, 1n]) },
        { in1: 255n, in2: 1n, in3: 0n, expected: ArithmeticOperations.shl([255n, 1n]) },
      ],
      sample: () => {
        const in1 = randomSmall();
        const in2 = randomWord();
        return { in1, in2, in3: 0n, expected: ArithmeticOperations.shl([in1, in2]) };
      },
    },
    {
      name: "SHR",
      selector: 1n << 28n,
      edgeCases: [
        { in1: 0n, in2: MAX_UINT256, in3: 0n, expected: ArithmeticOperations.shr([0n, MAX_UINT256]) },
        { in1: 1n, in2: MAX_UINT256, in3: 0n, expected: ArithmeticOperations.shr([1n, MAX_UINT256]) },
        { in1: 127n, in2: MAX_UINT256, in3: 0n, expected: ArithmeticOperations.shr([127n, MAX_UINT256]) },
        { in1: 128n, in2: MAX_UINT256, in3: 0n, expected: ArithmeticOperations.shr([128n, MAX_UINT256]) },
        { in1: 255n, in2: MAX_UINT256, in3: 0n, expected: ArithmeticOperations.shr([255n, MAX_UINT256]) },
      ],
      sample: () => {
        const in1 = randomSmall();
        const in2 = randomWord();
        return { in1, in2, in3: 0n, expected: ArithmeticOperations.shr([in1, in2]) };
      },
    },
    {
      name: "SAR",
      selector: 1n << 29n,
      edgeCases: [
        { in1: 0n, in2: NEG_ONE, in3: 0n, expected: ArithmeticOperations.sar([0n, NEG_ONE]) },
        { in1: 1n, in2: NEG_ONE, in3: 0n, expected: ArithmeticOperations.sar([1n, NEG_ONE]) },
        { in1: 127n, in2: MIN_INT256, in3: 0n, expected: ArithmeticOperations.sar([127n, MIN_INT256]) },
        { in1: 128n, in2: MIN_INT256, in3: 0n, expected: ArithmeticOperations.sar([128n, MIN_INT256]) },
        { in1: 255n, in2: MIN_INT256, in3: 0n, expected: ArithmeticOperations.sar([255n, MIN_INT256]) },
      ],
      sample: () => {
        const in1 = randomSmall();
        const in2 = randomWord();
        return { in1, in2, in3: 0n, expected: ArithmeticOperations.sar([in1, in2]) };
      },
    },
  ];

  for (const opCase of alu1Cases) {
    await runAlu1Op(alu1WitnessCalculator, opCase);
  }

  for (const opCase of alu2Cases) {
    await runAlu2Op(alu2WitnessCalculator, opCase);
  }

  await expectWitnessFailure(
    alu2WitnessCalculator.calculateWitness(
      { in: encodeAlu2Input(1n << 28n, 300n, randomWord(), 0n) },
      true,
    ),
    "ALU2 invalid shift test",
  );
  console.log("ALU2 invalid shift test passed");

  await expectWitnessFailure(
    alu1WitnessCalculator.calculateWitness(
      { in: encodeAlu1Input((1n << 1n) + (1n << 10n), 7n, 9n) },
      true,
    ),
    "ALU1 invalid selector test",
  );
  console.log("ALU1 invalid selector test passed");

  await expectWitnessFailure(
    alu2WitnessCalculator.calculateWitness(
      { in: encodeAlu2Input((1n << 4n) + (1n << 10n), 9n, 3n, 0n) },
      true,
    ),
    "ALU2 invalid selector test",
  );
  console.log("ALU2 invalid selector test passed");

  await expectWitnessFailure(
    alu2WitnessCalculator.calculateWitness(
      { in: [1n << 11n, 5n, 1n, ...split256BitInteger(0x80n), 0n, 0n] },
      true,
    ),
    "ALU2 invalid signextend high-limb test",
  );
  console.log("ALU2 invalid signextend high-limb test passed");

  await expectWitnessFailure(
    alu2WitnessCalculator.calculateWitness(
      { in: [1n << 26n, 31n, 42n, ...split256BitInteger(MAX_UINT256), 0n, 0n] },
      true,
    ),
    "ALU2 invalid byte high-limb test",
  );
  console.log("ALU2 invalid byte high-limb test passed");

  await expectWitnessFailure(
    alu2WitnessCalculator.calculateWitness(
      { in: [1n << 28n, 1n, 123456789n, ...split256BitInteger(5n), 0n, 0n] },
      true,
    ),
    "ALU2 invalid shift high-limb test",
  );
  console.log("ALU2 invalid shift high-limb test passed");
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
