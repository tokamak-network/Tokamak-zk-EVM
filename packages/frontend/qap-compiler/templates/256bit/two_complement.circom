pragma circom 2.1.6;
include "arithmetic_unsafe_in_out.circom";
include "../../functions/two_complement.circom";
include "mux.circom";
include "compare.circom";
include "../../node_modules/circomlib/circuits/gates.circom";

template getSignAndAbs256() {
    signal input in[2];
    var _res[3] = _getSignAndAbs(in, 255);  
    signal output isNeg, abs[2];
    isNeg <-- _res[0];
    abs <-- [_res[1], _res[2]];

    isNeg * (1 - isNeg) === 0;
    signal (_inter1[2], carry_add1) <== Add256_unsafe()(in, abs);
    signal _inter2[2] <== Sub256_unsafe()(in, abs);
    signal _inter3[2] <== Mux256()(isNeg, _inter1, _inter2);
    signal final_check[2] <== IsZero256()( _inter3 );
    final_check[0] === 1;
}

template recoverSignedInteger256() {
    signal input isNeg, in_abs[2];
    signal output recover[2] <-- _recoverSignedInteger(isNeg, in_abs, 255);
    isNeg * (1 - isNeg) === 0;
    signal (_inter11[2], carry_add2) <== Add256_unsafe()(recover, in_abs);
    signal _inter12[2] <== Sub256_unsafe()(recover, in_abs);
    signal _inter13[2] <== Mux256()(isNeg, _inter11, _inter12);
    signal final_check[2] <== IsZero256()( _inter13 );
    final_check[0] === 1;
}

template SignExtend256() {
    signal input sign_offset, in[2];
    signal output out[2];
    out <-- _signExtend(in, sign_offset);
    signal shift_amount_up;
    signal shift_amount_low;
    if ( sign_offset > 127 ) {
        shift_amount_up <-- (sign_offset + 1) - 128;
        shift_amount_down <-- 128;
    } else {
        shift_amount_up <-- 128;
        shift_amount_down <-- sign_offset + 1;
    }
    sign_offset === (sign_offset_up + 128) + sign_offset_down;
    signal down_check <== LessEqThan(8)(sign_offset_down, 128);
    signal up_check <== LessEqThan(8)(sign_offset_up, 128);
    down_check === 1;
    up_check === 1;
    
    // If in is non-negative, in === out.
    signal pos_eq[2] <== Eq256(in, out);

    // if in is negative, -in === -out.
    signal neg_out[2] <== Sub256_unsafe()
    signal not_out[2] <== Not256_unsafe(out);
    signal neg_in[2], neg_out[2];
    neg_in[0] <== (1<<sign_offset_down) - in[0];
    neg_in[1] <== not_in[1] + 1;
    neg_out[0] <== not_out[0] + 1;
    neg_out[1] <== not_out[1] + 1;
    
    signal neg_eq[2] <== Eq256(neg_in, neg_out);
    signal xor_eq <== XOR(pos_eq[0], neg_eq[0]);
    signal iszero[2] <== IsZero256(in);
    signal xor_xor_eq <== XOR(xor_eq, iszero[0]);
    xor_xor_eq === 1;
}