pragma circom 2.1.6;
include "../../templates/255bit/merkleTree.circom";
include "../../scripts/constants.circom";

template VerifyMerkleProof2x() {
    // For binary
    signal input in[12];

    component module = verifyP2MerkleProofStep2x();
    module._childIndex <== [
        in[0],
        in[1]
    ];
    module._child <== [
        in[2],
        in[3]
    ];
    module._sib[0] <== [
        in[4],
        in[5]
    ];
    module._sib[1] <== [
        in[6],
        in[7]
    ];
    module._parentIndex <== [
        in[8],
        in[9]
    ];
    module._parent <== [
        in[10],
        in[11]
    ];
}

component main{public [in]} = VerifyMerkleProof2x();