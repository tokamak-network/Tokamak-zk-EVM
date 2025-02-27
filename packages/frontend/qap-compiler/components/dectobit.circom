pragma circom 2.1.6;
include "../node_modules/circomlib/circuits/bitify.circom";

template DecToBit () {
    signal input in[2]; // A 256-bit integer consisting of two 128-bit integers; in[0]: lower, in[1]: upper
    signal output out[512];

    component lower_num_to_bits = Num2Bits(128);
    lower_num_to_bits.in <== in[0];
    
    component upper_num_to_bits = Num2Bits(128); 
    upper_num_to_bits.in <== in[1];

    for (var i = 0; i < 128; i++){
        out[2*i] <== lower_num_to_bits.out[i];
        out[2*i + 1] <== 0;
    }
    for (var i = 128; i < 256; i++){
        out[2*i] <== upper_num_to_bits.out[i - 128];
        out[2*i + 1] <== 0;
    }
}
