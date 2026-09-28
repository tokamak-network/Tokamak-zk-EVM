const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { readFileSync } = require("node:fs");

const { wasm } = require("circom_tester");
const { resolveCircomIncludeRoot } = require("./helper_functions.js");

const libraryDir = process.env.QAP_SUBCIRCUIT_LIBRARY_DIR
  ?? path.join(__dirname, "../library");
const builder = require(path.join(libraryDir, "witness_calculator.js"));
const include = resolveCircomIncludeRoot(path.join(__dirname, "../.."));
const WORD_BASE = 1n << 256n;
const SIGN_BIT = 1n << 255n;
const WORD_MASK = WORD_BASE - 1n;
const LIMB_MASK = (1n << 128n) - 1n;
const RANDOM_CASES_PER_OPERATION = 128;

const selectors = {
  DIV: 1n << 3n,
  SDIV: 1n << 4n,
  MOD: 1n << 5n,
  SMOD: 1n << 6n,
};

const split128 = (value) => [value & LIMB_MASK, value >> 128n];
const unsignedWord = (value) => value & WORD_MASK;
const signedWord = (value) => value >= SIGN_BIT ? value - WORD_BASE : value;
const randomWord = () => BigInt(`0x${crypto.randomBytes(32).toString("hex")}`);
const normalizeWitness = (values) => values.map((value) => BigInt(value.toString()));

const execute = (operation, dividend, divisor) => {
  if (divisor === 0n) {
    return 0n;
  }
  switch (operation) {
    case "DIV":
      return dividend / divisor;
    case "MOD":
      return dividend % divisor;
    case "SDIV":
      return unsignedWord(signedWord(dividend) / signedWord(divisor));
    case "SMOD":
      return unsignedWord(signedWord(dividend) % signedWord(divisor));
    default:
      throw new Error(`Unsupported operation ${operation}`);
  }
};

const encodePart1Input = (operation, dividend, divisor) => [
  selectors[operation],
  ...split128(dividend),
  ...split128(divisor),
];

const loadCalculators = async () => {
  const subcircuitInfo = JSON.parse(
    readFileSync(path.join(libraryDir, "subcircuitInfo.json"), "utf8"),
  );
  const load = async (name) => {
    const info = subcircuitInfo.find((entry) => entry.name === name);
    if (info === undefined) {
      throw new Error(`${name} subcircuit was not found in subcircuitInfo.json`);
    }
    return builder(readFileSync(path.join(libraryDir, `wasm/subcircuit${info.id}.wasm`)));
  };

  return {
    first: await load("ALU4A"),
    second: await load("ALU4B"),
  };
};

const calculatePair = async (calculators, operation, dividend, divisor) => {
  const firstWitness = await calculators.first.calculateWitness({
    in: encodePart1Input(operation, dividend, divisor),
  }, true);
  const bridge = normalizeWitness(firstWitness.slice(1, 14));
  assert.equal(bridge.length, 13, "ALU4A must expose exactly 13 output wires");

  const secondWitness = await calculators.second.calculateWitness({ in: bridge }, true);
  return {
    bridge,
    result: normalizeWitness(secondWitness.slice(1, 3)),
  };
};

const assertOperation = async (calculators, operation, dividend, divisor, label) => {
  const { result } = await calculatePair(
    calculators,
    operation,
    dividend,
    divisor,
  );
  assert.deepEqual(
    result,
    split128(execute(operation, dividend, divisor)),
    label,
  );
};

const mutateAndReject = async (circuit, witness, symbol, value) => {
  const wireIndex = circuit.symbols[symbol]?.varIdx;
  assert.notEqual(wireIndex, undefined, `${symbol} must exist`);
  assert.notEqual(wireIndex, -1, `${symbol} must survive O1`);
  const changed = [...witness];
  changed[wireIndex] = value;
  await assert.rejects(
    circuit.checkConstraints(changed),
    /Constraint doesn't match/,
    `${symbol} mutation must be rejected`,
  );
};

