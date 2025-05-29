pragma circom 2.1.6;
include "../../templates/512bit/arithmetic.circom";
include "../../templates/256bit/compare_safe.circom";

template ADDMOD2() {
    signal input in[5];
    signal output out[2];

    signal add_res[2] <== [in[0], in[1]];
    signal carry <== in[2];
    signal in3[2] <== [in[3], in[4]];
    CheckBus()(in3);

    signal (quo[4], rem[4]) <== Div512by256_unsafe()([add_res[0], add_res[1], carry, 0], in3);

    out[0] <== rem[0];
    out[1] <== rem[1];

    // Check the outputs are less than in3
    signal out_check <== LessThan256()(out, in3);
    out_check === 1;
}

component main {public [in]} = ADDMOD2();