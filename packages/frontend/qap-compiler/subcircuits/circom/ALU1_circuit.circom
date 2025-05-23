pragma circom 2.1.6;
include "../../templates/256bit/alu_safe.circom";

template ALU1_() {
    signal input in[7];
    signal output out[4];

    component alu = ALU1();
    alu.selector <== in[0];

    alu.in1 <== [in[1], in[2]];
    alu.in2 <== [in[3], in[4]];
    alu.in3 <== [in[5], in[6]];
    
    out[0] <== alu.out1[0];
    out[1] <== alu.out1[1];
    out[2] <== alu.out2[0];
    out[3] <== alu.out2[1];

    // Assumption without loss of generality. in3 is only used by SubExp
    alu.in3[1] === 0;
    alu.in3[0] * (1 - alu.in3[0]) === 0;
}

component main {public [in]} = ALU1_();

