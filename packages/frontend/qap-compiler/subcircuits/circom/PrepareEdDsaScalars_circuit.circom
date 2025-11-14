// pragma circom 2.1.6;
// include "../../templates/255bit/jubjub.circom";

// template PrepareEdDsaScalars() {
//     signal input in[4];
//     signal output out[504];

//     component module = prepareEdDsaScalars();
//     module._s <== [in[0], in[1]];
//     module._e <== [in[2], in[3]];
//     for (var i = 0; i < 252; i++) {
//         out[i] <== module.s_bit_LSB[i];
//         out[i+252] <== module.e_bit_LSB[i];
//     }
// }

// component main = PrepareEdDsaScalars();

// REPLACED BY DecToBit
