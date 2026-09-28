import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createCurveRuntime } from "../../src/runtime/curve/curve.js";
import { admitUnivariateCrsChunks } from "../../src/univariate/chunked-crs.js";
import { msmAffineMontgomeryChunks, type AffineMontgomeryMsmChunk } from "../../src/runtime/group/affine-msm.js";
const root = path.resolve(process.argv[2]!, "chunks");
const manifest = JSON.parse(await readFile(path.join(root, "univariate-crs-manifest.json"), "utf8"));
const runtime = await createCurveRuntime();
try {
  const f = runtime.Fr, reader = admitUnivariateCrsChunks({ manifest, loadChunk: async name => new Uint8Array(await readFile(path.join(root, name))) }, "prover");
  const n = 262147, bases = await reader.requireSection("crs.s0").readElements(0, n);
  let state = 123456789;
  const scalars = f.createZeroBuffer(n);
  for (let i = 0; i < n; i++) {
    let value = 0n;
    for (let j = 0; j < 8; j++) { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; value = (value << 32n) | BigInt(state >>> 0); }
    f.writeBufferElement(scalars, i, f.fromBigInt(value % f.modulus));
  }
  const chunks = (points: number, values = scalars, selectedBases = bases): AffineMontgomeryMsmChunk[] => {
    const output = [];
    for (let i = 0; i < values.length / 32; i += points) output.push({ bases: selectedBases.subarray(i * 96, (i + points) * 96), montgomeryScalars: values.subarray(i * 32, (i + points) * 32) });
    return output;
  };
  let expected: Uint8Array | undefined;
  for (const exponent of [18, 16, 17, 19, 18, 19, 17, 16]) {
    const start = performance.now(), out = await msmAffineMontgomeryChunks(runtime, chunks(2 ** exponent));
    const ms = performance.now() - start; expected ??= out; assert(runtime.G1.eq(out, expected));
    console.log(JSON.stringify({ experiment: "chunk", exponent, ms }));
  }
  for (const percent of [0, 25, 50, 75, 95, 100]) {
    const count = 65536, values = scalars.slice(0, count * 32), points = bases.subarray(0, count * 96);
    for (let i = 0; i < count; i++) if (i % 100 < percent) values.fill(0, i * 32, (i + 1) * 32);
    let reference: Uint8Array | undefined;
    for (const filtered of [false, true, false, true]) {
      const start = performance.now();
      let v = values, p = points;
      if (filtered) {
        v = new Uint8Array(values.length); p = new Uint8Array(points.length);
        let cursor = 0;
        for (let i = 0; i < count; i++) {
          let nonzero = 0; for (let j = i * 32; j < (i + 1) * 32; j++) nonzero |= values[j]!;
          if (nonzero) { v.set(values.subarray(i * 32, (i + 1) * 32), cursor * 32); p.set(points.subarray(i * 96, (i + 1) * 96), cursor * 96); cursor++; }
        }
        v = v.subarray(0, cursor * 32); p = p.subarray(0, cursor * 96);
      }
      const out = await msmAffineMontgomeryChunks(runtime, chunks(2 ** 18, v, p));
      const ms = performance.now() - start; reference ??= out; assert(runtime.G1.eq(out, reference));
      console.log(JSON.stringify({ experiment: "filter", percent, filtered, ms }));
    }
  }
  const small = chunks(128, scalars.subarray(0, 32768 * 32), bases.subarray(0, 32768 * 96));
  let reference: Uint8Array | undefined;
  for (const fused of [false, true, false, true]) {
    const start = performance.now();
    let source = small;
    if (fused) {
      const p = new Uint8Array(32768 * 96), v = new Uint8Array(32768 * 32);
      for (let i = 0; i < small.length; i++) { p.set(small[i]!.bases, i * 128 * 96); v.set(small[i]!.montgomeryScalars, i * 128 * 32); }
      source = [{ bases: p, montgomeryScalars: v }];
    }
    const out = await msmAffineMontgomeryChunks(runtime, source), ms = performance.now() - start;
    reference ??= out; assert(runtime.G1.eq(out, reference));
    console.log(JSON.stringify({ experiment: "fusion", fused, ms }));
  }
} finally { await runtime.terminate(); }
