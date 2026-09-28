import assert from "node:assert/strict";
import { getCurveFromName } from "ffjavascript";
import type { FfCurve } from "../../../src/runtime/curve/curve.js";
import type { WasmModuleBuilder } from "../../../src/runtime/field/kernel-builder-types.js";
import { installLinearBatchPlugin } from "../../../src/runtime/field/linear-batch-plugin.js";
import { buildSignedMsmKernel } from "../../../src/runtime/group/signed-msm-kernel.js";
import { signedDigits, signedG1Msm } from "../../../src/runtime/group/signed-msm.js";

const raw = await getCurveFromName("bls12381", false, (module: WasmModuleBuilder) => {
  installLinearBatchPlugin(module); buildSignedMsmKernel(module);
}) as FfCurve;
try {
  const { G1: g, Fr: f } = raw;
  const encode = (values: readonly bigint[]) => {
    const bytes = new Uint8Array(values.length * 32);
    for (let i = 0; i < values.length; i++) {
      let v = values[i]!;
      for (let b = 0; b < 32; b++) { bytes[i * 32 + b] = Number(v & 255n); v >>= 8n; }
    }
    return bytes;
  };
  for (const width of [2, 3, 7, 13, 14, 15, 17]) {
    const values = [0n, 1n, f.p - 1n, (1n << 256n) - 1n];
    for (let bit = width - 1; bit < 256; bit += width) for (const d of [-1n, 0n, 1n]) values.push((1n << BigInt(bit)) + d);
    const digits = signedDigits(encode(values), width);
    values.forEach((value, i) => {
      let actual = 0n;
      for (let w = digits.length - 1; w >= 0; w--) actual = (actual << BigInt(width)) + BigInt(digits[w]![i]!);
      assert.equal(actual, value);
    });
  }
  const pool = [g.zeroAffine, g.oneAffine, g.toAffine(g.neg(g.one)), g.toAffine(g.timesScalar(g.one, 7n))], factors = [0n, 1n, -1n, 7n];
  for (const count of [0, 1, 2, 3, 31, 32, 33, 257, 4097, 262144]) {
    const bases = new Uint8Array(count * 96), values = [];
    let state = 17n, sum = 0n;
    for (let i = 0; i < count; i++) {
      state = (state * 6364136223846793005n + 1442695040888963407n) % f.p;
      const value = i % 7 === 0 ? 0n : i % 7 === 1 ? 1n : i % 7 === 2 ? f.p - 1n : state;
      values.push(value); bases.set(pool[i % 4]!, i * 96); sum = (sum + value * factors[i % 4]!) % f.p;
    }
    sum = (sum + f.p) % f.p;
    const oracle = sum === 0n ? g.zero : g.timesScalar(g.one, sum), scalars = encode(values);
    const expected = await g.multiExpAffine(bases, scalars); assert(g.eq(expected, oracle));
    const nativeWidth = count < 32 ? 3 : Math.floor(Math.ceil(Math.log2(count)) * 0.69) + 1;
    const widths = count < 4097 ? [...new Set([2, 3, 7, 13, 14, 15, 17, nativeWidth, nativeWidth + 1])] : [nativeWidth - 1, nativeWidth, nativeWidth + 1];
    for (const width of widths) assert(g.eq(await signedG1Msm(g, f.tm, bases, scalars, width), oracle), `Signed MSM ${count}/${width}`);
    if (count >= 4097) {
      const samples = [];
      for (const width of widths) for (let i = 0; i < 5; i++) for (const mode of ["control", "signed"]) {
        const start = performance.now();
        const out = mode === "control" ? await g.multiExpAffine(bases, scalars) : await signedG1Msm(g, f.tm, bases, scalars, width);
        samples.push({ width, mode, ms: performance.now() - start }); assert(g.eq(out, oracle));
      }
      console.log(JSON.stringify({ count, workers: f.tm.concurrency, samples }));
    }
  }
  const repeated = new Uint8Array(96 * 2); repeated.set(g.oneAffine); repeated.set(g.oneAffine, 96);
  for (const width of [2, 13, 14, 15]) {
    assert(g.isZero(await signedG1Msm(g, f.tm, repeated, encode([1n, f.p - 1n]), width)));
    assert(g.isZero(await signedG1Msm(g, f.tm, repeated, encode([0n, 0n]), width)));
    const maximum = (1n << 256n) - 1n;
    assert(g.eq(await signedG1Msm(g, f.tm, g.oneAffine, encode([maximum]), width), g.timesScalar(g.one, maximum % f.p)));
  }
  await assert.rejects(() => signedG1Msm(g, f.tm, new Uint8Array(1), new Uint8Array(), 13), /length mismatch/);
  assert.throws(() => signedDigits(new Uint8Array(1), 13), /Invalid/);
} finally { await raw.terminate?.(); }
console.log("Checked signed-digit reconstruction, final carry, stock MSM/known-generator algebra, identities and cancellation.");
