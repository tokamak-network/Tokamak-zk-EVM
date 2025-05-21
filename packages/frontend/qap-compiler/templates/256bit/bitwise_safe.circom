pragma circom 2.1.6;
include "../../node_modules/circomlib/circuits/bitify.circom";
include "../../node_modules/circomlib/circuits/gates.circom";
include "../128bit/bitwise.circom";
// Input: 256-bit integers consisting of two 128-bit integers
// Output: 256-bit integer consisting of two 128-bit integers    
template Xor256() {
    signal input in1[2], in2[2];
    signal output out[2];
    out[0] <== Xor128()(in1[0], in2[0]);
    out[1] <== Xor128()(in1[1], in2[1]);
}

template Or256() {
    signal input in1[2], in2[2];
    signal output out[2];
    out[0] <== Or128()(in1[0], in2[0]);
    out[1] <== Or128()(in1[1], in2[1]);
}

template And256() {
    signal input in1[2], in2[2];
    signal output out[2];
    out[0] <== And128()(in1[0], in2[0]);
    out[1] <== And128()(in1[1], in2[1]);
}