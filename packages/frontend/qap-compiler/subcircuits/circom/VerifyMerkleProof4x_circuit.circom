pragma circom 2.1.6;
include "../../templates/255bit/merkleTree.circom";
include "./constants.circom";

template VerifyMerkleProof4x() {
    // For binary
    signal input in[16];

    component module = verifyP2MerkleProofStep4x();
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
    module._sib[2] <== [
        in[8],
        in[9]
    ];
    module._sib[3] <== [
        in[10],
        in[11]
    ];
    module._parentIndex <== [
        in[12],
        in[13]
    ];
    module._parent <== [
        in[14],
        in[15]
    ];
}

component main{public [in]} = VerifyMerkleProof4x();
