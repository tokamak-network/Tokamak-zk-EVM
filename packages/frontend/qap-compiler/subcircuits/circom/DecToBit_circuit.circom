pragma circom 2.1.6;
include "../../templates/256bit/bitify_safe.circom";

template DecToBit () {
    signal input in[2]; // A 256-bit integer consisting of two 128-bit integers; in[0]: lower, in[1]: upper
    signal output out[256];

    component n2b256 = Num2Bits256();
    n2b256.in <== in;
    for (var i = 0; i < 128; i++){
        out[i] <== n2b256.out[0][i];
        out[i + 128] <== n2b256.out[1][i];
    }
}

component main {public [in]} = DecToBit();