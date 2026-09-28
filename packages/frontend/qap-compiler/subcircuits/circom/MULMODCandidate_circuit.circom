pragma circom 2.1.6;
include "../../templates/256bit/mulmod_safe.circom";

template MULMODCandidate_() {
    signal input in[6];
    signal output out[12];

    component candidate = MulModCandidate();
    candidate.quotient <== [in[0], in[1], in[2], in[3]];
    candidate.remainder <== [in[4], in[5]];
    for (var word = 0; word < 8; word++) {
        out[word] <== candidate.quotientWords[word];
    }
    for (var word = 0; word < 4; word++) {
        out[8 + word] <== candidate.remainderWords[word];
    }
}

component main {public [in]} = MULMODCandidate_();
