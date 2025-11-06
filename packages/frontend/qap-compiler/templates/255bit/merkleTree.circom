pragma circom 2.1.6;
include "./poseidon.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";
include "../../node_modules/circomlib/circuits/bitify.circom";

template verifyParentNode(N) {
    signal input children[N][2], parent[2];
    component H = poseidonTokamak(N);
    for (var i = 0; i < N; i++){
        H.in[i] <== children[i];
    }
    
    H.out[0] === parent[0];
    H.out[1] === parent[1];
}

template getParentNode() {
    // 4-ary Merkle tree
    // inputs
    signal input childIndex, child, sib[3];
    // outputs
    signal output parentIndex, parent;

    // childIndex -> 2bits -> one-hot
    component nb = Num2Bits(2);
    nb.in <== childIndex;

    // bits
    signal b0, b1;
    b0 <== nb.out[0];
    b1 <== nb.out[1];

    // one-hot selectors
    signal e0; // childIndex==0
    signal e1; // childIndex==1
    signal e2; // childIndex==2
    signal e3; // childIndex==3

    e0 <== (1 - b0) * (1 - b1);
    e1 <== b0 * (1 - b1);
    e2 <== (1 - b0) * b1;
    e3 <== b0 * b1;

    signal c0; signal c1; signal c2; signal c3;

    // c0 <== e0 * child  + e1 * sib[0] + e2 * sib[0] + e3 * sib[0];
    // c1 <== e0 * sib[0] + e1 * child  + e2 * sib[1] + e3 * sib[1];
    // c2 <== e0 * sib[1] + e1 * sib[1] + e2 * child  + e3 * sib[2];
    // c3 <== e0 * sib[2] + e1 * sib[2] + e2 * sib[2] + e3 * child;

    signal c00 <== e0 * child;
    signal c000 <==  c00 + e1 * sib[0];
    signal c0000 <== c000 + e2 * sib[0];
    c0 <== c0000 + e3 * sib[0];

    signal c11 <== e0 * sib[0];
    signal c111 <== c11 + e1 * child;
    signal c1111 <== c111 + e2 * sib[1];
    c1 <== c1111 + e3 * sib[1];

    signal c22 <== e0 * sib[1];
    signal c222 <== c22 + e1 * sib[1];
    signal c2222 <== c222 + e2 * child;
    c2 <== c2222 + e3 * sib[2];

    signal c33 <== e0 * sib[2];
    signal c333 <== c33 + e1 * sib[2];
    signal c3333 <== c333 + e2 * sib[2];
    c3 <== c3333 + e3 * child;

    component H = Poseidon255(4);
    H.in[0] <== c0;
    H.in[1] <== c1;
    H.in[2] <== c2;
    H.in[3] <== c3;

    parent <== H.out;
    parentIndex <-- childIndex \ 4;
    signal rem <-- childIndex % 4;
    childIndex === parentIndex * 4 + rem;
    signal check <== LessThan(3)([rem, 4]);
    check === 1;

}