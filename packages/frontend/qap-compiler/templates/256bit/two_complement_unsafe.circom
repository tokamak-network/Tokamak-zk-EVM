pragma circom 2.1.6;
include "arithmetic_unsafe_type1.circom";
include "../../functions/two_complement.circom";
include "mux.circom";
include "compare_safe.circom";
include "../../node_modules/circomlib/circuits/gates.circom";

template getSignAndAbs256_unsafe() {
    signal input in[2];
    signal output isNeg, abs[2];
    var _res[3] = _getSignAndAbs(in, 255);  
    isNeg <-- _res[0];
    abs <-- [_res[1], _res[2]];

    isNeg * (1 - isNeg) === 0;
    signal (_inter1[2], carry_add1) <== Add256_unsafe()(in, abs);
    signal _inter2[2] <== Sub256_unsafe()(in, abs);
    signal _inter3[2] <== Mux256()(isNeg, _inter1, _inter2);
    signal final_check <== IsZero256()( _inter3 );
    final_check === 1;
}

template recoverSignedInteger256_unsafe() {
    signal input isNeg, in_abs[2];
    signal output recover[2] <-- _recoverSignedInteger(isNeg, in_abs, 255);
    isNeg * (1 - isNeg) === 0;
    signal (_inter11[2], carry_add2) <== Add256_unsafe()(recover, in_abs);
    signal _inter12[2] <== Sub256_unsafe()(recover, in_abs);
    signal _inter13[2] <== Mux256()(isNeg, _inter11, _inter12);
    signal final_check <== IsZero256()( _inter13 );
    final_check === 1;
}