pragma circom 2.1.6;
include "../../templates/jubjub.circom";

template EdDsaVerify() {
    signal input in[6];
    component module = edDsaVerify();
    module.SG <== [in[0], in[1]];
    module.R <== [in[2], in[3]];
    module.eA <== [in[4], in[5]];
}

component main = EdDsaVerify();
