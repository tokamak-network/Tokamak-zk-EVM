pragma circom 2.1.6;
include "../../templates/256bit/alu_safe.circom";

template ALU2_() {
    signal input in[7];
    signal output out[2];

    component alu2 = ALU2();
    alu2.selector <== in[0];
    
    alu2.in1 <== [in[1], in[2]];
    alu2.in2 <== [in[3], in[4]];
    alu2.in3 <== [in[5], in[6]];
    
    out <== alu2.out;
}

component main {public [in]} = ALU2_();

