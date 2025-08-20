pragma circom 2.1.6;
include "../node_modules/circomlib/circuits/bitify.circom"

template SafeLessThan(N) {
    signal input in1, in2;
    signal output out;

    signal in1_bit[N] <== Num2Bits(N)(in1);
    component n2b = Num2Bits(N+1);

    n2b.in <== in[0]+ (1<<n) - in[1];

    out <== 1-n2b.out[n];
}