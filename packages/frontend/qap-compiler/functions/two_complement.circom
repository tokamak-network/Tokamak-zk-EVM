pragma circom 2.1.6;

function _getSignAndAbs(x, sign_offset) {
    var x_low = x[0];
    var x_up = x[1];
    var FIELD_SIZE = 1 << 128;
    // var MASK = FIELD_SIZE - 1;
    // var isNeg = x_up >> 127;
    // var abs_x_low;
    // var abs_x_up;

    // if (isNeg == 1) {
    //     abs_x_low = ((x_low ^ MASK) + 1 ) % FIELD_SIZE;
    //     var abs_x_low_carry = ((x_low ^ MASK) + 1 ) / FIELD_SIZE;
    //     abs_x_up = ((x_up ^ MASK) + abs_x_low_carry) % FIELD_SIZE;
    // } else {
    //     abs_x_low = x_low;
    //     abs_x_up = x_up;
    // }

    var x_256 = x[0] + x[1] * FIELD_SIZE;
    x_256 = x_256 & ((1 << 256) - 1);
    var isNeg = (x_256 >> sign_offset) & 1;
    var VARIABLE_SIZE = (1 << sign_offset + 1);
    var x_256_truncated = x_256 % VARIABLE_SIZE;
    var abs_x_256;
    if (isNeg == 1) {
        abs_x_256 = VARIABLE_SIZE - x_256_truncated;
    } else {
        abs_x_256 = x_256_truncated;
    }

    var abs_x_low = abs_x_256 % FIELD_SIZE;
    var abs_x_up = abs_x_256 / FIELD_SIZE;

    return [isNeg, abs_x_low, abs_x_up];
}

function _recoverSignedInteger(isNeg, abs, sign_offset) {
    var abs_low = abs[0];
    var abs_up = abs[1];
    var FIELD_SIZE = 1 << 128;
    var TARGET_SIZE = 1 << (sign_offset + 1);
    // var MASK = FIELD_SIZE - 1;
    // var x_low;
    // var x_up;

    // if (isNeg == 1) {
    //     x_low = ((abs_low ^ MASK) + 1 ) % FIELD_SIZE;
    //     var x_low_carry = ((abs_low ^ MASK) + 1 ) / FIELD_SIZE;
    //     x_up = ((abs_up ^ MASK) + x_low_carry) % FIELD_SIZE;
    // } else {
    //     x_low = abs_low;
    //     x_up = abs_up;
    // }

    var abs_256 = abs[0] + abs[1] * FIELD_SIZE;
    var abs_fit = abs_256 % TARGET_SIZE;
    var x_fit;
    if (isNeg == 1) {
        x_fit = TARGET_SIZE - abs_fit;
    } else {
        x_fit = abs_fit;
    }

    var x_low = x_fit % FIELD_SIZE;
    var x_up = x_fit / FIELD_SIZE;
    return [x_low, x_up];
}


function _signExtend(x, sign_offset) {
    var FIELD_SIZE = 1 << 128;
    var signAndAbs = _getSignAndAbs(x, sign_offset);
    var isNeg = signAndAbs[0];
    var abs[2];
    abs[0] = signAndAbs[1];
    abs[1] = signAndAbs[2];
    var extended_x = _recoverSignedInteger(isNeg, abs, 255);
    return extended_x;
}
