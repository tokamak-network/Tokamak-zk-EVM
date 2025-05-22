pragma circom 2.1.6;
include "../../templates/256bit/arithmetic_unsafe_type1.circom";
include "../../templates/256bit/compare_safe.circom";

template MULMOD1() {
    signal input in[4];
    signal output out[4];

    signal in1[2] <== [in[0], in[1]];
    signal in2[2] <== [in[2], in[3]];

    CheckBus()(in1);
    CheckBus()(in2);

    signal (add_res[2], carry[2]) <== Mul256_unsafe()(in1, in2);
    out <== [add_res[0], add_res[1], carry[0], carry[1]];
}

component main {public [in]} = MULMOD1();