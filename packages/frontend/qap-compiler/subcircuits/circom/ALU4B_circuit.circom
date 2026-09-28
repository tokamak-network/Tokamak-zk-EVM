pragma circom 2.1.6;

include "../../templates/256bit/division_family.circom";

template ALU4B_() {
    signal input in[13];
    signal output out[2];

    component division = DivisionFamilyPart2();
    division.absDividend <== [in[0], in[1]];
    division.absQuotient <== [in[2], in[3]];
    division.absRemainder <== [in[4], in[5]];
    division.absDivisorWords <== [in[6], in[7], in[8], in[9]];
    division.divisorIsZero <== in[10];
    division.resultIsNegative <== in[11];
    division.useMod <== in[12];

    out <== division.out;
}

component main {public [in]} = ALU4B_();
