pragma circom 2.1.6;

include "circomlib/circuits/bitify.circom";

// Proves that the lower-first limb pair is the canonical integer
// representation of a BLS12-381 scalar-field element.
template StrictBls12381FrBoundFromLimbs() {
    signal input low;
    signal input high;

    var LIMB_BASE = 1 << 128;
    var FIELD_MAX_LOW = 111310594309268602877181240610339684352;
    var FIELD_MAX_HIGH = 154095187621958656428822154526901524485;

    signal lowBorrow <-- low > FIELD_MAX_LOW;
    lowBorrow * (1 - lowBorrow) === 0;

    component lowDifference = Num2Bits(128);
    lowDifference.in <== FIELD_MAX_LOW - low + lowBorrow * LIMB_BASE;

    component highDifference = Num2Bits(127);
    highDifference.in <== FIELD_MAX_HIGH - high - lowBorrow;
}

// Converts one native BLS12-381 scalar-field element to two lower-first
// 128-bit limbs, while excluding every non-canonical bit decomposition.
template CanonicalBls12381FrToLimbs() {
    signal input in;
    signal output out[2];

    component decomposition = Num2Bits(255);
    decomposition.in <== in;

    var lowExpression = 0;
    var highExpression = 0;
    for (var bit = 0; bit < 128; bit++) {
        lowExpression += decomposition.out[bit] * (1 << bit);
    }
    for (var bit = 128; bit < 255; bit++) {
        highExpression += decomposition.out[bit] * (1 << (bit - 128));
    }

    out[0] <== lowExpression;
    out[1] <== highExpression;

    component fieldBound = StrictBls12381FrBoundFromLimbs();
    fieldBound.low <== out[0];
    fieldBound.high <== out[1];
}

// Converts two independent native BLS12-381 scalar-field elements to their
// lower-first limb pairs. It is intentionally not transaction-specific.
template FrToLimbsPair() {
    signal input in[2];
    signal output out[4];

    component conversions[2];
    for (var index = 0; index < 2; index++) {
        conversions[index] = CanonicalBls12381FrToLimbs();
        conversions[index].in <== in[index];
        out[2 * index] <== conversions[index].out[0];
        out[2 * index + 1] <== conversions[index].out[1];
    }
}
