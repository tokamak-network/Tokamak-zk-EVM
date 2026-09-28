import assert from "node:assert/strict";
import { createCurveRuntime } from "../../src/runtime/curve/curve.js";
import { DenseUnivariatePolynomial as P } from "../../src/univariate/polynomial.js";
import { copyProductDifference, copyProductQuotient } from "../../src/univariate/quotients.js";

const runtime = await createCurveRuntime();
try {
  const f = runtime.Fr, poly = (n: number, seed: number) => P.fromCoefficients(f, f.concat(Array.from({ length: n }, (_, i) => f.fromBigInt(BigInt(seed * (i + 1))))));
  const samples = [];
  for (const n of [1, 2, 8, 32, 262144]) {
    const r = poly(n, 7), a = poly(n, 13), b = poly(n, 19), root = f.rootOfUnity(n);
    const old = async () => {
      const shifted = P.fromCoefficients(f, await f.batchApplyKeyBuffer(r.coefficients, f.one, root));
      return P.linearCombination(f, [[await shifted.multiply(b), f.one], [await r.multiply(a), f.neg(f.one)]]);
    };
    const expected = (await old()).coefficients;
    for (let i = 0; i < 4; i++) {
      const start = performance.now();
      const actual = await (i % 2 ? copyProductDifference(f, n, r, a, b) : old());
      const ms = performance.now() - start;
      assert.deepEqual(actual.coefficients, expected);
      if (n > 100) samples.push({ candidate: Boolean(i % 2), ms });
    }
    if (n < 100) {
      await assert.rejects(() => copyProductDifference(f, n, poly(n + 1, 3), a, b), /exceeds/);
      await assert.rejects(() => copyProductDifference(f, n, r, poly(n + 2, 3), b), /exceeds/);
      const input = (p: P) => ({ coefficients: p.coefficients, evaluations: f.createZeroBuffer(n) });
      await assert.rejects(() => copyProductQuotient(f, n, f.fromBigInt(7n), input(r), input(a), input(b), P.zero(f), P.zero(f)), /canonical root/);
    }
  }
  console.log(JSON.stringify({ n: 262144, samples }));
} finally { await runtime.terminate(); }
