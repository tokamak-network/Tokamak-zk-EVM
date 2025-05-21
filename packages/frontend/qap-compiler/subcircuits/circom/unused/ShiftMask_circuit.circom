pragma circom 2.1.6;
include "../../templates/256bit/arithmetic_unsafe_type2.circom";
include "../../templates/256bit/two_complement_unsafe.circom";
include "../../templates/256bit/mux.circom";
include "../../templates/256bit/compare_safe.circom";
include "../../templates/256bit/bitwise_safe.circom";

template ShiftMask() {
    signal input in[6];
    signal output out[2];

    // shift is assumed to be in -255 to 255
    signal shift[2] <== [in[0], in[1]];
    signal mask[2] <== [in[2], in[3]];
    signal val[2] <== [in[4], in[5]];

    signal (is_neg_shift, shift_abs[2]) <== getSignAndAbs256_unsafe()(shift);
    shift_abs[1] === 0;
    
    signal left_shifted_val[2] <== ShiftLeft256_unsafe(8)(shift_abs[0], val);
    signal (right_shifted_val[2], rem[2], divisor[2]) <== ShiftRight256_unsafe(8)(shift_abs[0], val);
    signal is_zero_div <== IsZero256()(divisor);
    signal range_check <== LessThan256()(rem, divisor);
    signal range_check_safe <== range_check * (1 - is_zero_div) + is_zero_div;

    signal shifted_out[2] <== Mux256()(is_neg_shift, right_shifted_val, left_shifted_val);

    out <== And256()(shifted_out, mask);
}

component main {public [in]} = ShiftMask();