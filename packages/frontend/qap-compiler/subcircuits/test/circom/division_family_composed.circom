pragma circom 2.1.6;

include "../../../templates/256bit/division_family.circom";

template DivisionFamilyComposedTest() {
    signal input selector;
    signal input dividend[2], divisor[2];
    signal output out[2];

    component first = DivisionFamilyPart1();
    first.selector <== selector;
    first.dividend <== dividend;
    first.divisor <== divisor;

    component second = DivisionFamilyPart2();
    second.absDividend <== first.absDividend;
    second.absQuotient <== first.absQuotient;
    second.absRemainder <== first.absRemainder;
    second.absDivisorWords <== first.absDivisorWords;
    second.divisorIsZero <== first.divisorIsZero;
    second.resultIsNegative <== first.resultIsNegative;
    second.useMod <== first.useMod;

    out <== second.out;
}

component main {public [selector, dividend, divisor]} = DivisionFamilyComposedTest();
