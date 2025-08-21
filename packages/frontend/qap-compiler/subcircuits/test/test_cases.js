const crypto = require("crypto");
const modulus = 1n << 256n;
const N = 115792089237316195423570985008687907853269984665640564039457584007913129639936n;

function randomNByteBigInt(N) {
  const buf = crypto.randomBytes(N);
  let result = 0n;
  for (let i = 0; i < N; i++) {
    result = (result << 8n) + BigInt(buf[i]);
  }
  return result;
}
function abs(x) {
  return x < 0n ? -x : x;
}

const NTestSamples = 2**0;
const in1 = Array.from({ length: NTestSamples }, () => randomNByteBigInt(32));
const in2 = Array.from({ length: NTestSamples }, () => randomNByteBigInt(32));
const in3 = Array.from({ length: NTestSamples }, () => randomNByteBigInt(32));

const in1_small = Array.from({ length: NTestSamples }, () => randomNByteBigInt(1));
// const in1_smaller = Array.from({ length: NTestSamples }, () => BigInt(crypto.randomInt(32)));
// const in1_half = Array.from({ length: NTestSamples }, () => randomNByteBigInt(16));

// const in2_half = Array.from({ length: NTestSamples }, () => randomNByteBigInt(16));

// const in3_half = Array.from({ length: NTestSamples }, () => randomNByteBigInt(16));
const in3_binary = Array.from({ length: NTestSamples }, () => BigInt(crypto.randomInt(2)));

const add_out = Array.from({ length: NTestSamples }, (_, i) =>
  (in1[i] + in2[i]) % modulus
);
const add = { in1: [...in1], in2: [...in2], out1: [...add_out] };

const mul_out = Array.from({ length: NTestSamples }, (_, i) =>
  (in1[i] * in2[i]) % modulus
);
const mul = { in1: [...in1], in2: [...in2], out1: [...mul_out] };

const sub_out = Array.from({ length: NTestSamples }, (_, i) =>
  (in1[i] - in2[i]) % modulus
);
const sub = { in1: [...in1], in2: [...in2], out1: [...sub_out] };

const div_out = Array.from({ length: NTestSamples }, (_, i) =>
  in2[i] === 0n ? 0n : in1[i] / in2[i]
);
const div = { in1: [randomNByteBigInt(32), ...in1], in2: [0n, ...in2], out1: [0n, ...div_out] };

const sdiv_out = Array.from({ length: NTestSamples }, (_, i) => {
  const a = in1[i] < modulus / 2n ? in1[i] : in1[i] - modulus;
  const b = in2[i] < modulus / 2n ? in2[i] : in2[i] - modulus;
  if (b === 0n) return 0n;
  const q = (a < 0n !== b < 0n) ? -(abs(a) / abs(b)) : abs(a) / abs(b);
  return (q + modulus) % modulus;
});
const sdiv = { in1: [randomNByteBigInt(32), ...in1], in2: [0n, ...in2], out1: [0n, ...sdiv_out] };

const mod_out = Array.from({ length: NTestSamples }, (_, i) =>
  in2[i] === 0n ? 0n : in1[i] % in2[i]
);
const mod = { in1: [randomNByteBigInt(32), ...in1], in2: [0n, ...in2], out1: [0n, ...mod_out] };

const smod_out = Array.from({ length: NTestSamples }, (_, i) => {
  const a = in1[i] < modulus / 2n ? in1[i] : in1[i] - modulus;
  const b = in2[i] < modulus / 2n ? in2[i] : in2[i] - modulus;
  if (b === 0n) return 0n;
  const r = abs(a) % abs(b);
  const signed = a < 0n ? -r : r;
  return (signed + modulus) % modulus;
});
const smod = { in1: [randomNByteBigInt(32), ...in1], in2: [0n, ...in2], out1: [0n, ...smod_out] };

const addmod_out = Array.from({ length: NTestSamples }, (_, i) =>
  in3[i] === 0n ? 0n : (in1[i] + in2[i]) % in3[i]
);
const addmod = { in1: [randomNByteBigInt(32), ...in1], in2: [randomNByteBigInt(32), ...in2], in3: [0n, ...in3], out1: [0n, ...addmod_out] };

const mulmod_out = Array.from({ length: NTestSamples }, (_, i) =>
  in3[i] === 0n ? 0n : (in1[i] * in2[i]) % in3[i]
);
const mulmod = { in1: [randomNByteBigInt(32), ...in1], in2: [randomNByteBigInt(32), ...in2], in3: [0n, ...in3], out1: [0n, ...mulmod_out] };

