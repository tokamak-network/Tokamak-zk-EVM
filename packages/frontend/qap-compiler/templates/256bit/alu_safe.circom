pragma circom 2.1.6;
include "arithmetic_unsafe_type1.circom";
include "arithmetic_unsafe_type2.circom";
include "compare_safe.circom";
include "two_complement_unsafe.circom";
include "mux.circom";
include "../128bit/mux.circom";
include "../../node_modules/circomlib/circuits/bitify.circom";
include "../../node_modules/circomlib/circuits/gates.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";


// ALU1-5 are optimized to have constraints less than 1024
template ALU1 () {
    var NUM_TOTAL_FUNCTIONS = 29; // number of functions over all ALUs
    var NUM_SELECTOR_BITS = NUM_TOTAL_FUNCTIONS + 1;
    var NUM_ALU_FUNCTIONS = 6; // number of functions in this ALU
    // selector is expected to 2^(opcode).
    signal input in1[2], in2[2], in3[2], selector;
    signal output out1[2], out2[2];

    // b_selector[Opcode] = 1, b_selector[i] = 0 for all i != Opcode.
    // selector bitification
    signal b_selector[NUM_SELECTOR_BITS] <== Num2Bits(NUM_SELECTOR_BITS)(selector);

    /* Input range check can be omitted, as each subcircuit will be connected to other subcircuits.
    // // Check inputs are in 128 bit limbs
    // CheckBus()(in1);
    // CheckBus()(in2);
    // CheckBus()(in3);
    */

    // signal is_in1_1_zero <== IsZero()(in1[1]);
    // signal is_in2_zero <== IsZero256()(in2);
    // signal is_in3_zero <== IsZero256()(in3);
    // signal is_in3_1_zero <== IsZero()(in3[1]);

    signal outs1[NUM_ALU_FUNCTIONS][2];
    signal outs2[NUM_ALU_FUNCTIONS][2];
    signal flags[NUM_ALU_FUNCTIONS];
    var ind = 0;

    // operator 0x01: add
    component add = Add256_unsafe();
    add.in1 <== in1;
    add.in2 <== in2;
    outs1[ind] <== add.out;
    outs2[ind] <== [0, 0];
    flags[ind] <== b_selector[1];
    ind++;

    // operator 0x02: mul
    component mul = Mul256_unsafe();
    mul.in1 <== in1;
    mul.in2 <== in2;
    outs1[ind] <== mul.out;
    outs2[ind] <== [0, 0];
    flags[ind] <== b_selector[2];
    ind++;

    // operator 0x03: sub
    component sub = Sub256_unsafe();
    sub.in1 <== in1;
    sub.in2 <== in2;
    outs1[ind] <== sub.out;
    outs2[ind] <== [0, 0];
    flags[ind] <== b_selector[3];
    ind++;

    // // operator 0x0A (10): EXP (SubExp)
    // component subexp = SubExp_unsafe();
    // subexp.c_prev <== in1;
    // subexp.a_prev <== in2;
    // subexp.b <== in3[0];
    // outs1[ind] <== subexp.c_next;
    // outs2[ind] <== subexp.a_next;
    // flags[ind] <== b_selector[10];
    // ind++;

    // operator 0x14 (20): eq
    component eq = IsEqual256();
    eq.in1 <== in1;
    eq.in2 <== in2;
    outs1[ind] <== [eq.out, 0];
    outs2[ind] <== [0, 0];
    flags[ind] <== b_selector[20];
    ind++;

    // operator 0x15 (21): iszero
    component iszero = IsZero256();
    iszero.in <== in1;
    outs1[ind] <== [iszero.out, 0];
    outs2[ind] <== [0, 0];
    flags[ind] <== b_selector[21];
    ind++;
    // is_in2_zero * b_selector[21] + (1 - b_selector[21]) === 1;

    // operator 0x19 (25): not
    component not = Not256_unsafe();
    not.in <== in1;
    outs1[ind] <== not.out;
    outs2[ind] <== [0, 0];
    flags[ind] <== b_selector[25];
    ind++;
    // is_in2_zero * b_selector[25] + (1 - b_selector[25]) === 1;

    component mux1 = ComplexMux256_unsafe(NUM_ALU_FUNCTIONS);
    mux1.selector <== flags;
    mux1.ins <== outs1;
    out1 <== mux1.out;

    component mux2 = ComplexMux256_unsafe(NUM_ALU_FUNCTIONS);
    mux2.selector <== flags;
    mux2.ins <== outs2;
    out2 <== mux2.out;

    // Check outputs are in 128 bit limbs
    CheckBus()(out1);
    CheckBus()(out2);
}

template _SafeDivisor(){
    signal input divisor_raw[2];
    signal output divisor_safe[2];
    signal is_zero_div <== IsZero256()(divisor_raw);
    signal divisor_replace[2] <== [0, 1<<128];
    divisor_safe <== Mux256()(is_zero_div,  divisor_replace, divisor_raw);
}

