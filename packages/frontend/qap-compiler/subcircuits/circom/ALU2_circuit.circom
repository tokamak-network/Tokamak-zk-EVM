pragma circom 2.1.6;
include "../../templates/256bit/alu_safe.circom";

template ALU2_() {
    signal input in[7];
    signal output out[2];
    signal in1[2] <== [in[1], in[2]];
    signal in2[2] <== [in[3], in[4]];
    signal in3[2] <== [in[5], in[6]];

    CheckBus()(in1);
    CheckBus()(in2);
    CheckBus()(in3);

    component alu = ALU_based_on_div();
    alu.selector <== in[0];
    alu.in1 <== in1;
    alu.in2 <== in2;
    alu.in3 <== in3;
    out <== alu.out;
}

component main {public [in]} = ALU2_();
