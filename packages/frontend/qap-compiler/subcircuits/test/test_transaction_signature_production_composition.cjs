const assert = require("node:assert/strict");
const { mkdirSync, mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { wasm } = require("circom_tester");
const { FUNCTION_INPUT_LENGTH } = require("tokamak-l2js");
const {
  DISPOSITIONS,
  createTransactionSignatureCorpus,
  evaluateCompleteStatement,
  getChallengeInputs,
} = require("./transaction_signature_verify_oracle.cjs");

const LIMB_BASE = 1n << 128n;
const LIMB_MASK = LIMB_BASE - 1n;
const FIELD_PRIME = 52435875175126190479447740508185965837690552500527637822603658699938581184513n;

const stripAnsi = (value) => value.replace(
  // eslint-disable-next-line no-control-regex
  /\u001b\[[0-9;]*m/g,
  "",
);

const compileAndMeasure = (packageRoot) => {
  const nodeModulesRoot = path.dirname(path.dirname(require.resolve(
    "circomlib/package.json",
    { paths: [packageRoot] },
  )));
  const outputRoot = mkdtempSync(path.join(tmpdir(), "tokamak-tsv-composition-"));
  try {
    const result = spawnSync("circom", [
      path.join(
        packageRoot,
        "subcircuits/test/circom/transaction_signature_production_composition_test.circom",
      ),
      "--r1cs",
      "--json",
      "--inspect",
      "--O2",
      "--prime",
      "bls12381",
      "-l",
      nodeModulesRoot,
      "-o",
      outputRoot,
    ], { cwd: packageRoot, encoding: "utf8" });
    const output = stripAnsi(`${result.stdout ?? ""}${result.stderr ?? ""}`);
    assert.equal(result.status, 0, output);
    const readCount = (label) => Number(
      output.match(new RegExp(`^${label}: (\\d+)`, "m"))?.[1],
    );
    const constraints = JSON.parse(readFileSync(
      path.join(
        outputRoot,
        "transaction_signature_production_composition_test_constraints.json",
      ),
      "utf8",
    )).constraints;
    return {
      nonlinear: readCount("non-linear constraints"),
      linear: readCount("linear constraints"),
      publicInputs: readCount("public inputs"),
      privateInputs: readCount("private inputs"),
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
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
};

const normalize = (value) => BigInt(value.toString());

const assertMutatedSignalRejected = async (circuit, witness, signalName) => {
  const signalIndex = circuit.symbols[signalName]?.varIdx;
  assert.notEqual(signalIndex, undefined, `${signalName} must exist`);
  assert.notEqual(signalIndex, -1, `${signalName} must own a witness wire`);
  const mutated = [...witness];
  mutated[signalIndex] = (normalize(mutated[signalIndex]) + 1n) % FIELD_PRIME;
  await assert.rejects(circuit.checkConstraints(mutated), /Constraint doesn't match/);
};

const split = (value) => [value & LIMB_MASK, value >> 128n];

const toCircuitInput = (vector) => {
  const challengeInputs = getChallengeInputs(vector);
  return {
    privateIn: [
      ...challengeInputs.slice(0, 5),
      ...challengeInputs.slice(7),
    ],
    contractAddress: vector.publicBoundary.contractAddress,
    functionSelector: vector.publicBoundary.functionSelector,
    S: vector.publicBoundary.S,
    O: vector.publicBoundary.O,
  };
};

const expectedProductionOutput = (vector, oracle) => ({
  evmContractAddress: split(vector.publicBoundary.contractAddress),
  evmFunctionSelector: [vector.publicBoundary.functionSelector, 0n],
  origin: split(oracle.circuit.origin),
});

const main = async () => {
  assert.equal(FUNCTION_INPUT_LENGTH, 29);
  const packageRoot = path.join(__dirname, "../..");
  const nodeModulesRoot = path.dirname(path.dirname(require.resolve(
    "circomlib/package.json",
    { paths: [packageRoot] },
  )));
  assert.deepEqual(compileAndMeasure(packageRoot), {
    nonlinear: 14943,
    linear: 3,
    publicInputs: 5,
    privateInputs: 34,
    outputs: 6,
    wires: 14969,
    nonzero: 135511,
  });
  const circuit = await wasm(
    path.join(
      packageRoot,
      "subcircuits/test/circom/transaction_signature_production_composition_test.circom",
    ),
    {
      include: nodeModulesRoot,
      prime: "bls12381",
      O: 2,
    },
  );
  const corpus = createTransactionSignatureCorpus();
  let accepted = 0;
  let rejected = 0;
  let mutationWitness;
  for (const vector of corpus) {
    const oracle = evaluateCompleteStatement(vector);
    const input = toCircuitInput(vector);
    if (vector.disposition === DISPOSITIONS.CIRCUIT_LOCAL_REJECTION) {
      await assert.rejects(circuit.calculateWitness(input, true), undefined, vector.id);
      rejected++;
      continue;
    }

    const witness = await circuit.calculateWitness(input, true);
    await circuit.checkConstraints(witness);
    await circuit.assertOut(witness, expectedProductionOutput(vector, oracle));
    mutationWitness ??= witness;
    accepted++;
  }

  await circuit.loadSymbols();
  for (const signalName of [
    "main.challengeBatches[0].out[1]",
    "main.tail3.firstHash.ark[0].out[0]",
    "main.pointPolicyWithoutHash.runtimeTable.additions[0].coordinateProduct",
    "main.pointPolicyWithoutHash.randomizerCofactor.point4.result[0]",
    "main.fixedPrefix.fixedPrefix.accumulators[69][0]",
    "main.challengeChunks.challenge.bits[0]",
    "main.challengeChunks.challenge.fieldBound.lowBorrow",
    "main.variableFirstBatch.batch.accumulators[15][0]",
    "main.variableBatches[0].batch.accumulators[15][0]",
    "main.variableBatches[1].batch.accumulators[15][0]",
    "main.variableBatches[2].batch.accumulators[15][0]",
    "main.final.fixedTail.accumulators[13][0]",
    "main.final.terminalAddition.result[0]",
    "main.final.publicKeyHash.bits[0]",
    "main.origin[0]",
  ]) {
    await assertMutatedSignalRejected(circuit, mutationWitness, signalName);
  }

  console.log(
    `transaction signature production composition: ${accepted} accepted, ${rejected} rejected; O2 topology and interfaces frozen`,
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
