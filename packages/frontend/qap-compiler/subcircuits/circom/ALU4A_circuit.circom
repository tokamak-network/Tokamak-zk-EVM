pragma circom 2.1.6;

include "../../templates/256bit/division_family.circom";

template ALU4A_() {
    signal input in[5];
    signal output out[13];

    component division = DivisionFamilyPart1();
    division.selector <== in[0];
    division.dividend <== [in[1], in[2]];
    division.divisor <== [in[3], in[4]];

    out[0] <== division.absDividend[0];
    out[1] <== division.absDividend[1];
    out[2] <== division.absQuotient[0];
    out[3] <== division.absQuotient[1];
    out[4] <== division.absRemainder[0];
    out[5] <== division.absRemainder[1];
    for (var word = 0; word < 4; word++) {
        out[6 + word] <== division.absDivisorWords[word];
    }
    out[10] <== division.divisorIsZero;
    out[11] <== division.resultIsNegative;
    out[12] <== division.useMod;
}

component main {public [in]} = ALU4A_();
