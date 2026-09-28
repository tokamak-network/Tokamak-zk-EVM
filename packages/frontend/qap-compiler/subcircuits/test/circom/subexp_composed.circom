pragma circom 2.1.6;
include "../../../templates/256bit/subexp.circom";
include "../../../templates/256bit/compare_safe.circom";

template SubExpComposed() {
    signal input in[6];
    signal output out[2];

    component step0 = SubExp();
    step0.in <== [in[0], in[1], in[2], in[3], in[4], in[5]];

    component step1 = SubExp();
    step1.in <== [
        step0.out[0],
        step0.out[1],
        step0.out[2],
        step0.out[3],
        step0.out[4],
        step0.out[5]
    ];

    AssertZeroWord()([step1.out[4], step1.out[5]]);
    CheckBus256()([step1.out[0], step1.out[1]]);
    out <== [step1.out[0], step1.out[1]];
}

component main {public [in]} = SubExpComposed();
