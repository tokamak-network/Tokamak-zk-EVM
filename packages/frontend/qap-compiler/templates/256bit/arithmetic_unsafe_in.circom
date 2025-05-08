pragma circom 2.1.6;
include "arithmetic_unsafe_in_out.circom";
include "../512bit/arithmetic.circom";
include "../128bit/arithmetic.circom";
include "two_complement.circom";
include "../../node_modules/circomlib/circuits/gates.circom";
include "compare.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";

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
    signal check_res <== Eq256()(res, in1);
    check_res === 1;
    for (var i = 0; i < 2; i++) {
        inter2[i] === 0;
    }
    carry3 === 0;

    signal is_zero_denom <== IsZero256()(in2);

    //Ensure 0 <= remainder < divisor when diviser > 0
    signal lt_divisor <== Lt256()(r_temp, in2);
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

template ShiftLeft256_unsafe() {
    // shift: an 254-bit integer
    // in: an 256-bit integer of two 128-bit limbs (LE)
    signal input shift, in[2];
    // out: an 256-bit integer of two 128-bit limbs (LE)
    signal output out[2];
    var FIELD_SIZE = (1 << 128);

    signal is_shift_gt_255 <== GreaterThan(8)([shift, 255]);
    signal is_shift_gt_127 <== GreaterThan(7)([shift, 127]);
    signal shift_up_inter <== (shift - 128) * is_shift_gt_127;
    signal shift_up <== (1 - is_shift_gt_255) * shift_up_inter;
    signal shift_masked <== shift * (1 - is_shift_gt_127);

    // var _out[2];
    // if (shift > 255) {
    //     // case 1
    //     _out[0] = 0;
    //     _out[1] = 0;
    // } else if (shift > 127) {
    //     // case 2
    //     _out[0] = 0;
    //     _out[1] = (in[0] << shift_up) % FIELD_SIZE; 
    // } else {
    //     // case 3
    //     _out[0] = (in[0] << shift) % FIELD_SIZE;
    //     _out[1] = (in[0] << shift) / FIELD_SIZE + (in[1] << shift) % FIELD_SIZE;
    // }
    // out <-- _out;

    // Check case 1
    signal case1_out[2] <== [0, 0];
    // Check case 2 and 3
    signal (exp_shift_case2, exp_shift_case3) <== TwosExp128TwoInput()(shift_up, shift_masked);
    signal exp_shift[2] <== Mux256()(is_shift_gt_127, [0, exp_shift_case2], [exp_shift_case3, 0]);
    signal (case23_out[2], carry[2]) <== Mul256_unsafe()(in, exp_shift);

    out <== Mux256()(is_shift_gt_255, case1_out, case23_out);
}

template ShiftRight256_unsafe() {
    // shift: an 254-bit integer
    // in: an 256-bit integer of two 128-bit limbs (LE)
    signal input shift, in[2];
    // out: an 256-bit integer of two 128-bit limbs (LE)
    signal output out[2];
    var FIELD_SIZE = (1 << 128);

    signal is_shift_gt_255 <== GreaterThan(8)([shift, 255]);
    signal is_shift_gt_127 <== GreaterThan(7)([shift, 127]);
    signal shift_low_inter <== (shift - 128) * is_shift_gt_127;
    signal shift_low <== (1 - is_shift_gt_255) * shift_low_inter;
    signal shift_masked <== shift * (1 - is_shift_gt_127);

    // var _out[2];
    // if (shift > 255) {
    //     // case 1
    //     _out[0] = 0;
    //     _out[1] = 0;
    // } else if (shift > 127) {
    //     // case 2
    //     _out[0] = (in[1] >> shift_low);
    //     _out[1] = 0;
    // } else {
    //     // case 3
    //     var inv_shift = 128 - shift;
    //     _out[0] = (in[1] << inv_shift) % FIELD_SIZE + (in[0] >> shift);
    //     _out[1] = (in[1] >> shift);
    // }
    // out <-- _out;
    // Check case 1
    signal case1_out[2] <== [0, 0];
    // Check case 2 and 3
    signal (exp_shift_case2, exp_shift_case3) <== TwosExp128TwoInput()(shift_low, shift_masked);
    signal exp_shift[2] <== Mux256()(is_shift_gt_127, [0, exp_shift_case2], [exp_shift_case3, 0]);
    signal (case23_out[2], rem[2]) <== Div256_unsafe()(in, exp_shift);

    out <== Mux256()(is_shift_gt_255, case1_out, case23_out);
}

