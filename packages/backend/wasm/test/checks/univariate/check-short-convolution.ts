import assert from "node:assert/strict";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import { DenseUnivariatePolynomial as P } from "../../../src/univariate/polynomial.js";

const runtime = await createCurveRuntime();
try {
  const f = runtime.Fr;
  const control = async (long: Uint8Array, short: Uint8Array) => {
    const length = f.bufferElementCount(long) + f.bufferElementCount(short) - 1;
    let result = f.createZeroBuffer(length);
    for (let j = 0; j < f.bufferElementCount(short); j++) {
      const factor = f.readBufferElement(short, j); if (f.isZero(factor)) continue;
      const shifted = f.createZeroBuffer(length); shifted.set(long, j * 32);
      result = await f.batchAddScaledBuffer(result, shifted, factor);
    }
    return result;
  };
  for (const n of [1, 2, 13, 63, 64, 65, 4097, 262144]) {
    const long = f.concat(Array.from({ length: n }, (_, i) => f.fromBigInt(BigInt(i * 17 + 3))));
    for (const width of [1, 2, 3, 4]) for (const zero of [false, true]) {
      const short = f.concat(Array.from({ length: width }, (_, i) => zero && i % 2 === 0 ? f.zero : f.sub(f.fromBigInt(BigInt(i * 11)), f.fromBigInt(13n))));
      const expected = await control(long, short); assert.deepEqual(await f.shortConvolutionBuffer(long, short), expected);
      const a = P.fromCoefficients(f, long), b = P.fromCoefficients(f, short);
      assert.deepEqual((await a.multiply(b)).coefficients, P.fromCoefficients(f, expected).coefficients);
      assert.deepEqual((await b.multiply(a)).coefficients, P.fromCoefficients(f, expected).coefficients);
      if (n === 262144 && !zero && [2, 4].includes(width)) {
        const samples = [];
        for (let i = 0; i < 5; i++) for (const candidate of i % 2 ? [true, false] : [false, true]) {
          const start = performance.now(), result = await (candidate ? f.shortConvolutionBuffer(long, short) : control(long, short));
          samples.push({ candidate, ms: performance.now() - start }); assert.deepEqual(result, expected);
        }
        console.log(JSON.stringify({ n, width, samples }));
      }
    }
  }
  await assert.rejects(() => f.shortConvolutionBuffer(f.one, f.createZeroBuffer(5)), /one to four/);
  await assert.rejects(() => f.shortConvolutionBuffer(new Uint8Array(0), f.one), /nonempty/);
} finally { await runtime.terminate(); }
console.log("Checked short convolution, shard halos, zero/sparse masks, unequal widths and rejection.");
