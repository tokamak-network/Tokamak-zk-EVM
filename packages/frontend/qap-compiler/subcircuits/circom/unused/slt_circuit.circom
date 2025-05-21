pragma circom 2.1.6;
include "../../templates/256bit/compare.circom";

template SLT() {
    signal input in[4];
    signal output out[2];

    out[0] <== SignedLessThan256()(
        [in[0], in[1]], 
        [in[2], in[3]]
    );
    out[1] <== 0;
}

component main {public [in]} = SLT();