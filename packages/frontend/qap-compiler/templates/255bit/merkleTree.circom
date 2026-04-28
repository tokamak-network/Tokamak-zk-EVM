pragma circom 2.1.6;
include "./poseidon.circom";
include "../../functions/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

template verifyParentNode(N) {
    signal input children[N][2], parent[2];
    component H = poseidonTokamak(N);
    for (var i = 0; i < N; i++){
        H.in[i] <== children[i];
    }
    
    H.out[0] === parent[0];
    H.out[1] === parent[1];
}

template verifyP2MerkleProofByMode() {
    signal input _selector, _childIndex[2], _child[2], _sib[6][2], _parentIndex[2], _parent[2];
    var FIELD_SIZE = 1<<128;

    var childIndex;
    var child;
    var sib;
    var children[2];
    var parent;
    var childHomeIndex;

    component firstStep = verifyP2MerkleProofStep();
    firstStep._childIndex <== _childIndex;
    firstStep._child <== _child;
    firstStep._sib <== _sib[0];

    childIndex = firstStep._childIndex[0];
    childHomeIndex = childIndex % 2;
    child = firstStep._child[0] + firstStep._child[1] * FIELD_SIZE;
    sib = firstStep._sib[0] + firstStep._sib[1] * FIELD_SIZE;
    if (childHomeIndex == 0) {
        children = [child, sib];
    } else {
        children = [sib, child];
    }
    parent = _Poseidon255_2(children);

    firstStep._parentIndex <-- [
        childIndex \ 2,
        0
    ];
    firstStep._parent <-- [
        parent % FIELD_SIZE,
        parent \ FIELD_SIZE
    ];

    component secondStep = verifyP2MerkleProofStep();
    secondStep._childIndex <== firstStep._parentIndex;
    secondStep._child <== firstStep._parent;
    secondStep._sib <== _sib[1];

    childIndex = secondStep._childIndex[0];
    childHomeIndex = childIndex % 2;
    child = secondStep._child[0] + secondStep._child[1] * FIELD_SIZE;
    sib = secondStep._sib[0] + secondStep._sib[1] * FIELD_SIZE;
    if (childHomeIndex == 0) {
        children = [child, sib];
    } else {
        children = [sib, child];
    }
    parent = _Poseidon255_2(children);

    secondStep._parentIndex <-- [
        childIndex \ 2,
        0
    ];
    secondStep._parent <-- [
        parent % FIELD_SIZE,
        parent \ FIELD_SIZE
    ];

    component thirdStep = verifyP2MerkleProofStep();
    thirdStep._childIndex <== secondStep._parentIndex;
    thirdStep._child <== secondStep._parent;
    thirdStep._sib <== _sib[2];

    childIndex = thirdStep._childIndex[0];
    childHomeIndex = childIndex % 2;
    child = thirdStep._child[0] + thirdStep._child[1] * FIELD_SIZE;
    sib = thirdStep._sib[0] + thirdStep._sib[1] * FIELD_SIZE;
    if (childHomeIndex == 0) {
        children = [child, sib];
    } else {
        children = [sib, child];
    }
    parent = _Poseidon255_2(children);

    thirdStep._parentIndex <-- [
        childIndex \ 2,
        0
    ];
    thirdStep._parent <-- [
        parent % FIELD_SIZE,
        parent \ FIELD_SIZE
    ];

    component fourthStep = verifyP2MerkleProofStep();
    fourthStep._childIndex <== thirdStep._parentIndex;
    fourthStep._child <== thirdStep._parent;
    fourthStep._sib <== _sib[3];

    childIndex = fourthStep._childIndex[0];
    childHomeIndex = childIndex % 2;
    child = fourthStep._child[0] + fourthStep._child[1] * FIELD_SIZE;
    sib = fourthStep._sib[0] + fourthStep._sib[1] * FIELD_SIZE;
    if (childHomeIndex == 0) {
        children = [child, sib];
    } else {
        children = [sib, child];
    }
    parent = _Poseidon255_2(children);

    fourthStep._parentIndex <-- [
        childIndex \ 2,
        0
    ];
    fourthStep._parent <-- [
        parent % FIELD_SIZE,
        parent \ FIELD_SIZE
    ];

    component fifthStep = verifyP2MerkleProofStep();
    fifthStep._childIndex <== fourthStep._parentIndex;
    fifthStep._child <== fourthStep._parent;
    fifthStep._sib <== _sib[4];

    childIndex = fifthStep._childIndex[0];
    childHomeIndex = childIndex % 2;
    child = fifthStep._child[0] + fifthStep._child[1] * FIELD_SIZE;
    sib = fifthStep._sib[0] + fifthStep._sib[1] * FIELD_SIZE;
    if (childHomeIndex == 0) {
        children = [child, sib];
    } else {
        children = [sib, child];
    }
    parent = _Poseidon255_2(children);

    fifthStep._parentIndex <-- [
        childIndex \ 2,
        0
    ];
    fifthStep._parent <-- [
        parent % FIELD_SIZE,
        parent \ FIELD_SIZE
    ];

    component sixthStep = verifyP2MerkleProofStep();
    sixthStep._childIndex <== fifthStep._parentIndex;
    sixthStep._child <== fifthStep._parent;
    sixthStep._sib <== _sib[5];

    childIndex = sixthStep._childIndex[0];
    childHomeIndex = childIndex % 2;
    child = sixthStep._child[0] + sixthStep._child[1] * FIELD_SIZE;
    sib = sixthStep._sib[0] + sixthStep._sib[1] * FIELD_SIZE;
    if (childHomeIndex == 0) {
        children = [child, sib];
    } else {
        children = [sib, child];
    }
    parent = _Poseidon255_2(children);

    sixthStep._parentIndex <-- [
        childIndex \ 2,
        0
    ];
    sixthStep._parent <-- [
        parent % FIELD_SIZE,
        parent \ FIELD_SIZE
    ];

    component eq1 = IsEqual();
    eq1.in[0] <== _selector;
    eq1.in[1] <== 1;

    component eq2 = IsEqual();
    eq2.in[0] <== _selector;
    eq2.in[1] <== 2;

    component eq3 = IsEqual();
    eq3.in[0] <== _selector;
    eq3.in[1] <== 4;

    component eq4 = IsEqual();
    eq4.in[0] <== _selector;
    eq4.in[1] <== 8;

    component eq5 = IsEqual();
    eq5.in[0] <== _selector;
    eq5.in[1] <== 16;

    component eq6 = IsEqual();
    eq6.in[0] <== _selector;
    eq6.in[1] <== 32;

    signal s1 <== eq1.out;
    signal s2 <== eq2.out;
    signal s3 <== eq3.out;
    signal s4 <== eq4.out;
    signal s5 <== eq5.out;
    signal s6 <== eq6.out;
    signal selectorCheck <== s1 + s2 + s3 + s4 + s5 + s6;
    selectorCheck === 1;

    signal parentIndex0Step0 <== s1 * firstStep._parentIndex[0];
    signal parentIndex0Step1 <== parentIndex0Step0 + s2 * secondStep._parentIndex[0];
    signal parentIndex0Step2 <== parentIndex0Step1 + s3 * thirdStep._parentIndex[0];
    signal parentIndex0Step3 <== parentIndex0Step2 + s4 * fourthStep._parentIndex[0];
    signal parentIndex0Step4 <== parentIndex0Step3 + s5 * fifthStep._parentIndex[0];
    signal parentIndex0Step5 <== parentIndex0Step4 + s6 * sixthStep._parentIndex[0];
    _parentIndex[0] === parentIndex0Step5;

    signal parentIndex1Step0 <== s1 * firstStep._parentIndex[1];
    signal parentIndex1Step1 <== parentIndex1Step0 + s2 * secondStep._parentIndex[1];
    signal parentIndex1Step2 <== parentIndex1Step1 + s3 * thirdStep._parentIndex[1];
    signal parentIndex1Step3 <== parentIndex1Step2 + s4 * fourthStep._parentIndex[1];
    signal parentIndex1Step4 <== parentIndex1Step3 + s5 * fifthStep._parentIndex[1];
    signal parentIndex1Step5 <== parentIndex1Step4 + s6 * sixthStep._parentIndex[1];
    _parentIndex[1] === parentIndex1Step5;

    signal parent0Step0 <== s1 * firstStep._parent[0];
    signal parent0Step1 <== parent0Step0 + s2 * secondStep._parent[0];
    signal parent0Step2 <== parent0Step1 + s3 * thirdStep._parent[0];
    signal parent0Step3 <== parent0Step2 + s4 * fourthStep._parent[0];
    signal parent0Step4 <== parent0Step3 + s5 * fifthStep._parent[0];
    signal parent0Step5 <== parent0Step4 + s6 * sixthStep._parent[0];
    _parent[0] === parent0Step5;

    signal parent1Step0 <== s1 * firstStep._parent[1];
    signal parent1Step1 <== parent1Step0 + s2 * secondStep._parent[1];
    signal parent1Step2 <== parent1Step1 + s3 * thirdStep._parent[1];
    signal parent1Step3 <== parent1Step2 + s4 * fourthStep._parent[1];
    signal parent1Step4 <== parent1Step3 + s5 * fifthStep._parent[1];
    signal parent1Step5 <== parent1Step4 + s6 * sixthStep._parent[1];
    _parent[1] === parent1Step5;
}

