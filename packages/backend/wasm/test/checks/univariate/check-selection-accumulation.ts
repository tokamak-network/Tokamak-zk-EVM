import assert from "node:assert/strict";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import { SelectedRoots } from "../../../src/univariate/selected-roots.js";

const runtime = await createCurveRuntime();
try {
  const f = runtime.Fr;
  for (const width of [1, 2, 8, 32]) {
    const setup = { m: 4, m_b: 2, t: 2, s: width, n: 2, publicWirePhases: [] };
    const roots = await SelectedRoots.create(f, setup, Array.from({ length: width }, (_, i) => i % 2 ? null : 0));
    for (const rows of [0, 1, 3, 17]) {
      const values = f.concat(Array.from({ length: rows * width }, (_, i) => f.fromBigInt((BigInt(i % 5 ? i - 7 : 0) + f.modulus) % f.modulus)));
      const expected = f.createZeroBuffer(rows * width);
      const inverse = f.inv(f.fromBigInt(BigInt(width * setup.t)));
      for (let row = 0; row < rows; row++) {
        for (let i = 0; i < width; i++) {
          const q = roots.polynomial.ruffini(roots.roots[i]!).quotient.scale(f.mul(roots.roots[i]!, inverse));
          for (let j = 0; j <= q.degree; j++) {
            const k = row * width + j;
            f.writeBufferElement(expected, k, f.add(f.readBufferElement(expected, k), f.mul(f.readBufferElement(values, row * width + i), f.readBufferElement(q.coefficients, j))));
          }
        }
      }
      assert.deepEqual(await roots.quotients(values), expected);
    }
    await assert.rejects(() => f.selectionAccumulateBuffer(f.createZeroBuffer(1), f.createZeroBuffer(width * width - 1), width));
  }
  // Independent dense and sparse accumulation timings include worker transfers.
  for (const sparse of [false, true]) {
    const width = 256, rows = 32;
    const cofactors = f.concat(Array.from({ length: width * width }, (_, i) => f.fromBigInt(BigInt(i + 1))));
    const values = f.concat(Array.from({ length: rows * width }, (_, i) => f.fromBigInt(BigInt(sparse && i % 16 ? 0 : i + 1))));
    const samples = [];
    for (let repeat = 0; repeat < 4; repeat++) {
      const candidate = repeat % 2 === 1;
      const start = performance.now();
      if (candidate) await f.selectionAccumulateBuffer(values, cofactors, width);
      else for (let row = 0; row < rows; row++) {
        let out = f.createZeroBuffer(width);
        for (let i = 0; i < width; i++) {
          const value = f.readBufferElement(values, row * width + i);
          if (!f.isZero(value)) out = await f.batchAddScaledBuffer(out, cofactors.slice(i * width * 32, (i + 1) * width * 32), value);
        }
      }
      samples.push({ candidate, ms: performance.now() - start });
    }
    console.log(JSON.stringify({ sparse, width, rows, samples }));
  }
} finally { await runtime.terminate(); }
console.log("Checked batched selection cofactors against scalar polynomial accumulation.");
