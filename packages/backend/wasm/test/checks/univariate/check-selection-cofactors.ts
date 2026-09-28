import assert from "node:assert/strict";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import { SelectedRoots } from "../../../src/univariate/selected-roots.js";

const runtime = await createCurveRuntime();
try {
  const f = runtime.Fr;
  for (const width of [1, 2, 16, 256]) {
    const setup = { m: 4, m_b: 2, t: 2, s: width, n: 2, publicWirePhases: [] };
    const selected = await SelectedRoots.create(f, setup, Array.from({ length: width }, (_, i) => i % 2 ? null : 0));
    const roots = f.concat(selected.roots), inverse = f.inv(f.fromBigInt(BigInt(width * 2)));
    const control = () => {
      const rows = selected.roots.map(z => {
        const q = selected.polynomial.ruffini(z).quotient.scale(f.mul(z, inverse));
        const row = f.createZeroBuffer(width); row.set(q.coefficients); return row;
      });
      const packed = f.createZeroBuffer(width * width);
      rows.forEach((row, i) => packed.set(row, i * width * 32));
      return packed;
    };
    const candidate = () => f.selectionCofactorsBuffer(selected.polynomial.coefficients, roots, inverse);
    const expected = control(); assert.deepEqual(await candidate(), expected);
    for (const count of [0, 1, 3]) {
      const values = f.concat(Array.from({ length: count * width }, (_, i) => i % 3 ? f.zero : f.fromBigInt(BigInt(i + 1))));
      assert.deepEqual(await selected.quotients(values), await f.selectionAccumulateBuffer(values, expected, width));
    }
    if (width === 256) {
      const samples = [];
      for (let i = 0; i < 5; i++) for (const batched of i % 2 ? [true, false] : [false, true]) {
        const start = performance.now(), actual = await (batched ? candidate() : control());
        samples.push({ candidate: batched, ms: performance.now() - start }); assert.deepEqual(actual, expected);
      }
      console.log(JSON.stringify({ width, samples }));
    }
    await assert.rejects(() => f.selectionCofactorsBuffer(selected.polynomial.coefficients.subarray(32), roots, inverse));
    await assert.rejects(() => f.selectionCofactorsBuffer(selected.polynomial.coefficients, roots.subarray(1), inverse));
    await assert.rejects(() => f.selectionCofactorsBuffer(selected.polynomial.coefficients, roots, new Uint8Array(31)));
  }
  await assert.rejects(() => f.selectionCofactorsBuffer(f.one, new Uint8Array(), f.one));
} finally { await runtime.terminate(); }
console.log("Checked worker cofactors, row order, inactive/singleton roots, empty/sparse witness and malformed shapes.");
