import assert from "node:assert/strict";
import { createCurveRuntime } from "../../../src/runtime/curve/curve.js";
import { buildCopyRecurrence } from "../../../src/univariate/reference-prover.js";
const runtime = await createCurveRuntime();
try {
  const f = runtime.Fr;
  const scalarOracle = (root: Uint8Array, n: number, b: Uint8Array, sc: Uint8Array, beta: Uint8Array, gamma: Uint8Array) => {
    const out = f.createZeroBuffer(n); f.writeBufferElement(out, 0, f.one);
    let point = f.one;
    for (let i = 0; i < n; i++) {
      const numerator = f.add(f.add(f.readBufferElement(b, i), f.mul(beta, f.readBufferElement(sc, i))), gamma);
      const denominator = f.add(f.add(f.readBufferElement(b, i), f.mul(beta, point)), gamma);
      if (f.isZero(denominator)) throw Error("denominator");
      if (i + 1 < n) f.writeBufferElement(out, i + 1, f.div(f.mul(f.readBufferElement(out, i), numerator), denominator));
      else assert(f.eq(f.mul(f.readBufferElement(out, i), numerator), denominator));
      point = f.mul(point, root);
    }
    return out;
  };
  const operands = (root: Uint8Array, n: number, b: Uint8Array, sc: Uint8Array, beta: Uint8Array, gamma: Uint8Array) => {
    const numerators = f.createZeroBuffer(n), denominators = f.createZeroBuffer(n);
    let point = f.one;
    for (let i = 0; i < n; i++) {
      const value = f.readBufferElement(b, i);
      f.writeBufferElement(numerators, i, f.add(f.add(value, f.mul(beta, f.readBufferElement(sc, i))), gamma));
      f.writeBufferElement(denominators, i, f.add(f.add(value, f.mul(beta, point)), gamma));
      point = f.mul(point, root);
    }
    return { numerators, denominators };
  };
  const control = async (root: Uint8Array, n: number, b: Uint8Array, sc: Uint8Array, beta: Uint8Array, gamma: Uint8Array) => {
    const { numerators, denominators } = operands(root, n, b, sc, beta, gamma);
    for (let i = 0; i < n; i++) assert(!f.isZero(f.readBufferElement(denominators, i)));
    const out = await f.orderedRecurrenceBuffer(numerators, await f.batchInverseBuffer(denominators));
    assert(f.eq(f.mul(f.readBufferElement(out, n - 1), f.readBufferElement(numerators, n - 1)), f.readBufferElement(denominators, n - 1)));
    return out;
  };
  for (const n of [1, 7, 37, 4097]) {
    const b = f.concat(Array.from({ length: n }, (_, i) => f.fromBigInt(BigInt(i * 7))));
    const sc = f.concat(Array.from({ length: n }, (_, i) => f.fromBigInt(BigInt(i * i + 2))));
    for (const beta of [f.zero, f.one, f.neg(f.one)]) {
      const root = f.rootOfUnity(32), gamma = f.neg(f.fromBigInt(3n));
      assert.deepEqual(await f.copyOperandsBuffer(b, sc, root, beta, gamma), operands(root, n, b, sc, beta, gamma));
    }
  }
  for (const n of [1, 2, 8, 32, 262144]) {
    const root = f.rootOfUnity(n), beta = f.fromBigInt(2n), gamma = f.fromBigInt(3n);
    const b = f.concat(Array.from({ length: n }, () => f.fromBigInt(7n)));
    const sc = f.createZeroBuffer(n);
    let point = f.one;
    for (let i = 0; i < n; i++) { f.writeBufferElement(sc, n - i - 1, point); point = f.mul(point, root); }
    const expectedScalar = n < 262144 ? scalarOracle(root, n, b, sc, beta, gamma) : undefined;
    await control(root, n, b, sc, beta, gamma);
    await buildCopyRecurrence(f, root, n, b, sc, beta, gamma);
    const samples = [];
    let expected: Uint8Array | undefined;
    for (let repeat = 0; repeat < 10; repeat++) {
      const start = performance.now();
      const out = repeat % 2 ? (await buildCopyRecurrence(f, root, n, b, sc, beta, gamma)).evaluations : await control(root, n, b, sc, beta, gamma);
      samples.push({ candidate: Boolean(repeat % 2), ms: performance.now() - start });
      expected ??= out;
      assert.deepEqual(out, expected);
      if (expectedScalar) assert.deepEqual(out, expectedScalar);
    }
    if (n === 262144) console.log(JSON.stringify({ n, samples }));
    else {
      const invalid = sc.slice(); f.writeBufferElement(invalid, 0, f.zero);
      await assert.rejects(() => buildCopyRecurrence(f, root, n, b, invalid, beta, gamma), /does not close/);
      for (const index of [0, Math.floor(n / 2), n - 1]) {
        const zeroGamma = f.neg(f.add(f.fromBigInt(7n), f.mul(beta, f.pow(root, index))));
        await assert.rejects(() => buildCopyRecurrence(f, root, n, b, sc, beta, zeroGamma), /denominator vanishes/);
      }
    }
  }
  await assert.rejects(() => f.orderedRecurrenceBuffer(new Uint8Array(), new Uint8Array()), /positive/);
  await assert.rejects(() => f.copyOperandsBuffer(new Uint8Array(), new Uint8Array(), f.one, f.one, f.one), /positive/);
  await assert.rejects(() => f.copyOperandsBuffer(f.one, new Uint8Array(), f.one, f.one, f.one), /same length|matching|length/i);
} finally { await runtime.terminate(); }
console.log("Checked forward univariate recurrence, batch inversion, zero rejection and closure.");
