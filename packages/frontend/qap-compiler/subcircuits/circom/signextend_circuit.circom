pragma circom 2.1.6;
include "../../templates/256bit/arithmetic_unsafe_in.circom";
include "../../templates/256bit/mux.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";

template SIGNEXTEND() {
    signal input in[4];
    signal output out[2];

    signal is_shift_small <== IsZero()(in[1]);

    // SignExtend256_unsafe assumes in[0] is a 1-byte word.
    signal out_small_shift[2] <== SignExtend256_unsafe()(
        in[0], 
        [in[2], in[3]]
    );

    out <== Mux256()(is_shift_small, out_small_shift, [in[2], in[3]]);
}

component main {public [in]} = SIGNEXTEND();