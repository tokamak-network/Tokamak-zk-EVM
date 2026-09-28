import assert from "node:assert/strict";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import { msmAffineMontgomeryChunks, coalesceAffineMsmChunks, type AffineMontgomeryMsmChunk } from "../../../src/runtime/group/affine-msm.js";
const runtime = await createCurveRuntime();
try {
  const f = runtime.Fr;
  for (const counts of [[], [0], [1], [3, 0, 5, 2], [17, 2, 1]]) {
    for (const allZero of [false, true]) {
      let total = 0n;
      const input = counts.map(count => {
        const bases = new Uint8Array(count * 96), scalars = f.createZeroBuffer(count);
        for (let i = 0; i < count; i++) { const value = BigInt(allZero || i % 3 === 0 ? 0 : i + 1); total += value; bases.set(runtime.G1.generator, i * 96); f.writeBufferElement(scalars, i, f.fromBigInt(value)); }
        return { bases, montgomeryScalars: scalars };
      });
      const expected = total === 0n ? runtime.G1.zero : runtime.G1.mulScalar(runtime.G1.generator, f.fromBigInt(total));
      async function* source() { yield* input; }
      for (const max of [1, 4, 16]) {
        const chunks: AffineMontgomeryMsmChunk[] = [];
        for await (const chunk of coalesceAffineMsmChunks(source(), max)) { assert(chunk.bases.length <= max * 96); chunks.push(chunk); }
        const out = await msmAffineMontgomeryChunks(runtime, chunks);
        runtime.G1.assertValid(out);
        assert(runtime.G1.eq(out, expected));
      }
      const sequential = await msmAffineMontgomeryChunks(runtime, input);
      runtime.G1.assertValid(sequential);
      assert(runtime.G1.eq(sequential, expected));
    }
  }
  async function* malformed() { yield { bases: new Uint8Array(1), montgomeryScalars: new Uint8Array(32) }; }
  await assert.rejects(() => msmAffineMontgomeryChunks(runtime, coalesceAffineMsmChunks(malformed(), 4)), /length mismatch/);
} finally { await runtime.terminate(); }
console.log("Checked bounded MSM source fusion, empty/all-zero identities and scalar sums.");
