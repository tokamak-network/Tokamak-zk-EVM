pragma circom 2.1.6;
include "arithmetic_unsafe_in_out.circom";
include "../512bit/arithmetic.circom";
include "../128bit/arithmetic.circom";
include "two_complement.circom";
include "../../node_modules/circomlib/circuits/gates.circom";
include "compare.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";
include "../../functions/two_complement.circom";

// Templates here include the range check on outputs.

template Div256_unsafe () {
    // Need range checks on the inputs and output to be safe.
    signal input in1[2], in2[2];
    signal output q[2], r[2];

    var _divout[2][2] = _div256(in1, in2); //div 
    q <-- _divout[0];
    signal r_temp[2] <-- _divout[1];

    // Check whether the division is correct.
    signal (inter[2], carry1[2]) <== Mul256_unsafe()(q, in2);
    signal (res[2], carry2) <== Add256_unsafe()(inter, r_temp);
    signal (inter2[2], carry3) <== Add256_unsafe()(carry1, [carry2, 0]);
    signal check_res <== IsEqual256()(res, in1);
    check_res === 1;
    for (var i = 0; i < 2; i++) {
        inter2[i] === 0;
    }
    carry3 === 0;

    signal is_zero_denom <== IsZero256()(in2);

    //Ensure 0 <= remainder < divisor when diviser > 0
    signal lt_divisor <== LessThan256()(r_temp, in2);
    lt_divisor === 1 * (1 - is_zero_denom);

    // Return r = 0 if in2 is zero.
    r <== Mux256()(is_zero_denom, [0, 0], r_temp);
}

template AddMod256_unsafe() {
    signal input in1[2], in2[2], in3[2];
    signal output out[2];

    signal (add_res[2], carry) <== Add256_unsafe()(in1, in2);
    signal (quo[4], rem[4]) <== Div512by256_unsafe()([add_res[0], add_res[1], carry, 0], in3);

    out[0] <== rem[0];
    out[1] <== rem[1];
}

template MulMod256_unsafe() {
    signal input in1[2], in2[2], in3[2];
    signal output out[2];

    signal (mul_res[2], carry[2]) <== Mul256_unsafe()(in1, in2);
    // log("div left: ", mul_res[0], mul_res[1], carry[0], carry[1], ", div right: ", in3[0], in3[1]);
    signal (quo[4], rem[4]) <== Div512by256_unsafe()([mul_res[0], mul_res[1], carry[0], carry[1]], in3);

    out[0] <== rem[0];
    out[1] <== rem[1];
}

template SignedDiv256_unsafe() {
  signal input in1[2], in2[2];
  signal output q[2], r[2];
  signal (isNeg_in1, abs_in1[2]) <== getSignAndAbs256()(in1);
  signal (isNeg_in2, abs_in2[2]) <== getSignAndAbs256()(in2);

  signal (abs_res[2], abs_rem[2]) <== Div256_unsafe()(abs_in1, abs_in2);
  signal isNeg_res <== XOR()(isNeg_in1, isNeg_in2);

  q <== recoverSignedInteger256()(isNeg_res, abs_res);
  r <== recoverSignedInteger256()(isNeg_in1, abs_rem);
}

template _FindShiftingTwosPower(N) {
    signal input shift;
    signal output twos_power[2], is_shift_gt_255;

    // case 1
    is_shift_gt_255 <== GreaterThan(N)([shift, 255]);
    // case 2
    signal is_shift_gt_127 <== GreaterThan(N)([shift, 127]);
    // case 3: !is_shift_gt_127

    signal shift_up_inter <== (shift - 128) * is_shift_gt_127;
    signal shift_up <== (1 - is_shift_gt_255) * shift_up_inter;
    signal shift_masked <== shift * (1 - is_shift_gt_127);

    // case 2 and 3
    signal (exp_shift_case2, exp_shift_case3) <== TwosExp128TwoInput()(shift_up, shift_masked);
    signal case23_out[2] <== Mux256()(is_shift_gt_127, [0, exp_shift_case2], [exp_shift_case3, 0]);
    twos_power <== Mux256()(is_shift_gt_255, [0, 0], case23_out);
}

template ShiftLeft256_unsafe(N) {
    // This is about shifting left on a BE-represented integer.
    
    // shift: a 8-bit integer
    // in: a 256-bit integer of two 128-bit limbs (LE)
    signal input shift, in[2];
    // out: a 256-bit integer of two 128-bit limbs (LE)
    signal output out[2];

    signal (exp_shift[2], is_shift_gt_255) <== _FindShiftingTwosPower(N)(shift);
    signal (res[2], carry[2]) <== Mul256_unsafe()(in, exp_shift);
    out <== res;
}

template ShiftRight256_unsafe(N) {
    // This is about shifting right on a BE-represented integer.

    // shift: a 8-bit integer
    // in: an 256-bit integer of two 128-bit limbs (LE)
    signal input shift, in[2];
    // out: an 256-bit integer of two 128-bit limbs (LE)
    signal output out[2];
    var FIELD_SIZE = (1 << 128);

    signal (exp_shift[2], is_shift_gt_255) <== _FindShiftingTwosPower(N)(shift);
    
    var _divout[2][2] = _div256(in, exp_shift); //potential shift 
    out <-- _divout[0];
    signal rem[2] <-- _divout[1];
    // log("out: ", out[0], out[1]);
    signal restored_in_up_part[2] <== ShiftLeft256_unsafe(8)(shift, out);
    // log("in: ", in[0], in[1]);
    signal (restored_in[2], carry) <== Add256_unsafe()(restored_in_up_part, rem);
    // log("restored_in: ", restored_in[0], restored_in[1]);
    signal compare <== IsEqual256()(in, restored_in);
    signal safe_compare <== (1 - is_shift_gt_255) * compare;
    signal iszero <== IsZero256()(out);
    signal final_compare <== safe_compare + is_shift_gt_255 * iszero;
    final_compare === 1;
}

