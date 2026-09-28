pragma circom 2.1.6;
include "../../../templates/256bit/arithmetic_safe.circom";

template AddMod257Composed() {
    signal input in[6];
    signal output out[2];

    signal lhs[2] <== [in[0], in[1]];
    signal rhs[2] <== [in[2], in[3]];
    signal modulus[2] <== [in[4], in[5]];

    component prepare = AddMod257Prepare();
    prepare.in1 <== lhs;
    prepare.in2 <== rhs;
    prepare.modulus <== modulus;

    component verify = AddMod257Verify();
    verify.numeratorWords <== prepare.numeratorWords;
    verify.modulus <== modulus;
    verify.quotientWords <== prepare.quotientWords;
    verify.remainder <== prepare.remainder;
    out <== verify.out;
}

component main {public [in]} = AddMod257Composed();
