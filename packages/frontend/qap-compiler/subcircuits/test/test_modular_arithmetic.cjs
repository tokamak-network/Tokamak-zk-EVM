const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const { wasm } = require("circom_tester");

const { resolveCircomIncludeRoot, split256BitInteger } = require("./helper_functions.js");

const WORD_BASE = 1n << 256n;
const WORD_MASK = WORD_BASE - 1n;
const RANDOM_CASES = 64;

const randomWord = () => BigInt(`0x${crypto.randomBytes(32).toString("hex")}`);

const operations = [
  {
    name: "ADDMOD",
    circuit: "subcircuits/test/circom/addmod257_composed.circom",
    selector: null,
    evaluate: (lhs, rhs, modulus) => modulus === 0n
      ? 0n
      : (lhs + rhs) % modulus,
  },
  {
    name: "MULMOD",
    circuit: "subcircuits/test/circom/mulmod_composed.circom",
    selector: null,
    evaluate: (lhs, rhs, modulus) => modulus === 0n
      ? 0n
      : lhs * rhs % modulus,
  },
];

const encodeInput = (operation, lhs, rhs, modulus) => ({
  in: [
    ...(operation.selector === null ? [] : [operation.selector]),
    ...split256BitInteger(lhs),
    ...split256BitInteger(rhs),
    ...split256BitInteger(modulus),
  ],
});

const assertOperation = async (
  circuit,
  operation,
  lhs,
  rhs,
  modulus,
  label,
) => {
  const witness = await circuit.calculateWitness(
    encodeInput(operation, lhs, rhs, modulus),
    true,
  );
  const expected = split256BitInteger(operation.evaluate(lhs, rhs, modulus));
  assert.equal(BigInt(witness[1].toString()), expected[0], `${label} low limb`);
  assert.equal(BigInt(witness[2].toString()), expected[1], `${label} high limb`);
  return witness;
};

const findSurvivingWire = (circuit, suffix) => {
  const matches = Object.entries(circuit.symbols)
    .filter(([name, symbol]) => name.endsWith(suffix) && symbol.varIdx >= 0);
  assert.ok(matches.length > 0, `${suffix} must survive O2`);
  return matches[0][1].varIdx;
};

const main = async () => {
  const packageRoot = path.join(__dirname, "../..");
  const include = resolveCircomIncludeRoot(packageRoot);
  const boundaries = [
    [0n, 0n, 0n],
    [WORD_MASK, WORD_MASK, 1n],
    [WORD_MASK, WORD_MASK, 2n],
    [5n, 7n, 10n],
    [WORD_MASK, WORD_MASK, 97n],
    [WORD_MASK, WORD_MASK, WORD_MASK],
    [WORD_MASK, 1n, 0n],
    [1n << 255n, (1n << 255n) + 1n, (1n << 128n) + 51n],
  ];

  for (const operation of operations) {
    const circuit = await wasm(
      path.join(
        packageRoot,
        operation.circuit,
      ),
      {
        include,
        prime: "bls12381",
        O: 2,
      },
    );

    let mutationWitness;
    for (const [index, [lhs, rhs, modulus]] of boundaries.entries()) {
      const witness = await assertOperation(
        circuit,
        operation,
        lhs,
        rhs,
        modulus,
        `${operation.name} boundary ${index}`,
      );
      if (modulus === 97n) {
        mutationWitness = witness;
      }
    }
    for (let index = 0; index < RANDOM_CASES; index++) {
      await assertOperation(
        circuit,
        operation,
        randomWord(),
        randomWord(),
        randomWord(),
        `${operation.name} randomized ${index}`,
      );
    }

    const invalidLimb = 1n << 128n;
    const firstInputLimb = operation.selector === null ? 0 : 1;
    for (const limb of Array.from({ length: 6 }, (_, index) => firstInputLimb + index)) {
      const input = encodeInput(operation, 0n, 0n, 1n).in;
      input[limb] = invalidLimb;
      await assert.rejects(
        circuit.calculateWitness({ in: input }, true),
        undefined,
        `${operation.name} must reject non-canonical input limb ${limb}`,
      );
    }
    if (operation.selector !== null) {
      for (const selector of [
        0n,
        1n,
        operation.selector + 1n,
        1n << 9n,
      ]) {
        await assert.rejects(
          circuit.calculateWitness({
            in: [selector, 0n, 0n, 0n, 0n, 1n, 0n],
          }, true),
          undefined,
          `${operation.name} must reject selector ${selector}`,
        );
      }
    }

    assert.notEqual(mutationWitness, undefined);
    await circuit.loadSymbols();
    const mutationTargets = [
      circuit.symbols["main.out[0]"].varIdx,
      circuit.symbols["main.out[1]"].varIdx,
      findSurvivingWire(circuit, ".quotientWords[0]"),
      findSurvivingWire(
        circuit,
        operation.name === "ADDMOD"
          ? ".verify.remainderSplit.bits[0].out[0]"
          : ".remainderWords[0]",
      ),
      ...(operation.name === "ADDMOD" ? [
        findSurvivingWire(circuit, ".prepare.numeratorWords[0]"),
        findSurvivingWire(circuit, ".prepare.quotientWords[0]"),
        findSurvivingWire(circuit, ".prepare.quotientWords[2]"),
        findSurvivingWire(circuit, ".verify.products[0][0]"),
        findSurvivingWire(circuit, ".verify.carry[0]"),
      ] : [
        findSurvivingWire(circuit, ".prepare.lhsWords[0]"),
        findSurvivingWire(circuit, ".verify.lhsProducts[0][0]"),
        findSurvivingWire(circuit, ".verify.quotientProducts[0][0]"),
      ]),
    ];
    for (const wireIndex of new Set(mutationTargets)) {
      const mutated = [...mutationWitness];
      mutated[wireIndex] = BigInt(mutated[wireIndex].toString()) + 1n;
      await assert.rejects(
        circuit.checkConstraints(mutated),
        /Constraint doesn't match/,
        `${operation.name} wire ${wireIndex} mutation must be rejected`,
      );
    }

    console.log(
      `${operation.name} passed ${boundaries.length} boundary cases, ${RANDOM_CASES} randomized cases, local canonicality, and mutation checks`,
    );
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
