pragma circom 2.1.6;
include "../../templates/256bit/alu_safe.circom";

template ALU1_() {
    var NUM_TOTAL_FUNCTIONS = 29;
    var NUM_SELECTOR_BITS = NUM_TOTAL_FUNCTIONS + 1;
    var NUM_ALU_FUNCTIONS = 13;
    var NUM_BITS = 128;

    signal input in[5];
    signal output out[2];

    signal selector <== in[0];
    signal in1[2] <== [in[1], in[2]];
    signal in2[2] <== [in[3], in[4]];

    signal b_selector[NUM_SELECTOR_BITS] <== Num2Bits(NUM_SELECTOR_BITS)(selector);
    signal unsupported_selector_sum <== b_selector[0] + b_selector[4] + b_selector[5] + b_selector[6] + b_selector[7] + b_selector[8] + b_selector[9] + b_selector[10] + b_selector[11] + b_selector[12] + b_selector[13] + b_selector[14] + b_selector[15] + b_selector[26] + b_selector[27] + b_selector[28] + b_selector[29];
    unsupported_selector_sum === 0;
    signal outs[NUM_ALU_FUNCTIONS][2];
    signal flags[NUM_ALU_FUNCTIONS];
    var ind = 0;

    component add = Add256_unsafe();
    add.in1 <== in1;
    add.in2 <== in2;
    outs[ind] <== add.out;
    flags[ind] <== b_selector[1];
    ind++;

    component mul = Mul256_unsafe();
    mul.in1 <== in1;
    mul.in2 <== in2;
    outs[ind] <== mul.out;
    flags[ind] <== b_selector[2];
    ind++;

    component sub = Sub256_unsafe();
    sub.in1 <== in1;
    sub.in2 <== in2;
    outs[ind] <== sub.out;
    flags[ind] <== b_selector[3];
    ind++;

    signal lt_lower_out <== LessThan(128)([in1[0], in2[0]]);
    signal lt_upper_out <== LessThan(128)([in1[1], in2[1]]);
    signal is_upper_eq <== IsEqual()([in1[1], in2[1]]);
    signal is_lower_eq <== IsEqual()([in1[0], in2[0]]);
    signal is_eq <== is_upper_eq * is_lower_eq;
    signal is_upper_lt <== (1 - is_upper_eq) * lt_upper_out;
    signal is_lower_lt <== is_upper_eq * lt_lower_out;
    signal is_lt256 <== is_upper_lt + is_lower_lt;

    outs[ind] <== [is_lt256, 0];
    flags[ind] <== b_selector[16];
    ind++;

    outs[ind] <== [(1 - is_lt256) * (1 - is_eq), 0];
    flags[ind] <== b_selector[17];
    ind++;

    signal isNeg_in1;
    signal abs_in1[2];
    signal isNeg_in2;
    signal abs_in2[2];
    (isNeg_in1, abs_in1) <== getSignAndAbs256_unsafe()(in1);
    (isNeg_in2, abs_in2) <== getSignAndAbs256_unsafe()(in2);

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
    signal inter2 <== is_abs_lt256 * (1 - isNeg_in1);
    signal inter3 <== is_abs_gt256 * isNeg_in1;
    signal inter4 <== OR()(inter2, inter3);
    signal inter5 <== sign_xor_out * isNeg_in1;
    signal is_slt256 <== (1 - sign_xor_out) * inter4 + inter5;

    outs[ind] <== [is_slt256, 0];
    flags[ind] <== b_selector[18];
    ind++;

    outs[ind] <== [(1 - is_slt256) * (1 - is_eq), 0];
    flags[ind] <== b_selector[19];
    ind++;

    component eq = IsEqual256();
    eq.in1 <== in1;
    eq.in2 <== in2;
    outs[ind] <== [eq.out, 0];
    flags[ind] <== b_selector[20];
    ind++;

    component iszero = IsZero256();
    iszero.in <== in1;
    outs[ind] <== [iszero.out, 0];
    flags[ind] <== b_selector[21];
    ind++;

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

    component not = Not256_unsafe();
    not.in <== in1;
    outs[ind] <== not.out;
    flags[ind] <== b_selector[25];
    ind++;

    signal flags_sum <== flags[0] + flags[1] + flags[2] + flags[3] + flags[4] + flags[5] + flags[6] + flags[7] + flags[8] + flags[9] + flags[10] + flags[11] + flags[12];
    flags_sum === 1;

    component mux = ComplexMux256_checked(NUM_ALU_FUNCTIONS);
    mux.selector <== flags;
    mux.ins <== outs;
    out <== mux.out;

    CheckBus()(out);
}

component main {public [in]} = ALU1_();
