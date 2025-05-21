pragma circom 2.1.6;
include "../../node_modules/circomlib/circuits/comparators.circom";

template Mul128_unsafe() {
    // inputs are 128 bits
    signal input in1_128, in2_128;
    // output is 128 bit limbs
    signal output out[2];
    var SUB_FIELD_SIZE = 1<<64;
    var FIELD_SIZE = 1<<128;

    signal in1[2], in2[2];
    in1[0] <-- in1_128 % SUB_FIELD_SIZE;
    in1[1] <-- in1_128 \ SUB_FIELD_SIZE;
    signal inter1 <== in1[1] * SUB_FIELD_SIZE;
    in1_128 === inter1 + in1[0];
    in2[0] <-- in2_128 % SUB_FIELD_SIZE;
    in2[1] <-- in2_128 \ SUB_FIELD_SIZE;
    signal inter2 <== in2[1] * SUB_FIELD_SIZE;
    in2_128 === inter2 + in2[0];
    signal second_inter1 <== in1[1] * in2[0];
    signal second_inter2 <== second_inter1 * SUB_FIELD_SIZE;
    signal second_inter3 <== in1[0] * in2[1];
    signal second_inter4 <== second_inter3 * SUB_FIELD_SIZE;
    signal second_inter5 <== second_inter2 + second_inter4;
    signal second <== second_inter5 + in1[0] * in2[0];
    signal t <-- second % FIELD_SIZE;
    signal t_carry <-- second \ FIELD_SIZE;
    second === t_carry * FIELD_SIZE + t;
    signal first <== in1[1] * in2[1] + t_carry;
    signal s <-- first % FIELD_SIZE;
    signal s_carry <-- first \ FIELD_SIZE;
    first === s_carry * FIELD_SIZE + s;
    out[1] <== s;
    out[0] <== t;
}

template Add128_unsafe () {
    // inputs are 128 bit
    signal input in1, in2;
    // outputs are 128 bit
    signal output out, carry;
    
    var FIELD_SIZE = 1 << 128;
    signal sum <== in1 + in2;
    out <-- (in1 + in2) % FIELD_SIZE;
    carry <-- (in1 + in2) \ FIELD_SIZE;
    sum === out + carry * FIELD_SIZE;
}

template Div128_unsafe() {
    // Need range checks on the inputs be safe.
    signal input in1, in2;
    signal output q, r;

    var _divout[2] = _div128(in1, in2); //div 
    q <-- _divout[0];
    signal r_temp <-- _divout[1];

    // Check whether the division is correct.
    signal inter[2] <== Mul128_unsafe()(q, in2);
    signal (res, carry2) <== Add128_unsafe()(inter[0], r_temp);
    signal (inter2, carry3) <== Add128_unsafe()(inter[1], carry2);
    res === in1;
    inter2 === 0;
    carry3 === 0;

    signal is_zero_denom <== IsZero()(in2);

    //Ensure 0 <= remainder < divisor when diviser > 0
    signal lt_divisor <== LessThan(128)([r_temp, in2]);
    lt_divisor === 1 * (1 - is_zero_denom);

    // Return r = 0 if in2 is zero.
    r <== (1 - is_zero_denom) * r_temp;
}

template ShiftRight128_unsafe(N) {
    // shift: a field element
    // in: an 128-bit integer
    signal input shift, in;
    // out: an 128-bit integer
    signal output out, rem, exp_shift;
    var FIELD_SIZE = (1 << 128);

    signal is_shift_gt_127 <== GreaterThan(N)([shift, 127]);
    signal shift_safe <== shift * (1 - is_shift_gt_127);
    exp_shift <== TwosExp128()(shift_safe);
    signal (quo, _rem) <== Div128_unsafe()(in, exp_shift);
    out <== quo * (1 - is_shift_gt_127);
    rem <== _rem;
}

template TwosExp128 () {
    signal input in;
    // Output: 128-bit length. 
    signal output out;

    var NUM_EXP_BITS = 7;

    signal exp[NUM_EXP_BITS];
    signal inter[NUM_EXP_BITS];
    signal temp[NUM_EXP_BITS]; // Used to detour a non-quadratic constraint error.

    signal in_bits[NUM_EXP_BITS] <== Num2Bits(NUM_EXP_BITS)(in);

    exp[0] <== 2;
    inter[0] <== 1;

    for (var i = 0; i < NUM_EXP_BITS; i++){
        temp[i] <== in_bits[i] * exp[i] + (1 - in_bits[i]);
        if(i < NUM_EXP_BITS - 1) {
            inter[i+1] <== inter[i] * temp[i];
            exp[i+1] <== exp[i] * exp[i];
        } else {
            out <== inter[i] * temp[i];
        }
    }
}

