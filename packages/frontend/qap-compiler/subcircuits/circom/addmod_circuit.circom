pragma circom 2.1.6;
include "../../templates/256bit/arithmetic_unsafe_in.circom";

component main {public [in1, in2, in3]} = AddMod256_unsafe();