pragma circom 2.1.6;
include "../../templates/256bit/alu_safe.circom";

template ALU3_() {
    signal input in[7];
    signal output out[2];

    component alu3 = ALU3();
    alu3.selector <== in[0];

    alu3.in1 <== [in[1], in[2]];
    alu3.in2 <== [in[3], in[4]];
    
    out <== alu3.out;

    // Assumption for optimization
    alu3.in1[1] === 0;
}

component main {public [in]} = ALU3_();