template SignExtend256_unsafe() {
    signal input sign_offset_byte, in[2];
    signal output out[2];
    signal sign_offset <== sign_offset_byte * 8;
    
    // We extract valid bits from the input by dividing it by a two's power.
    // Computing the divisor requires multiplexing.
    // case 1
    signal is_offset_gt_255 <== GreaterThan(8)([sign_offset, 255]);
    // case 2
    signal is_offset_gt_127 <== GreaterThan(7)([sign_offset, 127]);
    // case 3: !is_offset_gt_127

    signal offset_low_inter <== (sign_offset - 128) * is_offset_gt_127;
    signal offset_low <== (1 - is_offset_gt_255) * offset_low_inter;
    signal offset_masked <== sign_offset * (1 - is_offset_gt_127);

    // We fill the untouched higher bits with zeros or ones by adding the above extraction with a two's power - 1.
    signal filler_size <== 256 - (sign_offset + 1);
    // case 4
    signal is_filler_size_negative <== is_offset_gt_255;
    // case 5
    signal is_filler_size_gt_127 <== 1 - is_offset_gt_127;
    // case 6: !is_filler_size_gt_127

    signal filler_size_low_inter <== (filler_size - 128) * is_filler_size_gt_127;
    signal filler_size_low <== (1 - is_filler_size_negative) * filler_size_low_inter;
    signal filler_size_masked <== filler_size * (1 - is_filler_size_gt_127);

    // Computing the divisor and adder simultaneously.
    signal (divisor_case2, divisor_case3, filler_case5, filler_case6) <== TwosExp128FourInput()(offset_low, offset_masked, filler_size_low, filler_size_masked);

    signal divisor[2] <== Mux256()(is_offset_gt_127, [0, divisor_case2], [divisor_case3, 0]);
    signal (quo_in[2], rem_in[2]) <== Div256_unsafe()(in, divisor);

    signal filler_plus_one[2] <== Mux256()(is_filler_size_gt_127, [0, filler_case5], [filler_case6, 0]);
    signal _filler[2] <== Sub256_unsafe()(filler_plus_one, [1, 0]);

    signal isPos_in <== IsZero256()(quo_in);
    signal filler[2] <== Mux256()(isPos_in, [0, 0], _filler);
    signal (_out[2], carry) <== Add256_unsafe()(filler, rem_in);
    out <== _out;
}

template Byte256_unsafe(){
    // offset_byte: byte offset starting from the most significant byte.
    // in: 256bit integer of two 128bit limbs.
    signal input offset_byte, in[2];
    // out: 1byte integer (expected).
    signal output out;

    signal shift <== offset_byte * 8;
    signal inter1[2] <== ShiftLeft256_unsafe()(shift, in);
    out <== ShiftRight128_unsafe()(15 * 8, inter1[1]);
}

template SightShiftRight256_unsafe(){
    // shift: an 254-bit integer
    // in: an 256-bit integer of two 128-bit limbs (LE)
    signal input shift, in[2];
    // out: an 256-bit integer of two 128-bit limbs (LE)
    signal output out[2];

    signal shifted[2] <== ShiftRight256_unsafe(shift, in);

    // We fill the higher bits with zeros or ones by adding it a two's power - 1.
    signal filler_size <== 256 - shift;
    // case 1
    signal is_filler_size_256 <== IsZero256()(shifted);
    // case 2
    signal is_filler_size_gt_127 <== GreaterThan(7)([filler_size, 127]);
    // case 3: !is_filler_size_gt_127

    signal filler_size_low_inter <== (filler_size - 128) * is_filler_size_gt_127;
    signal filler_size_low <== (1 - is_filler_size_negative) * filler_size_low_inter;
    signal filler_size_masked <== filler_size * (1 - is_filler_size_gt_127);


    
}