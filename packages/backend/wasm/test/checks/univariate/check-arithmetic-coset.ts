import assert from "node:assert/strict";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import { DenseUnivariatePolynomial as P } from "../../../src/univariate/polynomial.js";
import { arithmeticQuotient } from "../../../src/univariate/quotients.js";
import type { DenseDomainPolynomial } from "../../../src/univariate/relation.js";

const runtime = await createCurveRuntime();
try {
  const f = runtime.Fr;
  const control = async (n: number, a: DenseDomainPolynomial, b: DenseDomainPolynomial, c: DenseDomainPolynomial, ma: P, mb: P, mc: P) => {
    const u = P.fromCoefficients(f, a.coefficients), v = P.fromCoefficients(f, b.coefficients), w = P.fromCoefficients(f, c.coefficients);
    const base = await (await P.linearCombination(f, [[await u.multiply(v), f.one], [w, f.neg(f.one)]])).divideVanishingExactBatched(n);
    return P.linearCombination(f, [[base, f.one], [await u.multiply(mb), f.one], [await v.multiply(ma), f.one], [(await ma.multiply(mb)).multiplyVanishing(n), f.one], [mc, f.neg(f.one)]]);
  };
  const domain = async (evaluations: Uint8Array): Promise<DenseDomainPolynomial> => ({ evaluations, coefficients: await f.ifftBuffer(evaluations) });
  for (const n of [1, 2, 8, 64, 262144]) {
    const u = await domain(f.concat(Array.from({ length: n }, (_, i) => f.fromBigInt(BigInt(i * 13 + 7)))));
    const v = await domain(f.concat(Array.from({ length: n }, (_, i) => f.fromBigInt(BigInt(i * 17 + 11)))));
    const w = await domain(await f.batchMulBuffer(u.evaluations, v.evaluations));
    for (const masked of [false, true]) {
      const mask = masked ? P.fromCoefficients(f, f.concat([f.fromBigInt(13n), f.fromBigInt(19n)])) : P.zero(f);
      const old = () => control(n, u, v, w, mask, mask, mask), candidate = () => arithmeticQuotient(f, n, u, v, w, mask, mask, mask);
      const expected = await old(), actual = await candidate();
      assert.deepEqual(actual.coefficients, expected.coefficients);
      if (n === 262144 && masked) {
        const samples = [];
        for (let i = 0; i < 5; i++) for (const [mode, run] of [["control", old], ["coset", candidate]] as const) {
          const start = performance.now(), result = await run(); samples.push({ mode, ms: performance.now() - start });
          assert.deepEqual(result.coefficients, expected.coefficients);
        }
        console.log(JSON.stringify({ n, samples }));
      }
    }
    if (n < 100) {
      const invalid = w.evaluations.slice(); f.writeBufferElement(invalid, 0, f.add(f.readBufferElement(invalid, 0), f.one));
      const invalidDomain = await domain(invalid);
      await assert.rejects(() => arithmeticQuotient(f, n, u, v, invalidDomain, P.zero(f), P.zero(f), P.zero(f)), /not divisible/);
      const zero = await domain(f.createZeroBuffer(n));
      assert.deepEqual((await arithmeticQuotient(f, n, zero, zero, zero, P.zero(f), P.zero(f), P.zero(f))).coefficients, f.zero);
      const extra = f.createZeroBuffer(n + 1); f.writeBufferElement(extra, n, f.one);
      await assert.rejects(() => arithmeticQuotient(f, n, { ...u, coefficients: extra }, v, w, P.zero(f), P.zero(f), P.zero(f)), /interpolation domain/);
    }
  }
} finally { await runtime.terminate(); }
console.log("Checked coset arithmetic against the prior exact quotient with masks, leading zeros, singleton domains and rejection.");
