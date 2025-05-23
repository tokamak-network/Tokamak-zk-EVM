pragma circom 2.1.6;
include "../../templates/256bit/arithmetic_unsafe_type1.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";
include "../../templates/256bit/compare_safe.circom";


template SubEXP () {
    // in[0]: lower 128 bit of c_prev
    // in[1]: upper 128 bit of c_prev
    // in[2]: lower 128 bit of a_prev
    // in[3]: upper 128 bit of a_prev
    // in[4]: binary input b
    signal input in[5];
    signal output c_next[2], a_next[2];

    signal c_prev[2];
    c_prev[0] <== in[0];
    c_prev[1] <== in[1];
    signal a_prev[2];
    a_prev[0] <== in[2];
    a_prev[1] <== in[3];
    signal b <== in[4];

    CheckBus()(c_prev);
    CheckBus()(a_prev);
    b * ( 1 - b ) === 0;
    
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
    inter3[1] <== carry + inter2[1]; // a_next * b + (1 - b)
    signal carry2[2];
    (c_next, carry2) <== Mul256_unsafe()(c_prev, inter3);
    // carry2 is thrown away according to the EVM spec.

    CheckBus()(c_next);
}

component main {public [in]} = SubEXP();