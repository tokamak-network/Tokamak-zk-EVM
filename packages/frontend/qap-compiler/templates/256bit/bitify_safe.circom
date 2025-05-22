pragma circom 2.1.6;
include "../../node_modules/circomlib/circuits/bitify.circom";

template Num2Bits256() {
    signal input in[2];
    signal output out[2][128];
    out[0] <== Num2Bits(128)(in[0]);
    out[1] <== Num2Bits(128)(in[1]);
}