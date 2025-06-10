pragma circom 2.1.6;
include "../node_modules/circomlib/circuits/comparators.circom";

template Buffer (N) {
    // signal input in[N];
    // signal output out[N] <== in;
    // NOTE: This code relies on "Something === 0", which can result in zero columns and break simulation-extractability of Groth16.

    // Consider the following code to prevent zero columns (resulting in triple constraints)
    signal input in[N];
    signal output out[N] <-- in;
    signal inter[N];
    for (var i=0; i<N; i++){
        inter[i] <== IsEqual()([in[i], out[i]]);
        inter[i] === 1;
    }
}