pragma circom 2.1.6;
include "../../templates/256bit/arithmetic_unsafe_in.circom";

template BYTE() {
    signal input in[4];
    signal output out[2];

    in[1] === 0;
    out[1] <== 0;
    out[0] <== Byte256_unsafe()(
        in[0], 
        [in[2], in[3]]
    );
}

component main {public [in]} = BYTE();