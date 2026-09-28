import assert from "node:assert/strict";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import { DenseUnivariatePolynomial as P } from "../../../src/univariate/polynomial.js";
import { arithmeticQuotient, copyProductQuotient } from "../../../src/univariate/quotients.js";

const runtime = await createCurveRuntime();
try {
  const f = runtime.Fr, minus = f.neg(f.one);
  const poly = (n: number, seed = 7) => P.fromCoefficients(f, f.concat(Array.from({ length: n }, (_, i) => f.fromBigInt(BigInt(seed * (i + 1))))));
  const blind = (p: P, mask: P, n: number) => p.add(mask.multiplyVanishing(n));
  const interpolate = async (values: Uint8Array) => P.fromCoefficients(f, await f.ifftBuffer(values));
  const genericArithmetic = async (n: number, u: P, v: P, w: P, mu: P, mv: P, mw: P) =>
    (await P.linearCombination(f, [[await blind(u, mu, n).multiply(blind(v, mv, n)), f.one], [blind(w, mw, n), minus]])).divideVanishingExactBatched(n);
  const genericCopy = async (n: number, root: Uint8Array, r: P, a: P, b: P, mr: P, mb: P) => {
    const rh = blind(r, mr, n), ah = blind(a, mb, n), bh = blind(b, mb, n);
    const shifted = P.fromCoefficients(f, await f.batchApplyKeyBuffer(rh.coefficients, f.one, root));
    return (await P.linearCombination(f, [[await shifted.multiply(bh), f.one], [await rh.multiply(ah), minus]])).divideVanishingExactBatched(n);
  };
  const results = [];
  // The arithmetic and copy domains are deliberately independent and unequal.
  for (const [na, nc] of [[1, 2], [8, 32], [64, 16], [262144, 262144]]) {
    const uValues = poly(na).coefficients, vValues = poly(na, 11).coefficients;
    const wValues = await f.batchMulBuffer(uValues, vValues);
    const u = await interpolate(uValues), v = await interpolate(vValues), w = await interpolate(wValues);
    const uInput = { coefficients: u.coefficients, evaluations: uValues }, vInput = { coefficients: v.coefficients, evaluations: vValues }, wInput = { coefficients: w.coefficients, evaluations: wValues };
    const rValues = poly(nc, 13).coefficients, gValues = poly(nc, 19).coefficients;
    const nextR = f.createZeroBuffer(nc);
    nextR.set(rValues.subarray(f.byteLength)); nextR.set(rValues.subarray(0, f.byteLength), (nc - 1) * f.byteLength);
    const aValues = await f.batchMulBuffer(await f.batchMulBuffer(nextR, gValues), await f.batchInverseBuffer(rValues));
    const r = await interpolate(rValues), a = await interpolate(aValues), b = await interpolate(gValues), root = f.rootOfUnity(nc);
    for (const masked of na < 100 ? [false, true] : [true]) {
      const mu = masked ? poly(2, 23) : P.zero(f), mv = masked ? poly(2, 29) : P.zero(f), mw = masked ? poly(2, 31) : P.zero(f);
      const mr = masked ? poly(4, 37) : P.zero(f), mb = masked ? poly(2, 41) : P.zero(f);
      for (const [name, old, candidate] of [
        ["arithmetic", () => genericArithmetic(na, u, v, w, mu, mv, mw), () => arithmeticQuotient(f, na, uInput, vInput, wInput, mu, mv, mw)],
        ["copy", () => genericCopy(nc, root, r, a, b, mr, mb), () => copyProductQuotient(f, nc, root, { coefficients: r.coefficients, evaluations: rValues }, { coefficients: a.coefficients, evaluations: aValues }, { coefficients: b.coefficients, evaluations: gValues }, mr, mb)],
      ] as const) {
        const samples = [], expected = (await old()).coefficients;
        for (let i = 0; i < (na > 100 ? 4 : 1); i++) {
          const start = performance.now();
          const actual = await (na > 100 && i % 2 === 0 ? old() : candidate());
          samples.push({ candidate: na <= 100 || Boolean(i % 2), ms: performance.now() - start });
          assert.deepEqual(actual.coefficients, expected);
        }
        if (na > 100) results.push({ name, na, nc, samples });
      }
      if (na < 100) {
        const badW = w.add(poly(1)), wPadded = f.createZeroBuffer(na); wPadded.set(badW.coefficients);
        const badWValues = await f.fftBuffer(wPadded);
        await assert.rejects(() => arithmeticQuotient(f, na, uInput, vInput, { coefficients: badW.coefficients, evaluations: badWValues }, mu, mv, mw), /not divisible/);
        const badA = a.add(poly(1)), padded = f.createZeroBuffer(nc); padded.set(badA.coefficients);
        const badValues = await f.fftBuffer(padded);
        await assert.rejects(() => copyProductQuotient(f, nc, root, { coefficients: r.coefficients, evaluations: rValues }, { coefficients: badA.coefficients, evaluations: badValues }, { coefficients: b.coefficients, evaluations: gValues }, mr, mb), /not divisible/);
      }
    }
  }
  console.log(JSON.stringify({ results }));
} finally { await runtime.terminate(); }
