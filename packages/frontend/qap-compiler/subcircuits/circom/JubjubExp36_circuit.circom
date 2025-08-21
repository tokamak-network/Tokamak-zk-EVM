pragma circom 2.1.6;
include "../../templates/jubjub.circom";

template JubjubExp(N) {
    signal input in[4+N];
    signal output out[4];

    component module = jubjubExp(N);
    module.P_prev <== [in[0], in[1]];
    module.G_prev <== [in[2], in[3]];
    for (var i = 0; i < N; i++){
        module.b[i] <== in[4+i];
    }
    out[0] <== module.P_next[0];
    out[1] <== module.P_next[1];
    out[2] <== module.G_next[0];
    out[3] <== module.G_next[1];
}

component main = JubjubExp(36);
