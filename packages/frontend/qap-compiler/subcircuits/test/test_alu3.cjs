const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const { wasm } = require("circom_tester");

const { resolveCircomIncludeRoot, split256BitInteger } = require("./helper_functions.js");

const WORD_BASE = 1n << 256n;
const MAX_UINT256 = WORD_BASE - 1n;
const RANDOM_CASES = 64;

const randomWord = () => BigInt(`0x${crypto.randomBytes(32).toString("hex")}`);
const expectedByte = (index, value) => (
  index >= 32n ? 0n : value >> (8n * (31n - index)) & 0xffn
);
const expectedSignExtend = (index, value) => {
  if (index >= 32n) return value;
  const signPosition = 8n * index + 7n;
  const retainedMask = (1n << (signPosition + 1n)) - 1n;
  return (value >> signPosition & 1n) === 1n
    ? value | (MAX_UINT256 ^ retainedMask)
    : value & retainedMask;
};
const expectedSar = (shift, value) => {
  const signedValue = value >> 255n === 0n ? value : value - WORD_BASE;
  return shift >= 256n
    ? signedValue < 0n ? MAX_UINT256 : 0n
    : signedValue >> shift & MAX_UINT256;
};

const operations = [
  { name: "SIGNEXTEND", selector: 1n, evaluate: expectedSignExtend },
  { name: "BYTE", selector: 2n, evaluate: expectedByte },
  { name: "SAR", selector: 4n, evaluate: expectedSar },
];

const encodeInput = (selector, indexOrShift, value) => ({
  in: [selector, ...split256BitInteger(indexOrShift), ...split256BitInteger(value)],
});

const assertOperation = async (circuit, operation, indexOrShift, value, label) => {
  const witness = await circuit.calculateWitness(
    encodeInput(operation.selector, indexOrShift, value),
    true,
  );
  const [expectedLow, expectedHigh] = split256BitInteger(
    operation.evaluate(indexOrShift, value),
  );
  assert.equal(BigInt(witness[1].toString()), expectedLow, `${label} low limb`);
  assert.equal(BigInt(witness[2].toString()), expectedHigh, `${label} high limb`);
};

const main = async () => {
  const packageRoot = path.join(__dirname, "../..");
  const include = resolveCircomIncludeRoot(packageRoot);
  const circuit = await wasm(
    path.join(packageRoot, "subcircuits/circom/ALU3_circuit.circom"),
    { include, prime: "bls12381", O: 2 },
  );

  const patternedValue = BigInt(
    `0x${Array.from({ length: 32 }, (_, index) => (
      (index * 7 + 3).toString(16).padStart(2, "0")
    )).join("")}`,
  );
  const boundaryIndices = [0n, 1n, 31n, 32n, 255n, 256n, 1n << 128n, MAX_UINT256];
  const boundaryValues = [0n, 1n, patternedValue, 1n << 255n, MAX_UINT256];

  for (const operation of operations) {
    for (const indexOrShift of boundaryIndices) {
      for (const value of boundaryValues) {
        await assertOperation(circuit, operation, indexOrShift, value,
          `${operation.name} boundary ${indexOrShift}:${value}`);
      }
    }
    for (let index = 0; index < RANDOM_CASES; index++) {
      await assertOperation(circuit, operation, randomWord(), randomWord(),
        `${operation.name} random ${index}`);
    }
  }

  for (const limb of [3, 4]) {
    const input = [1n << 26n, 0n, 0n, 0n, 0n];
    input[limb] = 1n << 128n;
    await assert.rejects(circuit.calculateWitness({ in: input }, true), undefined,
      `non-canonical value limb ${limb} must be rejected`);
  }
  for (const selector of [0n, 8n, 16n, MAX_UINT256]) {
    await assert.rejects(circuit.calculateWitness(encodeInput(selector, 0n, patternedValue), true), undefined,
      `unsupported selector ${selector} must be rejected`);
  }

  const witness = await circuit.calculateWitness(
    encodeInput(4n, 13n, MAX_UINT256), true,
  );
  await circuit.loadSymbols();
  for (const symbolName of [
    "main.out[0]",
    "main.out[1]",
    "main.shiftCore.outBits[0][0]",
    "main.inversePower.negativeFiller[1]",
    "main.indexShiftBits[0]",
  ]) {
    const wireIndex = circuit.symbols[symbolName]?.varIdx;
    assert.notEqual(wireIndex, undefined, `${symbolName} must exist`);
    const maliciousWitness = [...witness];
    maliciousWitness[wireIndex] = BigInt(maliciousWitness[wireIndex].toString()) + 1n;
    await assert.rejects(circuit.checkConstraints(maliciousWitness), /Constraint doesn't match/,
      `${symbolName} mutation must be rejected`);
  }

  console.log(`ALU3 passed BYTE, SIGNEXTEND, and SAR with ${RANDOM_CASES} randomized cases each`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