template SignExtend256_unsafe() {
    // byte_minus_one (8-bit): size in byte - 1 of the integer "in" to be sign-extended.
    // in: 256 bit integer of two 128 bit limbs to sign extend.
    signal input byte_minus_one, in[2];
    // out: 256 bit integer of two 128 bit limbs.
    signal output out[2];

    out <-- _signExtend(in, byte_minus_one);
    // log("out:", out[0], out[1]);
    signal bit_size <== byte_minus_one * 8 + 8;
    signal (masker_plus_one[2], is_size_gt_255) <== _FindShiftingTwosPower(11)(bit_size);
    signal (quo[2], masked_in[2]) <== Div256_unsafe()(in, masker_plus_one);
    signal safe_masked_in[2] <== Mux256()(is_size_gt_255, in, masked_in);
    signal expected_filler[2] <== Sub256_unsafe()([0, 0], masker_plus_one);
    signal sub_res[2] <== Sub256_unsafe()(out, safe_masked_in);
    // log("sub_res:", sub_res[0], sub_res[1]);
    // log("expected_filler:", expected_filler[0], expected_filler[1]);
    signal compare_pos_case <== IsZero256()(sub_res);
    signal compare_neg_case <== IsEqual256()(sub_res, expected_filler);
    signal safe_compare_neg_case <== (1 - is_size_gt_255) * compare_neg_case;
    signal compare <== XOR()(compare_pos_case, safe_compare_neg_case);
    compare === 1;
    
    
    // signal sign_discrimer <== bit_size - 1;

    // // Truncnate lower bits.
    // signal (divisor[2], is_exponent_gt_255) <== _FindShiftingTwosPower(11)(sign_discrimer);
    // // log("divisor: ", divisor[0], divisor[1]);
    // // if is_exponent_gt_255 = 1, diviso = 0, which is incorrect. 
    // signal (quo_in_small_div[2], rem_in_small_div[2]) <== Div256_unsafe()(in, divisor);
    // signal adjusted_quo_in[2] <== Mux256()(is_exponent_gt_255, [0, 0], quo_in_small_div);
    // signal adjusted_rem_in[2] <== Mux256()(is_exponent_gt_255, in, rem_in_small_div);
    // signal isPos_in <== IsZero256()(adjusted_quo_in);
    
    // // Filling the empty high bits.
    // signal (divisor2x[2], carry1[2]) <== Mul256_unsafe()(divisor, [2, 0]);
    // signal neg_filler[2] <== Sub256_unsafe()([0, 0], divisor2x);
    // signal filler[2] <== Mux256()(isPos_in, [0, 0], neg_filler);
    // // log("adjusted_rem_in: ", adjusted_rem_in[0], adjusted_rem_in[1]);
    // // log("filler: ", filler[0], filler[1]);
    // signal (_out[2], carry2) <== Add256_unsafe()(filler, adjusted_rem_in);
    // out <== _out;
}

template Byte256_unsafe(){
    // offset_byte: byte offset starting from the most significant byte.
    // in: 256bit integer of two 128bit limbs.
    signal input offset_byte, in[2];
    // out: 1byte integer (expected).
    signal output out;

    signal shift <== offset_byte * 8;
    signal inter1[2] <== ShiftLeft256_unsafe(11)(shift, in);
    out <== ShiftRight128_unsafe(7)(15 * 8, inter1[1]);
}

template SignedShiftRight256_unsafe(){
    // This is about shifting right on a BE-represented integer.

    // shift: a 8-bit integer
    // in: a 256-bit integer of two 128-bit limbs (LE)
    signal input shift, in[2];
    // out: a 256-bit integer of two 128-bit limbs (LE)
    signal output out[2];

    // Extract the sign
    signal (isNeg_in, abs[2]) <== getSignAndAbs256()(in);

    // // ShiftRight256
    // signal (exp_shift[2], is_shift_gt_255) <== _FindShiftingTwosPower()(shift);
    // signal (shifted_out[2], rem[2]) <== Div256_unsafe()(in, exp_shift);
    // // Filling the empty high bits.
    // signal neg_filler_unshifted[2] <== Sub256_unsafe()([0, 0], exp_shift);
    // signal filler_unshifted[2] <== Mux256()(isNeg_in, neg_filler_unshifted, [0, 0]);
    // signal (_out[2], carry) <== Add256_unsafe()(filler, shifted_out);
    // out <== _out;

    signal shifted_out[2] <== ShiftRight256_unsafe(8)(shift, in);
    signal inv_shift <== 256 - shift;
    signal (exp_shift[2], is_shift_gt_255) <== _FindShiftingTwosPower(8)(inv_shift);
    // is_shift_gt_255 = 1 & shift = 0 => no shift => filler = 0.
    // is_shift_gt_255 = 1 & shift != 0 => inv_shift is overflowed => shift is greater than 256 => neg_filler = 111...11
    signal neg_filler[2] <== Sub256_unsafe()([0, 0], exp_shift);
    signal max_filler[2] <== [2**128 - 1, 2**128 - 1];
    signal adjusted_neg_filler[2] <== Mux256()(is_shift_gt_255, max_filler, neg_filler);
    signal filler[2] <== Mux256()(isNeg_in, adjusted_neg_filler, [0, 0]);
    signal is_shift_zero <== IsZero()(shift);
    signal safe_filler[2] <== Mux256()(is_shift_zero, [0, 0], filler);
    signal (_out[2], carry) <== Add256_unsafe()(safe_filler, shifted_out);
    out <== _out;
}