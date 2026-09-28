pragma circom 2.1.6;
include "../../templates/256bit/bitwise_safe.circom";

template OR_() {
    signal input in[4];
    signal output out[2];

    out <== Or256()([in[0], in[1]], [in[2], in[3]]);
}

component main {public [in]} = OR_();
