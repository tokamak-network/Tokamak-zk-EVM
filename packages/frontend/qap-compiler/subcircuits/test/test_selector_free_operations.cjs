const assert = require("node:assert/strict");
const path = require("node:path");

const { wasm } = require("circom_tester");
const { resolveCircomIncludeRoot } = require("./helper_functions.js");

const WORD_BITS = 256n;
const WORD_BASE = 1n << WORD_BITS;
const WORD_MASK = WORD_BASE - 1n;
const SIGN_BIT = 1n << (WORD_BITS - 1n);
const MAX_LIMB = (1n << 128n) - 1n;

const splitWord = (value) => [value & MAX_LIMB, value >> 128n];
const toSignedWord = (value) => value >= SIGN_BIT ? value - WORD_BASE : value;
const moduloWord = (value) => (value + WORD_BASE) % WORD_BASE;

const operations = [
  { name: "ADD", expected: (lhs, rhs) => (lhs + rhs) & WORD_MASK },
  { name: "MUL", expected: (lhs, rhs) => (lhs * rhs) & WORD_MASK },
  { name: "SUB", expected: (lhs, rhs) => moduloWord(lhs - rhs) },
  { name: "NOT", expected: (value) => WORD_MASK ^ value, unary: true },
  { name: "LT", expected: (lhs, rhs) => lhs < rhs ? 1n : 0n },
  { name: "GT", expected: (lhs, rhs) => lhs > rhs ? 1n : 0n },
  {
    name: "SLT",
    expected: (lhs, rhs) => toSignedWord(lhs) < toSignedWord(rhs) ? 1n : 0n,
  },
  {
    name: "SGT",
    expected: (lhs, rhs) => toSignedWord(lhs) > toSignedWord(rhs) ? 1n : 0n,
  },
  { name: "AND", expected: (lhs, rhs) => lhs & rhs },
  { name: "OR", expected: (lhs, rhs) => lhs | rhs },
  { name: "XOR", expected: (lhs, rhs) => lhs ^ rhs },
  {
    name: "SHR",
    expected: (shift, value) => shift >= WORD_BITS ? 0n : value >> shift,
    shift: true,
  },
];

const wordCases = [
  0n,
  1n,
  (1n << 128n) - 1n,
  1n << 128n,
  SIGN_BIT - 1n,
  SIGN_BIT,
  WORD_MASK,
];
const shiftCases = [0n, 1n, 127n, 128n, 255n, 256n, WORD_MASK];

const inputFor = (operation, lhs, rhs) => {
  if (operation.unary) {
    return splitWord(lhs);
  }
  return [...splitWord(lhs), ...splitWord(rhs)];
};

const assertResult = async (circuit, operation, lhs, rhs, label) => {
  const input = inputFor(operation, lhs, rhs);
  const witness = await circuit.calculateWitness({ in: input }, true);
  const expected = operation.expected(lhs, rhs);
  const [expectedLow, expectedHigh] = splitWord(expected);
  assert.equal(BigInt(witness[1].toString()), expectedLow, `${operation.name} ${label}: low limb`);
  assert.equal(BigInt(witness[2].toString()), expectedHigh, `${operation.name} ${label}: high limb`);
  return witness;
};

const main = async () => {
  const packageRoot = path.join(__dirname, "../..");
  const include = resolveCircomIncludeRoot(packageRoot);

  for (const operation of operations) {
    const circuit = await wasm(
      path.join(packageRoot, `subcircuits/circom/${operation.name}_circuit.circom`),
      {
        include,
        prime: "bls12381",
        O: 2,
      },
    );

    let witness;
    if (operation.shift) {
      for (const shift of shiftCases) {
        for (const value of wordCases) {
          witness = await assertResult(circuit, operation, shift, value, `${shift}:${value}`);
        }
      }
    } else if (operation.unary) {
      for (const value of wordCases) {
        witness = await assertResult(circuit, operation, value, 0n, `${value}`);
      }
    } else {
      for (const lhs of wordCases) {
        for (const rhs of wordCases) {
          witness = await assertResult(circuit, operation, lhs, rhs, `${lhs}:${rhs}`);
        }
      }
    }

    await circuit.loadSymbols();
    const resultWire = circuit.symbols["main.out[0]"]?.varIdx;
    assert.notEqual(resultWire, undefined, `${operation.name}: main.out[0] must exist`);
    const mutatedWitness = [...witness];
    mutatedWitness[resultWire] = (BigInt(mutatedWitness[resultWire].toString()) + 1n) % WORD_BASE;
    await assert.rejects(
      circuit.checkConstraints(mutatedWitness),
      undefined,
      `${operation.name}: mutated result must be rejected`,
    );
  }

  console.log("selector-free operation circuits handle canonical boundary values and reject mutated outputs");
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
