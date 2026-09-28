pragma circom 2.1.6;
include "poseidon-bls12381-circom/circuits/poseidon255.circom";
include "circomlib/circuits/comparators.circom";
// Each input and output is an 255-bit integer represented by two 128-bit LE limbs; e.g.) in1[0]: lower 128 bits, in1[1]: upper 128 bits
template poseidonTokamak(N) {
    signal input in[N][2];
    signal output out[2];

    var FIELD_SIZE = 1<<128;
    component H = Poseidon255(N);
    for (var i = 0; i < N; i++) {
        H.in[i] <== in[i][0] + in[i][1] * FIELD_SIZE;
    }

   out[0] <-- H.out % FIELD_SIZE;
   out[1] <-- H.out \ FIELD_SIZE;

   H.out === out[0] + out[1] * FIELD_SIZE;
}

template poseidonTokamakByMode(N, M) {
    assert(N == 2);
    assert(M > 0);
    assert(M <= 128);
    signal input selector;
    signal input in[M + 1][2];
    signal output out[2];

    component hashes[M];
    component selectorMatches[M];
    signal chain[M + 1][2];
    signal selectorSum[M + 1];
    signal selectedOutput[M + 1][2];

    chain[0] <== in[0];
    selectorSum[0] <== 0;
    selectedOutput[0] <== [0, 0];

    for (var i = 0; i < M; i++) {
        hashes[i] = poseidonTokamak(N);
        hashes[i].in[0] <== chain[i];
        hashes[i].in[1] <== in[i + 1];
        chain[i + 1] <== hashes[i].out;

        selectorMatches[i] = IsEqual();
        selectorMatches[i].in[0] <== selector;
        selectorMatches[i].in[1] <== 2 ** i;

        selectorSum[i + 1] <== selectorSum[i] + selectorMatches[i].out;
        selectedOutput[i + 1][0] <== selectedOutput[i][0] + selectorMatches[i].out * chain[i + 1][0];
        selectedOutput[i + 1][1] <== selectedOutput[i][1] + selectorMatches[i].out * chain[i + 1][1];
    }

    selectorSum[M] === 1;
    out <== selectedOutput[M];
}
