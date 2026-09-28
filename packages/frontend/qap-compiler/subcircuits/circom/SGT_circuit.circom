pragma circom 2.1.6;
include "../../templates/256bit/compare_safe.circom";

template SGT() {
    signal input in[4];
    signal output out[2];
    signal lhs[2] <== [in[0], in[1]];
    signal rhs[2] <== [in[2], in[3]];

    component lhsHighBits = Num2Bits(128);
    component rhsHighBits = Num2Bits(128);
    lhsHighBits.in <== lhs[1];
    rhsHighBits.in <== rhs[1];

    signal lowerLess <== LessThan(128)([rhs[0], lhs[0]]);
    signal upperLess <== LessThan(128)([rhs[1], lhs[1]]);
    signal upperEqual <== IsEqual()([rhs[1], lhs[1]]);
    signal unsignedLess <== upperLess + upperEqual * lowerLess;
    signal signDifference <== rhsHighBits.out[127]
        + lhsHighBits.out[127]
        - 2 * rhsHighBits.out[127] * lhsHighBits.out[127];
    out[0] <== unsignedLess
        + signDifference * (rhsHighBits.out[127] - unsignedLess);
    out[1] <== 0;
}

component main {public [in]} = SGT();
