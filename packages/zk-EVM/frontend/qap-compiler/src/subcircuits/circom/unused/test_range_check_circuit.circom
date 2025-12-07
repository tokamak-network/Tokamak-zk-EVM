pragma circom 2.1.6;

include "../../templates/256bit/compare_safe.circom";

template TestRangeCheck () {
    signal input in1[2], in2[2];
    signal output out[2];

    out[0] <== in1[0] * in2[0];
    out[1] <== in1[1] * in2[1];

    // Check input is in 128 bit
    CheckBus()(in1);
    CheckBus()(in2);
    CheckBus()(out);
}

component main {public [in1, in2]} = TestRangeCheck();