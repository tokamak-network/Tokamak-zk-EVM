pragma circom 2.1.6;
include "../../templates/256bit/compare_safe.circom";

template GT() {
    signal input in[4];
    signal output out[2];

    signal lowerLess <== LessThan(128)([in[2], in[0]]);
    signal upperLess <== LessThan(128)([in[3], in[1]]);
    signal upperEqual <== IsEqual()([in[3], in[1]]);
    out[0] <== upperLess + upperEqual * lowerLess;
    out[1] <== 0;
}

component main {public [in]} = GT();
