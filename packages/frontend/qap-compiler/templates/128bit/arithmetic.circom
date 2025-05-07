pragma circom 2.1.6;
template Mul128_unsafe() {
    // inputs are 64 bit limbs.
    signal input in1[2], in2[2];
    // output is 128 bit limbs
    signal output out[2];
    var SUB_FIELD_SIZE = 1<<64;
    var FIELD_SIZE = 1<<128;

    signal second_inter1 <== in1[1] * in2[0];
    signal second_inter2 <== second_inter1 * SUB_FIELD_SIZE;
    signal second_inter3 <== in1[0] * in2[1];
    signal second_inter4 <== second_inter3 * SUB_FIELD_SIZE;
    signal second_inter5 <== second_inter2 + second_inter4;
    signal second <== second_inter5 + in1[0] * in2[0];
    signal t <-- second % FIELD_SIZE;
    signal t_carry <-- second / FIELD_SIZE;
    second === t_carry * FIELD_SIZE + t;
    signal first <== in1[1] * in2[1] + t_carry;
    signal s <-- first % FIELD_SIZE;
    signal s_carry <-- first / FIELD_SIZE;
    first === s_carry * FIELD_SIZE + s;
    out[1] <== s;
    out[0] <== t;
}

template Add128_unsafe () {
    // inputs are 128 bit
    signal input in1, in2;
    // outputs are 128 bit
    signal output out, carry;
    
    var FIELD_SIZE = 1<<128;
    out <-- (in1 + in2) % FIELD_SIZE;
    carry <-- (in1 + in2) / FIELD_SIZE;
    (in1 + in2) === out * FIELD_SIZE + carry;
}