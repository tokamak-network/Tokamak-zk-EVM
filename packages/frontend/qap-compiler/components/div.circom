pragma circom 2.1.6;
include "add.circom";
include "mul.circom";
include "eq.circom";
include "lt.circom";
include "iszero.circom";
include "templates/arithmetic_func.circom";

// template Div () {
//     signal input in[4];
//     signal in1[2] <== [in[0], in[1]];
//     signal in2[2] <== [in[2], in[3]];

//     signal is_zero_denom[2] <== IsZero256()(in2);

//     var q[2][2] = div(in1, in2); //div 
//     signal output out[2] <-- q[0];
//     signal remainder[2] <-- q[1];

//     signal inter[2] <== Mul()([out[0], out[1], in2[0], in2[1]]);
//     signal res[2] <== Add()([inter[0], inter[1], remainder[0], remainder[1]]);
//     signal eq[2] <== Eq()([res[0], res[1], in1[0], in1[1]]);
//     eq[0] === 1;

//     //rc => Range Check
//     signal rc_divisor[2];
//     rc_divisor[0] <== in2[0] + is_zero_denom[0];
//     rc_divisor[1] <== in2[1] + is_zero_denom[0];

//     signal rc_remainder[2];
//     rc_remainder[0] <== (1 - is_zero_denom[0])*remainder[0];
//     rc_remainder[1] <== (1 - is_zero_denom[0])*remainder[1];

//     //Ensure 0 <= rc_remainder < rc_divisor
//     //signal lt_r[2] <== LEqT()([0,0],rc_remainder);
//     signal lt_divisor[2] <== LT()([rc_remainder[0], rc_remainder[1], rc_divisor[0], rc_divisor[1]]);

//     lt_divisor[0] === 1;

//     // Ensure out is zero if in2 is zero
//     is_zero_out[0] * out[0] === 0;
//     is_zero_out[0] * out[1] === 0;
// }

template Div1 () {
    signal input in[4];
    signal in1[2] <== [in[0], in[1]];
    signal in2[2] <== [in[2], in[3]];

    var q[2][2] = div(in1, in2); //div 
    signal out[2] <-- q[0];
    signal remainder[2] <-- q[1];

    // Check whether the division is correct.
    signal output inter[2] <== Mul()([out[0], out[1], in2[0], in2[1]]);
}

template Div2 () {
    signal input in[4], inter[2];
    signal in1[2] <== [in[0], in[1]];
    signal in2[2] <== [in[2], in[3]];

    var q[2][2] = div(in1, in2); //div 
    signal out[2] <-- q[0];
    signal remainder[2] <-- q[1];

    // Check whether the division is correct.
    signal output res[2] <== Add()([inter[0], inter[1], remainder[0], remainder[1]]);
}

template Div3 () {
    signal input in[4], res[2];
    signal in1[2] <== [in[0], in[1]];
    signal in2[2] <== [in[2], in[3]];

    var q[2][2] = div(in1, in2); //div 
    signal output out[2] <-- q[0];
    signal remainder[2] <-- q[1];

    // Check whether the division is correct.
    signal eq[2] <== Eq()([res[0], res[1], in1[0], in1[1]]);
    eq[0] === 1;

    signal is_zero_denom[2] <== IsZero256()(in2);

    //Ensure 0 <= remainder < divisor when diviser > 0
    signal lt_divisor[2] <== LT()([remainder[0], remainder[1], in2[0], in2[1]]);

    lt_divisor[0] === 1 * (1 - is_zero_denom[0]);
}