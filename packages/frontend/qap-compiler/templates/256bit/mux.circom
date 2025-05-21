pragma circom 2.1.6;

template Mux256() {
    signal input flag, in_true[2], in_false[2];
    
    signal res00 <== flag * in_true[0];
    signal res01 <== (1-flag) * in_false[0];
    signal res0 <== res00 + res01;

    signal res10 <== flag * in_true[1];
    signal res11 <== (1-flag) * in_false[1];
    signal res1 <== res10 + res11;
    signal output res[2] <== [res0, res1];
}

template ComplexMux256_unsafe(N) {
    // This is unsafe because selector is assumed to be a binary string of length N.
    signal input selector[N], ins[N][2];
    signal output out[2];
    signal inter[N][2]; // intermediate signals to prevent non-quadratic constraints

    // Check the selector well-formness
    signal sum[N];
    sum[0] <== selector[0];
    for (var i = 1; i < N; i++) {
        sum[i] <== sum[i-1] + selector[i];
    }
    sum[N-1] === 1;

    inter[0] <== [
        ins[0][0] * selector[0],
        ins[0][1] * selector[0]
    ];
    for (var i = 1; i < N; i++){
        inter[i] <== [
            ins[i][0] * selector[i] + inter[i-1][0],
            ins[i][1] * selector[i] + inter[i-1][1]
        ];
    }
    out <== inter[N-1];
}