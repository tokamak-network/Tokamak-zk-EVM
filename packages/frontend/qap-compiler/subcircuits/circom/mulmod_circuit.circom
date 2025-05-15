pragma circom 2.1.6;
include "../../templates/256bit/arithmetic_unsafe_in.circom";

template MULMOD() {
    signal input in[6];
    signal output out[2];

    out <== MulMod256_unsafe()(
        [in[0], in[1]], 
        [in[2], in[3]],
        [in[4], in[5]]
    );
}

component main {public [in]} = MULMOD();