template ALU2 () {
    var NUM_TOTAL_FUNCTIONS = 29; // number of functions in the ALU
    var NUM_SELECTOR_BITS = NUM_TOTAL_FUNCTIONS + 1;
    var NUM_ALU_FUNCTIONS = 6;
    // selector is expected to 2^(opcode).
    signal input in1[2], in2[2], in3[2], selector;
    signal output out[2];

    // b_selector[Opcode] = 1, b_selector[i] = 0 for all i != Opcode.
    // selector bitification
    signal b_selector[NUM_SELECTOR_BITS] <== Num2Bits(NUM_SELECTOR_BITS)(selector);

    /* Input range check can be omitted, as each subcircuit will be connected to other subcircuits.
    // // Check inputs are in 128 bit limbs
    // CheckBus()(in1);
    // CheckBus()(in2);
    */

    signal outs[NUM_ALU_FUNCTIONS][2];
    signal rems[NUM_ALU_FUNCTIONS][2];
    signal divisors[NUM_ALU_FUNCTIONS][2];
    signal flags[NUM_ALU_FUNCTIONS];
    var ind = 0;

    // operator 0x04: div
    component div = Div256_unsafe();
    div.in1 <== in1;
    div.in2 <== in2;
    outs[ind] <== div.q;
    rems[ind] <== div.r;
    divisors[ind] <== _SafeDivisor()(div.in2);
    flags[ind] <== b_selector[4];
    ind++;

    // operator 0x06: mod
    outs[ind] <== div.r;
    rems[ind] <== div.r;
    divisors[ind] <== _SafeDivisor()(div.in2);
    flags[ind] <== b_selector[6];
    ind++;

    // common process for sdiv and smod
    signal (isNeg_in1, abs_in1[2]) <== getSignAndAbs256_unsafe()(in1);
    signal (isNeg_in2, abs_in2[2]) <== getSignAndAbs256_unsafe()(in2);

    signal (abs_res[2], abs_rem[2]) <== Div256_unsafe()(abs_in1, abs_in2);
    signal isNeg_res <== XOR()(isNeg_in1, isNeg_in2);

    signal q[2] <== recoverSignedInteger256_unsafe()(isNeg_res, abs_res);
    signal r[2] <== recoverSignedInteger256_unsafe()(isNeg_in1, abs_rem);

    // operator 0x05: sdiv
    outs[ind] <== q;
    rems[ind] <== abs_rem;
    divisors[ind] <== _SafeDivisor()(abs_in2);
    flags[ind] <== b_selector[5];
    ind++;

    // operator 0x07: smod
    outs[ind] <== r;
    rems[ind] <== abs_rem;
    divisors[ind] <== _SafeDivisor()(abs_in2);
    flags[ind] <== b_selector[7];
    ind++;

    // operator 0x08 :ADDMOD
    component addmod = AddMod256_unsafe();
    addmod.in1 <== in1;
    addmod.in2 <== in2;
    addmod.in3 <== in3;
    outs[ind] <== addmod.out;
    rems[ind] <== addmod.out;
    divisors[ind] <== _SafeDivisor()(in3);
    flags[ind] <== b_selector[8];
    ind++;

    // operator 0x09 :MULMOD
    component mulmod = MulMod256_unsafe();
    mulmod.in1 <== in1;
    mulmod.in2 <== in2;
    mulmod.in3 <== in3;
    outs[ind] <== mulmod.out;
    rems[ind] <== mulmod.out;
    divisors[ind] <== _SafeDivisor()(in3);
    flags[ind] <== b_selector[9];
    ind++;

    component mux1 = ComplexMux256_unsafe(NUM_ALU_FUNCTIONS);
    mux1.selector <== flags;
    mux1.ins <== outs;
    out <== mux1.out;

    component mux2 = ComplexMux256_unsafe(NUM_ALU_FUNCTIONS);
    mux2.selector <== flags;
    mux2.ins <== rems;
    signal rem[2] <== mux2.out;

    component mux3 = ComplexMux256_unsafe(NUM_ALU_FUNCTIONS);
    mux3.selector <== flags;
    mux3.ins <== divisors;
    signal divisor[2] <== mux3.out;

    // Check the remainders are less than in2
    signal range_check <== LessThan256()(rem, divisor);
    range_check === 1;
}

