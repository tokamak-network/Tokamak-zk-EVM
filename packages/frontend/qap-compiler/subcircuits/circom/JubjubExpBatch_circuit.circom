pragma circom 2.1.6;
include "../../templates/255bit/jubjub.circom";
include "../../scripts/constants.circom";

template JubjubExp(N) {
    signal input in[8+N];
    signal output out[8];

    component module = jubjubExp(N);
    module._P_prev <== [
        [in[0], in[1]],
        [in[2], in[3]]
    ];
    module._G_prev <== [
        [in[4], in[5]],
        [in[6], in[7]]
    ];
    for (var i = 0; i < N; i++){
        // in[i] is LSB-left
        module.b[i] <== in[8+i];
    }
    out <== [
        module._P_next[0][0], module._P_next[0][1], 
        module._P_next[1][0], module._P_next[1][1],
        module._G_next[0][0], module._G_next[0][1],
        module._G_next[1][0], module._G_next[1][1]
    ];
}

component main = JubjubExp(nJubjubExpBatch());
