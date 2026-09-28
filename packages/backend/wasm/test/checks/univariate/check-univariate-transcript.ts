import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import { UnivariateTranscript, encodeG1MessageBlock, encodeEvaluationMessageBlock } from "../../../src/univariate/transcript.js";
const fixture = JSON.parse(await readFile(new URL("../../../../common/contracts/fixtures/univariate-fiat-shamir.json", import.meta.url), "utf8"));

const runtime = await createCurveRuntime();
try {
  const f = runtime.Fr;
  const transcript = new UnivariateTranscript(f, fixture.publicInputs.map((v: string) => f.fromBigInt(BigInt(v))));
  for(let round = 1; round <= 6; round++) {
    const message = fixture.messages[round - 1] as string[];
    transcript.setMessage(round === 5 ? encodeEvaluationMessageBlock(f, message.map(v => f.fromBigInt(BigInt(v)))) :
      encodeG1MessageBlock(`F2.a${round}`, runtime.G1, message.map(v => runtime.G1.parseAffine({ x: "0x" + v.slice(0, 96), y: "0x" + v.slice(96) }))));
    const values = round === 2 ? transcript.challengePair(2) : [round === 4 ? transcript.zeta(fixture.arithmeticSize, fixture.connectionSize) :
      round === 6 ? transcript.nonzeroChallenge(6, 0) : transcript.challenge(round, 0)];
    values.forEach((v, i) => assert.equal(f.toHex(v), fixture.expected[round - 1][i].value));
  }
  const contract = JSON.parse(await readFile(new URL("../../../../common/contracts/univariate-domain-contract.v1.json", import.meta.url), "utf8"));
  const max = f.fromHex("0x" + contract.scalarRootOfUnity.maxRootCanonicalHex);
  for(const size of [2, 4, 16, 256, 16384, 262144, 1048576])
    assert(f.eq(f.rootOfUnity(size), f.pow(max, 2 ** 32 / size)), `Root mismatch for ${size}`);
}
finally {
  await runtime.terminate();
}
console.log("All six F4 challenge rounds and native/WASM root orientation agree.");
