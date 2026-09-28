pragma circom 2.1.6;
include "../../templates/256bit/arithmetic_unsafe_type1.circom";

template SUB() {
    signal input in[4];
    signal output out[2];

    out <== Sub256_unsafe()([in[0], in[1]], [in[2], in[3]]);
    CheckBus256()(out);
}

component main {public [in]} = SUB();
