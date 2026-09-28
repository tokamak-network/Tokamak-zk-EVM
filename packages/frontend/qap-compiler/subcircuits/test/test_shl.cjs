const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { readFileSync } = require("node:fs");

const { wasm } = require("circom_tester");
const { resolveCircomIncludeRoot } = require("./helper_functions.js");
const { split256BitInteger } = require("./helper_functions.js");

const libraryDir = process.env.QAP_SUBCIRCUIT_LIBRARY_DIR
  ?? path.join(__dirname, "../library");
const builder = require(path.join(libraryDir, "witness_calculator.js"));
const include = resolveCircomIncludeRoot(path.join(__dirname, "../.."));
const MAX_UINT256 = (1n << 256n) - 1n;
const RANDOM_CASES = 128;

const randomWord = () => BigInt(`0x${crypto.randomBytes(32).toString("hex")}`);
const expectedShiftLeft = (shift, value) => {
  return shift >= 256n ? 0n : value << shift & MAX_UINT256;
};

const loadShiftLeft = async () => {
  const subcircuitInfo = JSON.parse(
    readFileSync(path.join(libraryDir, "subcircuitInfo.json"), "utf8"),
  );
  const shiftLeftInfo = subcircuitInfo.find((entry) => entry.name === "SHL");
  if (shiftLeftInfo === undefined) {
    throw new Error("SHL subcircuit was not found in subcircuitInfo.json");
  }
  return builder(
    readFileSync(path.join(libraryDir, `wasm/subcircuit${shiftLeftInfo.id}.wasm`)),
  );
};

const calculate = (witnessCalculator, shift, value) => {
  return witnessCalculator.calculateWitness({
    in: [
      ...split256BitInteger(shift),
      ...split256BitInteger(value),
    ],
  }, true);
};

const assertShiftLeft = async (witnessCalculator, shift, value, label) => {
  const witness = await calculate(witnessCalculator, shift, value);
  const [expectedLow, expectedHigh] = split256BitInteger(
    expectedShiftLeft(shift, value),
  );
  assert.equal(BigInt(witness[1].toString()), expectedLow, `${label} low limb`);
  assert.equal(BigInt(witness[2].toString()), expectedHigh, `${label} high limb`);
};

const main = async () => {
  const witnessCalculator = await loadShiftLeft();
  const patternedValue = BigInt(
    `0x${Array.from({ length: 32 }, (_, index) => (index * 5 + 1).toString(16).padStart(2, "0")).join("")}`,
  );
  const boundaryShifts = [
    0n,
    1n,
    63n,
    64n,
    127n,
    128n,
    191n,
    192n,
    254n,
    255n,
    256n,
    257n,
    1n << 128n,
    1n << 255n,
    MAX_UINT256,
  ];
  const boundaryValues = [0n, 1n, patternedValue, MAX_UINT256];
  for (const shift of boundaryShifts) {
    for (const value of boundaryValues) {
      await assertShiftLeft(
        witnessCalculator,
        shift,
        value,
        `SHL boundary ${shift}:${value}`,
      );
    }
  }

  for (let index = 0; index < RANDOM_CASES; index++) {
    const value = randomWord();
    await assertShiftLeft(
      witnessCalculator,
      BigInt(crypto.randomBytes(1)[0]),
      value,
      `SHL in-range randomized case ${index}`,
    );
    await assertShiftLeft(
      witnessCalculator,
      randomWord(),
      value,
      `SHL full-domain randomized case ${index}`,
    );
  }

  const invalidLimb = 1n << 128n;
  for (const limb of [0, 2, 3]) {
    const input = [0n, 0n, 0n, 0n];
    input[limb] = invalidLimb;
    await assert.rejects(
      witnessCalculator.calculateWitness({ in: input }, true),
      undefined,
      `non-canonical input limb ${limb} must be rejected`,
    );
  }
  const nonCanonicalHighShiftWitness = await witnessCalculator.calculateWitness({
    in: [
      0n,
      1n << 128n,
      ...split256BitInteger(patternedValue),
    ],
  }, true);
  assert.equal(BigInt(nonCanonicalHighShiftWitness[1].toString()), 0n);
  assert.equal(BigInt(nonCanonicalHighShiftWitness[2].toString()), 0n);
  const packageRoot = path.join(__dirname, "../..");
  const circuit = await wasm(
    path.join(packageRoot, "subcircuits/circom/SHL_circuit.circom"),
    {
      include,
      prime: "bls12381",
      O: 2,
    },
  );
  const witness = await circuit.calculateWitness({
    in: [1n, 0n, 1n, 0n],
  }, true);
  await circuit.loadSymbols();
  const outputLowIndex = circuit.symbols["main.out[0]"]?.varIdx;
  assert.notEqual(outputLowIndex, undefined);
  const maliciousWitness = [...witness];
  maliciousWitness[outputLowIndex] = 0n;
  await assert.rejects(
    circuit.checkConstraints(maliciousWitness),
    /Constraint doesn't match/,
  );

  const oversizedWitness = await circuit.calculateWitness({
    in: [0n, 1n << 128n, ...split256BitInteger(patternedValue)],
  }, true);
  assert.equal(BigInt(oversizedWitness[1].toString()), 0n);
  assert.equal(BigInt(oversizedWitness[2].toString()), 0n);
  const highIsZeroInverseSymbol = Object.keys(circuit.symbols).find((name) => (
    name.endsWith(".shiftHighIsZero.inv")
  ));
  assert.notEqual(highIsZeroInverseSymbol, undefined);
  const highIsZeroIndex = circuit.symbols[highIsZeroInverseSymbol]?.varIdx;
  assert.notEqual(highIsZeroIndex, undefined);
  const maliciousOversizedWitness = [...oversizedWitness];
  maliciousOversizedWitness[highIsZeroIndex] = 1n;
  await assert.rejects(
    circuit.checkConstraints(maliciousOversizedWitness),
    /Constraint doesn't match/,
  );

  console.log(
    `SHL passed ${boundaryShifts.length * boundaryValues.length} boundary cases, ${RANDOM_CASES} in-range and ${RANDOM_CASES} full-domain randomized cases, constrained-limb checks, high-shift zero detection, and output mutation rejection`,
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