template ALU3 () {
    var NUM_TOTAL_FUNCTIONS = 29; // number of functions in the ALU
    var NUM_SELECTOR_BITS = NUM_TOTAL_FUNCTIONS + 1;
    var NUM_ALU_FUNCTIONS = 3;
    // selector is expected to 2^(opcode).
    // in1 (shift) is assumed to be 1 byte (for optimization).
    signal input in1[2], in2[2], selector;
    signal output out[2];

    // b_selector[Opcode] = 1, b_selector[i] = 0 for all i != Opcode.
    // selector bitification
    signal b_selector[NUM_SELECTOR_BITS] <== Num2Bits(NUM_SELECTOR_BITS)(selector);

    /* Input range check can be omitted, as each subcircuit will be connected to other subcircuits.
    // // Check inputs are in 128 bit limbs
    // CheckBus()(in1);
    // CheckBus()(in2);
    */

    signal outs[NUM_ALU_FUNCTIONS][2];
    signal rems[NUM_ALU_FUNCTIONS][2];
    signal divisors[NUM_ALU_FUNCTIONS][2];
    signal flags[NUM_ALU_FUNCTIONS];
    var ind = 0;

    // common process for SHL, SHR, SAR
    signal inv_shift <== 256 - in1[0];
    signal (exp_shift[2], is_shift_gt_255, exp_inv_shift[2], is_inv_shift_gt_255) <== FindShiftingTwosPower256TwoInput(8, 8)(in1[0], inv_shift);

    // operator 0x1B (27): SHL
    component lshift = Mul256_unsafe();
    lshift.in1 <== in2;
    lshift.in2 <== exp_shift;
    outs[ind] <== lshift.out;
    signal shl_range_check <== LessEqThan(128)([lshift.out[0], (1<<128) - 1]);
    shl_range_check === 1;
    rems[ind] <== lshift.out;
    divisors[ind] <== [0, 1<<128];
    flags[ind] <== b_selector[27];
    ind++;

    // operator 0x1C (28): SHR
    // in1[0] is assumed to be less than 256. Otherwise, assertion error.
    component rshift = Div256_unsafe();
    rshift.in1 <== in2;
    rshift.in2 <== exp_shift;
    outs[ind] <== rshift.q;
    rems[ind] <== rshift.r;
    divisors[ind] <== _SafeDivisor()(exp_shift);
    flags[ind] <== b_selector[28];
    ind++;

    // operator 0x1D (29): SAR
    signal (isNeg_in, abs[2]) <== getSignAndAbs256_unsafe()(in2);
    component sar = _SignedShiftRight256_internal();
    sar.shift <== in1[0];
    sar.shifted_in <== rshift.q;
    sar.isNeg_in <== isNeg_in;
    sar.exp_inv_shift <== exp_inv_shift;
    sar.is_inv_shift_gt_255 <== is_inv_shift_gt_255;
    outs[ind] <== sar.out;
    rems[ind] <== rshift.r;
    divisors[ind] <== divisors[ind - 1];
    flags[ind] <== b_selector[29];
    ind++;

    component mux1 = ComplexMux256_unsafe(NUM_ALU_FUNCTIONS);
    mux1.selector <== flags;
    mux1.ins <== outs;
    out <== mux1.out;

    component mux2 = ComplexMux256_unsafe(NUM_ALU_FUNCTIONS);
    mux2.selector <== flags;
    mux2.ins <== rems;
    signal rem[2] <== mux2.out;

    component mux3 = ComplexMux256_unsafe(NUM_ALU_FUNCTIONS);
    mux3.selector <== flags;
    mux3.ins <== divisors;
    signal divisor[2] <== mux3.out;

    // Check the remainders are less than in2
    signal range_check <== LessThan256()(rem, divisor);
    range_check === 1;
}


