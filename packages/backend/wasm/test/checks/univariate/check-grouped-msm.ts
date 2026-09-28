import assert from "node:assert/strict";
import { getCurveFromName } from "ffjavascript";
import type { FfCurve } from "../../../src/runtime/curve/curve.js";
import { installLinearBatchPlugin } from "../../../src/runtime/field/linear-batch-plugin.js";
import { groupedG1Msm } from "../../profiling/candidates/grouped-msm.js";

const raw = await getCurveFromName("bls12381", false, installLinearBatchPlugin) as FfCurve;
try {
  const { G1: g, Fr: f } = raw;
  const pool = [g.zeroAffine, g.oneAffine, g.toAffine(g.neg(g.one)), g.toAffine(g.timesScalar(g.one, 7n))];
  const multiples = [0n, 1n, -1n, 7n];
  for (const count of [0, 1, 2, 3, 15, 16, 17, 257, 1023, 1024, 1025, 4097, 262144]) {
    const bases = new Uint8Array(count * 96), scalars = new Uint8Array(count * 32);
    let expected = 0n, state = 15n;
    for (let i = 0; i < count; i++) {
      state = (state * 6364136223846793005n + 1442695040888963407n) % f.p;
      const value = i % 7 === 0 ? 0n : i % 7 === 1 ? 1n : i % 7 === 2 ? f.p - 1n : state;
      bases.set(pool[i % pool.length]!, i * 96);
      f.toRprLE(scalars, i * 32, f.e(value));
      expected = (expected + value * multiples[i % pool.length]!) % f.p;
    }
    expected = (expected + f.p) % f.p;
    const oracle = expected === 0n ? g.zero : g.timesScalar(g.one, expected);
    const control = () => g.multiExpAffine(bases, scalars);
    const candidate = () => groupedG1Msm(g, f.tm, bases, scalars);
    for (const out of [await control(), await candidate()]) assert(g.eq(out, oracle), `MSM mismatch at ${count}`);
    if (count < 4097) for (const concurrency of [1, 3, 7]) {
      const out = await groupedG1Msm(g, { concurrency, queueAction: task => f.tm.queueAction(task) }, bases, scalars);
      assert(g.eq(out, oracle), `Uneven window mismatch at ${count}/${concurrency}`);
    }
    if (count === 262144) {
      const samples = [];
      for (let i = 0; i < 5; i++) for (const [mode, run] of [["control", control], ["candidate", candidate]] as const) {
        const start = performance.now(), out = await run();
        samples.push({ mode, ms: performance.now() - start });
        assert(g.eq(out, oracle));
      }
      console.log(JSON.stringify({ count, workers: f.tm.concurrency, samples }));
    }
  }
  await assert.rejects(() => groupedG1Msm(g, f.tm, new Uint8Array(1), new Uint8Array()), /length mismatch/);
  await assert.rejects(() => groupedG1Msm(g, f.tm, g.oneAffine, new Uint8Array()), /length mismatch/);
} finally { await raw.terminate?.(); }
console.log("Checked grouped MSM: full scalars, identities, signed points, uneven windows and point-count boundaries.");
