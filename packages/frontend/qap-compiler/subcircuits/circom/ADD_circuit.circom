pragma circom 2.1.6;
include "../../templates/256bit/arithmetic_unsafe_type1.circom";

template ADD() {
    signal input in[4];
    signal output out[2];

    component add = Add256_unsafe();
    add.in1 <== [in[0], in[1]];
    add.in2 <== [in[2], in[3]];
    out <== add.out;
    CheckBus256()(out);
}

component main {public [in]} = ADD();
