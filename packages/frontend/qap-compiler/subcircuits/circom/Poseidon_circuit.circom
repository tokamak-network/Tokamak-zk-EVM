pragma circom 2.1.6;
include "../../templates/255bit/poseidon.circom";
include "./constants.circom";

template PoseidonTokamak(N) {
    assert(N == 2);
    signal input in[15];
    signal output out[2];

    component H = poseidonTokamakByMode(N);
    H.selector <== in[0];
    for (var i = 0; i < 7; i++){
        H.in[i][0] <== in[1 + 2 * i];
        H.in[i][1] <== in[1 + 2 * i + 1];
    }
    out <== [H.out[0], H.out[1]];

}

component main = PoseidonTokamak(nPoseidonInputs());
