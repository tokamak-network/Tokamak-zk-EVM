pragma circom 2.1.6;
include "../../templates/256bit/arithmetic_safe.circom";

template SHL_() {
    signal input in[4];
    signal output out[2];
    signal shift[2] <== [in[0], in[1]];
    signal value[2] <== [in[2], in[3]];

    out <== ShiftLeft256()(shift, value);
}

component main {public [in]} = SHL_();
