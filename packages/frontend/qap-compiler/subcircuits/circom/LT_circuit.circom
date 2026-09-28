pragma circom 2.1.6;
include "../../templates/256bit/compare_safe.circom";

template LT() {
    signal input in[4];
    signal output out[2];

    signal lowerLess <== LessThan(128)([in[0], in[2]]);
    signal upperLess <== LessThan(128)([in[1], in[3]]);
    signal upperEqual <== IsEqual()([in[1], in[3]]);
    out[0] <== upperLess + upperEqual * lowerLess;
    out[1] <== 0;
}

component main {public [in]} = LT();
