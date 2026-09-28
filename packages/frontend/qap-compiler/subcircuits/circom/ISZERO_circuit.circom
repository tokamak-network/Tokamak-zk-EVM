pragma circom 2.1.6;
include "../../templates/256bit/compare_safe.circom";

// Tests whether a physical 256-bit limb pair is zero. Input canonicality is
// supplied by the surrounding composition when EVM-word semantics are needed.
template ISZERO() {
    signal input in[2];
    signal output out[2];

    out[0] <== IsZero256()([in[0], in[1]]);
    out[1] <== 0;
}

component main {public [in]} = ISZERO();
