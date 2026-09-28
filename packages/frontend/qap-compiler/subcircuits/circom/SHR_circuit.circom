pragma circom 2.1.6;
include "../../templates/256bit/arithmetic_safe.circom";

template SHR() {
    signal input in[4];
    signal output out[2];

    component shiftRight = ShiftRight256();
    shiftRight.shift <== [in[0], in[1]];
    shiftRight.value <== [in[2], in[3]];
    out <== shiftRight.out;
}

component main {public [in]} = SHR();
