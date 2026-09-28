pragma circom 2.1.6;
include "../../templates/256bit/mulmod_safe.circom";

template MULMODPrepare_() {
    signal input in[6];
    signal output out[18];

    component prepare = MulModPrepare();
    prepare.lhs <== [in[0], in[1]];
    prepare.rhs <== [in[2], in[3]];
    prepare.modulus <== [in[4], in[5]];
    for (var word = 0; word < 4; word++) {
        out[word] <== prepare.lhsWords[word];
        out[4 + word] <== prepare.rhsWords[word];
        out[8 + word] <== prepare.modulusWords[word];
        out[12 + word] <== prepare.quotient[word];
    }
    out[16] <== prepare.remainder[0];
    out[17] <== prepare.remainder[1];
}

component main {public [in]} = MULMODPrepare_();