template verifyP2MerkleProofStep4x() {
    // Fixed for 2-ary Merkle tree
    // inputs
    signal input _childIndex[2], _child[2], _sib[4][2], _parentIndex[2], _parent[2];
    var FIELD_SIZE = 1<<128;

    var childIndex;
    var child;
    var sib;
    var children[2];
    var parent;
    var childHomeIndex;

    component firstStep = verifyP2MerkleProofStep();
    firstStep._childIndex <== _childIndex;
    firstStep._child <== _child;
    firstStep._sib <== _sib[0];

    childIndex = firstStep._childIndex[0];
    childHomeIndex = childIndex % 2;
    child = firstStep._child[0] + firstStep._child[1] * FIELD_SIZE;
    sib = firstStep._sib[0] + firstStep._sib[1] * FIELD_SIZE;
    if (childHomeIndex == 0) {
        children = [child, sib];
    } else {
        children = [sib, child];
    }
    parent = _Poseidon255_2(children);

    firstStep._parentIndex <-- [
        childIndex \ 2,
        0
    ];
    firstStep._parent <-- [
        parent % FIELD_SIZE,
        parent \ FIELD_SIZE
    ];

    component secondStep = verifyP2MerkleProofStep();
    secondStep._childIndex <== firstStep._parentIndex;
    secondStep._child <== firstStep._parent;
    secondStep._sib <== _sib[1];

    childIndex = secondStep._childIndex[0];
    childHomeIndex = childIndex % 2;
    child = secondStep._child[0] + secondStep._child[1] * FIELD_SIZE;
    sib = secondStep._sib[0] + secondStep._sib[1] * FIELD_SIZE;
    if (childHomeIndex == 0) {
        children = [child, sib];
    } else {
        children = [sib, child];
    }
    parent = _Poseidon255_2(children);

    secondStep._parentIndex <-- [
        childIndex \ 2,
        0
    ];
    secondStep._parent <-- [
        parent % FIELD_SIZE,
        parent \ FIELD_SIZE
    ];

    component thirdStep = verifyP2MerkleProofStep();
    thirdStep._childIndex <== secondStep._parentIndex;
    thirdStep._child <== secondStep._parent;
    thirdStep._sib <== _sib[2];

    childIndex = thirdStep._childIndex[0];
    childHomeIndex = childIndex % 2;
    child = thirdStep._child[0] + thirdStep._child[1] * FIELD_SIZE;
    sib = thirdStep._sib[0] + thirdStep._sib[1] * FIELD_SIZE;
    if (childHomeIndex == 0) {
        children = [child, sib];
    } else {
        children = [sib, child];
    }
    parent = _Poseidon255_2(children);

    thirdStep._parentIndex <-- [
        childIndex \ 2,
        0
    ];
    thirdStep._parent <-- [
        parent % FIELD_SIZE,
        parent \ FIELD_SIZE
    ];

    component fourthStep = verifyP2MerkleProofStep();
    fourthStep._childIndex <== thirdStep._parentIndex;
    fourthStep._child <== thirdStep._parent;
    fourthStep._sib <== _sib[3];
    fourthStep._parentIndex <== _parentIndex;
    fourthStep._parent <== _parent;
}

