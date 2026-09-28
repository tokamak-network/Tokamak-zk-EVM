const assert = require("node:assert/strict");
const path = require("node:path");

const { wasm } = require("circom_tester");
const { resolveCircomIncludeRoot } = require("./helper_functions.js");

const MAX_LIMB = (1n << 128n) - 1n;

const main = async () => {
  const packageRoot = path.join(__dirname, "../..");
  const include = resolveCircomIncludeRoot(packageRoot);
  const circuit = await wasm(
    path.join(packageRoot, "subcircuits/circom/EQ_circuit.circom"),
    {
      include,
      prime: "bls12381",
      O: 2,
    },
  );

  for (const { input, expected, label } of [
    { input: [0n, 0n, 0n, 0n], expected: 1n, label: "zero pairs" },
    { input: [1n, 0n, 1n, 0n], expected: 1n, label: "equal low limbs" },
    { input: [0n, 1n, 0n, 1n], expected: 1n, label: "equal high limbs" },
    {
      input: [MAX_LIMB, MAX_LIMB, MAX_LIMB, MAX_LIMB],
      expected: 1n,
      label: "equal maximum canonical limbs",
    },
    { input: [1n, 0n, 0n, 1n], expected: 0n, label: "different pairs" },
    {
      input: [1n << 128n, 0n, 1n << 128n, 0n],
      expected: 1n,
      label: "equal non-canonical limbs",
    },
    {
      input: [1n << 128n, 0n, 0n, 1n],
      expected: 0n,
      label: "distinct non-canonical encodings",
    },
  ]) {
    const witness = await circuit.calculateWitness({ in: input }, true);
    assert.equal(BigInt(witness[1].toString()), expected, `${label}: result`);
    assert.equal(BigInt(witness[2].toString()), 0n, `${label}: high result limb`);
  }

  const witness = await circuit.calculateWitness({ in: [1n, 0n, 1n, 0n] }, true);
  await circuit.loadSymbols();
  const resultWire = circuit.symbols["main.out[0]"].varIdx;
  const mutatedWitness = [...witness];
  mutatedWitness[resultWire] = 0n;
  await assert.rejects(circuit.checkConstraints(mutatedWitness));

  console.log("EQ compares physical limb pairs without input range checks");
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
