pragma circom 2.1.6;
include "../../node_modules/poseidon-bls12381-circom/circuits/poseidon255.circom";
// Each input and output is an 255-bit integer represented by two 128-bit LE limbs; e.g.) in1[0]: lower 128 bits, in1[1]: upper 128 bits
template poseidonTokamak(N) {
    signal input in[N][2];
    signal output out[2];

    var FIELD_SIZE = 1<<128;
    component H = Poseidon255(N);
    for (var i = 0; i < N; i++) {
        H.in[i] <== in[i][0] + in[i][1] * FIELD_SIZE;
    }

   out[0] <-- H.out % FIELD_SIZE;
   out[1] <-- H.out \ FIELD_SIZE;

   H.out === out[0] + out[1] * FIELD_SIZE;
}
