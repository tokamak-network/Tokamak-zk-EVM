pragma circom 2.1.6;
include "../../templates/256bit/compare_safe.circom";

// Compares two physical 256-bit limb pairs. Input canonicality is supplied by
// the surrounding composition when EVM-word semantics are required.
template EQ() {
    signal input in[4];
    signal output out[2];

    out[0] <== IsEqual256()([in[0], in[1]], [in[2], in[3]]);
    out[1] <== 0;
}

component main {public [in]} = EQ();
