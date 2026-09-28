const assert = require("node:assert/strict");
const { mkdirSync, mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { wasm } = require("circom_tester");
const { jubjub } = require("@noble/curves/misc.js");
const {
  createTransactionSignatureCorpus,
  getChallengeInputs,
} = require("./transaction_signature_verify_oracle.cjs");
const { resolveCircomIncludeRoot } = require("./helper_functions.js");

const FIELD_PRIME = 52435875175126190479447740508185965837690552500527637822603658699938581184513n;
const LIMB_MASK = (1n << 128n) - 1n;

const stripAnsi = (value) => value.replace(
  // eslint-disable-next-line no-control-regex
  /\u001b\[[0-9;]*m/g,
  "",
);

const compileAndMeasure = (packageRoot, outputRoot) => {
  const include = resolveCircomIncludeRoot(packageRoot);
  const target = "TransactionSignaturePointPolicy";
  const outputDirectory = path.join(outputRoot, target);
  mkdirSync(outputDirectory);
  const result = spawnSync("circom", [
    path.join(packageRoot, `subcircuits/circom/${target}_circuit.circom`),
    "--r1cs",
    "--json",
    "--sym",
    "--inspect",
    "--O2",
    "--prime",
    "bls12381",
    "-l",
    include,
    "-o",
    outputDirectory,
  ], { cwd: packageRoot, encoding: "utf8" });
  const output = stripAnsi(`${result.stdout ?? ""}${result.stderr ?? ""}`);
  assert.equal(result.status, 0, output);

  const readCount = (label) => Number(
    output.match(new RegExp(`^${label}: (\\d+)`, "m"))?.[1],
  );
  const constraints = JSON.parse(readFileSync(
    path.join(outputDirectory, `${target}_circuit_constraints.json`),
    "utf8",
  )).constraints;
  return {
    nonlinear: readCount("non-linear constraints"),
    linear: readCount("linear constraints"),
    inputs: readCount("public inputs"),
    outputs: readCount("public outputs"),
    wires: readCount("wires"),
    nonzero: constraints.reduce(
      (total, row) => total + row.reduce(
        (rowTotal, expression) => rowTotal + Object.keys(expression).length,
        0,
      ),
      0,
    ),
  };
};

const normalize = (value) => BigInt(value.toString());

const invert = (value) => {
  let result = 1n;
  let factor = normalize(value);
  let exponent = FIELD_PRIME - 2n;
  while (exponent !== 0n) {
    if ((exponent & 1n) === 1n) {
      result = result * factor % FIELD_PRIME;
    }
    factor = factor * factor % FIELD_PRIME;
    exponent >>= 1n;
  }
  return result;
};

const affine = (point) => {
  const value = point.toAffine();
  return [value.x, value.y];
};

const split = (value) => [value & LIMB_MASK, value >> 128n];

const assertMutatedSignalRejected = async (circuit, witness, signalName) => {
  const signalIndex = circuit.symbols[signalName]?.varIdx;
  assert.notEqual(signalIndex, undefined, `${signalName} must exist`);
  assert.notEqual(signalIndex, -1, `${signalName} must own a witness wire`);
  const mutated = [...witness];
  mutated[signalIndex] = (normalize(mutated[signalIndex]) + 1n) % FIELD_PRIME;
  await assert.rejects(circuit.checkConstraints(mutated), /Constraint doesn't match/);
};

const main = async () => {
  const packageRoot = path.join(__dirname, "../..");
  const include = resolveCircomIncludeRoot(packageRoot);
  const outputRoot = mkdtempSync(path.join(tmpdir(), "tokamak-tsv-point-policy-"));
  try {
    assert.deepEqual(compileAndMeasure(packageRoot, outputRoot), {
      nonlinear: 223,
      linear: 5,
      inputs: 8,
      outputs: 16,
      wires: 234,
      nonzero: 1082,
    });

    const pointPolicy = await wasm(
      path.join(packageRoot, "subcircuits/circom/TransactionSignaturePointPolicy_circuit.circom"),
      { include, prime: "bls12381", O: 2 },
    );
    const vector = createTransactionSignatureCorpus()[0];
    const challengeInputs = getChallengeInputs(vector);
    const common = [
      ...challengeInputs.slice(0, 4),
      vector.publicBoundary.contractAddress,
      vector.publicBoundary.functionSelector,
    ];
    const witness = await pointPolicy.calculateWitness({
      in: [...common, ...vector.publicBoundary.O],
    }, true);
    const publicKey8 = vector.publicKey.multiply(8n);
    const randomizer8 = vector.randomizer.multiply(8n);
    const randomizerZInverse = invert(witness[15]);
    assert.deepEqual(
      witness.slice(1, 13).map(normalize),
      [
        vector.publicBoundary.functionSelector,
        0n,
        vector.publicBoundary.contractAddress & ((1n << 128n) - 1n),
        vector.publicBoundary.contractAddress >> 128n,
        ...vector.publicBoundary.O,
        ...affine(publicKey8),
        ...affine(publicKey8.multiply(2n)),
        ...affine(publicKey8.multiply(3n)),
      ],
    );
    assert.deepEqual(
      witness.slice(13, 15).map((coordinate) => (
        normalize(coordinate) * randomizerZInverse % FIELD_PRIME
      )),
      affine(randomizer8),
    );

    await assert.rejects(pointPolicy.calculateWitness({
      in: [common[0], common[1], 0n, 0n, ...common.slice(4), ...vector.publicBoundary.O],
    }, true));
    await pointPolicy.loadSymbols();
    for (const signalName of [
      "main.out[0]",
      "main.out[4]",
      "main.out[12]",
      "main.publicKeyAffine.point[0]",
    ]) {
      await assertMutatedSignalRejected(pointPolicy, witness, signalName);
    }

    console.log("TransactionSignaturePointPolicy passed O2, equivalence, policy, and mutation checks");
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
