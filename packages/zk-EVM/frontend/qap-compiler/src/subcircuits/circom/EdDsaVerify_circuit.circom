pragma circom 2.1.6;
include "../../templates/255bit/jubjub.circom";

template EdDsaVerify() {
    signal input in[12];
    component module = edDsaVerify();
    module._SG <== [
        [in[0], in[1]],
        [in[2], in[3]]
    ];
    module._R <== [
        [in[4], in[5]],
        [in[6], in[7]]
    ];
    module._eA <== [
        [in[8], in[9]],
        [in[10], in[11]]
    ];
}

component main = EdDsaVerify();
