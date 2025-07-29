pragma circom 2.1.6;
include "../../templates/256bit/alu_safe.circom";

template ALU_based_on_div_() {
    signal input in[7];
    signal output out[2];

    component alu_div = ALU_based_on_div();
    alu_div.selector <== in[0];
    
    alu_div.in1 <== [in[1], in[2]];
    alu_div.in2 <== [in[3], in[4]];
    alu_div.in3 <== [in[5], in[6]];
    
    out <== alu_div.out;
}

component main {public [in]} = ALU_based_on_div_();