template ALU4 () {
    var NUM_TOTAL_FUNCTIONS = 29; // number of functions in the ALU
    var NUM_SELECTOR_BITS = NUM_TOTAL_FUNCTIONS + 1;
    var NUM_ALU_FUNCTIONS = 4;
    // selector is expected to 2^(opcode).
    signal input in1[2], in2[2], selector;
    signal output out[2];

    // b_selector[Opcode] = 1, b_selector[i] = 0 for all i != Opcode.
    // selector bitification
    signal b_selector[NUM_SELECTOR_BITS] <== Num2Bits(NUM_SELECTOR_BITS)(selector);

    signal outs[NUM_ALU_FUNCTIONS];
    signal flags[NUM_ALU_FUNCTIONS];
    var ind = 0;

    // common process for LT, GT, and SGT, 
    signal lt_lower_out <== LessThan(128)([in1[0], in2[0]]);
    signal lt_upper_out <== LessThan(128)([in1[1], in2[1]]);
    signal is_upper_eq <== IsEqual()([in1[1], in2[1]]);
    signal is_lower_eq <== IsEqual()([in1[0], in2[0]]);
    signal is_eq <== is_upper_eq * is_lower_eq;

    signal is_upper_lt <== (1 - is_upper_eq) * lt_upper_out;
    signal is_lower_lt <== is_upper_eq * lt_lower_out;

    // operator 0x10 (16): LT
    signal is_lt256 <== is_upper_lt + is_lower_lt;
    outs[ind] <== is_lt256;
    flags[ind] <== b_selector[16];
    ind++;

    // operator 0x11 (17): GT
    outs[ind] <== (1 - is_lt256) * (1 - is_eq);
    flags[ind] <== b_selector[17];
    ind++;

    // direct implementation of SLT
    signal (isNeg_in1, abs_in1[2]) <== getSignAndAbs256_unsafe()(in1);
    signal (isNeg_in2, abs_in2[2]) <== getSignAndAbs256_unsafe()(in2);

    signal abs_lt_lower_out <== LessThan(128)([abs_in1[0], abs_in2[0]]);
    signal abs_lt_upper_out <== LessThan(128)([abs_in1[1], abs_in2[1]]);
    signal is_abs_upper_eq <== IsEqual()([abs_in1[1], abs_in2[1]]);
    signal is_abs_lower_eq <== IsEqual()([abs_in1[0], abs_in2[0]]);
    signal is_abs_eq <== is_abs_upper_eq * is_abs_lower_eq;

    signal is_abs_upper_lt <== (1 - is_abs_upper_eq) * abs_lt_upper_out;
    signal is_abs_lower_lt <== is_abs_upper_eq * abs_lt_lower_out;
    signal is_abs_lt256 <== is_abs_upper_lt + is_abs_lower_lt;
    signal is_abs_gt256 <== (1 - is_abs_lt256) * (1 - is_abs_eq);

    signal sign_xor_out <== XOR()(isNeg_in1, isNeg_in2);

    signal inter1 <== sign_xor_out * isNeg_in1;
    signal inter2 <== is_abs_lt256 * (1 - isNeg_in1);
    signal inter3 <== is_abs_gt256 * isNeg_in1;
    signal inter4 <== OR()(inter2, inter3);
    signal inter5 <== sign_xor_out * isNeg_in1;
    

    // operator 0x12 (18): SLT
    signal is_slt256 <== (1 - sign_xor_out) * inter4 + inter5;
    outs[ind] <== is_slt256;
    flags[ind] <== b_selector[18];
    ind++;

    // operator 0x13 (19): SGT
    outs[ind] <== (1 - is_slt256) * (1 - is_eq);
    flags[ind] <== b_selector[19];
    ind++;

    component mux = ComplexMux128_unsafe(NUM_ALU_FUNCTIONS);
    mux.selector <== flags;
    mux.ins <== outs;
    out <== [mux.out, 0];
}

template ALU5 () {
    var NUM_TOTAL_FUNCTIONS = 29; // number of functions in the ALU
    var NUM_SELECTOR_BITS = NUM_TOTAL_FUNCTIONS + 1;
    var NUM_ALU_FUNCTIONS = 2;
    // selector is expected to 2^(opcode).
    // in1 (shift) is assumed to be 1 byte (for optimization).
    signal input in1[2], in2[2], selector;
    signal output out[2];

    // b_selector[Opcode] = 1, b_selector[i] = 0 for all i != Opcode.
    // selector bitification
    signal b_selector[NUM_SELECTOR_BITS] <== Num2Bits(NUM_SELECTOR_BITS)(selector);

    /* Input range check can be omitted, as each subcircuit will be connected to other subcircuits.
    // // Check inputs are in 128 bit limbs
    // CheckBus()(in1);
    // CheckBus()(in2);
    */

    signal outs[NUM_ALU_FUNCTIONS][2];
    signal rems[NUM_ALU_FUNCTIONS][2];
    signal divisors[NUM_ALU_FUNCTIONS][2];
    signal flags[NUM_ALU_FUNCTIONS];
    var ind = 0;

    // common process for SIGNEXTEND and BYTE
    // in1[0] is assumed to be less than 32. Otherwise, assertion error.
    signal (SE_exp_shift[2], SE_is_shift_gt_255, BY_exp_shift[2], BY_is_shift_gt_255) <== FindShiftingTwosPower256TwoInput(11, 11)(in1[0] * 8 + 8, in1[0] * 8);

    // operator 0x0B (11): SIGNEXTEND
    // in[0] * 8 + 8: bit length
    component signExtend = _SignExted256_internal();
    signExtend.masker_plus_one <== SE_exp_shift;
    signExtend.is_size_gt_255 <== SE_is_shift_gt_255;
    signExtend.byte_minus_one <== in1[0];
    signExtend.in <== in2;
    outs[ind] <== signExtend.out;
    rems[ind] <== signExtend.rem;
    divisors[ind] <== signExtend.divisor;
    flags[ind] <== b_selector[11];
    ind++;

    // operator 0x1A (26): BYTE
    component byte_ = _Byte256_internal();
    byte_.exp_shift <== BY_exp_shift;
    byte_.is_shift_gt_255 <== BY_is_shift_gt_255;
    byte_.in <== in2;
    outs[ind] <== [byte_.out, 0];
    rems[ind] <== [byte_.rem, 0];
    divisors[ind] <== [byte_.divisor, 0];
    flags[ind] <== b_selector[26];
    ind++;

    component mux1 = ComplexMux256_unsafe(NUM_ALU_FUNCTIONS);
    mux1.selector <== flags;
    mux1.ins <== outs;
    out <== mux1.out;

    component mux2 = ComplexMux256_unsafe(NUM_ALU_FUNCTIONS);
    mux2.selector <== flags;
    mux2.ins <== rems;
    signal rem[2] <== mux2.out;

    component mux3 = ComplexMux256_unsafe(NUM_ALU_FUNCTIONS);
    mux3.selector <== flags;
    mux3.ins <== divisors;
    signal divisor[2] <== mux3.out;

    // Check the remainders are less than in2
    signal range_check <== LessThan256()(rem, divisor);
    range_check === 1;
}


