const assert = require("node:assert/strict");
const path = require("node:path");

const { wasm } = require("circom_tester");
const { resolveCircomIncludeRoot } = require("./helper_functions.js");

const FIELD_PRIME = 52435875175126190479447740508185965837690552500527637822603658699938581184513n;
const LIMB_BASE = 1n << 128n;
const LIMB_MASK = LIMB_BASE - 1n;

const split = (value) => [value & LIMB_MASK, value >> 128n];

const main = async () => {
  const packageRoot = path.join(__dirname, "../..");
  const include = resolveCircomIncludeRoot(packageRoot);
  const circuit = await wasm(
    path.join(packageRoot, "subcircuits/circom/FrToLimbsPair_circuit.circom"),
    {
      include,
      prime: "bls12381",
      O: 2,
    },
  );

  const vectors = [
    [0n, 1n],
    [LIMB_BASE - 1n, LIMB_BASE],
    [FIELD_PRIME - 2n, FIELD_PRIME - 1n],
  ];

  for (const [first, second] of vectors) {
    const witness = await circuit.calculateWitness({ in: [first, second] }, true);
    await circuit.checkConstraints(witness);
    await circuit.assertOut(witness, { out: [...split(first), ...split(second)] });
  }

  console.log("FrToLimbsPair converts canonical native field values to lower-first limbs");
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
