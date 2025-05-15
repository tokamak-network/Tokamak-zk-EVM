pragma circom 2.1.6;
include "../../templates/128bit/bitwise.circom";

template AND_LOW() {
    // in[0] and in[1]: lower 128 bit limbs of two inputs (left and right, respectively)
    signal input in[2];
    signal output out;
    out <== And128()(in[0], in[1]);
}

component main {public [in]} = AND_LOW();