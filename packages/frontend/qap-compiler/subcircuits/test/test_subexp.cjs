const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const { wasm } = require("circom_tester");

const { resolveCircomIncludeRoot, split256BitInteger } = require("./helper_functions.js");

const WORD_MASK = (1n << 256n) - 1n;
const RANDOM_CASES = 32;

const randomWord = () => BigInt(`0x${crypto.randomBytes(32).toString("hex")}`);

const executeStep = (accumulator, basePower, exponentRemainder) => {
  const bit = exponentRemainder & 1n;
  return [
    accumulator * (bit === 1n ? basePower : 1n) & WORD_MASK,
    basePower * basePower & WORD_MASK,
    exponentRemainder >> 1n,
  ];
};

const encodeStep = (accumulator, basePower, exponentRemainder) => ({
  in: [
    ...split256BitInteger(accumulator),
    ...split256BitInteger(basePower),
    ...split256BitInteger(exponentRemainder),
  ],
});

const assertStep = async (circuit, accumulator, basePower, exponentRemainder, label) => {
  const witness = await circuit.calculateWitness(
    encodeStep(accumulator, basePower, exponentRemainder),
    true,
  );
  const [nextAccumulator, nextBasePower, nextExponentRemainder] = executeStep(
    accumulator,
    basePower,
    exponentRemainder,
  );
  await circuit.loadSymbols();
  const readOutput = (index) => BigInt(
    witness[circuit.symbols[`main.out[${index}]`].varIdx].toString(),
  );
  assert.deepEqual(
    Array.from({ length: 6 }, (_, index) => readOutput(index)),
    [
      ...split256BitInteger(nextAccumulator),
      ...split256BitInteger(nextBasePower),
      ...split256BitInteger(nextExponentRemainder),
    ],
    label,
  );
  return witness;
};

const main = async () => {
  const packageRoot = path.join(__dirname, "../..");
  const include = resolveCircomIncludeRoot(packageRoot);
  const circuit = await wasm(
    path.join(packageRoot, "subcircuits/circom/SubExp_circuit.circom"),
    { include, prime: "bls12381", O: 2 },
  );
  const composed = await wasm(
    path.join(packageRoot, "subcircuits/test/circom/subexp_composed.circom"),
    { include, prime: "bls12381", O: 2 },
  );
  const checker = await wasm(
    path.join(packageRoot, "subcircuits/circom/CheckBus256_circuit.circom"),
    { include, prime: "bls12381", O: 2 },
  );

  await assertStep(circuit, 0n, 0n, 0n, "zero state");
  await assertStep(circuit, 1n, 0n, 3n, "zero base");
  await assertStep(circuit, WORD_MASK, 1n, 1n, "one base");
  await assertStep(circuit, WORD_MASK, WORD_MASK, WORD_MASK, "maximum words");

  for (let index = 0; index < RANDOM_CASES; index++) {
    await assertStep(
      circuit,
      randomWord(),
      randomWord(),
      randomWord(),
      `randomized ${index}`,
    );
  }

  const invalidLimb = 1n << 128n;
  for (let limb = 0; limb < 4; limb++) {
    const input = [0n, 0n, 0n, 0n, 0n, 0n];
    input[limb] = invalidLimb;
    await assert.rejects(
      circuit.calculateWitness({ in: input }, true),
      undefined,
      `entry limb ${limb} must be canonical`,
    );
  }

  const checkedWord = split256BitInteger(WORD_MASK);
  await checker.calculateWitness({ in: checkedWord }, true);
  await assert.rejects(
    checker.calculateWitness({ in: [1n << 128n, 0n] }, true),
    undefined,
    "terminal checker must reject a non-canonical limb",
  );

  const accumulator = randomWord();
  const basePower = randomWord();
  const exponentRemainder = 3n;
  const composedWitness = await composed.calculateWitness({
    in: [
      ...split256BitInteger(accumulator),
      ...split256BitInteger(basePower),
      ...split256BitInteger(exponentRemainder),
    ],
  }, true);
  const [firstAccumulator, firstBasePower, firstRemainder] = executeStep(
    accumulator,
    basePower,
    exponentRemainder,
  );
  const [finalAccumulator] = executeStep(
    firstAccumulator,
    firstBasePower,
    firstRemainder,
  );
  assert.deepEqual(
    composedWitness.slice(1, 3).map((value) => BigInt(value.toString())),
    split256BitInteger(finalAccumulator),
    "composed result",
  );

  await composed.loadSymbols();
  for (const signalName of [
    "main.step0.out[0]",
    "main.step0.out[3]",
    "main.step1.accumulate.carryLow",
    "main.out[1]",
  ]) {
    const wireIndex = composed.symbols[signalName]?.varIdx;
    assert.notEqual(wireIndex, undefined, `${signalName} must exist`);
    assert.notEqual(wireIndex, -1, `${signalName} must survive O2`);
    const mutated = [...composedWitness];
    mutated[wireIndex] = BigInt(mutated[wireIndex].toString()) + 1n;
    await assert.rejects(
      composed.checkConstraints(mutated),
      /Constraint doesn't match/,
      `${signalName} mutation must be rejected`,
    );
  }

  await assert.rejects(
    composed.calculateWitness({ in: [0n, 0n, 1n, 0n, 4n, 0n] }, true),
    undefined,
    "composed remainder must reach zero",
  );

  console.log(
    `SubExp passed ${RANDOM_CASES} randomized steps, entry canonicality, and exact composed-state checks`,
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
