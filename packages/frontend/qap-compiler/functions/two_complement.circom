pragma circom 2.1.6;

function _getSignAndAbs(x, sign_offset) {
    var FIELD_SIZE = 1 << 128;
    var bit_length = sign_offset + 1;

    if (bit_length >= 256) {
        var is_neg = x[1] >> 127;
        if (is_neg) {  
            var not_x[2] = [
                x[0] ^ (FIELD_SIZE - 1),
                x[1] ^ (FIELD_SIZE - 1)
            ];
            var add_res[3] = _add256(not_x, [1, 0]);
            return [is_neg, add_res[0], add_res[1]];
        } else {
            return [is_neg, x[0], x[1]];
        }
    }

    var is_neg = 0;
    var abs_x[2];
    if ( bit_length > 128 ) {
        var bit_length_high = bit_length - 128;
        var x_high_mask = (1 << bit_length_high) - 1;
        var masked_x[2] = [
            x[0],
            x[1] & x_high_mask
        ];
        var sign_tester = 1 << (bit_length_high - 1);
        if ( (masked_x[1] & sign_tester) > 0) {
            is_neg = 1;
            var not_x[2] = [
                masked_x[0] ^ (FIELD_SIZE - 1), 
                masked_x[1] ^ x_high_mask
            ];
            var add_res[3] = _add256(not_x, [1, 0]);
            abs_x = [
                add_res[0], 
                add_res[1] & x_high_mask
            ]; 
        } else {
            abs_x = masked_x;
        }
    } else {
        var bit_length_low = bit_length;
        var x_low_mask = (1 << bit_length_low) - 1;
        var masked_x[2] = [
            x[0] & x_low_mask,
            0
        ];
        var sign_tester = 1 << (bit_length_low - 1);
        if ( (masked_x[0] & sign_tester) > 0) {
            is_neg = 1;
            var not_x[2] = [
                masked_x[0] ^ x_low_mask, 
                0
            ];
            var add_res[3] = _add256(not_x, [1, 0]);
            abs_x = [add_res[0] & x_low_mask, 0]; 
        } else {
            abs_x = masked_x;
        }
    }

    return [is_neg, abs_x[0], abs_x[1]];
}

function _recoverSignedInteger(is_neg, x, sign_offset) {
    var FIELD_SIZE = 1 << 128;
    var bit_length = sign_offset + 1;
    if (!is_neg) {
        return [x[0], x[1]];
    }

    if (bit_length >= 256) {
        var not_x[2] = [
            x[0] ^ (FIELD_SIZE - 1),
            x[1] ^ (FIELD_SIZE - 1)
        ];
        var add_res[3] = _add256(not_x, [1, 0]);
        return [add_res[0], add_res[1]];
    }

    var signed_x[2];
    if ( bit_length > 128 ) {
        var bit_length_high = bit_length - 128;
        var x_high_mask = (1 << bit_length_high) - 1;
        var masked_x[2] = [
            x[0],
            x[1] & x_high_mask
        ];
        var not_x[2] = [
            masked_x[0] ^ (FIELD_SIZE - 1), 
            masked_x[1] ^ x_high_mask
        ];
        var add_res[3] = _add256(not_x, [1, 0]);
        signed_x = [
            add_res[0], 
            add_res[1] & x_high_mask
        ];
    } else {
        var bit_length_low = bit_length;
        var x_low_mask = (1 << bit_length_low) - 1;
        var masked_x[2] = [
            x[0] & x_low_mask,
            0
        ];
        var not_x[2] = [
            masked_x[0] ^ x_low_mask, 
            0
        ];
        var add_res[3] = _add256(not_x, [1, 0]);
        signed_x = [
            add_res[0] & x_low_mask, 
            0
        ];
    }

    return [signed_x[0], signed_x[1]];
}


function _signExtend(x, k) { 
    if (k >= 31) return x;
    var bit_length = 8 * (k + 1);
    var sign_offset = bit_length - 1;

    var _res[3] = _getSignAndAbs(x, sign_offset);
    var is_neg = _res[0];
    var masked_x[2] = _recoverSignedInteger(is_neg, [_res[1], _res[2]], sign_offset);
    if (!is_neg) return masked_x;

    var extended_x[2];
    if (bit_length > 128) {
        var bit_length_high = bit_length - 128;
        var filler_high = ((1 << 128) - 1) - ( (1 << bit_length_high) - 1 );
        extended_x = [
            x[0],
            masked_x[1] + filler_high
        ];
    } else {
        var bit_length_low = bit_length;
        var filler_high = (1 << 128) - 1;
        var filler_low = ((1 << 128) - 1) - ( (1 << bit_length_low) - 1 );
        extended_x = [
            masked_x[0] + filler_low,
            filler_high
        ];
    }
    return extended_x;
}
