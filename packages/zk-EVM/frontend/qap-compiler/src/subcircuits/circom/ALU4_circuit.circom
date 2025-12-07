pragma circom 2.1.6;
include "../../templates/256bit/alu_safe.circom";

template ALU4_() {
    signal input in[7];
    signal output out[2];

    component alu4 = ALU4();
    alu4.selector <== in[0];
    
    alu4.in1 <== [in[1], in[2]];
    alu4.in2 <== [in[3], in[4]];
    
    out <== alu4.out;
}

component main {public [in]} = ALU4_();