// n=2048
// ALU1 + ALU4
template ALU_basic () {
    var NUM_TOTAL_FUNCTIONS = 29; // number of functions over all ALUs
    var NUM_SELECTOR_BITS = NUM_TOTAL_FUNCTIONS + 1;
    var NUM_ALU_FUNCTIONS = 11; // number of functions in this ALU
    // selector is expected to 2^(opcode).
    signal input in1[2], in2[2], in3[2], selector;
    signal output out1[2], out2[2];

    // b_selector[Opcode] = 1, b_selector[i] = 0 for all i != Opcode.
    // selector bitification
    signal b_selector[NUM_SELECTOR_BITS] <== Num2Bits(NUM_SELECTOR_BITS)(selector);

    /* Input range check can be omitted, as each subcircuit will be connected to other subcircuits.
    // // Check inputs are in 128 bit limbs
    // CheckBus()(in1);
    // CheckBus()(in2);
    // CheckBus()(in3);
    */

    // signal is_in1_1_zero <== IsZero()(in1[1]);
    // signal is_in2_zero <== IsZero256()(in2);
    // signal is_in3_zero <== IsZero256()(in3);
    // signal is_in3_1_zero <== IsZero()(in3[1]);

    signal outs1[NUM_ALU_FUNCTIONS][2];
    signal outs2[NUM_ALU_FUNCTIONS][2];
    signal flags[NUM_ALU_FUNCTIONS];
    var ind = 0;

    // operator 0x01: add
    component add = Add256_unsafe();
    add.in1 <== in1;
    add.in2 <== in2;
    outs1[ind] <== add.out;
    outs2[ind] <== [0, 0];
    flags[ind] <== b_selector[1];
    ind++;

    // operator 0x02: mul
    component mul = Mul256_unsafe();
    mul.in1 <== in1;
    mul.in2 <== in2;
    outs1[ind] <== mul.out;
    outs2[ind] <== [0, 0];
    flags[ind] <== b_selector[2];
    ind++;

    // operator 0x03: sub
    component sub = Sub256_unsafe();
    sub.in1 <== in1;
    sub.in2 <== in2;
    outs1[ind] <== sub.out;
    outs2[ind] <== [0, 0];
    flags[ind] <== b_selector[3];
    ind++;

    // operator 0x0A (10): EXP (SubExp)
    component subexp = SubExp_unsafe();
    subexp.c_prev <== in1;
    subexp.a_prev <== in2;
    subexp.b <== in3[0];
    outs1[ind] <== subexp.c_next;
    outs2[ind] <== subexp.a_next;
    flags[ind] <== b_selector[10];
    ind++;

    // common process for LT, GT, and SGT, 
    signal lt_lower_out <== LessThan(128)([in1[0], in2[0]]);
    signal lt_upper_out <== LessThan(128)([in1[1], in2[1]]);
    signal is_upper_eq <== IsEqual()([in1[1], in2[1]]);
    signal is_lower_eq <== IsEqual()([in1[0], in2[0]]);
    signal is_eq <== is_upper_eq * is_lower_eq;

    signal is_upper_lt <== (1 - is_upper_eq) * lt_upper_out;
    signal is_lower_lt <== is_upper_eq * lt_lower_out;

    // operator 0x10 (16): LT
    signal is_lt256 <== is_upper_lt + is_lower_lt;
    outs1[ind] <== [is_lt256, 0];
    outs2[ind] <== [0, 0];
    flags[ind] <== b_selector[16];
    ind++;

    // operator 0x11 (17): GT
    outs1[ind] <== [(1 - is_lt256) * (1 - is_eq), 0];
    outs2[ind] <== [0, 0];
    flags[ind] <== b_selector[17];
    ind++;

    // direct implementation of SLT
    signal (isNeg_in1, abs_in1[2]) <== getSignAndAbs256_unsafe()(in1);
    signal (isNeg_in2, abs_in2[2]) <== getSignAndAbs256_unsafe()(in2);

    signal abs_lt_lower_out <== LessThan(128)([abs_in1[0], abs_in2[0]]);
    signal abs_lt_upper_out <== LessThan(128)([abs_in1[1], abs_in2[1]]);
    signal is_abs_upper_eq <== IsEqual()([abs_in1[1], abs_in2[1]]);
    signal is_abs_lower_eq <== IsEqual()([abs_in1[0], abs_in2[0]]);
    signal is_abs_eq <== is_abs_upper_eq * is_abs_lower_eq;

    signal is_abs_upper_lt <== (1 - is_abs_upper_eq) * abs_lt_upper_out;
    signal is_abs_lower_lt <== is_abs_upper_eq * abs_lt_lower_out;
    signal is_abs_lt256 <== is_abs_upper_lt + is_abs_lower_lt;
    signal is_abs_gt256 <== (1 - is_abs_lt256) * (1 - is_abs_eq);

    signal sign_xor_out <== XOR()(isNeg_in1, isNeg_in2);

    signal inter1 <== sign_xor_out * isNeg_in1;
    signal inter2 <== is_abs_lt256 * (1 - isNeg_in1);
    signal inter3 <== is_abs_gt256 * isNeg_in1;
    signal inter4 <== OR()(inter2, inter3);
    signal inter5 <== sign_xor_out * isNeg_in1;
    
    // operator 0x12 (18): SLT
    signal is_slt256 <== (1 - sign_xor_out) * inter4 + inter5;
    outs1[ind] <== [is_slt256, 0];
    outs2[ind] <== [0, 0];
    flags[ind] <== b_selector[18];
    ind++;

    // operator 0x13 (19): SGT
    outs1[ind] <== [(1 - is_slt256) * (1 - is_eq), 0];
    outs2[ind] <== [0, 0];
    flags[ind] <== b_selector[19];
    ind++;

    // operator 0x14 (20): eq
    component eq = IsEqual256();
    eq.in1 <== in1;
    eq.in2 <== in2;
    outs1[ind] <== [eq.out, 0];
    outs2[ind] <== [0, 0];
    flags[ind] <== b_selector[20];
    ind++;

    // operator 0x15 (21): iszero
    component iszero = IsZero256();
    iszero.in <== in1;
    outs1[ind] <== [iszero.out, 0];
    outs2[ind] <== [0, 0];
    flags[ind] <== b_selector[21];
    ind++;
    // is_in2_zero * b_selector[21] + (1 - b_selector[21]) === 1;

    // operator 0x19 (25): not
    component not = Not256_unsafe();
    not.in <== in1;
    outs1[ind] <== not.out;
    outs2[ind] <== [0, 0];
    flags[ind] <== b_selector[25];
    ind++;
    // is_in2_zero * b_selector[25] + (1 - b_selector[25]) === 1;

    component mux1 = ComplexMux256_unsafe(NUM_ALU_FUNCTIONS);
    mux1.selector <== flags;
    mux1.ins <== outs1;
    out1 <== mux1.out;

    component mux2 = ComplexMux256_unsafe(NUM_ALU_FUNCTIONS);
    mux2.selector <== flags;
    mux2.ins <== outs2;
    out2 <== mux2.out;

    // Check outputs are in 128 bit limbs
    CheckBus()(out1);
    CheckBus()(out2);
}

