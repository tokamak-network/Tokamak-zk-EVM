pragma circom 2.1.6;

template Mux512 () {
    signal input flag, in_true[4], in_false[4];
    signal output res[4];

    signal inter_true[4];
    signal inter_false[4];

    for (var i = 0; i < 4; i++) {
        inter_true[i] <== flag * in_true[i];
        inter_false[i] <== (1 - flag) * in_false[i];
        res[i] <== inter_true[i] + inter_false[i];
    }
}