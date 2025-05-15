pragma circom 2.1.6;
include "../../templates/256bit/arithmetic_unsafe_in.circom";

template MOD() {
    signal input in[4];
    signal output out[2];

    signal (quo[2], rem[2]) <== Div256_unsafe()(
        [in[0], in[1]], 
        [in[2], in[3]]
    );
    out[0] <== rem[0];
    out[1] <== rem[1];
}

component main {public [in]} = MOD();