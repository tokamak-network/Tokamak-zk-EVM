const assert = require("node:assert/strict");
const {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  parseLogicalInterface,
} = require("../../scripts/parse-interfaces.js");
const {
  countPhysicalWires,
  parseCircomConstants,
} = require("../../scripts/runtime/logical-interface.js");
const { getSubcircuitNames } = require("../../scripts/configure.js");

const EXPECTED = Object.freeze([
  Object.freeze({ name: "TransactionSignaturePoseidonBatch4", nonlinear: 950, linear: 0, inputs: 7, outputs: 2, wires: 957, nonzero: 11380, warnings: 1, placements: 9 }),
  Object.freeze({ name: "TransactionSignaturePointPolicy", nonlinear: 223, linear: 5, inputs: 8, outputs: 16, wires: 234, nonzero: 1082, warnings: 0, placements: 1 }),
  Object.freeze({ name: "TransactionSignatureFixedPrefix70", nonlinear: 1016, linear: 0, inputs: 1, outputs: 5, wires: 1017, nonzero: 6689, warnings: 0, placements: 1 }),
  Object.freeze({ name: "TransactionSignatureChallengeChunks", nonlinear: 511, linear: 1, inputs: 1, outputs: 4, wires: 511, nonzero: 2556, warnings: 2, placements: 1 }),
  Object.freeze({ name: "TransactionSignatureVariableFirstBatch32", nonlinear: 969, linear: 0, inputs: 9, outputs: 4, wires: 978, nonzero: 4750, warnings: 0, placements: 1 }),
  Object.freeze({ name: "TransactionSignatureVariableBatch32", nonlinear: 992, linear: 0, inputs: 13, outputs: 4, wires: 1005, nonzero: 4732, warnings: 0, placements: 3 }),
  Object.freeze({ name: "TransactionSignatureFinal", nonlinear: 716, linear: 0, inputs: 14, outputs: 2, wires: 725, nonzero: 3879, warnings: 3, placements: 1 }),
]);

const stripAnsi = (value) => value.replace(
  // eslint-disable-next-line no-control-regex
  /\u001b\[[0-9;]*m/g,
  "",
);

const readCount = (output, label) => {
  const value = Number(output.match(new RegExp(`^${label}: (\\d+)`, "m"))?.[1]);
  assert.equal(Number.isInteger(value), true, `${label} is missing:\n${output}`);
  return value;
};

const main = () => {
  const packageRoot = path.join(__dirname, "../..");
  const nodeModulesRoot = path.dirname(path.dirname(require.resolve(
    "circomlib/package.json",
    { paths: [packageRoot] },
  )));
  const outputRoot = mkdtempSync(path.join(tmpdir(), "tokamak-tsv-production-"));

  try {
    const constants = parseCircomConstants(readFileSync(
      path.join(packageRoot, "subcircuits/circom/constants.circom"),
      "utf8",
    ));
    const measurements = [];
    for (const expected of EXPECTED) {
      const outputDirectory = path.join(outputRoot, expected.name);
      mkdirSync(outputDirectory);
      const result = spawnSync("circom", [
        path.join(
          packageRoot,
          `subcircuits/circom/${expected.name}_circuit.circom`,
        ),
        "--r1cs",
        "--json",
        "--sym",
        "--inspect",
        "--O2",
        "--prime",
        "bls12381",
        "-l",
        nodeModulesRoot,
        "-o",
        outputDirectory,
      ], {
        cwd: packageRoot,
        encoding: "utf8",
      });
      const output = stripAnsi(`${result.stdout ?? ""}${result.stderr ?? ""}`);
      assert.equal(result.status, 0, output);

      const constraints = JSON.parse(readFileSync(
        path.join(outputDirectory, `${expected.name}_circuit_constraints.json`),
        "utf8",
      )).constraints;
      const nonzero = constraints.reduce(
        (total, row) => total + row.reduce(
          (rowTotal, expression) => rowTotal + Object.keys(expression).length,
          0,
        ),
        0,
      );
      const actual = {
        name: expected.name,
        nonlinear: readCount(output, "non-linear constraints"),
        linear: readCount(output, "linear constraints"),
        inputs: readCount(output, "public inputs"),
        outputs: readCount(output, "public outputs"),
        wires: readCount(output, "wires"),
        nonzero,
        warnings: output.match(/warning\[CA0[12]\]/g)?.length ?? 0,
        placements: expected.placements,
      };
      assert.deepEqual(actual, expected);
      assert.ok(actual.nonlinear + actual.linear <= 1024, expected.name);

      const interfacePath = path.join(
        packageRoot,
        "subcircuits/interface",
        expected.name === "TransactionSignaturePointPolicy" ? "conditional" : "",
        `${expected.name}.json`,
      );
      const logicalInterface = parseLogicalInterface(readFileSync(
        interfacePath,
        "utf8",
      ), constants, interfacePath);
      assert.equal(countPhysicalWires(logicalInterface.inputs), actual.inputs);
      assert.equal(countPhysicalWires(logicalInterface.outputs), actual.outputs);
      measurements.push(actual);
    }

    assert.equal(
      measurements.reduce((sum, item) => sum + item.nonlinear + item.linear, 0),
      5383,
    );
    assert.equal(measurements.reduce((sum, item) => sum + item.wires, 0), 5427);
    assert.equal(measurements.reduce((sum, item) => sum + item.placements, 0), 17);
    assert.equal(
      measurements.reduce(
        (sum, item) => sum + item.placements * (item.nonlinear + item.linear),
        0,
      ),
      14967,
    );

    const productionNames = getSubcircuitNames(constants.get("nPrivateMessageInputs"));
    assert.deepEqual(
      productionNames.filter((name) => name.startsWith("TransactionSignature")),
      EXPECTED.map(({ name }) => name),
    );

    console.log(
      "Transaction signature production catalog freezes seven types, 17 placements, 5383 unique constraints, and 14967 placement-weighted constraints",
    );
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
};

main();
