pragma circom 2.1.6;
include "../../templates/256bit/arithmetic_unsafe_in_out.circom";
include "../../templates/256bit/arithmetic_unsafe_in.circom";
include "../../templates/256bit/compare.circom";
include "../../templates/256bit/mux.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";

template Arith1 () {
    var NUM_TOTAL_FUNCTIONS = 29; // number of functions in the ALU
    var NUM_SELECTOR_BITS = NUM_TOTAL_FUNCTIONS + 1;
    var NUM_ALU1_FUNCTIONS = 5;
    // selector is expected to 2^(opcode).
    signal input in1[2], in2[2], selector;
    signal inter[NUM_ALU1_FUNCTIONS][2]; // intermediate signals to prevent non-quadratic constraints
    signal output out[2];

    // selector bitification
    signal b_selector[NUM_SELECTOR_BITS] <== Num2Bits(NUM_SELECTOR_BITS)(selector);

    /*  We don't check the input range, since they directly or indirectly connected to the input buffer, which is honest.
    // b_selector[Opcode] = 1, b_selector[i] = 0 for all i != Opcode.
    // Check the selector well-formness
    var sum = 0;
    for (var i = 0; i < NUM_SELECTOR_BITS; i++) {
        sum = sum + b_selector[i];
    }
    signal check_b_sum <-- sum;
    check_b_sum === 1;

    // Check input is in 128 bit
    CheckBus()(in1);
    CheckBus()(in2);
    */

    // operator 0x01: add
    signal (add_out[2], carry_add) <== Add256_unsafe()(in1, in2);
    inter[0] <== [
        b_selector[1] * add_out[0],
        b_selector[1] * add_out[1]
    ];

    // operator 0x02: mul
    signal (mul_out[2], carry_mul[2]) <== Mul256_unsafe()(in1, in2);
    inter[1] <== [
        inter[0][0] + b_selector[2] * mul_out[0],
        inter[0][1] + b_selector[2] * mul_out[1]
    ];

    // operator 0x03: sub
    signal sub_out[2] <== Sub256_unsafe()(in1, in2);
    inter[2] <== [
        inter[1][0] + b_selector[3] * sub_out[0],
        inter[1][1] + b_selector[3] * sub_out[1]
    ];

    // operator 0x04: div
    signal (div_out[2], mod_out[2]) <== Div256_unsafe()(in1, in2);
    inter[3] <== [
        inter[2][0] + b_selector[4] * div_out[0],
        inter[2][1] + b_selector[4] * div_out[1]
    ];

    // // operator 0x05: sdiv
    // signal (sdiv_out[2], smod_out[2]) <== SignedDiv256_unsafe()(in1, in2);
    // inter[4] <== [
    //     inter[3][0] + b_selector[5] * sdiv_out[0],
    //     inter[3][1] + b_selector[5] * sdiv_out[1]
    // ];

    // operator 0x06: mod
    inter[4] <== [
        inter[3][0] + b_selector[6] * mod_out[0],
        inter[3][1] + b_selector[6] * mod_out[1]
    ];

    // // operator 0x07: smod
    // inter[6] <== [
    //     inter[5][0] + b_selector[7] * smod_out[0],
    //     inter[5][1] + b_selector[7] * smod_out[1]
    // ];
    
    /*
    // operator 0x08: addmod
    signal addmod_out[2] <== AddMod()(in1, in2, in[2]);
    inter[7] <== [
        inter[6][0] + b_selector[7] * addmod_out[0],
        inter[6][1] + b_selector[7] * addmod_out[1]
    ];

    // operator 0x09: mulmod
    signal mulmod_out[2] <== MulMod()(in1, in2, in[2]);
    inter[8] <== [
        inter[7][0] + b_selector[8] * mulmod_out[0],
        inter[7][1] + b_selector[8] * mulmod_out[1]
    ];

    // operator 0x0a: exp
    signal exp_out[2] <== Exp()(in1, in2);
    inter[9] <== [
        inter[8][0] + b_selector[9] * exp_out[0],
        inter[8][1] + b_selector[9] * exp_out[1]
    ];

    // operator 0x0b: signextend
    signal signextend_out[2] <== SignExtend()(in1, in2);
    inter[10] <== [
        inter[9][0] + b_selector[10] * signextend_out[0],
        inter[9][1] + b_selector[10] * signextend_out[1]
    ];

    // operator 0x14: eq
    signal eq_out[2] <== Eq()(in1, in2);
    inter[11] <== [
        inter[10][0] + b_selector[11] * eq_out[0],
        inter[10][1] + b_selector[11] * eq_out[1]
    ];

    // operator 0x15: iszero
    signal iszero_out[2] <== IsZero256()(in1);
    inter[12] <== [
        inter[11][0] + b_selector[12] * iszero_out[0],
        inter[11][1] + b_selector[12] * iszero_out[1]
    ];

    // operator 0x1a: byte
    signal byte_out[2] <== Byte()(in1, in2);
    signal output out[2] <== [
        inter[12][0] + b_selector[13] * byte_out[0],
        inter[12][1] + b_selector[13] * byte_out[1]
    ];
    */

    out <== inter[NUM_ALU1_FUNCTIONS - 1];
    /*  We don't check the output range, since they are directly or indirectly connected to the output buffer, which is honest.
    // Check output is in 128 bit
    CheckBus()(out);
    */
}

component main {public [in1, in2, selector]} = Arith1();

