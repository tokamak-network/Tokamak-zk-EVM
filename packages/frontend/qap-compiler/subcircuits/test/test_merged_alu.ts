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
  sample: (iteration: number) => Alu1Input;
};

type Alu2OpCase = {
  name: string;
  selector: bigint;
  sample: (iteration: number) => Alu2Input;
};

const RANDOM_CASES = 500;
const builder = builderModule as (code: Uint8Array, options?: unknown) => Promise<WitnessCalculator>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const runAlu1Op = async (
  witnessCalculator: WitnessCalculator,
  opCase: Alu1OpCase,
): Promise<void> => {
  for (let iteration = 0; iteration < RANDOM_CASES; iteration++) {
    const { in1, in2, expected } = opCase.sample(iteration);
    const witness = await witnessCalculator.calculateWitness(
      { in: encodeAlu1Input(opCase.selector, in1, in2) },
      true,
    );
    assertWitnessMatches(witness, expected, `ALU1 ${opCase.name} case ${iteration}`);
  }
  console.log(`ALU1 ${opCase.name} passed ${RANDOM_CASES} randomized cases`);
};

const runAlu2Op = async (
  witnessCalculator: WitnessCalculator,
  opCase: Alu2OpCase,
): Promise<void> => {
  for (let iteration = 0; iteration < RANDOM_CASES; iteration++) {
    const { in1, in2, in3, expected } = opCase.sample(iteration);
    const witness = await witnessCalculator.calculateWitness(
      { in: encodeAlu2Input(opCase.selector, in1, in2, in3) },
      true,
    );
    assertWitnessMatches(witness, expected, `ALU2 ${opCase.name} case ${iteration}`);
  }
  console.log(`ALU2 ${opCase.name} passed ${RANDOM_CASES} randomized cases`);
};

