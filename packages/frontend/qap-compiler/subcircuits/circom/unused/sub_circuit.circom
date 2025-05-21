pragma circom 2.1.6;
include "../../templates/256bit/arithmetic_unsafe_in_out.circom";

template Sub() {
    signal input in[4];
    signal output out[2];

    out <== Sub256_unsafe()(
        [in[0], in[1]], 
        [in[2], in[3]]
    );
}

component main {public [in]} = Sub();