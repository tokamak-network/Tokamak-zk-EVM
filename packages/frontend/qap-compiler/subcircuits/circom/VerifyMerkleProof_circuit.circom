pragma circom 2.1.6;
include "../../templates/255bit/merkleTree.circom";
include "./constants.circom";


// template VerifyMerkleProof() {
//     // For 4-ary
//     signal input in[14];

//     component module = verifyP4MerkleProofStep();
//     module._childIndex <== [
//         in[0],
//         in[1]
//     ];
//     module._child <== [
//         in[2],
//         in[3]
//     ];
//     module._sib[0] <== [
//         in[4],
//         in[5]
//     ];
//     module._sib[1] <== [
//         in[6],
//         in[7]
//     ];
//     module._sib[2] <== [
//         in[8],
//         in[9]
//     ];
//     module._parentIndex <== [
//         in[10],
//         in[11]
//     ];
//     module._parent <== [
//         in[12],
//         in[13]
//     ];
// }

template VerifyMerkleProof() {
    signal input in[17];

    component module = verifyP2MerkleProofByMode();
    module._selector <== in[0];
    module._childIndex <== [
        in[1],
        in[2]
    ];
    module._child <== [
        in[3],
        in[4]
    ];
    module._sib[0] <== [
        in[5],
        in[6]
    ];
    module._sib[1] <== [
        in[7],
        in[8]
    ];
    module._sib[2] <== [
        in[9],
        in[10]
    ];
    module._sib[3] <== [
        in[11],
        in[12]
    ];
    module._parentIndex <== [
        in[13],
        in[14]
    ];
    module._parent <== [
        in[15],
        in[16]
    ];
}

component main{public [in]} = VerifyMerkleProof();
