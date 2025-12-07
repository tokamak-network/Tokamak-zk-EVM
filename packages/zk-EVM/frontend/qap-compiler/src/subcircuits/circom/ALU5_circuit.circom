pragma circom 2.1.6;
include "../../templates/256bit/alu_safe.circom";

template ALU5_() {
    signal input in[7];
    signal output out[2];

    component alu5 = ALU5();
    alu5.selector <== in[0];

    alu5.in1 <== [in[1], in[2]];
    alu5.in2 <== [in[3], in[4]];
    
    out <== alu5.out;

    // Assumption for optimization
    alu5.in1[1] === 0;
}

component main {public [in]} = ALU5_();