// Error: in1[2] can't be used as both shifting index and field element
// ALU2 + ALU3 + ALU5
template ALU_based_on_div () {
    var NUM_TOTAL_FUNCTIONS = 29; // number of functions in the ALU
    var NUM_SELECTOR_BITS = NUM_TOTAL_FUNCTIONS + 1;
    var NUM_ALU_FUNCTIONS = 11;
    // selector is expected to 2^(opcode).
    signal input in1[2], in2[2], in3[2], selector;
    signal output out[2];

    // b_selector[Opcode] = 1, b_selector[i] = 0 for all i != Opcode.
    // selector bitification
    signal b_selector[NUM_SELECTOR_BITS] <== Num2Bits(NUM_SELECTOR_BITS)(selector);

    /* Input range check can be omitted, as each subcircuit will be connected to other subcircuits.
    // // Check inputs are in 128 bit limbs
    // CheckBus()(in1);
    // CheckBus()(in2);
    */

    signal outs[NUM_ALU_FUNCTIONS][2];
    signal rems[NUM_ALU_FUNCTIONS][2];
    signal divisors[NUM_ALU_FUNCTIONS][2];
    signal flags[NUM_ALU_FUNCTIONS];
    var ind = 0;

    // operator 0x04: div
    component div = Div256_unsafe();
    div.in1 <== in1;
    div.in2 <== in2;
    outs[ind] <== div.q;
    rems[ind] <== div.r;
    divisors[ind] <== _SafeDivisor()(div.in2);
    flags[ind] <== b_selector[4];
    ind++;

    // operator 0x06: mod
    outs[ind] <== div.r;
    rems[ind] <== div.r;
    divisors[ind] <== _SafeDivisor()(div.in2);
    flags[ind] <== b_selector[6];
    ind++;

    // common process for sdiv and smod
    signal (isNeg_in1, abs_in1[2]) <== getSignAndAbs256_unsafe()(in1);
    signal (isNeg_in2, abs_in2[2]) <== getSignAndAbs256_unsafe()(in2);

    signal (abs_res[2], abs_rem[2]) <== Div256_unsafe()(abs_in1, abs_in2);
    signal isNeg_res <== XOR()(isNeg_in1, isNeg_in2);

    signal q[2] <== recoverSignedInteger256_unsafe()(isNeg_res, abs_res);
    signal r[2] <== recoverSignedInteger256_unsafe()(isNeg_in1, abs_rem);

    // operator 0x05: sdiv
    outs[ind] <== q;
    rems[ind] <== abs_rem;
    divisors[ind] <== _SafeDivisor()(abs_in2);
    flags[ind] <== b_selector[5];
    ind++;

    // operator 0x07: smod
    outs[ind] <== r;
    rems[ind] <== abs_rem;
    divisors[ind] <== _SafeDivisor()(abs_in2);
    flags[ind] <== b_selector[7];
    ind++;

    // operator 0x08 :ADDMOD
    component addmod = AddMod256_unsafe();
    addmod.in1 <== in1;
    addmod.in2 <== in2;
    addmod.in3 <== in3;
    outs[ind] <== addmod.out;
    rems[ind] <== addmod.out;
    divisors[ind] <== _SafeDivisor()(in3);
    flags[ind] <== b_selector[8];
    ind++;

    // operator 0x09 :MULMOD
    component mulmod = MulMod256_unsafe();
    mulmod.in1 <== in1;
    mulmod.in2 <== in2;
    mulmod.in3 <== in3;
    outs[ind] <== mulmod.out;
    rems[ind] <== mulmod.out;
    divisors[ind] <== _SafeDivisor()(in3);
    flags[ind] <== b_selector[9];
    ind++;

    // common process for SIGNEXTEND and BYTE
    // in1[0] is assumed to be less than 32. Otherwise, assertion error.
    signal (SE_exp_shift[2], SE_is_shift_gt_255, BY_exp_shift[2], BY_is_shift_gt_255) <== FindShiftingTwosPower256TwoInput(11, 11)(in1[0] * 8 + 8, in1[0] * 8);

    // operator 0x0B (11): SIGNEXTEND
    // in[0] * 8 + 8: bit length
    component signExtend = _SignExted256_internal();
    signExtend.masker_plus_one <== SE_exp_shift;
    signExtend.is_size_gt_255 <== SE_is_shift_gt_255;
    signExtend.byte_minus_one <== in1[0];
    signExtend.in <== in2;
    outs[ind] <== signExtend.out;
    rems[ind] <== signExtend.rem;
    divisors[ind] <== signExtend.divisor;
    flags[ind] <== b_selector[11];
    ind++;

    // operator 0x1A (26): BYTE
    component byte_ = _Byte256_internal();
    byte_.exp_shift <== BY_exp_shift;
    byte_.is_shift_gt_255 <== BY_is_shift_gt_255;
    byte_.in <== in2;
    outs[ind] <== [byte_.out, 0];
    rems[ind] <== [byte_.rem, 0];
    divisors[ind] <== [byte_.divisor, 0];
    flags[ind] <== b_selector[26];
    ind++;

    // common process for SHL, SHR, SAR
    signal inv_shift <== 256 - in1[0];
    signal (exp_shift[2], is_shift_gt_255, exp_inv_shift[2], is_inv_shift_gt_255) <== FindShiftingTwosPower256TwoInput(8, 8)(in1[0], inv_shift);

    // operator 0x1B (27): SHL
    component lshift = Mul256_unsafe();
    lshift.in1 <== in2;
    lshift.in2 <== exp_shift;
    outs[ind] <== lshift.out;
    signal shl_range_check <== LessEqThan(128)([lshift.out[0], (1<<128) - 1]);
    shl_range_check === 1;
    rems[ind] <== lshift.out;
    divisors[ind] <== [0, 1<<128];
    flags[ind] <== b_selector[27];
    ind++;

    // operator 0x1C (28): SHR
    // in1[0] is assumed to be less than 256. Otherwise, assertion error.
    component rshift = Div256_unsafe();
    rshift.in1 <== in2;
    rshift.in2 <== exp_shift;
    outs[ind] <== rshift.q;
    rems[ind] <== rshift.r;
    divisors[ind] <== _SafeDivisor()(exp_shift);
    flags[ind] <== b_selector[28];
    ind++;

    // operator 0x1D (29): SAR
    signal (isNeg_in, abs[2]) <== getSignAndAbs256_unsafe()(in2);
    component sar = _SignedShiftRight256_internal();
    sar.shift <== in1[0];
    sar.shifted_in <== rshift.q;
    sar.isNeg_in <== isNeg_in;
    sar.exp_inv_shift <== exp_inv_shift;
    sar.is_inv_shift_gt_255 <== is_inv_shift_gt_255;
    outs[ind] <== sar.out;
    rems[ind] <== rshift.r;
    divisors[ind] <== divisors[ind - 1];
    flags[ind] <== b_selector[29];
    ind++;

    component mux1 = ComplexMux256_unsafe(NUM_ALU_FUNCTIONS);
    mux1.selector <== flags;
    mux1.ins <== outs;
    out <== mux1.out;

    component mux2 = ComplexMux256_unsafe(NUM_ALU_FUNCTIONS);
    mux2.selector <== flags;
    mux2.ins <== rems;
    signal rem[2] <== mux2.out;

    component mux3 = ComplexMux256_unsafe(NUM_ALU_FUNCTIONS);
    mux3.selector <== flags;
    mux3.ins <== divisors;
    signal divisor[2] <== mux3.out;

    // Check the remainders are less than in2
    signal range_check <== LessThan256()(rem, divisor);
    range_check === 1;
}

