pragma circom 2.1.6;
include "../../templates/255bit/poseidon.circom";
include "../../scripts/constants.circom";

template PoseidonTokamak(N) {
    signal input in[N * 2];
    signal output out[2];

    component H = poseidonTokamak(N);
    for (var i = 0; i < N; i++){
        H.in[i][0] <== in[2 * i];
        H.in[i][1] <== in[2 * i + 1];
    }
    out <== [H.out[0], H.out[1]];

}

component main = PoseidonTokamak(nPoseidonInputs());