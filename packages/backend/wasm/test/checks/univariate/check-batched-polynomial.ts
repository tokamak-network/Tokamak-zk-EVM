import assert from "node:assert/strict";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import { DenseUnivariatePolynomial as P } from "../../../src/univariate/polynomial.js";

const runtime = await createCurveRuntime();
try {
  const f = runtime.Fr;
  const poly = (n: number) => P.fromCoefficients(f, f.concat(Array.from({ length: n }, (_, i) => f.sub(f.fromBigInt(BigInt(i * 13)), f.fromBigInt(17n)))));
  const fftProduct = async (a: P, b: P) => {
    const size = 2 ** Math.ceil(Math.log2(a.degree + b.degree + 1));
    const left = f.createZeroBuffer(size), right = f.createZeroBuffer(size);
    left.set(a.coefficients); right.set(b.coefficients);
    return P.fromCoefficients(f, await f.ifftBuffer(await f.batchMulBuffer(await f.fftBuffer(left), await f.fftBuffer(right))));
  };
  for (const count of [1, 2, 9, 65, 256]) {
    const a = poly(count), b = poly(3), factor = f.fromBigInt(19n);
    assert.deepEqual((await P.linearCombination(f, [[a, f.one], [b, factor]])).coefficients, a.add(b.scale(factor)).coefficients);
    assert.deepEqual((await P.linearCombination(f, [])).coefficients, P.zero(f).coefficients);
    assert.deepEqual((await a.multiply(b)).coefficients, (await fftProduct(a, b)).coefficients);
    assert.deepEqual(await f.evaluatePolynomialBuffer(a.coefficients, 1, count, f.one, factor), a.evaluate(factor));
    const divided = await f.ruffiniYBuffer(a.coefficients, count, factor);
    assert.deepEqual(P.fromCoefficients(f, divided.quotient).coefficients, a.ruffini(factor).quotient.coefficients);
    assert.deepEqual(divided.remainder, a.ruffini(factor).value);
    assert.deepEqual(P.fromCoefficients(f, await f.batchApplyKeyBuffer(a.coefficients, f.one, factor)).coefficients, a.scaleArgument(factor).coefficients);
    for (const n of [1, 2, 8, 128]) {
      const product = a.multiplyVanishing(n);
      assert.deepEqual(product.coefficients, a.shift(n).sub(a).coefficients);
      assert.deepEqual((await product.divideVanishingExactBatched(n)).coefficients, a.coefficients);
      const bad = product.add(P.fromCoefficients(f, f.one));
      await assert.rejects(() => bad.divideVanishingExactBatched(n), /not divisible/);
    }
  }
  await assert.rejects(() => poly(2).divideVanishingExactBatched(0), /positive/);
  assert.deepEqual((await P.zero(f).divideVanishingExactBatched(128)).coefficients, P.zero(f).coefficients);
  const n = 262144, a = poly(n), b = poly(4), factor = f.fromBigInt(19n), product = a.multiplyVanishing(n);
  const cases = [
    { name: "linear-combination", old: () => a.add(a.scale(factor)).coefficients, candidate: async () => (await P.linearCombination(f, [[a, f.one], [a, factor]])).coefficients },
    { name: "exact-vanishing", old: () => product.divideVanishingExact(n).coefficients, candidate: async () => (await product.divideVanishingExactBatched(n)).coefficients },
    { name: "evaluation", old: () => a.evaluate(factor), candidate: () => f.evaluatePolynomialBuffer(a.coefficients, 1, n, f.one, factor) },
    { name: "ruffini", old: () => a.ruffini(factor).quotient.coefficients, candidate: async () => P.fromCoefficients(f, (await f.ruffiniYBuffer(a.coefficients, n, factor)).quotient).coefficients },
    { name: "short-product", old: async () => (await fftProduct(a, b)).coefficients, candidate: async () => (await a.multiply(b)).coefficients },
    { name: "short-vanishing", old: () => b.shift(n).sub(b).coefficients, candidate: () => b.multiplyVanishing(n).coefficients },
  ];
  const results = [];
  for (const operation of cases) {
    const expected = await operation.old(), samples = [];
    for (let i = 0; i < 4; i++) {
      const start = performance.now();
      const actual = await (i % 2 ? operation.candidate() : operation.old());
      samples.push({ candidate: Boolean(i % 2), ms: performance.now() - start });
      assert.deepEqual(actual, expected);
    }
    results.push({ name: operation.name, samples });
  }
  console.log(JSON.stringify({ n, results }));
} finally { await runtime.terminate(); }
