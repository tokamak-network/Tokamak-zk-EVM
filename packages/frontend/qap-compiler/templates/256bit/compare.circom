pragma circom 2.1.6;
include "../../node_modules/circomlib/circuits/comparators.circom";
include "../../node_modules/circomlib/circuits/gates.circom";
include "two_complement.circom";

template Eq256 () {
    signal input in1[2], in2[2];
    signal output out[2];
    out[1] <== 0;

    signal eq_lower_out <== IsEqual()([in1[0], in2[0]]);
    signal eq_upper_out <== IsEqual()([in1[1], in2[1]]);
    out[0] <== eq_lower_out * eq_upper_out;
}

template Lt256 () {
    // in1 < in2
    signal input in1[2], in2[2];

    signal lt_lower_out <== LessThan(128)([in1[0], in2[0]]);
    signal lt_upper_out <== LessThan(128)([in1[1], in2[1]]);
    signal eq_out <== IsEqual()([in1[1], in2[1]]);
    signal not_out <== NOT()(eq_out);

    signal temp <== not_out * lt_upper_out;

    signal output out[2] <== [ 
        eq_out * lt_lower_out + temp,
        0
    ];
}

template LEq256 () {
    signal input in1[2], in2[2]; // 256-bit integers consisting of two 128-bit integers; in[0]: lower, in[1]: upper
    signal eq_128 <== IsEqual()([((2**128) - 1),in2[0]]);
    signal lt_lower_out <== LessThan(128)([in1[0], in2[0] + 1 - eq_128]);
    signal lt_upper_out <== LessThan(128)([in1[1], in2[1] + eq_128]);
    signal eq_out <== IsEqual()([in1[1], in2[1] + eq_128]);
    signal not_out <== NOT()(eq_out);

    signal temp <== not_out * lt_upper_out;

    signal output out[2] <== [ 
        eq_out * lt_lower_out + temp,
        0
    ];
}

template Gt256 () {
    // 256-bit integers consisting of two 128-bit integers; in[0]: lower, in[1]: upper
    signal input in1[2], in2[2];
    signal output out[2] <== Lt256()(in2, in1);
}

template SignedLt256 () {
    // in1 < in2
    signal input in1[2], in2[2];
    signal output out[2];
    signal (isNeg_in1, abs_in1[2]) <== getSignAndAbs256()(in1);
    signal (isNeg_in2, abs_in2[2]) <== getSignAndAbs256()(in2);

    signal lt_out[2] <== Lt256()(abs_in1, abs_in2);
    signal eq_out[2] <== Eq256()(abs_in1, abs_in2);
    signal gt_out <== (1 - lt_out[0]) * (1 - eq_out[0]);
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
    signal inter2 <== lt_out[0] * (1 - isNeg_in1);
    signal inter3 <== gt_out * isNeg_in1;
    signal inter4 <== OR()(inter2, inter3);
    signal inter5 <== (1 - xor_out) * inter4;
    out <== [inter1 + inter5, 0];
}

template SignedGt256 () {
  // 256-bit integers consisting of two 128-bit integers; in[0]: lower, in[1]: upper
  signal input in1[2], in2[2];
  signal output out[2] <== SignedLt256()(in2, in1);
}

template IsZero256 () {
  signal input in[2];

  signal is_zero_lower <== IsZero()(in[0]);
  signal is_zero_upper <== IsZero()(in[1]);

  signal output out[2] <== [
    is_zero_lower * is_zero_upper,
    0
  ];
}

template CheckBus() {
    signal input in[2];

    signal in0_range <== LessEqThan(128)([in[0], (1<<128) - 1]);
    signal in1_range <== LessEqThan(128)([in[1], (1<<128) - 1]);
    signal res <== in0_range * in1_range;
    res === 1;
}