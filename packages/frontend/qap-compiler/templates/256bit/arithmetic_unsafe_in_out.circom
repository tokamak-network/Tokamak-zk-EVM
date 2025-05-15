pragma circom 2.1.6;
include "../../functions/arithmetic.circom";
include "../128bit/arithmetic.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";
include "../../node_modules/circomlib/circuits/gates.circom";

// Each input is an 256-bit integer represented by two 128-bit integers; e.g.) in1[0]: lower 128 bits, in1[1]: upper 128 bits
template Add256_unsafe() {
    // Need range checks on the inputs and output to be safe.
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

// template Sub256_unsafe() {
//     // Need range checks on the inputs and output to be safe.
//     signal input in1[2], in2[2];
//     signal output out[2];
//     var FIELD_SIZE = 1<<128;
//     out[0] <-- (in1[0] - in2[0]) % FIELD_SIZE;
//     var _borrow;
//     if (in1[0] >= in2[0]) {
//         _borrow = 0;
//     } else {
//         _borrow = 1;
//     }
//     signal borrow <-- _borrow;
//     out[1] <-- (in1[1] - in2[1] - borrow) % FIELD_SIZE;
//     borrow * (borrow - 1) === 0;
//     signal lo_sum <== out[0] + in2[0];
//     signal lo_carry <-- lo_sum \ FIELD_SIZE;
//     lo_sum === in1[0];

//     signal hi_sum <== out[1] + in2[1] + lo_carry;
//     hi_sum === in1[1]; 
// }

template Sub256_unsafe() {
    // Need range checks on the inputs and output to be safe.
    signal input in1[2], in2[2];
    signal output out[2];

    out <-- _sub256(in1, in2);
    signal (expected_in1[2], carry1) <== Add256_unsafe()(in2, out);
    
    expected_in1[0] === in1[0];
    expected_in1[1] === in1[1];
}

template Mul256_unsafe() {
    // Need range checks on the inputs and output to be safe.
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

// template Mul256_unsafe() {
//     // Need range checks on the inputs and output to be safe.
//     var FIELD_SIZE = 1<<128;
//     var SUB_FIELD_SIZE = 1<<64;
//     signal input in1[2], in2[2];
//     // let in1 = aX + b, in2 = cX + d, where X = 2^128.
//     signal a <== in1[1];
//     signal b <== in1[0];
//     signal c <== in2[1];
//     signal d <== in2[0];
    
//     // let in1 * in2 = carry * X^2 + out
//     signal output out[2], carry[2];
//     // let out = eX + f.
//     // let carry = yX + z.
//     // then in1 * in2 = yX^3 + zX^2 + eX + f.
    

//     // Then, out = ac X^2 + ad X + bc X + bd.
//     // We compute each coefficient.
    
//     // let b = g Y + h and d = i Y + j, where Y = 2^64.
//     signal g <-- b \ SUB_FIELD_SIZE;
//     signal h <-- b % SUB_FIELD_SIZE;
//     signal i <-- d \ SUB_FIELD_SIZE;
//     signal j <-- d % SUB_FIELD_SIZE;
//     b === g * SUB_FIELD_SIZE + h;
//     d === i * SUB_FIELD_SIZE + j;

//     // bd = gi Y^2 + gj Y + hi Y + hj.
//     // let bd = kX + l.
//     signal kl[2] <== Mul128_unsafe()([g, h], [i, j]);
//     signal k <== kl[1];
//     signal l <== kl[0];
    
//     // let c = m Y + n.
//     signal m <-- c \ SUB_FIELD_SIZE;
//     signal n <-- c % SUB_FIELD_SIZE;
//     c === m * SUB_FIELD_SIZE + n;
//     // bc = gm Y^2 + gn Y + hm Y + hn.
//     // let bc = oX + p.
//     signal op[2] <== Mul128_unsafe()([g, h], [m, n]);
//     signal o <== op[1];
//     signal p <== op[0];

//     // let a = q Y + r.
//     signal q <-- a \ SUB_FIELD_SIZE;
//     signal r <-- a % SUB_FIELD_SIZE;
//     a === q * SUB_FIELD_SIZE + r;
//     // ad = qi Y^2 + qj Y + rg Y + rj.
//     // let ad = sX + t.
//     signal st[2] <== Mul128_unsafe()([q, r], [i, j]);
//     signal s <== st[1];
//     signal t <== st[0];

//     // let (k + p + t) X = u X^2 + vX.
//     signal v <-- (k + p + t) % FIELD_SIZE;
//     signal u <-- (k + p + t) \ FIELD_SIZE;
//     k + p + t === u * FIELD_SIZE + v;

//     // let ac = wX + x.
//     signal wx[2] <== Mul128_unsafe()([q, r], [m, n]);
//     signal w <== wx[1];
//     signal x <== wx[0];

//     // let (o + s + x + u) X^2 = (yX + z) X^2
//     signal z <-- (o + s + x + u) % FIELD_SIZE;
//     signal y <-- (o + s + x + u) \ FIELD_SIZE;
//     o + s + x + u === y * FIELD_SIZE + z;

//     // e
//     out[1] <== v;
//     // f
//     out[0] <== l;
//     carry[1] <== w + y;
//     carry[0] <== z;
// }

template Not256_unsafe() {
    signal input in[2];
    signal output out[2];
    out[0] <== (1<<128) - in[0] - 1;
    out[1] <== (1<<128) - in[1] - 1;
}

