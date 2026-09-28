import assert from "node:assert/strict";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import { buildConnectionPermutationPolynomial } from "../../../src/univariate/relation.js";
import { deriveUnivariateDomainShape } from "../../../src/univariate/domain.js";

const runtime = await createCurveRuntime();
try {
  const f = runtime.Fr;
  for (const n of [2, 16, 64, 262144]) {
    const setup = { n: 2, m: n, m_b: n, t: 2, s: 1, publicWirePhases: [{ name: "output", region: "free" as const, subcircuitIds: [0] }] };
    const infos = [{
      id: 0, name: "buffer", Nwires: n, NrealWires: n, Nconsts: 0,
      Out_idx: [1, 1] as const, In_idx: [2, n - 2] as const, Wiring_idx: [0, n] as const,
      Public_idx: [1, 1] as const, Internal_idx: [n, 0] as const,
      bufferDirection: "out" as const, publicPhase: "output",
    }];
    const domain = deriveUnivariateDomainShape(f, setup), root = domain.connectionRoot;
    const targets = Uint32Array.from({ length: n }, (_, i) => i), mapped = new Uint8Array(n);
    const permutation: { row: number; col: number; X: number; Y: number }[] = [
      { row: 1, col: 0, X: 0, Y: 0 }, { row: 0, col: 0, X: 1, Y: 0 },
    ];
    targets[0] = 1; targets[1] = 0; mapped[0] = mapped[1] = 1;
    for (let i = 2; i + 1 < n; i += 16) {
      targets[i] = i + 1; targets[i + 1] = i; mapped[i] = mapped[i + 1] = 1;
      permutation.push({ row: i, col: 0, X: i + 1, Y: 0 }, { row: i + 1, col: 0, X: i, Y: 0 });
    }
    const control = () => {
      const values = f.createZeroBuffer(n); let point = f.one;
      for (let i = 0; i < n; i++) { f.writeBufferElement(values, i, point); point = f.mul(point, root); }
      for (let i = 0; i < n; i++) if (mapped[i]) f.writeBufferElement(values, i, f.pow(root, targets[i]!));
      return values;
    };
    // Mirrors only the changed construction region, excluding admission/IFFT
    // equally from both unit timings. The public helper is checked below.
    const candidate = async () => {
      const ones = f.createZeroBuffer(n); ones.set(f.one);
      for (let filled = 32; filled < ones.byteLength; filled *= 2) ones.set(ones.subarray(0, Math.min(filled, ones.byteLength - filled)), filled);
      const powers = await f.batchApplyKeyBuffer(ones, f.one, root), values = f.createZeroBuffer(n);
      for (let i = 0; i < n; i++) values.set(powers.subarray(targets[i]! * 32, (targets[i]! + 1) * 32), i * 32);
      return values;
    };
    const expected = control(); assert.deepEqual(await candidate(), expected);
    const actual = await buildConnectionPermutationPolynomial(f, domain, setup, [0], permutation, infos);
    assert.deepEqual(actual.evaluations, expected); assert.deepEqual(actual.coefficients, await f.ifftBuffer(expected));
    if (n > 1) {
      await assert.rejects(() => buildConnectionPermutationPolynomial(f, domain, setup, [null], permutation, infos));
      await assert.rejects(() => buildConnectionPermutationPolynomial(f, domain, setup, [0], [permutation[0]!, permutation[0]!], infos));
      await assert.rejects(() => buildConnectionPermutationPolynomial(f, domain, setup, [0], [permutation[0]!], infos));
      await assert.rejects(() => buildConnectionPermutationPolynomial(f, domain, setup, [0], [{ row: n, col: 0, X: 0, Y: 0 }], infos));
    }
    if (n === 262144) {
      const samples = [];
      for (let i = 0; i < 5; i++) for (const batched of i % 2 ? [true, false] : [false, true]) {
        const start = performance.now(), result = await (batched ? candidate() : control());
        samples.push({ candidate: batched, ms: performance.now() - start }); assert.deepEqual(result, expected);
      }
      console.log(JSON.stringify({ n, explicitMappings: permutation.length, samples }));
    }
  }
} finally { await runtime.terminate(); }
console.log("Checked batched permutation roots/gather, identity, inactive slots, singleton, coefficient parity and admission failures.");
