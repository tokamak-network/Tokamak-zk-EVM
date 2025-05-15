pragma circom 2.1.6;
include "../../templates/256bit/compare.circom";

template ISZERO() {
    signal input in[2];
    signal output out[2];

    out[0] <== IsZero256()([in[0], in[1]]);
    out[1] <== 0;
}

component main {public [in]} = ISZERO();