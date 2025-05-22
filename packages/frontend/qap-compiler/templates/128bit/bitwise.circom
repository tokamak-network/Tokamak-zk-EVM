pragma circom 2.1.6;
include "../../node_modules/circomlib/circuits/bitify.circom";
include "../../node_modules/circomlib/circuits/gates.circom";
// Input: 128-bit integer
// Output: 128-bit integer
template Xor128() {
    signal input in1, in2;
    signal output out;

    var NUM_BITS = 128;
    
    signal in1_bin[NUM_BITS] <== Num2Bits(NUM_BITS)(in1);
    signal in2_bin[NUM_BITS] <== Num2Bits(NUM_BITS)(in2);
    component b2n = Bits2Num(NUM_BITS);
    for (var i = 0; i < NUM_BITS; i++) {
        b2n.in[i] <== XOR()(in1_bin[i], in2_bin[i]);
    }
    out <== b2n.out;
}

template Or128() {
    signal input in1, in2;
    signal output out;

    var NUM_BITS = 128;
    
    signal in1_bin[NUM_BITS] <== Num2Bits(NUM_BITS)(in1);
    signal in2_bin[NUM_BITS] <== Num2Bits(NUM_BITS)(in2);
    component b2n = Bits2Num(NUM_BITS);
    for (var i = 0; i < NUM_BITS; i++) {
        b2n.in[i] <== OR()(in1_bin[i], in2_bin[i]);
    }
    out <== b2n.out;
}

template And128() {
    signal input in1, in2;
    signal output out;

    var NUM_BITS = 128;
    
    signal in1_bin[NUM_BITS] <== Num2Bits(NUM_BITS)(in1);
    signal in2_bin[NUM_BITS] <== Num2Bits(NUM_BITS)(in2);
    component b2n = Bits2Num(NUM_BITS);
    for (var i = 0; i < NUM_BITS; i++) {
        b2n.in[i] <== AND()(in1_bin[i], in2_bin[i]);
    }
    out <== b2n.out;
}