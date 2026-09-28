pragma circom 2.1.6;
include "../../templates/256bit/arithmetic_safe.circom";

template ADDMODPrepare_() {
    signal input in[6];
    signal output out[8];

    signal numeratorWords[3];
    signal quotientWords[3];
    signal remainder[2];
    (numeratorWords, quotientWords, remainder)
        <== AddMod257Prepare()([in[0], in[1]], [in[2], in[3]], [in[4], in[5]]);

    for (var word = 0; word < 3; word++) {
        out[word] <== numeratorWords[word];
        out[3 + word] <== quotientWords[word];
    }
    out[6] <== remainder[0];
    out[7] <== remainder[1];
}

component main {public [in]} = ADDMODPrepare_();
