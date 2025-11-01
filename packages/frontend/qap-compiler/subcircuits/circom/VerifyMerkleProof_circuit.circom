pragma circom 2.1.6;
include "../../templates/merkleTree.circom";
include "../../scripts/constants.circom";

template VerifyMerkleProof(N) {
    signal input in[N + 1];

    component module = verifyParentNode(N);
    for (var i = 0; i < N; i++) {
        module.children[i] <== in[i];
    }
    module.parent <== in[N];
}

component main = VerifyMerkleProof(nPoseidonInputs());