pragma circom 2.1.6;
include "../../templates/256bit/mulmod_safe.circom";

template MULMODVerify_() {
    signal input in[24];
    signal output out[2];

    component verify = MulModVerify();
    for (var word = 0; word < 4; word++) {
        verify.lhsWords[word] <== in[word];
        verify.rhsWords[word] <== in[4 + word];
        verify.modulusWords[word] <== in[8 + word];
        verify.remainderWords[word] <== in[20 + word];
    }
    for (var word = 0; word < 8; word++) {
        verify.quotientWords[word] <== in[12 + word];
    }
    out <== verify.remainder;
}

component main {public [in]} = MULMODVerify_();
