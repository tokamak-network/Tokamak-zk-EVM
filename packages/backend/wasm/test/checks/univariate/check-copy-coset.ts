import assert from "node:assert/strict";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import { DenseUnivariatePolynomial as P } from "../../../src/univariate/polynomial.js";
import { copyProductDifference, copyProductQuotient } from "../../../src/univariate/quotients.js";
import type { DenseDomainPolynomial } from "../../../src/univariate/relation.js";

const runtime = await createCurveRuntime();
try {
  const f = runtime.Fr, minus = f.neg(f.one);
  const control = async (n: number, r: P, a: P, b: P, mr: P, mb: P) => {
    const root = f.rootOfUnity(n), shifted = P.fromCoefficients(f, await f.batchApplyKeyBuffer(r.coefficients, f.one, root)), shiftedMask = mr.scaleArgument(root);
    const base = await (await copyProductDifference(f, n, r, a, b)).divideVanishingExactBatched(n);
    const delta = await P.linearCombination(f, [[shifted, f.one], [r, minus]]);
    return P.linearCombination(f, [[base, f.one], [await delta.multiply(mb), f.one], [await shiftedMask.multiply(b), f.one], [await mr.multiply(a), minus], [(await shiftedMask.sub(mr).multiply(mb)).multiplyVanishing(n), f.one]]);
  };
  const domain = async (values: Uint8Array): Promise<DenseDomainPolynomial> => ({ evaluations: values, coefficients: await f.ifftBuffer(values) });
  for (const n of [1, 2, 8, 64, 262144]) {
    const r = await domain(f.concat(Array.from({ length: n }, (_, i) => f.fromBigInt(BigInt(i * 13 + 7)))));
    const b = await domain(f.concat(Array.from({ length: n }, (_, i) => f.fromBigInt(BigInt(i * 17 + 11)))));
    const next = f.createZeroBuffer(n); next.set(r.evaluations.subarray(32)); next.set(r.evaluations.subarray(0, 32), (n - 1) * 32);
    const a = await domain(await f.batchMulBuffer(await f.batchMulBuffer(next, b.evaluations), await f.batchInverseBuffer(r.evaluations)));
    // Adding a multiple of Z_N preserves the domain relation but exercises
    // the degree-N coefficient fold, including the singleton beta*X case.
    const bPoly = P.fromCoefficients(f, b.coefficients).add(P.fromCoefficients(f, f.fromBigInt(19n)).multiplyVanishing(n));
    const aPoly = P.fromCoefficients(f, a.coefficients).add(P.fromCoefficients(f, f.fromBigInt(23n)).multiplyVanishing(n));
    const aInput = { ...a, coefficients: aPoly.coefficients };
    const bInput = { ...b, coefficients: bPoly.coefficients };
    for (const masked of [false, true]) {
      const mr = masked ? P.fromCoefficients(f, f.concat([3n, 5n, 7n, 11n].map(x => f.fromBigInt(x)))) : P.zero(f);
      const mb = masked ? P.fromCoefficients(f, f.concat([13n, 17n].map(x => f.fromBigInt(x)))) : P.zero(f);
      const old = () => control(n, P.fromCoefficients(f, r.coefficients), aPoly, bPoly, mr, mb);
      const candidate = () => copyProductQuotient(f, n, f.rootOfUnity(n), r, aInput, bInput, mr, mb);
      const expected = await old(); assert.deepEqual((await candidate()).coefficients, expected.coefficients);
      if (n === 262144 && masked) {
        const samples = [];
        for (let i = 0; i < 5; i++) for (const [mode, run] of (i % 2 ? [["coset", candidate], ["control", old]] : [["control", old], ["coset", candidate]]) as [string, () => Promise<P>][]) {
          const start = performance.now(), result = await run(); samples.push({ mode, ms: performance.now() - start });
          assert.deepEqual(result.coefficients, expected.coefficients);
        }
        console.log(JSON.stringify({ n, samples }));
      }
    }
    if (n < 100) {
      const bad = a.evaluations.slice(); f.writeBufferElement(bad, 0, f.add(f.readBufferElement(bad, 0), f.one));
      const badA = await domain(bad);
      await assert.rejects(() => copyProductQuotient(f, n, f.rootOfUnity(n), r, badA, bInput, P.zero(f), P.zero(f)), /not divisible/);
      const zero = await domain(f.createZeroBuffer(n));
      assert.deepEqual((await copyProductQuotient(f, n, f.rootOfUnity(n), zero, zero, zero, P.zero(f), P.zero(f))).coefficients, f.zero);
      const extra = P.fromCoefficients(f, f.one).shift(n);
      await assert.rejects(() => copyProductQuotient(f, n, f.rootOfUnity(n), { ...r, coefficients: extra.coefficients }, a, bInput, P.zero(f), P.zero(f)), /interpolation domain/);
      await assert.rejects(() => copyProductQuotient(f, n, f.rootOfUnity(n), r, aInput, { ...bInput, coefficients: extra.shift(1).coefficients }, P.zero(f), P.zero(f)), /interpolation domain/);
    }
  }
} finally { await runtime.terminate(); }
console.log("Checked copy coset exact coefficients, masks, degree-N folds, singleton/zero domains and rejection.");
