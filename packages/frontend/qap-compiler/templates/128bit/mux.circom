pragma circom 2.1.6;

template ComplexMux128_unsafe(N) {
    // This is unsafe because selector is assumed to be a binary string of length N.
    signal input selector[N], ins[N];
    signal output out;
    signal inter[N]; // intermediate signals to prevent non-quadratic constraints

    // Check the selector well-formness
    signal sum[N];
    sum[0] <== selector[0];
    for (var i = 1; i < N; i++) {
        sum[i] <== sum[i-1] + selector[i];
    }
    sum[N-1] === 1;

    inter[0] <== ins[0] * selector[0];
    for (var i = 1; i < N; i++){
        inter[i] <== ins[i] * selector[i] + inter[i-1];
    }
    out <== inter[N-1];
}