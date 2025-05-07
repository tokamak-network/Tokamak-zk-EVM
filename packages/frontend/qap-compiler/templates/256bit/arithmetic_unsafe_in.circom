pragma circom 2.1.6;
include "arithmetic_unsafe_in_out.circom";
include "../512bit/arithmetic.circom";
include "two_complement.circom";
include "../../node_modules/circomlib/circuits/gates.circom";
include "compare.circom";

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
    for (var i = 0; i < 2; i++) {
        inter2[i] === 0;
    }
    carry3 === 0;

    signal is_zero_denom[2] <== IsZero256()(in2);

    //Ensure 0 <= remainder < divisor when diviser > 0
    signal lt_divisor[2] <== Lt256()(r_temp, in2);
    lt_divisor[0] === 1 * (1 - is_zero_denom[0]);

    // Return r = 0 if in2 is zero.
    r <== Mux256()(is_zero_denom[0], [0, 0], r_temp);
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