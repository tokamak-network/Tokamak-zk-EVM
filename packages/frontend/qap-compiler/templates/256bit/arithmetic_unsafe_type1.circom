pragma circom 2.1.6;
include "../../functions/arithmetic.circom";
include "../128bit/arithmetic.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";
include "arithmetic_safe.circom";
// include "../../node_modules/circomlib/circuits/gates.circom";

// Each input and output is an 256-bit integer represented by two 128-bit LE limbs; e.g.) in1[0]: lower 128 bits, in1[1]: upper 128 bits
// Each template here becomes safe only if well-formness of the input and output is guaranteed.
template Add256_unsafe() {
    signal input in1[2], in2[2];
    signal output out[2], carry;
    var FIELD_SIZE = 1 << 128;
    out[0] <-- (in1[0] + in2[0]) % FIELD_SIZE;
    signal low_add_carry <-- (in1[0] + in2[0]) \ FIELD_SIZE;
    out[1] <-- (in1[1] + in2[1] + low_add_carry) % FIELD_SIZE;
    carry <-- (in1[1] + in2[1] + low_add_carry) \ FIELD_SIZE;

    // Check the correctness of out[0] and low_add_carry
    in1[0] + in2[0] === out[0] + low_add_carry * FIELD_SIZE;

    // Check the correctenss of out[1] and up_add_carry
    in1[1] + in2[1] + low_add_carry === out[1] + carry * FIELD_SIZE;
}

template Sub256_unsafe() {
    signal input in1[2], in2[2];
    signal output out[2];

    out <-- _sub256(in1, in2);
    signal (expected_in1[2], carry1) <== Add256_unsafe()(in2, out);
    
    expected_in1[0] === in1[0];
    expected_in1[1] === in1[1];
}

template Mul256_unsafe() {
    var FIELD_SIZE = 1<<128;
    var SUB_FIELD_SIZE = 1<<64;
    signal input in1[2], in2[2];
    // let in1 = aX + b, in2 = cX + d, where X = 2^128.
    signal a <== in1[1];
    signal b <== in1[0];
    signal c <== in2[1];
    signal d <== in2[0];
    
    // let in1 * in2 = carry * X^2 + out
    signal output out[2], carry[2];
    // let out = eX + f.
    // let carry = yX + z.
    // then in1 * in2 = yX^3 + zX^2 + eX + f.
    

    // Then, out = ac X^2 + ad X + bc X + bd.
    // We compute each coefficient.

    // let bd = kX + l.
    signal kl[2] <== Mul128_unsafe()(b, d);
    signal k <== kl[1];
    signal l <== kl[0];
    
    // let bc = oX + p.
    signal op[2] <== Mul128_unsafe()(b, c);
    signal o <== op[1];
    signal p <== op[0];

    // let ad = sX + t.
    signal st[2] <== Mul128_unsafe()(a, d);
    signal s <== st[1];
    signal t <== st[0];

    // let (k + p + t) X = u X^2 + vX.
    signal v <-- (k + p + t) % FIELD_SIZE;
    signal u <-- (k + p + t) \ FIELD_SIZE;
    k + p + t === u * FIELD_SIZE + v;

    // let ac = wX + x.
    signal wx[2] <== Mul128_unsafe()(a, c);
    signal w <== wx[1];
    signal x <== wx[0];

    // let (o + s + x + u) X^2 = (yX + z) X^2
    signal z <-- (o + s + x + u) % FIELD_SIZE;
    signal y <-- (o + s + x + u) \ FIELD_SIZE;
    o + s + x + u === y * FIELD_SIZE + z;

    // e
    out[1] <== v;
    // f
    out[0] <== l;
    carry[1] <== w + y;
    carry[0] <== z;
}

template Not256_unsafe() {
    signal input in[2];
    signal output out[2];
    out[0] <== (1<<128) - in[0] - 1;
    out[1] <== (1<<128) - in[1] - 1;
}

template ShiftLeft256_unsafe(N) {
    // This is about shifting left on a BE-represented integer.
    
    // shift: a 8-bit integer
    // in: a 256-bit integer of two 128-bit limbs (LE)
    signal input shift, in[2];
    // out: a 256-bit integer of two 128-bit limbs (LE)
    signal output out[2];

    signal (exp_shift[2], is_shift_gt_255) <== FindShiftingTwosPower256(N)(shift);
    signal (res[2], carry[2]) <== Mul256_unsafe()(in, exp_shift);
    out <== res;
}

template SubExp_unsafe() {
    signal input c_prev[2], a_prev[2], b;
    signal output c_next[2], a_next[2];
    
    b * (1 - b) === 0;

    // Constraint 2: a_next <== a_prev * a_prev
    signal carry1[2];
    (a_next, carry1) <== Mul256_unsafe()(a_prev, a_prev);
    // carry1 is thrown away according to the EVM spec.

    // Constraint 3: c_next <== c_prev * ( b ? a_next : 1 )
    signal inter1[2];
    signal inter2[2];
    signal inter3[2];
    inter1 <== [1 - b, 0];
    inter2 <== [b * a_prev[0], b * a_prev[1]]; // a_prev * b
    signal bool3 <== IsEqual()([1, b]);
    signal bool4 <== IsEqual()([(2**128)-1, inter2[0]]);
    signal bool5 <== bool3 * bool4;
    signal carry <== bool5;
    signal sum <== (1 - bool5) * (inter1[0] + inter2[0]);
    inter3[0] <== sum;
    inter3[1] <== carry + inter2[1]; // a_prev * b + (1 - b)
    signal carry2[2];
    (c_next, carry2) <== Mul256_unsafe()(c_prev, inter3);
    // carry2 is thrown away according to the EVM spec.
}

template subExpBatch(N) {
    signal input c_prev[2], a_prev[2], b[N];
    signal output c_next[2], a_next[2];

    signal inter_c[N+1][2];
    signal inter_a[N+1][2];
    inter_c[0] <== c_prev;
    inter_a[0] <== a_prev;
    component subExp[N];
    for (var i = 0; i < N; i++) {
        subExp[i] = SubExp_unsafe();
        subExp[i].c_prev <== inter_c[i];
        subExp[i].a_prev <== inter_a[i];
        subExp[i].b <== b[i];
        inter_c[i+1] <== subExp[i].c_next;
        inter_a[i+1] <== subExp[i].a_next;
    }
    c_next <== inter_c[N];
    a_next <== inter_a[N];
}