template verifyP2MerkleProofStep3x() {
    // Fixed for 2-ary Merkle tree
    // inputs
    signal input _childIndex[2], _child[2], _sib[3][2], _parentIndex[2], _parent[2];
    var FIELD_SIZE = 1<<128;

    var childIndex;
    var child;
    var sib;
    var children[2];
    var parent;
    var childHomeIndex;

    component firstStep = verifyP2MerkleProofStep();
    firstStep._childIndex <== _childIndex;
    firstStep._child <== _child;
    firstStep._sib <== _sib[0];

    childIndex = firstStep._childIndex[0];
    childHomeIndex = childIndex % 2;
    child = firstStep._child[0] + firstStep._child[1] * FIELD_SIZE;
    sib = firstStep._sib[0] + firstStep._sib[1] * FIELD_SIZE;
    if (childHomeIndex == 0) {
        children = [child, sib];
    } else {
        children = [sib, child];
    }
    parent = _Poseidon255_2(children);

    firstStep._parentIndex <-- [
        childIndex \ 2,
        0
    ];
    firstStep._parent <-- [
        parent % FIELD_SIZE,
        parent \ FIELD_SIZE
    ];

    component secondStep = verifyP2MerkleProofStep();
    secondStep._childIndex <== firstStep._parentIndex;
    secondStep._child <== firstStep._parent;
    secondStep._sib <== _sib[1];

    childIndex = secondStep._childIndex[0];
    childHomeIndex = childIndex % 2;
    child = secondStep._child[0] + secondStep._child[1] * FIELD_SIZE;
    sib = secondStep._sib[0] + secondStep._sib[1] * FIELD_SIZE;
    if (childHomeIndex == 0) {
        children = [child, sib];
    } else {
        children = [sib, child];
    }
    parent = _Poseidon255_2(children);

    secondStep._parentIndex <-- [
        childIndex \ 2,
        0
    ];
    secondStep._parent <-- [
        parent % FIELD_SIZE,
        parent \ FIELD_SIZE
    ];

    component thirdStep = verifyP2MerkleProofStep();
    thirdStep._childIndex <== secondStep._parentIndex;
    thirdStep._child <== secondStep._parent;
    thirdStep._sib <== _sib[2];
    thirdStep._parentIndex <== _parentIndex;
    thirdStep._parent <== _parent;
}

