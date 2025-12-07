pragma circom 2.1.6;
include "../../templates/256bit/arithmetic_unsafe_in.circom";

template SHL() {
    signal input in[4];
    signal output out[2];

    in[1] === 0;

    // ShiftLeft256_unsafe assumes in[0] is a 1-byte word.
    out <== ShiftLeft256_unsafe(8)(
        in[0], 
        [in[2], in[3]]
    );
}

component main {public [in]} = SHL();