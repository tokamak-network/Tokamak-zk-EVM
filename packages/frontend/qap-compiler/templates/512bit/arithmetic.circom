pragma circom 2.1.6;
include "../256bit/arithmetic_unsafe_type1.circom";
include "../128bit/arithmetic.circom";
include "../../functions/arithmetic.circom";
include "mux.circom";

template Mul512by256_unsafe() {
    // 512-bit input: in1 = [in1[0]..in1[3]] (each a 128-bit limb, least significant first)
    // 256-bit input: in2 = [in2[0], in2[1]] (each a 128-bit limb)
    signal input in1[4], in2[2];
    // out: lower 512-bit of the product split into 4 × 128-bit limbs (indices 0..3)
    // carry: upper 256-bit of the product
    signal output out[4], carry[2];

    // perform two 256×256 multiplications
    component M0 = Mul256_unsafe();
    M0.in1 <== [in1[0], in1[1]];
    M0.in2 <== in2;

    component M1 = Mul256_unsafe();
    M1.in1 <== [in1[2], in1[3]];
    M1.in2 <== in2;

    // limb 0: coefficient c_{0,0}
    out[0] <== M0.out[0];

    // limb 1: coefficient c_{0,1}
    out[1] <== M0.out[1];

    // limb 2: coefficient c_{0,2} + c_{1,0}
    component A2 = Add128_unsafe();
    A2.in1 <== M0.carry[0];
    A2.in2 <== M1.out[0];
    out[2] <== A2.out;

    // limb 3: coefficient c_{0,3} + c_{1,1} + carry from limb 2
    component A3a = Add128_unsafe();
    A3a.in1 <== M0.carry[1];
    A3a.in2 <== M1.out[1];
    component A3b = Add128_unsafe();
    A3b.in1 <== A3a.out;
    A3b.in2 <== A2.carry;
    out[3] <== A3b.out;

    // compute combined carry from limb 3 additions
    component C3 = Add128_unsafe();
    C3.in1 <== A3a.carry;
    C3.in2 <== A3b.carry;

    // limb 4: coefficient c_{1,2} + carry from limb 3
    component A4 = Add128_unsafe();
    A4.in1 <== M1.carry[0];
    A4.in2 <== C3.out;
    carry[0] <== A4.out;

    // limb 5: coefficient c_{1,3} + carry-over from limb 3 + carry from limb 4
    component A5a = Add128_unsafe();
    A5a.in1 <== M1.carry[1];
    A5a.in2 <== C3.carry;
    component A5b = Add128_unsafe();
    A5b.in1 <== A5a.out;
    A5b.in2 <== A4.carry;
    carry[1] <== A5b.out;
}

template Add512_unsafe() {
    // 512-bit inputs:
    //   in1 = [in1[0], in1[1], in1[2], in1[3]]  (128-bit limbs, LSB first)
    //   in2 = [in2[0], in2[1], in2[2], in2[3]]  (128-bit limbs, LSB first)
    // Outputs:
    //   out   = lower 512 bits of (in1 + in2), as 4 × 128-bit limbs
    //   carry = the single 128-bit limb overflow beyond 512 bits

    signal input in1[4], in2[4];
    signal output out[4], carry;

    // 1) Add the low 256 bits (limbs 0–1)
    component A0 = Add256_unsafe();
    A0.in1 <== [in1[0], in1[1]];
    A0.in2 <== [in2[0], in2[1]];
    // write out limbs 0–1
    out[0] <== A0.out[0];
    out[1] <== A0.out[1];

    // 2) Add the high 256 bits (limbs 2–3)
    //    first add in1[2..3] + in2[2..3]
    component H0 = Add256_unsafe();
    H0.in1 <== [in1[2], in1[3]];
    H0.in2 <== [in2[2], in2[3]];

    //    then add the carry from the low 256-bit addition
    component H1 = Add256_unsafe();
    H1.in1 <== H0.out;               // sum of high halves
    H1.in2 <== [A0.carry, H0.carry];
    // write out limbs 2–3
    out[2] <== H1.out[0];
    out[3] <== H1.out[1];

    // 3) any overflow beyond 512 bits is in H1.carry
    carry <== H1.carry;
}

template Div512by256_unsafe() {
    signal input in1[4], in2[2];
    signal output quo[4], rem[4];

    signal res_temp[2][4] <-- _div512by256(in1, in2);
    quo <== res_temp[0];
    // log("in1: ", in1[0],  in1[1], in1[2], in1[3]);
    // log("in2: ", in2[0],  in2[1]);
    // log("_quo: ", quo[0],  quo[1], quo[2], quo[3]);
    signal r_temp[4] <== res_temp[1];
    // log("_rem: ", r_temp[0],  r_temp[1], r_temp[2], r_temp[3]);
    signal (inter1[4], carry1[2]) <== Mul512by256_unsafe()(quo, in2);
    // log("inter1: ", inter1[0], inter1[1], inter1[2], inter1[3]);
    // log("carry1: ", carry1[0], carry1[1]);
    signal (inter2[4], carry2) <== Add512_unsafe()(inter1, r_temp);
    // log("inter2: ", inter2[0], inter2[1], inter2[2], inter2[3]);
    // log("carry2: ", carry2);
    signal (inter3[2], carry3) <== Add256_unsafe()(carry1, [carry2, 0]);
    for (var i = 0; i < 4; i++){
        inter2[i] === in1[i];
    }
    for (var i = 0; i < 2; i++){
        inter3[i] === 0;
    }
    carry3 === 0;

    signal is_zero_denom <== IsZero256()(in2);

    /* These checks must be included for Div256 to be safe.
    //Ensure 0 <= remainder < divisor when diviser > 0
    signal lt_divisor[2] <== LT()(r_temp, in2);
    lt_divisor[0] === 1 * (1 - is_zero_denom[0]);
    */

    // Return r = 0 if in2 is zero.
    rem <== Mux512()(is_zero_denom, [0, 0, 0, 0], r_temp);
}