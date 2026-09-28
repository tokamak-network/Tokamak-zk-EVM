import assert from "node:assert/strict";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
const runtime = await createCurveRuntime();
try {
  const f = runtime.Fr;
  const control = async (a: Uint8Array, b: Uint8Array, c: Uint8Array, d: Uint8Array) => f.batchSubBuffer(await f.batchMulBuffer(a, b), await f.batchMulBuffer(c, d));
  for (const n of [0, 1, 2, 17, 65, 4097, 262144]) {
    const a = f.concat(Array.from({ length: n }, (_, i) => f.fromBigInt(BigInt(i * 17 + 3))));
    const b = await f.batchScaleBuffer(a, f.neg(f.one)), zero = f.createZeroBuffer(n);
    for (const [c, d] of [[a, b], [zero, b], [b, b]]) {
      const expected = await control(a, b, c, d);
      assert.deepEqual(await f.batchProductDifferenceBuffer(a, b, c, d), expected);
      if (n < 100) for (let i = 0; i < n; i++) assert.deepEqual(f.readBufferElement(expected, i), f.sub(f.mul(f.readBufferElement(a, i), f.readBufferElement(b, i)), f.mul(f.readBufferElement(c, i), f.readBufferElement(d, i))));
    }
    if (n === 262144) {
      const expected = await control(a, b, b, b), samples = [];
      for (let i = 0; i < 5; i++) for (const candidate of i % 2 ? [true, false] : [false, true]) {
        const start = performance.now(), result = await (candidate ? f.batchProductDifferenceBuffer(a, b, b, b) : control(a, b, b, b));
        samples.push({ candidate, ms: performance.now() - start }); assert.deepEqual(result, expected);
      }
      console.log(JSON.stringify({ n, samples }));
    }
  }
  await assert.rejects(() => f.batchProductDifferenceBuffer(f.one, f.one, f.createZeroBuffer(2), f.one));
  await assert.rejects(() => f.batchProductDifferenceBuffer(new Uint8Array(31), f.one, f.one, f.one));
} finally { await runtime.terminate(); }
console.log("Checked fused product differences, zeros, cancellation, uneven/empty ranges and malformed buffers.");