const sub_exp_out1 = Array.from({ length: NTestSamples }, (_, i) => {
  const c_prev = in1[i];
  const a_prev = in2[i];
  const b = in3_binary[i];
  const c_next = (c_prev * (a_prev * b + (1n-b))) % N;
  return c_next
});
const sub_exp_out2 = Array.from({ length: NTestSamples }, (_, i) => {
  const a_prev = in2[i];
  const a_next = (a_prev * a_prev) % N;
  return a_next
});
const sub_exp = { in1: [...in1], in2: [...in2], in3: [...in3_binary], out1: [...sub_exp_out1], out2: [...sub_exp_out2] };

const signextend_out = Array.from({ length: NTestSamples }, (_, i) => {
  const k = in1_small[i];
  const x = in2[i];
  if (k >= 31n) return x;
  const bit_length = 8n * (k + 1n);
  const sign_tester = 1n << (bit_length - 1n);
  const x_mask = (1n << bit_length) - 1n;
  const masked_x = x & x_mask;
  return masked_x & sign_tester ? ( masked_x | (~x_mask & (modulus - 1n)) ) : masked_x;
});
const signextend = { in1: [...in1_small], in2: [...in2], out1: [...signextend_out] };

const lt_out = Array.from({ length: NTestSamples }, (_, i) =>
  in1[i] < in2[i] ? 1n : 0n
);
const lt = { in1: [...in1], in2: [...in2], out1: [...lt_out] };

const gt_out = Array.from({ length: NTestSamples }, (_, i) =>
  in1[i] > in2[i] ? 1n : 0n
);
const gt = { in1: [...in1], in2: [...in2], out1: [...gt_out] };

const slt_out = Array.from({ length: NTestSamples }, (_, i) => {
  const a = in1[i] < modulus / 2n ? in1[i] : in1[i] - modulus;
  const b = in2[i] < modulus / 2n ? in2[i] : in2[i] - modulus;
  return a < b ? 1n : 0n;
});
const slt = { in1: [...in1], in2: [...in2], out1: [...slt_out] };

const sgt_out = Array.from({ length: NTestSamples }, (_, i) => {
  const a = in1[i] < modulus / 2n ? in1[i] : in1[i] - modulus;
  const b = in2[i] < modulus / 2n ? in2[i] : in2[i] - modulus;
  return a > b ? 1n : 0n;
});
const sgt = { in1: [...in1], in2: [...in2], out1: [...sgt_out] };

const eq_out = Array.from({ length: NTestSamples }, (_, i) =>
  in1[i] === in2[i] ? 1n : 0n
);
const eq = { in1: [...in1], in2: [...in2], out1: [...eq_out] };

const iszero_out = Array.from({ length: NTestSamples }, (_, i) =>
  in1[i] === 0n ? 1n : 0n
);
const iszero = { in1: [...in1], out1: [...iszero_out] };

const and_out = Array.from({ length: NTestSamples }, (_, i) =>
  in1[i] & in2[i]
);
const and = { in1: [...in1], in2: [...in2], out1: [...and_out] };

const or_out = Array.from({ length: NTestSamples }, (_, i) =>
  in1[i] | in2[i]
);
const or = { in1: [...in1], in2: [...in2], out1: [...or_out]};

const xor_out = Array.from({ length: NTestSamples }, (_, i) =>
  in1[i] ^ in2[i]
);
const xor = { in1: [...in1], in2: [...in2], out1: [...xor_out]};

const not_out = Array.from({ length: NTestSamples }, (_, i) =>
  (~in1[i]) & (modulus - 1n)
);
const not = { in1: [...in1], out1: [...not_out] };

const byte_out = Array.from({ length: NTestSamples }, (_, i) => {
  if (in1_small[i] >= 32n) return 0n;
  const shift = 248n - 8n * in1_small[i];
  return (in2[i] >> shift) & 0xffn;
});
const byte = { in1: [...in1_small], in2: [...in2], out1: [...byte_out] };

const shl_out = Array.from({ length: NTestSamples }, (_, i) => {
  const shift = in1_small[i];
  return (in2[i] << shift) % modulus;
});
const shl = { in1: [...in1_small], in2: [...in2], out1: [...shl_out] };

const shr_out = Array.from({ length: NTestSamples }, (_, i) => {
  const shift = in1_small[i];
  return in2[i] >> shift;
});
const shr = { in1: [...in1_small], in2: [...in2], out1: [...shr_out] };

const sar_out = Array.from({ length: NTestSamples }, (_, i) => {
  const shift = in1_small[i];
  const x = in2[i] < modulus / 2n ? in2[i] : in2[i] - modulus;
  const shifted = x >> shift;
  return (shifted + modulus) % modulus;
});
const sar = { in1: [...in1_small], in2: [...in2], out1: [...sar_out] };

module.exports = {
  NTestSamples,
  add,
  mul,
  sub,
  div,
  sdiv,
  mod,
  smod,
  addmod,
  mulmod,
  sub_exp,
  signextend,
  lt,
  gt,
  slt,
  sgt,
  eq,
  iszero,
  and,
  or,
  xor,
  not,
  byte,
  shl,
  shr,
  sar,
}