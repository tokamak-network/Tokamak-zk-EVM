import type { FfGroup, FfThreadManager } from "../curve/curve.js";
import { G1_SIGNED_WINDOW } from "./signed-msm-kernel.js";

export function signedDigits(scalars: Uint8Array, width: number): readonly Int32Array[] {
  if (scalars.length % 32 || !Number.isInteger(width) || width < 2 || width > 17) throw new Error("Invalid signed MSM scalar length or width.");
  const count = scalars.length / 32, windows = Math.ceil(256 / width), radix = 1 << width, half = radix >>> 1;
  const padded = new Uint8Array(scalars.length + 4); padded.set(scalars);
  const view = new DataView(padded.buffer), digits = Array.from({ length: windows }, () => new Int32Array(count));
  for (let i = 0; i < count; i++) {
    let carry = 0;
    for (let w = 0; w < windows; w++) {
      const bit = w * width, mask = (1 << Math.min(width, 256 - bit)) - 1;
      const value = ((view.getUint32(i * 32 + (bit >>> 3), true) >>> (bit & 7)) & mask) + carry;
      carry = (value + half) >>> width;
      digits[w]![i] = w + 1 === windows ? value : value - carry * radix;
    }
  }
  return digits;
}

export async function signedG1Msm(group: FfGroup, tm: FfThreadManager, bases: Uint8Array, scalars: Uint8Array, width?: number): Promise<Uint8Array> {
  const count = bases.length / 96;
  if (!Number.isInteger(count) || scalars.length !== count * 32) throw new Error("Signed G1 MSM length mismatch.");
  if (width !== undefined && (!Number.isInteger(width) || width < 2 || width > 17)) throw new Error("Invalid signed MSM width.");
  let result = group.zero;
  // Preserve the dependency's point-chunk bound; scalar recoding stays local
  // to that chunk rather than scaling scratch space with the complete input.
  for (let start = 0; start < count; start += 1 << 22) {
    const end = Math.min(count, start + (1 << 22)), n = end - start;
    const bits = width ?? (n < 32 ? 3 : Math.floor(Math.ceil(Math.log2(n)) * 69 / 100) + 1);
    const term = await signedChunk(group, tm, bases.subarray(start * 96, end * 96), scalars.subarray(start * 32, end * 32), bits);
    if (!group.isZero(term)) result = group.isZero(result) ? term : group.add(result, term);
  }
  return result;
}

async function signedChunk(group: FfGroup, tm: FfThreadManager, bases: Uint8Array, scalars: Uint8Array, width: number): Promise<Uint8Array> {
  const count = bases.length / 96;
  const digits = signedDigits(scalars, width);
  const pending = digits.map((values, w) => {
    const bucketCount = 1 << (w + 1 === digits.length ? Math.min(width, 256 - w * width) : width - 1);
    return tm.queueAction([
      { cmd: "ALLOCSET", var: 0, buff: bases },
      { cmd: "ALLOCSET", var: 1, buff: new Uint8Array(values.buffer) },
      { cmd: "ALLOC", var: 2, len: bucketCount * 144 },
      { cmd: "ALLOC", var: 3, len: 144 },
      { cmd: "CALL", fnName: G1_SIGNED_WINDOW, params: [{ var: 0 }, { var: 1 }, { val: count }, { val: bucketCount }, { var: 2 }, { var: 3 }] },
      { cmd: "GET", out: 0, var: 3, len: 144 },
    ]);
  });
  const terms = await Promise.all(pending);
  let out = group.zero;
  for (let w = terms.length - 1; w >= 0; w--) {
    if (!group.isZero(out)) for (let bit = 0; bit < width; bit++) out = group.double(out);
    const term = terms[w]![0]!;
    if (!group.isZero(term)) out = group.isZero(out) ? term : group.add(out, term);
  }
  return out;
}
