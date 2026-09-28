pragma circom 2.1.6;
include "../../templates/256bit/arithmetic_safe.circom";

template ADDMODVerify_() {
    signal input in[10];
    signal output out[2];

    signal numeratorWords[3];
    signal quotientWords[3];
    for (var word = 0; word < 3; word++) {
        numeratorWords[word] <== in[word];
        quotientWords[word] <== in[5 + word];
    }

    out <== AddMod257Verify()(
        numeratorWords,
        [in[3], in[4]],
        quotientWords,
        [in[8], in[9]]
    );
}

component main {public [in]} = ADDMODVerify_();