template TwosExp128TwoInput () {
    // This allow two powers share the same intermediate results.
    // Input: independent two 128-bit inputs
    signal input in1, in2;
    // Output: independent two 128-bit outputs 
    signal output out1, out2;

    var NUM_EXP_BITS = 7;

    signal exp[NUM_EXP_BITS];
    signal inter[2][NUM_EXP_BITS];
    signal temp[2][NUM_EXP_BITS]; // Used to detour a non-quadratic constraint error.

    signal in1_bits[NUM_EXP_BITS] <== Num2Bits(NUM_EXP_BITS)(in1);
    signal in2_bits[NUM_EXP_BITS] <== Num2Bits(NUM_EXP_BITS)(in2);

    exp[0] <== 2;

    for (var i = 0; i < NUM_EXP_BITS; i++){
        if(i < NUM_EXP_BITS - 1) {
            exp[i+1] <== exp[i] * exp[i];
        }
    }

    inter[0][0] <== 1;
    for (var i = 0; i < NUM_EXP_BITS; i++){
        temp[0][i] <== in1_bits[i] * exp[i] + (1 - in1_bits[i]);
        if(i < NUM_EXP_BITS - 1) {
            inter[0][i+1] <== inter[0][i] * temp[0][i];
        } else {
            out1 <== inter[0][i] * temp[0][i];
        }
    }

    inter[1][0] <== 1;
    for (var i = 0; i < NUM_EXP_BITS; i++){
        temp[1][i] <== in2_bits[i] * exp[i] + (1 - in2_bits[i]);
        if(i < NUM_EXP_BITS - 1) {
            inter[1][i+1] <== inter[1][i] * temp[1][i];
        } else {
            out2 <== inter[1][i] * temp[1][i];
        }
    }
}

template TwosExp128FourInput () {
    // This allow four two's powers share the same intermediate results.
    // Input: independent four 128-bit inputs
    signal input in1, in2, in3, in4;
    // Output: independent four 128-bit outputs 
    signal output out1, out2, out3, out4;

    var NUM_EXP_BITS = 7;

    signal exp[NUM_EXP_BITS];
    signal inter[4][NUM_EXP_BITS];
    signal temp[4][NUM_EXP_BITS]; // Used to detour a non-quadratic constraint error.

    signal in1_bits[NUM_EXP_BITS] <== Num2Bits(NUM_EXP_BITS)(in1);
    signal in2_bits[NUM_EXP_BITS] <== Num2Bits(NUM_EXP_BITS)(in2);
    signal in3_bits[NUM_EXP_BITS] <== Num2Bits(NUM_EXP_BITS)(in3);
    signal in4_bits[NUM_EXP_BITS] <== Num2Bits(NUM_EXP_BITS)(in4);

    exp[0] <== 2;

    for (var i = 0; i < NUM_EXP_BITS; i++){
        if(i < NUM_EXP_BITS - 1) {
            exp[i+1] <== exp[i] * exp[i];
        }
    }

    inter[0][0] <== 1;
    for (var i = 0; i < NUM_EXP_BITS; i++){
        temp[0][i] <== in1_bits[i] * exp[i] + (1 - in1_bits[i]);
        if(i < NUM_EXP_BITS - 1) {
            inter[0][i+1] <== inter[0][i] * temp[0][i];
        } else {
            out1 <== inter[0][i] * temp[0][i];
        }
    }

    inter[1][0] <== 1;
    for (var i = 0; i < NUM_EXP_BITS; i++){
        temp[1][i] <== in2_bits[i] * exp[i] + (1 - in2_bits[i]);
        if(i < NUM_EXP_BITS - 1) {
            inter[1][i+1] <== inter[1][i] * temp[1][i];
        } else {
            out2 <== inter[1][i] * temp[1][i];
        }
    }

    inter[2][0] <== 1;
    for (var i = 0; i < NUM_EXP_BITS; i++){
        temp[2][i] <== in3_bits[i] * exp[i] + (1 - in3_bits[i]);
        if(i < NUM_EXP_BITS - 1) {
            inter[2][i+1] <== inter[2][i] * temp[2][i];
        } else {
            out3 <== inter[2][i] * temp[2][i];
        }
    }

    inter[3][0] <== 1;
    for (var i = 0; i < NUM_EXP_BITS; i++){
        temp[3][i] <== in4_bits[i] * exp[i] + (1 - in4_bits[i]);
        if(i < NUM_EXP_BITS - 1) {
            inter[3][i+1] <== inter[3][i] * temp[3][i];
        } else {
            out4 <== inter[3][i] * temp[3][i];
        }
    }
}