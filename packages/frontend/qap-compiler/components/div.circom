pragma circom 2.1.6;
include "../templates/256bit/add.circom";
include "mul.circom";
include "eq.circom";
include "lt.circom";
include "../templates/256bit/iszero.circom";
include "../functions/arithmetic.circom";

template Div () {
    // 256-bit integers consisting of two 128-bit integers; in[0]: lower, in[1]: upper
    signal input in1[2], in2[2];

    var q[2][2] = div256(in1, in2); //div 
    signal output out[2] <-- q[0];
    signal remainder[2] <-- q[1];

    // Check whether the division is correct.
    signal inter[2] <== Mul()(out, in2);
    signal res[2] <== Add()(inter, remainder);
    signal eq[2] <== Eq()(res, in1);
    eq[0] === 1;

    //rc => Range Check
    signal rc_divisor[2];
    rc_divisor[0] <== in2[0] + is_zero_out[0];
    rc_divisor[1] <== in2[1] + is_zero_out[0];

    signal rc_remainder[2];
    rc_remainder[0] <== (1 - is_zero_out[0])*remainder[0];
    rc_remainder[1] <== (1 - is_zero_out[0])*remainder[1];

    //Ensure 0 <= rc_remainder < rc_divisor
    //signal lt_r[2] <== LEqT()([0,0],rc_remainder);
    signal lt_divisor[2] <== LT()([rc_remainder[0], rc_remainder[1], rc_divisor[0], rc_divisor[1]]);

    lt_divisor[0] === 1;

    // Ensure out is zero if in2 is zero
    is_zero_out[0] * out[0] === 0;
    is_zero_out[0] * out[1] === 0;
}