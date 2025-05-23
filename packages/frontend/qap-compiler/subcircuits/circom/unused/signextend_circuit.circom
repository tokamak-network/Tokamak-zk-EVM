pragma circom 2.1.6;
include "../../templates/256bit/arithmetic_unsafe_type2.circom";
include "../../templates/256bit/mux.circom";
include "../../templates/256bit/compare_safe.circom";

template SIGNEXTEND() {
    signal input in[4];
    signal output out[2];

    // Check the input value is in 128 bit limbs
    CheckBus()([in[2], in[3]]);
    signal is_shift_small <== IsZero()(in[1]);

    component signExtend = SignExtend256_unsafe();
    signExtend.byte_minus_one <== in[0];
    signExtend.in <== [in[2], in[3]];
    signal out_small_shift[2] <== signExtend.out;
    signal range_check <== LessThan256()(signExtend.rem, signExtend.divisor);
    range_check === 1;

    out <== Mux256()(is_shift_small, out_small_shift, [in[2], in[3]]);
}

component main {public [in]} = SIGNEXTEND();