template verifyP2MerkleProofStep2x() {
    // Fixed for 2-ary Merkle tree
    // inputs
    signal input _childIndex[2], _child[2], _sib[2][2], _parentIndex[2], _parent[2];
    var FIELD_SIZE = 1<<128;

    component firstStep = verifyP2MerkleProofStep();
    firstStep._childIndex <== _childIndex;
    firstStep._child <== _child;
    firstStep._sib <== _sib[0];

    var childIndex = _childIndex[0];
    var childHomeIndex = childIndex % 2;
    var child = _child[0] + _child[1] * FIELD_SIZE;
    var sib0 = _sib[0][0] + _sib[0][1] * FIELD_SIZE;
    var children[2];
    if (childHomeIndex == 0) {
        children = [child, sib0];
    } else {
        children = [sib0, child];
    }
    var parent = _Poseidon255_2(children);
    firstStep._parentIndex <-- [
        _childIndex[0] \ 2,
        0
    ];
    firstStep._parent <-- [
        parent % FIELD_SIZE,
        parent \ FIELD_SIZE
    ];

    component secondStep = verifyP2MerkleProofStep();
    secondStep._childIndex <== firstStep._parentIndex;
    secondStep._child <== firstStep._parent;
    secondStep._sib <== _sib[1];
    secondStep._parentIndex <== _parentIndex;
    secondStep._parent <== _parent;
}