const main = async (): Promise<void> => {
  const alu1WitnessCalculator = await loadWitnessCalculator("ALU1");
  const alu2WitnessCalculator = await loadWitnessCalculator("ALU2");

  const alu1Cases: Alu1OpCase[] = [
    {
      name: "ADD",
      selector: 1n << 1n,
      sample: () => {
        const in1 = randomWord();
        const in2 = randomWord();
        return { in1, in2, expected: ArithmeticOperations.add([in1, in2]) };
      },
    },
    {
      name: "MUL",
      selector: 1n << 2n,
      sample: () => {
        const in1 = randomWord();
        const in2 = randomWord();
        return { in1, in2, expected: ArithmeticOperations.mul([in1, in2]) };
      },
    },
    {
      name: "SUB",
      selector: 1n << 3n,
      sample: () => {
        const in1 = randomWord();
        const in2 = randomWord();
        return { in1, in2, expected: ArithmeticOperations.sub([in1, in2]) };
      },
    },
    {
      name: "LT",
      selector: 1n << 16n,
      sample: () => {
        const in1 = randomWord();
        const in2 = randomWord();
        return { in1, in2, expected: ArithmeticOperations.lt([in1, in2]) };
      },
    },
    {
      name: "GT",
      selector: 1n << 17n,
      sample: () => {
        const in1 = randomWord();
        const in2 = randomWord();
        return { in1, in2, expected: ArithmeticOperations.gt([in1, in2]) };
      },
    },
    {
      name: "SLT",
      selector: 1n << 18n,
      sample: () => {
        const in1 = randomWord();
        const in2 = randomWord();
        return { in1, in2, expected: ArithmeticOperations.slt([in1, in2]) };
      },
    },
    {
      name: "SGT",
      selector: 1n << 19n,
      sample: () => {
        const in1 = randomWord();
        const in2 = randomWord();
        return { in1, in2, expected: ArithmeticOperations.sgt([in1, in2]) };
      },
    },
    {
      name: "EQ",
      selector: 1n << 20n,
      sample: (iteration) => {
        const in1 = randomWord();
        const in2 = iteration % 10 === 0 ? in1 : randomWord();
        return { in1, in2, expected: ArithmeticOperations.eq([in1, in2]) };
      },
    },
    {
      name: "ISZERO",
      selector: 1n << 21n,
      sample: (iteration) => {
        const in1 = iteration % 10 === 0 ? 0n : randomWord();
        return { in1, in2: 0n, expected: ArithmeticOperations.iszero([in1]) };
      },
    },
    {
      name: "AND",
      selector: 1n << 22n,
      sample: () => {
        const in1 = randomWord();
        const in2 = randomWord();
        return { in1, in2, expected: ArithmeticOperations.and([in1, in2]) };
      },
    },
    {
      name: "OR",
      selector: 1n << 23n,
      sample: () => {
        const in1 = randomWord();
        const in2 = randomWord();
        return { in1, in2, expected: ArithmeticOperations.or([in1, in2]) };
      },
    },
    {
      name: "XOR",
      selector: 1n << 24n,
      sample: () => {
        const in1 = randomWord();
        const in2 = randomWord();
        return { in1, in2, expected: ArithmeticOperations.xor([in1, in2]) };
      },
    },
    {
      name: "NOT",
      selector: 1n << 25n,
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
      sample: (iteration) => {
        const in1 = randomWord();
        const in2 = iteration % 10 === 0 ? 0n : randomWord();
        return { in1, in2, in3: 0n, expected: ArithmeticOperations.div([in1, in2]) };
      },
    },
    {
      name: "SDIV",
      selector: 1n << 5n,
      sample: (iteration) => {
        const in1 = randomWord();
        const in2 = iteration % 10 === 0 ? 0n : randomWord();
        return { in1, in2, in3: 0n, expected: ArithmeticOperations.sdiv([in1, in2]) };
      },
    },
    {
      name: "MOD",
      selector: 1n << 6n,
      sample: (iteration) => {
        const in1 = randomWord();
        const in2 = iteration % 10 === 0 ? 0n : randomWord();
        return { in1, in2, in3: 0n, expected: ArithmeticOperations.mod([in1, in2]) };
      },
    },
    {
      name: "SMOD",
      selector: 1n << 7n,
      sample: (iteration) => {
        const in1 = randomWord();
        const in2 = iteration % 10 === 0 ? 0n : randomWord();
        return { in1, in2, in3: 0n, expected: ArithmeticOperations.smod([in1, in2]) };
      },
    },
    {
      name: "ADDMOD",
      selector: 1n << 8n,
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
      sample: () => {
        const in1 = randomSmall();
        const in2 = randomWord();
        return { in1, in2, in3: 0n, expected: ArithmeticOperations.signextend([in1, in2]) };
      },
    },
    {
      name: "BYTE",
      selector: 1n << 26n,
      sample: () => {
        const in1 = randomSmall();
        const in2 = randomWord();
        return { in1, in2, in3: 0n, expected: ArithmeticOperations.byte([in1, in2]) };
      },
    },
    {
      name: "SHL",
      selector: 1n << 27n,
      sample: () => {
        const in1 = randomSmall();
        const in2 = randomWord();
        return { in1, in2, in3: 0n, expected: ArithmeticOperations.shl([in1, in2]) };
      },
    },
    {
      name: "SHR",
      selector: 1n << 28n,
      sample: () => {
        const in1 = randomSmall();
        const in2 = randomWord();
        return { in1, in2, in3: 0n, expected: ArithmeticOperations.shr([in1, in2]) };
      },
    },
    {
      name: "SAR",
      selector: 1n << 29n,
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

  const invalidShiftWitness = await alu2WitnessCalculator.calculateWitness(
    { in: encodeAlu2Input(1n << 28n, 300n, randomWord(), 0n) },
    true,
  ).then(
    () => false,
    () => true,
  );
  assert.equal(invalidShiftWitness, true, "ALU2 invalid shift test was expected to fail");
  console.log("ALU2 invalid shift test passed");
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
