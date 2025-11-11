pragma circom 2.1.6;
include "../../templates/255bit/merkleTree.circom";
include "../../scripts/constants.circom";

template VerifyMerkleProof(N) {
    signal input in[2 * (N + 1)];

    component module = verifyParentNode(N);
    for (var i = 0; i < N; i++) {
        module.children[i] <== [in[2 * i], in[2 * i + 1]];
    }
    module.parent <== [in[2*N], in[2*N+1]];
}

component main = VerifyMerkleProof(nPoseidonInputs());