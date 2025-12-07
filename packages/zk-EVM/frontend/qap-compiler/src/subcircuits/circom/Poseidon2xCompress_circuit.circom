pragma circom 2.1.6;
include "../../templates/255bit/poseidon.circom";
include "../../scripts/constants.circom";

template PoseidonTokamak2XCompress(NInputs) {
    var NParents = NInputs; // This should not be changed.
    var NChilds = NParents ** 2;
    
    signal input in[NChilds * 2];
    signal output out[2];

    component H_in[NParents];
    for (var k = 0; k < NParents; k++) {
        H_in[k] = poseidonTokamak(NInputs);
        for (var i = 0; i < NInputs; i++){
            H_in[k].in[i][0] <== in[2 * (k * NInputs + i)];
            H_in[k].in[i][1] <== in[2 * (k * NInputs + i) + 1];
        }
    }

    component H_out = poseidonTokamak(NInputs);
    for (var k = 0; k < NParents; k++) {
        H_out.in[k] <== H_in[k].out;
    }
    out <== H_out.out;

}

component main = PoseidonTokamak2XCompress(nPoseidonInputs());