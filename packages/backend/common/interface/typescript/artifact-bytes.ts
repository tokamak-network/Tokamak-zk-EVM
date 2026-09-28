// Generated from common/contracts/univariate-artifact-contract.json. Do not edit.
function checkField(bytes: Uint8Array, scalar: boolean): void {
  const width = scalar ? 32 : 48;
  const modulus = scalar ? 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001n : 0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaabn;
  for (let offset = 0; offset < bytes.length; offset += width) {
    let value = 0n;
    for (let i = width - 1; i >= 0; i--) value = (value << 8n) | BigInt(bytes[offset + i]!);
    if (value >= modulus) throw new Error("noncanonical artifact field");
  }
}

export interface ProofBytes {
  c_l: Uint8Array;
  c_h: Uint8Array;
  c_o: Uint8Array;
  d_q: Uint8Array;
  d_q_k: Uint8Array;
  c_d: Uint8Array;
  c_r: Uint8Array;
  c_q: Uint8Array;
  pi_chi: Uint8Array;
  pi_plus: Uint8Array;
  s_c: Uint8Array;
  u: Uint8Array;
  v: Uint8Array;
  w: Uint8Array;
  b: Uint8Array;
  r: Uint8Array;
  r_plus: Uint8Array;
}
export function decodeProofBytes(bytes: Uint8Array): ProofBytes {
  if (bytes.length !== 1184) throw new Error("invalid artifact byte length");
  checkField(bytes.subarray(0, 96), false);
  checkField(bytes.subarray(96, 192), false);
  checkField(bytes.subarray(192, 288), false);
  checkField(bytes.subarray(288, 384), false);
  checkField(bytes.subarray(384, 480), false);
  checkField(bytes.subarray(480, 576), false);
  checkField(bytes.subarray(576, 672), false);
  checkField(bytes.subarray(672, 768), false);
  checkField(bytes.subarray(768, 864), false);
  checkField(bytes.subarray(864, 960), false);
  checkField(bytes.subarray(960, 992), true);
  checkField(bytes.subarray(992, 1024), true);
  checkField(bytes.subarray(1024, 1056), true);
  checkField(bytes.subarray(1056, 1088), true);
  checkField(bytes.subarray(1088, 1120), true);
  checkField(bytes.subarray(1120, 1152), true);
  checkField(bytes.subarray(1152, 1184), true);
  return {
    c_l: bytes.slice(0, 96),
    c_h: bytes.slice(96, 192),
    c_o: bytes.slice(192, 288),
    d_q: bytes.slice(288, 384),
    d_q_k: bytes.slice(384, 480),
    c_d: bytes.slice(480, 576),
    c_r: bytes.slice(576, 672),
    c_q: bytes.slice(672, 768),
    pi_chi: bytes.slice(768, 864),
    pi_plus: bytes.slice(864, 960),
    s_c: bytes.slice(960, 992),
    u: bytes.slice(992, 1024),
    v: bytes.slice(1024, 1056),
    w: bytes.slice(1056, 1088),
    b: bytes.slice(1088, 1120),
    r: bytes.slice(1120, 1152),
    r_plus: bytes.slice(1152, 1184),
  };
}
export function encodeProofBytes(record: ProofBytes): Uint8Array {
  const bytes = new Uint8Array(1184);
  if (record.c_l.length !== 96) throw new Error("invalid c_l byte length");
  checkField(record.c_l, false);
  bytes.set(record.c_l, 0);
  if (record.c_h.length !== 96) throw new Error("invalid c_h byte length");
  checkField(record.c_h, false);
  bytes.set(record.c_h, 96);
  if (record.c_o.length !== 96) throw new Error("invalid c_o byte length");
  checkField(record.c_o, false);
  bytes.set(record.c_o, 192);
  if (record.d_q.length !== 96) throw new Error("invalid d_q byte length");
  checkField(record.d_q, false);
  bytes.set(record.d_q, 288);
  if (record.d_q_k.length !== 96) throw new Error("invalid d_q_k byte length");
  checkField(record.d_q_k, false);
  bytes.set(record.d_q_k, 384);
  if (record.c_d.length !== 96) throw new Error("invalid c_d byte length");
  checkField(record.c_d, false);
  bytes.set(record.c_d, 480);
  if (record.c_r.length !== 96) throw new Error("invalid c_r byte length");
  checkField(record.c_r, false);
  bytes.set(record.c_r, 576);
  if (record.c_q.length !== 96) throw new Error("invalid c_q byte length");
  checkField(record.c_q, false);
  bytes.set(record.c_q, 672);
  if (record.pi_chi.length !== 96) throw new Error("invalid pi_chi byte length");
  checkField(record.pi_chi, false);
  bytes.set(record.pi_chi, 768);
  if (record.pi_plus.length !== 96) throw new Error("invalid pi_plus byte length");
  checkField(record.pi_plus, false);
  bytes.set(record.pi_plus, 864);
  if (record.s_c.length !== 32) throw new Error("invalid s_c byte length");
  checkField(record.s_c, true);
  bytes.set(record.s_c, 960);
  if (record.u.length !== 32) throw new Error("invalid u byte length");
  checkField(record.u, true);
  bytes.set(record.u, 992);
  if (record.v.length !== 32) throw new Error("invalid v byte length");
  checkField(record.v, true);
  bytes.set(record.v, 1024);
  if (record.w.length !== 32) throw new Error("invalid w byte length");
  checkField(record.w, true);
  bytes.set(record.w, 1056);
  if (record.b.length !== 32) throw new Error("invalid b byte length");
  checkField(record.b, true);
  bytes.set(record.b, 1088);
  if (record.r.length !== 32) throw new Error("invalid r byte length");
  checkField(record.r, true);
  bytes.set(record.r, 1120);
  if (record.r_plus.length !== 32) throw new Error("invalid r_plus byte length");
  checkField(record.r_plus, true);
  bytes.set(record.r_plus, 1152);
  return bytes;
}

export interface PreprocessBytes {
  s_c: Uint8Array;
  c_fix: Uint8Array;
  e_kappa: Uint8Array;
}
export function decodePreprocessBytes(bytes: Uint8Array): PreprocessBytes {
  if (bytes.length !== 384) throw new Error("invalid artifact byte length");
  checkField(bytes.subarray(0, 96), false);
  checkField(bytes.subarray(96, 192), false);
  checkField(bytes.subarray(192, 384), false);
  return {
    s_c: bytes.slice(0, 96),
    c_fix: bytes.slice(96, 192),
    e_kappa: bytes.slice(192, 384),
  };
}
export function encodePreprocessBytes(record: PreprocessBytes): Uint8Array {
  const bytes = new Uint8Array(384);
  if (record.s_c.length !== 96) throw new Error("invalid s_c byte length");
  checkField(record.s_c, false);
  bytes.set(record.s_c, 0);
  if (record.c_fix.length !== 96) throw new Error("invalid c_fix byte length");
  checkField(record.c_fix, false);
  bytes.set(record.c_fix, 96);
  if (record.e_kappa.length !== 192) throw new Error("invalid e_kappa byte length");
  checkField(record.e_kappa, false);
  bytes.set(record.e_kappa, 192);
  return bytes;
}
