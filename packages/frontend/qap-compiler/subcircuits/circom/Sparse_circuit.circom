pragma circom 2.1.6;
// This circuit is for benchmarking backend
template Sparse (N) {
    signal input in;
    signal output out;

    signal inter[N];
    for (var i = 0; i < N; i++){
        inter[i] <== in * in;
    }
    out <== inter[N-1];
}

component main {public [in]} = Sparse(64);