template verifyP2MerkleProofStep() {
    // Fixed for 2-ary Merkle tree
    // inputs
    signal input _childIndex[2], _child[2], _sib[2], _parentIndex[2], _parent[2];

    var FIELD_SIZE = 1<<128;

    _childIndex[1] === 0;
    signal childIndex <== _childIndex[0];
    _parentIndex[1] === 0;
    signal parentIndex <-- childIndex \ 2;
    _parentIndex[0] === parentIndex;

    signal childHomeIndex <-- childIndex % 2;
    childIndex === parentIndex * 2 + childHomeIndex;
    signal check <== LessThan(2)([childHomeIndex, 2]);
    check === 1;

    signal child <== _child[0] + _child[1] * FIELD_SIZE;
    signal sib <== _sib[0] + _sib[1] * FIELD_SIZE;

    // childHomeIndex -> 1bit
    // one-hot selectors
    signal e0; // childHomeIndex==0
    signal e1; // childHomeIndex==1

    e0 <== (1 - childHomeIndex);
    e1 <== childHomeIndex;

    signal c0; signal c1;

    // c0 <== e0 * child  + e1 * sib
    // c1 <== e0 * sib + e1 * child

    signal c00 <== e0 * child;
    c0 <==  c00 + e1 * sib;

    signal c11 <== e0 * sib;
    c1 <== c11 + e1 * child;

    component H = Poseidon255(2);
    H.in[0] <== c0;
    H.in[1] <== c1;

    signal parent <== H.out;

    parent === _parent[0] + _parent[1] * FIELD_SIZE;
}

template verifyP4MerkleProofStep() {
    // Fixed for 4-ary Merkle tree
    // inputs
    signal input _childIndex[2], _child[2], _sib[3][2], _parentIndex[2], _parent[2];

    var FIELD_SIZE = 1<<128;

    _childIndex[1] === 0;
    signal childIndex <== _childIndex[0];

    signal parentIndex <-- childIndex \ 4;
    signal childHomeIndex <-- childIndex % 4;
    childIndex === parentIndex * 4 + childHomeIndex;
    signal check <== LessThan(3)([childHomeIndex, 4]);
    check === 1;

    signal child <== _child[0] + _child[1] * FIELD_SIZE;
    signal sib[3];
    for (var i = 0; i < 3; i++) {
        sib[i] <== _sib[i][0] + _sib[i][1] * FIELD_SIZE;
    }

    // childHomeIndex -> 2bits -> one-hot
    component nb = Num2Bits(2);
    nb.in <== childHomeIndex;

    // bits
    signal b0, b1;
    b0 <== nb.out[0];
    b1 <== nb.out[1];

    // one-hot selectors
    signal e0; // childHomeIndex==0
    signal e1; // childHomeIndex==1
    signal e2; // childHomeIndex==2
    signal e3; // childHomeIndex==3

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

    signal parent <== H.out;

    _parentIndex[1] === 0;
    _parentIndex[0] === parentIndex;
    parent === _parent[0] + _parent[1] * FIELD_SIZE;
}
