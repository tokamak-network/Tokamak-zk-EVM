pragma circom 2.1.6;
include "../../templates/255bit/poseidon.circom";
include "./constants.circom";

template PoseidonTokamak4XCompress(NInputs) {
    var NGreatGrandParents = NInputs;
    var NGrandParents = NInputs ** 2;
    var NParents = NInputs ** 3;
    var NChilds = NInputs ** 4;

    signal input in[NChilds * 2];
    signal output out[2];

    component H_leaf[NParents];
    for (var k = 0; k < NParents; k++) {
        H_leaf[k] = poseidonTokamak(NInputs);
        for (var i = 0; i < NInputs; i++) {
            H_leaf[k].in[i][0] <== in[2 * (k * NInputs + i)];
            H_leaf[k].in[i][1] <== in[2 * (k * NInputs + i) + 1];
        }
    }

    component H_parent[NGrandParents];
    for (var k = 0; k < NGrandParents; k++) {
        H_parent[k] = poseidonTokamak(NInputs);
        for (var i = 0; i < NInputs; i++) {
            H_parent[k].in[i] <== H_leaf[k * NInputs + i].out;
        }
    }

    component H_grandParent[NGreatGrandParents];
    for (var k = 0; k < NGreatGrandParents; k++) {
        H_grandParent[k] = poseidonTokamak(NInputs);
        for (var i = 0; i < NInputs; i++) {
            H_grandParent[k].in[i] <== H_parent[k * NInputs + i].out;
        }
    }

    component H_out = poseidonTokamak(NInputs);
    for (var k = 0; k < NGreatGrandParents; k++) {
        H_out.in[k] <== H_grandParent[k].out;
    }
    out <== H_out.out;
}

component main = PoseidonTokamak4XCompress(nPoseidonInputs());
