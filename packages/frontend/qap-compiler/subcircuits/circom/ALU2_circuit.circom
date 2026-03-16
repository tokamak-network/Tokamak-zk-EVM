pragma circom 2.1.6;
include "../../templates/256bit/alu_safe.circom";

template ALU2_() {
    signal input in[7];
    signal output out[2];

    component alu = ALU_based_on_div();
    alu.selector <== in[0];
    alu.in1 <== [in[1], in[2]];
    alu.in2 <== [in[3], in[4]];
    alu.in3 <== [in[5], in[6]];
    out <== alu.out;
}

component main {public [in]} = ALU2_();
