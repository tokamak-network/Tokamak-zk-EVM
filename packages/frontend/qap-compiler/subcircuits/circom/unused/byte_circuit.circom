pragma circom 2.1.6;
include "../../templates/256bit/arithmetic_unsafe_type2.circom";
include "../../templates/256bit/compare_safe.circom";

template BYTE() {
    signal input in[4];
    signal output out[2];

    // // Check the input value is in 128 bit limbs
    // CheckBus()([in[2], in[3]]);
    // // Byte256_unsafe checks that the shift is in 8 bit
    in[1] === 0;

    out[1] <== 0;
    component _byte = Byte256_unsafe();
    _byte.offset_byte <== in[0];
    _byte.in <== [in[2], in[3]];
    out[0] <== _byte.out;
    signal rem <== _byte.rem;
    signal divisor <== _byte.divisor;

    signal is_out_8bit <== LessEqThan(8)([out[0], (1<<8) - 1]);
    is_out_8bit === 1;
    signal range_check <== LessThan(128)([rem, divisor]);
    range_check === 1;
}

component main {public [in]} = BYTE();