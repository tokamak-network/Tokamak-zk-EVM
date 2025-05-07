pragma circom 2.1.6;
include "../../templates/256bit/arithmetic_unsafe_in_out.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";


template SubEXP () {
    signal input c_prev[2], a_prev[2], b[2];
    signal output c_next[2], a_next[2];

    // Constraint 1: Ensure b is binary (b ∈ {[0,0], [1,0]})
    b[0] * ( 1 - b[0] ) === 0;
    b[1] * b[1] === 0;

    // Constraint 2: a_next <== a_prev * a_prev
    signal carry1[2];
    (a_next, carry1) <== Mul256_unsafe()(a_prev, a_prev);
    // carry1 is thrown away according to the EVM spec.

    // Constraint 3: c_next <== c_prev * ( b ? a_next : 1 )
    signal inter1[2];
    signal inter2[2];
    signal inter3[2];
    inter1 <== [1 - b[0], 0];
    inter2 <== [b[0] * a_prev[0], b[0] * a_prev[1]]; // a_prev * b
    signal bool3 <== IsEqual()([1, b[0]]);
    signal bool4 <== IsEqual()([(2**128)-1, inter2[0]]);
    signal bool5 <== bool3 * bool4;
    signal carry <== bool5;
    signal sum <== (1 - bool5) * (inter1[0] + inter2[0]);
    inter3[0] <== sum;
    inter3[1] <== carry + inter2[1]; // a_next * b + (1 - b)
    signal carry2[2];
    (c_next, carry2) <== Mul256_unsafe()(c_prev, inter3);
    // carry2 is thrown away according to the EVM spec.
}

component main {public [c_prev, a_prev, b]} = SubEXP();