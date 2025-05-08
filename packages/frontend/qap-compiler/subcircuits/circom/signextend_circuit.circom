pragma circom 2.1.6;
include "../../templates/256bit/arithmetic_unsafe_in.circom";

component main {public [sign_offset_byte, in]} = SignExtend256_unsafe();