pragma circom 2.1.6;
include "../../../templates/256bit/mulmod_safe.circom";

template MULMODComposed() {
    signal input in[6];
    signal output out[2];

    component prepare = MulModPrepare();
    prepare.lhs <== [in[0], in[1]];
    prepare.rhs <== [in[2], in[3]];
    prepare.modulus <== [in[4], in[5]];

    component candidate = MulModCandidate();
    candidate.quotient <== prepare.quotient;
    candidate.remainder <== prepare.remainder;

    component verify = MulModVerify();
    verify.lhsWords <== prepare.lhsWords;
    verify.rhsWords <== prepare.rhsWords;
    verify.modulusWords <== prepare.modulusWords;
    verify.quotientWords <== candidate.quotientWords;
    verify.remainderWords <== candidate.remainderWords;
    out <== verify.remainder;
}

component main {public [in]} = MULMODComposed();
