pragma circom 2.1.6;
include "../../templates/256bit/arithmetic_unsafe_in_out.circom";

template MUL() {
    signal input in[4];
    signal output out[2];

    signal (_out[2], carry[2]) <== Mul256_unsafe()(
        [in[0], in[1]], 
        [in[2], in[3]]
    );
    out[0] <== _out[0];
    out[1] <== _out[1];
}

component main {public [in]} = MUL();

