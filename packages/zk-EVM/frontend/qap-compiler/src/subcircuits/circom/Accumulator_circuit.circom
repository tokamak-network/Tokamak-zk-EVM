pragma circom 2.1.6;
include "../../templates/256bit/arithmetic_unsafe_type1.circom";
include "../../templates/256bit/compare_safe.circom";
include "../../scripts/constants.circom";

template Accumulator() {
    var N = nAccumulation();
    signal input in[2 * N];
    signal output out[2];

    component adds[N-1];
    adds[0] = Add256_unsafe();
    adds[0].in1 <== [in[0], in[1]];
    adds[0].in2 <== [in[2], in[3]];
    for (var i = 1; i < N - 1; i++) {
        adds[i] = Add256_unsafe();
        adds[i].in1 <== adds[i-1].out;
        adds[i].in2 <== [in[(i + 1) * 2], in[(i + 1) * 2 + 1]]; 
    }
    out <== adds[N-2].out;
    CheckBus()(out);
}

component main {public [in]} = Accumulator();