// Independent byte-level F4 oracle. Runtime Rust/WASM parity is a later gate.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(new URL("../../../wasm/package.json", import.meta.url));
const { keccak_256: keccak } = require("@noble/hashes/sha3");
const read = name => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), "utf8"));
const contract = read("univariate-transcript-contract.json");
const fixture = read("fixtures/univariate-fiat-shamir.json");
const modulus = BigInt(fixture.scalarModulus);
const bytes = (n, length) => {
  const hex = BigInt(n).toString(16).padStart(length * 2, "0");
  assert.equal(hex.length, length * 2);
  return Buffer.from(hex, "hex");
};
const frame = (label, value) => Buffer.concat([bytes(Buffer.byteLength(label), 4), Buffer.from(label), bytes(value.length, 8), value]);
const concatenate = fields => Buffer.concat(fields.map(([label, value]) => frame(label, value)));
const scalar = value => bytes(value, 32);
const power = (base, exponent) => {
  let result = 1n;
  for (let e = BigInt(exponent); e > 0n; e >>= 1n, base = base * base % modulus) {
    if (e & 1n) result = result * base % modulus;
  }
  return result;
};
const publicInput = values => concatenate([
  [contract.publicInput.countLabel, bytes(values.length, 4)],
  ...values.map((value, i) => [contract.publicInput.elementLabelPrefix + i, scalar(value)]),
]);
const previousInput = values => concatenate(values.map((value, i) => [contract.previousChallenge.elementLabelPrefix + i, scalar(value)]));
function message(round, values) {
  assert.equal(values.length, round.message.length);
  if (round.kind === "scalar") return concatenate(round.message.map((name, i) => [name, scalar(values[i])]));
  return concatenate([
    [contract.pointMessage.countLabel, bytes(values.length, 4)],
    ...values.map((value, i) => {
      const encoded = Buffer.from(value, "hex");
      assert.equal(encoded.length, 96);
      return [contract.pointMessage.elementLabelPrefix.replace("{round}", round.index) + i, encoded];
    }),
  ]);
}
function sample(round, input, encoded, outputIndex, digest = keccak) {
  for (let counter = 0; counter <= 0xffffffff; counter++) {
    const preimage = concatenate([
      ["protocol", Buffer.from(contract.schemaId)], ["round", bytes(round.index, 4)],
      ["output-index", bytes(outputIndex, 4)], ["input", input], ["message", encoded],
      ["rejection-counter", bytes(counter, 4)],
    ]);
    const value = BigInt("0x" + Buffer.from(digest(preimage)).toString("hex"));
    if (value >= modulus) continue;
    if (round.range !== "field" && value === 0n) continue;
    if (round.index === 4 && (power(value, fixture.arithmeticSize) === 1n || power(value, fixture.connectionSize) === 1n)) continue;
    return { value, counter, preimage: preimage.toString("hex") };
  }
  throw new Error("Fiat-Shamir rejection counter exhausted");
}
function derive(publicValues, messages) {
  let previous;
  return contract.rounds.map((round, index) => {
    const input = index === 0 ? publicInput(publicValues) : previousInput(previous);
    const encoded = message(round, messages[index]);
    // Both pair coordinates use exactly the same predecessor and message.
    const results = round.challenges.map((_, output) => sample(round, input, encoded, output));
    previous = results.map(result => result.value);
    return results.map(result => ({ ...result, value: "0x" + scalar(result.value).toString("hex") }));
  });
}

const actual = derive(fixture.publicInputs, fixture.messages);
test("six F4 rounds match the fixed Keccak preimages and challenge vectors", () => {
  assert.equal(contract.rounds.length, 6);
  assert.deepEqual(actual, fixture.expected);
});
test("message cardinalities match the current proof and exclude fixed configuration", () => {
  const proof = read("univariate-artifact-contract.json").artifacts.find(x => x.name === "univariate_proof");
  const names = contract.rounds.flatMap(round => round.message).sort();
  assert.deepEqual(names, proof.fields.map(([name]) => ({ d_q_k: "D_QK", pi_chi: "Pi_chi", pi_plus: "Pi_plus", s_c: "s_C" }[name] ?? (name.startsWith("c_") || name.startsWith("d_") ? name.toUpperCase() : name))).sort());
  for (const label of ["C_fix", "crs", "selector", "permutation", "q_chi"]) assert.ok(!names.includes(label));
  for (let i = 1; i < 6; i++) assert.deepEqual(contract.rounds[i].input, contract.rounds[i - 1].challenges);
});
test("altering free input or an earlier message changes the later challenge chain", () => {
  const values = [...fixture.publicInputs]; values[0] = String(BigInt(values[0]) + 1n);
  const changed = derive(values, fixture.messages);
  for (let i = 0; i < 6; i++) assert.notEqual(changed[i][0].value, actual[i][0].value);
  const messages = structuredClone(fixture.messages);
  messages[4][0] = String(BigInt(messages[4][0]) + 1n);
  const changedMessage = derive(fixture.publicInputs, messages);
  assert.deepEqual(changedMessage.slice(0, 4), actual.slice(0, 4));
  assert.notEqual(changedMessage[4][0].value, actual[4][0].value);
  assert.notEqual(changedMessage[5][0].value, actual[5][0].value);
});
test("rejection sampling excludes noncanonical, zero, and domain-root chi candidates", () => {
  const candidates = [modulus, 0n, 1n, 2n];
  let calls = 0;
  const result = sample(contract.rounds[3], Buffer.alloc(0), Buffer.alloc(0), 0, () => scalar(candidates[calls++]));
  assert.equal(result.value, 2n);
  assert.equal(result.counter, 3);
});

// The fixture refresh command prints data; callers apply changes explicitly.
if (process.argv.includes("--print-vectors")) console.log(JSON.stringify(actual, null, 2));
