pragma circom 2.1.6;
include "arithmetic_unsafe_type1.circom";
include "arithmetic_safe.circom";
include "../512bit/arithmetic.circom";
include "../128bit/arithmetic.circom";
include "two_complement_unsafe.circom";
include "../../node_modules/circomlib/circuits/gates.circom";
include "compare_safe.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";
include "../../functions/two_complement.circom";
include "../../functions/arithmetic.circom";

// Each input and output is an 256-bit integer represented by two 128-bit LE limbs; e.g.) in1[0]: lower 128 bits, in1[1]: upper 128 bits
// All templates here are based on unsafe divisions, which needs a range check on output to make it safe.

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

    /*
    //Ensure 0 <= remainder < divisor when diviser > 0
    signal lt_divisor <== LessThan256()(r_temp, in2);
    lt_divisor === 1 * (1 - is_zero_denom);
    */

    // Return r = 0 if in2 is zero.
    r <== Mux256()(is_zero_denom, [0, 0], r_temp);
}

template SignedDiv256_unsafe() {
  signal input in1[2], in2[2];
  signal output q[2], r[2];
  signal (isNeg_in1, abs_in1[2]) <== getSignAndAbs256_unsafe()(in1);
  signal (isNeg_in2, abs_in2[2]) <== getSignAndAbs256_unsafe()(in2);

  signal (abs_res[2], abs_rem[2]) <== Div256_unsafe()(abs_in1, abs_in2);
  signal isNeg_res <== XOR()(isNeg_in1, isNeg_in2);

  q <== recoverSignedInteger256_unsafe()(isNeg_res, abs_res);
  r <== recoverSignedInteger256_unsafe()(isNeg_in1, abs_rem);
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

template ShiftRight256_unsafe(N) {
    // This is about shifting right on a BE-represented integer.

    // shift: a 8-bit integer
    // in: an 256-bit integer of two 128-bit limbs (LE)
    signal input shift, in[2];
    // out: an 256-bit integer of two 128-bit limbs (LE)
    signal output out[2], rem[2], divisor[2];
    var FIELD_SIZE = (1 << 128);

    signal (exp_shift[2], is_shift_gt_255) <== FindShiftingTwosPower256(N)(shift);
    divisor <== exp_shift;
    
    var _divout[2][2] = _div256(in, exp_shift); //potential shift 
    out <-- _divout[0];
    rem <-- _divout[1];
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

template _SignExted256_internal() {
    signal input byte_minus_one, in[2], masker_plus_one[2], is_size_gt_255;
    signal output out[2], rem[2], divisor[2];

    signal (quo[2], masked_in[2]) <== Div256_unsafe()(in, masker_plus_one);
    out <-- _signExtend(in, byte_minus_one);
    rem <== masked_in;
    divisor <== Mux256()(is_size_gt_255, [0, 1<<128], masker_plus_one);
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
}

template SignExtend256_unsafe() {
    // byte_minus_one (8-bit): size in byte - 1 of the integer "in" to be sign-extended.
    // in: 256 bit integer of two 128 bit limbs to sign extend.
    signal input byte_minus_one, in[2];
    // out: 256 bit integer of two 128 bit limbs.
    signal output out[2], rem[2], divisor[2];

    // log("out:", out[0], out[1]);
    signal bit_size <== byte_minus_one * 8 + 8;
    signal (masker_plus_one[2], is_size_gt_255) <== FindShiftingTwosPower256(11)(bit_size);
    (out, rem, divisor) <== _SignExted256_internal()( byte_minus_one, in, masker_plus_one, is_size_gt_255);
}

template _Byte256_internal(){
    signal input in[2], exp_shift[2], is_shift_gt_255;
    signal output out, rem, divisor;
    signal (inter[2], carry2[2]) <== Mul256_unsafe()(in, exp_shift);
    divisor <== 1<<(15*8);
    (out, rem) <== Div128_unsafe()(inter[1], divisor);
}

template Byte256_unsafe(){
    // offset_byte: byte offset starting from the most significant byte.
    // in: 256bit integer of two 128bit limbs.
    signal input offset_byte, in[2];
    // out: 1byte integer (expected).
    signal output out, rem, divisor;

    signal shift <== offset_byte * 8;
    signal (exp_shift[2], is_shift_gt_255) <== FindShiftingTwosPower256(11)(shift);
    (out, rem, divisor) <== _Byte256_internal()(in, exp_shift, is_shift_gt_255);
}

template _SignedShiftRight256_internal(){
    signal input shift, shifted_in[2], isNeg_in, exp_inv_shift[2], is_inv_shift_gt_255;
    signal output out[2];

    // is_shift_gt_255 = 1 & shift = 0 => no shift => filler = 0.
    // is_shift_gt_255 = 1 & shift != 0 => inv_shift is overflowed => shift is greater than 256 => neg_filler = 111...11
    signal neg_filler[2] <== Sub256_unsafe()([0, 0], exp_inv_shift);
    signal max_filler[2] <== [2**128 - 1, 2**128 - 1];
    signal adjusted_neg_filler[2] <== Mux256()(is_inv_shift_gt_255, max_filler, neg_filler);
    signal filler[2] <== Mux256()(isNeg_in, adjusted_neg_filler, [0, 0]);
    signal is_shift_zero <== IsZero()(shift);
    signal safe_filler[2] <== Mux256()(is_shift_zero, [0, 0], filler);
    signal (_out[2], carry) <== Add256_unsafe()(safe_filler, shifted_in);
    out <== _out;
}


template SignedShiftRight256_unsafe(){
    // This is about shifting right on a BE-represented integer.

    // shift: a 8-bit integer
    // in: a 256-bit integer of two 128-bit limbs (LE)
    signal input shift, in[2];
    // out: a 256-bit integer of two 128-bit limbs (LE)
    signal output out[2], rem[2], divisor[2];

    // Extract the sign
    signal (isNeg_in, abs[2]) <== getSignAndAbs256_unsafe()(in);

    // // ShiftRight256
    // signal (exp_shift[2], is_shift_gt_255) <== FindShiftingTwosPower256()(shift);
    // signal (shifted_out[2], rem[2]) <== Div256_unsafe()(in, exp_shift);
    // // Filling the empty high bits.
    // signal neg_filler_unshifted[2] <== Sub256_unsafe()([0, 0], exp_shift);
    // signal filler_unshifted[2] <== Mux256()(isNeg_in, neg_filler_unshifted, [0, 0]);
    // signal (_out[2], carry) <== Add256_unsafe()(filler, shifted_out);
    // out <== _out;

    signal (shifted_in[2], _rem[2], _divisor[2]) <== ShiftRight256_unsafe(8)(shift, in);
    signal inv_shift <== 256 - shift;
    signal (exp_inv_shift[2], is_inv_shift_gt_255) <== FindShiftingTwosPower256(8)(inv_shift);
    out <== _SignedShiftRight256_internal()(shift, shifted_in, isNeg_in, exp_inv_shift, is_inv_shift_gt_255);

    rem <== _rem;
    divisor <== _divisor;
    
}