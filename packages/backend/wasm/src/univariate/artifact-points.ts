import type { CurveRuntime } from "../runtime/curve/curve.js";
function le(value: string, width: number): Uint8Array {
  const n = BigInt(value);
  return Uint8Array.from({ length: width }, (_, i) => Number(n >> BigInt(i * 8) & 255n));
}
function hex(bytes: Uint8Array): string {
  return "0x" + Array.from(bytes).reverse().map(b => b.toString(16).padStart(2, "0")).join("");
}
/** Common artifact coordinates are canonical LE, never ffjavascript memory. */
export function encodePoint(runtime: CurveRuntime, point: Uint8Array, g2 = false): Uint8Array {
  const p = (g2 ? runtime.G2 : runtime.G1).formatAffine(point);
  const width = g2 ? 96 : 48;
  const result = new Uint8Array(width * 2);
  result.set(le(p.x, width));
  result.set(le(p.y, width), width);
  return result;
}
export function decodePoint(runtime: CurveRuntime, bytes: Uint8Array, g2 = false): Uint8Array {
  const width = g2 ? 96 : 48;
  if(bytes.length !== width * 2)
    throw new Error("Invalid affine artifact length.");
  const modulus = 0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaabn;
  for(let i = 0; i < bytes.length; i += 48)
    if(BigInt(hex(bytes.subarray(i, i + 48))) >= modulus)
      throw new Error("Noncanonical point coordinate.");
  const group = g2 ? runtime.G2 : runtime.G1;
  const point = group.toAffine(group.parseAffine({ x: hex(bytes.subarray(0, width)), y: hex(bytes.subarray(width)) }));
  group.assertValid(point);
  return point;
}
export function decodeScalar(runtime: CurveRuntime, bytes: Uint8Array): Uint8Array {
  return runtime.Fr.fromHex(hex(bytes));
}
