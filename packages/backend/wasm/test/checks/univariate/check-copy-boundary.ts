import assert from "node:assert/strict";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import { DenseUnivariatePolynomial as P } from "../../../src/univariate/polynomial.js";
import { copyBoundaryQuotient } from "../../../src/univariate/reference-prover.js";
const runtime = await createCurveRuntime();
try {
  const f = runtime.Fr, constant = (x: bigint) => P.fromCoefficients(f, f.concat([f.fromBigInt(x)]));
  const old = async (p: P, n: number) => {
    const l0 = P.fromCoefficients(f, f.concat(Array.from({ length: n }, () => f.inv(f.fromBigInt(BigInt(n))))));
    return (await p.sub(constant(1n)).multiply(l0)).divideVanishingExact(n);
  };
  for (const n of [1, 2, 8, 64]) {
    const mask = P.fromCoefficients(f, f.concat([f.fromBigInt(2n), f.fromBigInt(3n), f.fromBigInt(4n), f.fromBigInt(5n)]));
    const r = constant(1n).add(mask.multiplyVanishing(n));
    assert.deepEqual((await copyBoundaryQuotient(f, r, n)).coefficients, (await old(r, n)).coefficients);
    assert.deepEqual((await copyBoundaryQuotient(f, constant(1n), n)).coefficients, P.zero(f).coefficients);
    await assert.rejects(() => copyBoundaryQuotient(f, r.add(constant(1n)), n), /must equal one/);
    await assert.rejects(() => old(r.add(constant(1n)), n), /not divisible/);
    // Nonconstant valid boundaries need not be a pure vanishing mask.
    const raw = P.fromCoefficients(f, f.concat(Array.from({ length: n + 4 }, (_, i) =>
      i % 2 ? f.neg(f.fromBigInt(BigInt(i + 1))) : f.fromBigInt(BigInt(i + 1)))));
    const corrected = raw.sub(P.fromCoefficients(f, raw.evaluate(f.one))).add(constant(1n));
    assert.deepEqual((await copyBoundaryQuotient(f, corrected, n)).coefficients,
      corrected.ruffini(f.one).quotient.scale(f.inv(f.fromBigInt(BigInt(n)))).coefficients);
    for (const invalid of [constant(0n), constant(2n)])
      await assert.rejects(() => copyBoundaryQuotient(f, invalid, n), /must equal one/);
  }
  const n = 262144;
  const r = P.fromCoefficients(f, f.concat(Array.from({ length: n }, (_, i) => f.fromBigInt(BigInt(i)))));
  const admissible = r.sub(P.fromCoefficients(f, f.concat([r.evaluate(f.one)]))).add(constant(1n)).add(constant(5n).multiplyVanishing(n));
  const scalar = () => admissible.ruffini(f.one).quotient.scale(f.inv(f.fromBigInt(BigInt(n))));
  const expected = scalar();
  await copyBoundaryQuotient(f, admissible, n);
  const samples = [];
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    const value = i % 2 ? await copyBoundaryQuotient(f, admissible, n) : scalar();
    samples.push({ candidate: Boolean(i % 2), ms: performance.now() - start });
    assert.deepEqual(value.coefficients, expected.coefficients);
  }
  console.log(JSON.stringify({ n, samples }));
} finally { await runtime.terminate(); }
