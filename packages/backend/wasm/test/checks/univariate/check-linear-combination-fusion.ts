import assert from "node:assert/strict";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import { DenseUnivariatePolynomial as P } from "../../../src/univariate/polynomial.js";
import type { FieldElement } from "../../../src/runtime/field/field-types.js";

const runtime = await createCurveRuntime();
try {
  const f = runtime.Fr;
  const control = async (terms: readonly (readonly [P, FieldElement])[]) => {
    const count = Math.max(0, ...terms.map(([p]) => p.degree)) + 1;
    let result = f.createZeroBuffer(count);
    for (const [p, factor] of terms) {
      if (f.isZero(factor)) continue;
      const source = f.createZeroBuffer(count); source.set(p.coefficients);
      result = await f.batchAddScaledBuffer(result, source, factor);
    }
    return P.fromCoefficients(f, result);
  };
  for (const n of [1, 2, 17, 65, 4097, 262144]) {
    const a = P.fromCoefficients(f, f.concat(Array.from({ length: n }, (_, i) => f.fromBigInt(BigInt(17 * i + 3)))));
    const b = P.fromCoefficients(f, a.coefficients.subarray(0, Math.ceil(n / 3) * 32));
    for (const terms of [[], [[a, f.zero]], [[a, f.one], [a, f.neg(f.one)]], [[a, f.one], [b, f.fromBigInt(13n)], [P.zero(f), f.one], [a, f.fromBigInt(19n)]]] as (readonly [P, FieldElement])[][]) {
      const expected = await control(terms); assert.deepEqual((await P.linearCombination(f, terms)).coefficients, expected.coefficients);
      if (n < 100) {
        const scalar = terms.reduce((sum, [p, factor]) => sum.add(p.scale(factor)), P.zero(f));
        assert.deepEqual(expected.coefficients, scalar.coefficients);
      }
      if (n === 262144 && terms.length === 4) {
        const samples = [];
        for (let i = 0; i < 5; i++) for (const candidate of i % 2 ? [true, false] : [false, true]) {
          const start = performance.now(), actual = await (candidate ? P.linearCombination(f, terms) : control(terms));
          samples.push({ candidate, ms: performance.now() - start }); assert.deepEqual(actual.coefficients, expected.coefficients);
        }
        console.log(JSON.stringify({ n, samples }));
      }
    }
  }
  await assert.rejects(() => f.linearCombinationBuffer([[new Uint8Array(31), f.one]]));
  await assert.rejects(() => f.linearCombinationBuffer([[f.one, new Uint8Array(31)]]));
} finally { await runtime.terminate(); }
console.log("Checked fused worker accumulation against batched/scalar controls, unequal/zero lengths, cancellation and malformed buffers.");
