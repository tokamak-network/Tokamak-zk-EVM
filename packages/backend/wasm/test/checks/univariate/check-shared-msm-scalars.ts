import assert from "node:assert/strict";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import { commitDenseUnivariatePolynomial, commitSharedCoefficients } from "../../../src/univariate/commitments.js";
import type { UnivariateCrsChunkSection } from "../../../src/univariate/chunked-crs.js";
const runtime = await createCurveRuntime();
try {
  const f = runtime.Fr;
  const section = (count: number, point: Uint8Array): UnivariateCrsChunkSection => ({
    label: "test", encoding: "g1", elementCount: count, elementByteLength: 96,
    async readElements(start, n) {
      assert(start >= 0 && start + n <= count);
      const out = new Uint8Array(n * 96); for (let i = 0; i < n; i++) out.set(point, i * 96); return out;
    },
    async readElement() { throw Error("unused"); }, async readStridedElements() { throw Error("unused"); },
  });
  for (const n of [0, 1, 2, 17, 33]) for (const size of [1, 4, 32]) for (const zero of [false, true]) {
    const first = section(n, runtime.G1.generator), second = section(n, runtime.G1.toAffine(runtime.G1.neg(runtime.G1.generator)));
    const coefficients = f.concat(Array.from({ length: n }, (_, i) => zero ? f.zero : f.sub(f.fromBigInt(BigInt(i)), f.fromBigInt(3n))));
    const expected = [await commitDenseUnivariatePolynomial(runtime, first, coefficients, size), await commitDenseUnivariatePolynomial(runtime, second, coefficients, size)];
    const actual = await commitSharedCoefficients(runtime, first, second, coefficients, size);
    actual.forEach((point, i) => assert(runtime.G1.eq(point, expected[i]!)));
  }
  await assert.rejects(() => commitSharedCoefficients(runtime, section(0, runtime.G1.zero), section(1, runtime.G1.zero), f.one, 1), /requires/);
  await assert.rejects(() => commitSharedCoefficients(runtime, section(1, runtime.G1.zero), section(1, runtime.G1.zero), f.one, 0), /positive/);
  const n = 262144, scalars = f.concat(Array.from({ length: n }, (_, i) => f.fromBigInt(BigInt(i))));
  const convert = async (shared: boolean) => {
    const a = await f.batchFromMontgomeryBuffer(scalars), b = shared ? a : await f.batchFromMontgomeryBuffer(scalars);
    return [a, b];
  };
  await convert(false); await convert(true);
  const samples = [];
  for (let i = 0; i < 5; i++) for (const shared of [false, true]) {
    const start = performance.now(), result = await convert(shared); samples.push({ shared, ms: performance.now() - start });
    assert.deepEqual(result[0], result[1]);
  }
  console.log(JSON.stringify({ n, samples }));
} finally { await runtime.terminate(); }
console.log("Checked independent shared-scalar commitments, zero vectors, chunk tails and admission.");
