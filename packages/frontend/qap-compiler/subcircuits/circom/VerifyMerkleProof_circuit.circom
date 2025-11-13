pragma circom 2.1.6;
include "../../templates/255bit/merkleTree.circom";
include "../../scripts/constants.circom";

// template VerifyMerkleProof(N) {
//     signal input in[2 * (N + 1)];

//     component module = verifyParentNode(N);
//     for (var i = 0; i < N; i++) {
//         module.children[i] <== [in[2 * i], in[2 * i + 1]];
//     }
//     module.parent <== [in[2*N], in[2*N+1]];
// }

// component main = VerifyMerkleProof(nPoseidonInputs());

template VerifyMerkleProof() {
    signal input in[14];

    component module = verifyMerkleProofStep();
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

component main{public [in]} = VerifyMerkleProof();