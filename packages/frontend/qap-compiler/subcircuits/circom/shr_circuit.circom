pragma circom 2.1.6;
include "../../templates/256bit/arithmetic_unsafe_in.circom";

component main {public [shift, in]} = ShiftRight256_unsafe();