template ALU_bitwise () {
    var NUM_TOTAL_FUNCTIONS = 29; // number of functions over all ALUs
    var NUM_SELECTOR_BITS = NUM_TOTAL_FUNCTIONS + 1;
    var NUM_ALU_FUNCTIONS = 3; // number of functions in this ALU
    // selector is expected to 2^(opcode).
    signal input in1[2], in2[2], selector;
    signal output out[2];

    // b_selector[Opcode] = 1, b_selector[i] = 0 for all i != Opcode.
    // selector bitification
    signal b_selector[NUM_SELECTOR_BITS] <== Num2Bits(NUM_SELECTOR_BITS)(selector);

    /* Input range check can be omitted, as each subcircuit will be connected to other subcircuits.
    // // Check inputs are in 128 bit limbs
    // CheckBus()(in1);
    // CheckBus()(in2);
    // CheckBus()(in3);
    */

    // signal is_in1_1_zero <== IsZero()(in1[1]);
    // signal is_in2_zero <== IsZero256()(in2);
    // signal is_in3_zero <== IsZero256()(in3);
    // signal is_in3_1_zero <== IsZero()(in3[1]);

    signal outs[NUM_ALU_FUNCTIONS][2];
    signal flags[NUM_ALU_FUNCTIONS];
    var ind = 0;

    // common process for AND, OR, and XOR
    var NUM_BITS = 128;
    // signal in1_bin[NUM_BITS] <== Num2Bits(NUM_BITS)(in1);
    // signal in2_bin[NUM_BITS] <== Num2Bits(NUM_BITS)(in2);
    component n2b[2][2];
    for (var i = 0; i < 2; i++) {
        for (var j = 0; j < 2; j++) {
            n2b[i][j] = Num2Bits(NUM_BITS);
        }
    }
    n2b[0][0].in <== in1[0];
    n2b[0][1].in <== in1[1];
    n2b[1][0].in <== in2[0];
    n2b[1][1].in <== in2[1];
    signal in1_bin_lower[NUM_BITS] <== n2b[0][0].out;
    signal in1_bin_upper[NUM_BITS] <== n2b[0][1].out;
    signal in2_bin_lower[NUM_BITS] <== n2b[1][0].out;
    signal in2_bin_upper[NUM_BITS] <== n2b[1][1].out;

    // operator 0x16: and
    component b2n_and[2];
    b2n_and[0] = Bits2Num(NUM_BITS);
    b2n_and[1] = Bits2Num(NUM_BITS); 
    for (var i = 0; i < NUM_BITS; i++) {
        b2n_and[0].in[i] <== AND()(in1_bin_lower[i], in2_bin_lower[i]);
        b2n_and[1].in[i] <== AND()(in1_bin_upper[i], in2_bin_upper[i]);
    }
    outs[ind] <== [b2n_and[0].out, b2n_and[1].out];
    flags[ind] <== b_selector[22];
    ind++;

    // operator 0x17: or
    component b2n_or[2];
    b2n_or[0] = Bits2Num(NUM_BITS);
    b2n_or[1] = Bits2Num(NUM_BITS);  
    for (var i = 0; i < NUM_BITS; i++) {
        b2n_or[0].in[i] <== OR()(in1_bin_lower[i], in2_bin_lower[i]);
        b2n_or[1].in[i] <== OR()(in1_bin_upper[i], in2_bin_upper[i]);
    }
    outs[ind] <== [b2n_or[0].out, b2n_or[1].out];
    flags[ind] <== b_selector[23];
    ind++;

    // operator 0x18: xor
    component b2n_xor[2];
    b2n_xor[0] = Bits2Num(NUM_BITS);
    b2n_xor[1] = Bits2Num(NUM_BITS);  
    for (var i = 0; i < NUM_BITS; i++) {
        b2n_xor[0].in[i] <== XOR()(in1_bin_lower[i], in2_bin_lower[i]);
        b2n_xor[1].in[i] <== XOR()(in1_bin_upper[i], in2_bin_upper[i]);
    }
    outs[ind] <== [b2n_xor[0].out, b2n_xor[1].out];
    flags[ind] <== b_selector[24];
    ind++;

    component mux = ComplexMux256_unsafe(NUM_ALU_FUNCTIONS);
    mux.selector <== flags;
    mux.ins <== outs;
    out <== mux.out;

    // Check outputs are in 128 bit limbs
    CheckBus()(out);
}