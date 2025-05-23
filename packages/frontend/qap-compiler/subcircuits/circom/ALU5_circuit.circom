pragma circom 2.1.6;
include "../../templates/256bit/alu_safe.circom";

template ALU5_() {
    signal input in[7];
    signal output out[2];

    component alu = ALU5();
    alu.selector <== in[0];

    alu.in1 <== [in[1], in[2]];
    alu.in2 <== [in[3], in[4]];
    
    out <== alu.out;

    // Assumption for optimization
    alu.in1[1] === 0;
}

component main {public [in]} = ALU5_();