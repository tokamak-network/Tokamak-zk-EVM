pragma circom 2.1.6;
include "../../templates/256bit/arithmetic_unsafe_in_out.circom";

template NOT_() {
    signal input in[2];
    signal output out[2];

    out <== Not256_unsafe()(in);
}

component main {public [in]} = NOT_();