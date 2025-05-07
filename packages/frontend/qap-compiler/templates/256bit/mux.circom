pragma circom 2.1.6;

template Mux256 () {
    signal input flag, in_true[2], in_false[2];
    
    signal res00 <== flag * in_true[0];
    signal res01 <== (1-flag) * in_false[0];
    signal res0 <== res00 + res01;

    signal res10 <== flag * in_true[1];
    signal res11 <== (1-flag) * in_false[1];
    signal res1 <== res10 + res11;
    signal output res[2] <== [res0, res1];
}