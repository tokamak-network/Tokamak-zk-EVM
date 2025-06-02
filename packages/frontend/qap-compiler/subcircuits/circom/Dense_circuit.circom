pragma circom 2.1.6;
// This circuit is for benchmarking backend
template Dense (N) {
    signal input in;
    signal output out;

    signal inter[N];
    inter[0] <== in * 3;
    inter[1] <== in * 4;
    for (var i = 2; i < N; i++){
        inter[i] <== inter[i-1] * inter[i-2];
    }
    out <== inter[N-1];
}

component main {public [in]} = Dense(64);