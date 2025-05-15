pragma circom 2.1.6;
include "../../templates/128bit/bitwise.circom";

template OR_HIGH() {
    // in[0]: The output of OR_LOW
    // in[1] and in[2]: upper 128 bit limbs of two inputs (left and right, respectively)
    signal input in[3];
    signal output out[2];
    out[0] <== in[0];
    out[1] <== Or128()(in[1], in[2]);
}

component main {public [in]} = OR_HIGH();