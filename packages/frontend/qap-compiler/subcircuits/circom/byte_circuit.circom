pragma circom 2.1.6;
include "../../templates/256bit/arithmetic_unsafe_in.circom";

component main {public [offset_byte, in]} = Byte256_unsafe();