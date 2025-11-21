pragma circom 2.1.6;
include "../../templates/256bit/arithmetic_unsafe_type1.circom";
include "../../scripts/constants.circom";

template SubExpBatch(N) {
    signal input in[4 + N];
    signal output out[4];

    component module = subExpBatch(N);
    module.c_prev <== [in[0], in[1]];
    module.a_prev <== [in[2], in[3]];
    for (var i = 0; i < N; i++){
        // in[i] is LSB-left
        module.b[i] <== in[4+i];
    }
    out <== [
        module.c_next[0], module.c_next[1], 
        module.a_next[0], module.a_next[1]
    ];

    // CheckBus()(c_next);
    // CheckBus()(a_next);
}

component main = SubExpBatch(nSubExpBatch());