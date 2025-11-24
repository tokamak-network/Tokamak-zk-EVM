pragma circom 2.1.6;
include "../../templates/255bit/merkleTree.circom";
include "../../scripts/constants.circom";

template VerifyMerkleProof3x() {
    // For binary
    signal input in[14];

    component module = verifyP2MerkleProofStep3x();
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
    module._parentIndex <== [
        in[10],
        in[11]
    ];
    module._parent <== [
        in[12],
        in[13]
    ];
}

component main{public [in]} = VerifyMerkleProof3x();