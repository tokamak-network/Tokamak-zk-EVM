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

    signal is_zero_denom[2] <== IsZero256()(in2);

    //Ensure 0 <= remainder < divisor when diviser > 0
    signal lt_divisor[2] <== LT()([remainder[0], remainder[1], in2[0], in2[1]]);

    lt_divisor[0] === 1 * (1 - is_zero_denom[0]);
}