pragma circom 2.1.6;
include "../../templates/jubjub.circom";

template PrepareEdDsaScalars() {
    signal input in[2];
    signal output out[504];

    component module = prepareEdDsaScalars();
    module.s <== in[0];
    module.e <== in[1];
    for (var i = 0; i < 252; i++) {
        out[i] <== module.s_bit[i];
        out[i+252] <== module.e_bit[i];
    }
}

component main = PrepareEdDsaScalars();