const main = async () => {
  const calculators = await loadCalculators();
  const boundaryCases = [
    ["DIV", 0n, 0n],
    ["DIV", 1n, 0n],
    ["DIV", WORD_MASK, 0n],
    ["DIV", WORD_MASK, 1n],
    ["DIV", WORD_MASK, WORD_MASK],
    ["MOD", WORD_MASK, 0n],
    ["MOD", WORD_MASK, 2n],
    ["MOD", WORD_MASK, (1n << 128n) + 17n],
    ["SDIV", unsignedWord(-7n), 3n],
    ["SDIV", unsignedWord(-7n), unsignedWord(-3n)],
    ["SDIV", 7n, unsignedWord(-3n)],
    ["SDIV", SIGN_BIT, unsignedWord(-1n)],
    ["SDIV", SIGN_BIT, 1n],
    ["SDIV", SIGN_BIT, 0n],
    ["SMOD", unsignedWord(-7n), 3n],
    ["SMOD", 7n, unsignedWord(-3n)],
    ["SMOD", unsignedWord(-7n), unsignedWord(-3n)],
    ["SMOD", SIGN_BIT, unsignedWord(-1n)],
    ["SMOD", unsignedWord(-123n), 0n],
  ];

  for (const [index, [operation, dividend, divisor]] of boundaryCases.entries()) {
    await assertOperation(
      calculators,
      operation,
      dividend,
      divisor,
      `${operation} boundary case ${index}`,
    );
  }

  for (const operation of Object.keys(selectors)) {
    for (let index = 0; index < RANDOM_CASES_PER_OPERATION; index++) {
      await assertOperation(
        calculators,
        operation,
        randomWord(),
        randomWord(),
        `${operation} randomized case ${index}`,
      );
    }
  }

  const signedBridge = await calculatePair(
    calculators,
    "SMOD",
    unsignedWord(-7n),
    3n,
  );
  assert.deepEqual(
    signedBridge.bridge,
    [7n, 0n, 2n, 0n, 1n, 0n, 3n, 0n, 0n, 0n, 0n, 1n, 1n],
    "ALU4A-to-ALU4B wire order must match the 13-wire contract",
  );

  for (const selector of [0n, 3n << 4n, 1n << 8n]) {
    await assert.rejects(
      calculators.first.calculateWitness({ in: [selector, 1n, 0n, 1n, 0n] }, true),
    );
  }

  const invalidLimb = 1n << 128n;
  for (let limb = 1; limb <= 4; limb++) {
    const input = [selectors.SDIV, 0n, 0n, 1n, 0n];
    input[limb] = invalidLimb;
    await assert.rejects(calculators.first.calculateWitness({ in: input }, true));
  }

  const packageRoot = path.join(__dirname, "../..");
  const circuit = await wasm(
    path.join(__dirname, "circom/division_family_composed.circom"),
    {
      include,
      prime: "bls12381",
      O: 2,
    },
  );
  const mutationInput = {
    selector: selectors.SMOD,
    dividend: split128(unsignedWord(-((1n << 200n) + 12345n))),
    divisor: split128((1n << 129n) + 77n),
  };
  const mutationWitness = await circuit.calculateWitness(mutationInput, true);
  await circuit.loadSymbols();

  const quotientLowIndex = circuit.symbols["main.first.absQuotient[0]"]?.varIdx;
  const remainderHighIndex = circuit.symbols["main.first.absRemainder[1]"]?.varIdx;
  const coefficientHighIndex = circuit.symbols["main.second.coefficient[4]"]?.varIdx;
  const negativeValueSymbol = Object.keys(circuit.symbols).find(
    (symbol) => symbol.startsWith(
      "main.second.RecoverSignedMagnitudeFromCanonical_unsafe_",
    ) && symbol.endsWith(".negativeValue[0]"),
  );
  assert.notEqual(quotientLowIndex, undefined);
  assert.notEqual(remainderHighIndex, undefined);
  assert.notEqual(coefficientHighIndex, undefined);
  assert.notEqual(negativeValueSymbol, undefined);

  await mutateAndReject(
    circuit,
    mutationWitness,
    "main.first.absQuotient[0]",
    BigInt(mutationWitness[quotientLowIndex].toString()) + 1n,
  );
  await mutateAndReject(
    circuit,
    mutationWitness,
    "main.first.absRemainder[1]",
    BigInt(mutationWitness[remainderHighIndex].toString()) + 1n,
  );
  await mutateAndReject(circuit, mutationWitness, "main.second.carry[0]", 1n << 65n);
  await mutateAndReject(circuit, mutationWitness, "main.second.carry[1]", 1n << 66n);
  await mutateAndReject(
    circuit,
    mutationWitness,
    "main.second.coefficient[4]",
    BigInt(mutationWitness[coefficientHighIndex].toString()) + 1n,
  );
  await mutateAndReject(circuit, mutationWitness, negativeValueSymbol, 0n);
  await mutateAndReject(circuit, mutationWitness, "main.first.isSigned", 0n);
  await mutateAndReject(circuit, mutationWitness, "main.first.useMod", 0n);
  await mutateAndReject(circuit, mutationWitness, "main.out[0]", 0n);

  console.log(
    `ALU4A/ALU4B passed ${boundaryCases.length} boundary cases, ${RANDOM_CASES_PER_OPERATION} randomized cases per operation, exact bridge ordering, input rejection, and composed soundness mutations`,
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
