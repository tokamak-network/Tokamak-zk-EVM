pragma circom 2.1.6;
include "../../node_modules/circomlib/circuits/comparators.circom";
include "../../node_modules/circomlib/circuits/gates.circom";
include "two_complement_unsafe.circom";

template LessThan256 () {
    // in1 < in2
    signal input in1[2], in2[2];
    signal output out;

    signal lt_lower_out <== LessThan(128)([in1[0], in2[0]]);
    signal lt_upper_out <== LessThan(129)([in1[1], in2[1]]);
    signal eq_out <== IsEqual()([in1[1], in2[1]]);
    signal not_out <== NOT()(eq_out);

    signal temp <== not_out * lt_upper_out;

    out <== eq_out * lt_lower_out + temp;
}

// template LIsEqual256 () {
//     signal input in1[2], in2[2]; // 256-bit integers consisting of two 128-bit integers; in[0]: lower, in[1]: upper
//     signal output out;
//     signal eq_128 <== IsEqual()([((2**128) - 1),in2[0]]);
//     signal lt_lower_out <== LessThan(128)([in1[0], in2[0] + 1 - eq_128]);
//     signal lt_upper_out <== LessThan(128)([in1[1], in2[1] + eq_128]);
//     signal eq_out <== IsEqual()([in1[1], in2[1] + eq_128]);
//     signal not_out <== NOT()(eq_out);

//     signal temp <== not_out * lt_upper_out;

//     out <== eq_out * lt_lower_out + temp;
// }

template GreaterThan256 () {
    // 256-bit integers consisting of two 128-bit integers; in[0]: lower, in[1]: upper
    signal input in1[2], in2[2];
    signal output out <== LessThan256()(in2, in1);
}

template SignedLessThan256 () {
    // in1 < in2
    signal input in1[2], in2[2];
    signal output out;
    signal (isNeg_in1, abs_in1[2]) <== getSignAndAbs256_unsafe()(in1);
    signal (isNeg_in2, abs_in2[2]) <== getSignAndAbs256_unsafe()(in2);

    signal lt_out <== LessThan256()(abs_in1, abs_in2);
    signal eq_out <== IsEqual256()(abs_in1, abs_in2);
    signal gt_out <== (1 - lt_out) * (1 - eq_out);
    signal xor_out <== XOR()(isNeg_in1, isNeg_in2);

    /*
        |in1| < |in2| implies
            in1 < in2 for sign (+,+)
            in1 > in2 for sign (+,-)
            in1 < in2 for sign (-,+)
            in1 > in2 for sign (-,-)
        |in1| >= |in2| implies
            in1 >= in2 for sign (+,+)
            in1 > in2 for sign (+,-)
            in1 < in2 for sign (-,+)
            in1 <= in2 for sign (-,-)
    */
    // If xor_out == 1 => ( isNeg_in1 <=> out )
    // If xor_out == 0 => ( (lt_out & !isNeg_in1) | ( gt_out & isNeg_in1 ) <=> out  )

    signal inter1 <== xor_out * isNeg_in1;
    signal inter2 <== lt_out * (1 - isNeg_in1);
    signal inter3 <== gt_out * isNeg_in1;
    signal inter4 <== OR()(inter2, inter3);
    signal inter5 <== (1 - xor_out) * inter4;
    out <== inter1 + inter5;
}

template SignedGreaterThan256 () {
  // 256-bit integers consisting of two 128-bit integers; in[0]: lower, in[1]: upper
  signal input in1[2], in2[2];
  signal output out <== SignedLessThan256()(in2, in1);
}

template IsZero256() {
  signal input in[2];
  signal output out;

  signal is_zero_lower <== IsZero()(in[0]);
  signal is_zero_upper <== IsZero()(in[1]);

  out <== is_zero_lower * is_zero_upper;
}

template IsEqual256() {
    signal input in1[2], in2[2];
    signal output out;

    signal eq_lower_out <== IsEqual()([in1[0], in2[0]]);
    signal eq_upper_out <== IsEqual()([in1[1], in2[1]]);
    out <== eq_lower_out * eq_upper_out;
}

template CheckBus() {
    signal input in[2];

    signal in0_range <== LessEqThan(128)([in[0], (1<<128) - 1]);
    signal in1_range <== LessEqThan(128)([in[1], (1<<128) - 1]);
    signal res <== in0_range * in1_range;
    res === 1;
}