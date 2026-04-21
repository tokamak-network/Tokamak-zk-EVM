pragma circom 2.1.6;
include "../../node_modules/poseidon-bls12381-circom/circuits/poseidon255.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";
// Each input and output is an 255-bit integer represented by two 128-bit LE limbs; e.g.) in1[0]: lower 128 bits, in1[1]: upper 128 bits
template poseidonTokamak(N) {
    signal input in[N][2];
    signal output out[2];

    var FIELD_SIZE = 1<<128;
    component H = Poseidon255(N);
    for (var i = 0; i < N; i++) {
        H.in[i] <== in[i][0] + in[i][1] * FIELD_SIZE;
    }

   out[0] <-- H.out % FIELD_SIZE;
   out[1] <-- H.out \ FIELD_SIZE;

   H.out === out[0] + out[1] * FIELD_SIZE;
}

template poseidonTokamakByMode(N) {
    assert(N == 2);
    signal input selector;
    signal input in[7][2];
    signal output out[2];

    component first = poseidonTokamak(2);
    first.in[0] <== in[0];
    first.in[1] <== in[1];

    component second = poseidonTokamak(2);
    second.in[0] <== first.out;
    second.in[1] <== in[2];

    component third = poseidonTokamak(2);
    third.in[0] <== second.out;
    third.in[1] <== in[3];

    component fourth = poseidonTokamak(2);
    fourth.in[0] <== third.out;
    fourth.in[1] <== in[4];

    component fifth = poseidonTokamak(2);
    fifth.in[0] <== fourth.out;
    fifth.in[1] <== in[5];

    component sixth = poseidonTokamak(2);
    sixth.in[0] <== fifth.out;
    sixth.in[1] <== in[6];

    component eq1 = IsEqual();
    eq1.in[0] <== selector;
    eq1.in[1] <== 1;

    component eq2 = IsEqual();
    eq2.in[0] <== selector;
    eq2.in[1] <== 2;

    component eq3 = IsEqual();
    eq3.in[0] <== selector;
    eq3.in[1] <== 4;

    component eq4 = IsEqual();
    eq4.in[0] <== selector;
    eq4.in[1] <== 8;

    component eq5 = IsEqual();
    eq5.in[0] <== selector;
    eq5.in[1] <== 16;

    component eq6 = IsEqual();
    eq6.in[0] <== selector;
    eq6.in[1] <== 32;

    signal s1 <== eq1.out;
    signal s2 <== eq2.out;
    signal s3 <== eq3.out;
    signal s4 <== eq4.out;
    signal s5 <== eq5.out;
    signal s6 <== eq6.out;
    signal selectorCheck <== s1 + s2 + s3 + s4 + s5 + s6;
    selectorCheck === 1;

    signal out0Step0 <== s1 * first.out[0];
    signal out0Step1 <== out0Step0 + s2 * second.out[0];
    signal out0Step2 <== out0Step1 + s3 * third.out[0];
    signal out0Step3 <== out0Step2 + s4 * fourth.out[0];
    signal out0Step4 <== out0Step3 + s5 * fifth.out[0];
    signal out0Step5 <== out0Step4 + s6 * sixth.out[0];
    out[0] <== out0Step5;

    signal out1Step0 <== s1 * first.out[1];
    signal out1Step1 <== out1Step0 + s2 * second.out[1];
    signal out1Step2 <== out1Step1 + s3 * third.out[1];
    signal out1Step3 <== out1Step2 + s4 * fourth.out[1];
    signal out1Step4 <== out1Step3 + s5 * fifth.out[1];
    signal out1Step5 <== out1Step4 + s6 * sixth.out[1];
    out[1] <== out1Step5;
}
