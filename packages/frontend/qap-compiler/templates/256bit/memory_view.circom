pragma circom 2.1.6;

include "circomlib/circuits/bitify.circom";

// Applies one byte-aligned memory fragment to a running 256-bit memory view.
//
// The running word is sound only in the approved serial composition: the first
// step receives the exact zero state and every later step receives the previous
// step's three outputs on the same physical wires. Source limbs and packed
// ownership masks are checked locally.
template MemoryViewStep() {
    // in[0..1]: source word, lower 128-bit limb first
    // in[2]: encoded byte shift, low 5 bits are magnitude and bit 5 is direction
    // in[3]: incoming packed 32-bit byte ownership
    // in[4..5]: previous accumulated word, lower limb first
    // in[6]: previous packed 32-bit byte ownership
    signal input in[7];

    // out[0..1]: next accumulated word, lower limb first
    // out[2]: next packed byte ownership
    signal output out[3];

    component sourceBits[2];
    for (var limb = 0; limb < 2; limb++) {
        sourceBits[limb] = Num2Bits(128);
        sourceBits[limb].in <== in[limb];
    }

    component shiftBits = Num2Bits(6);
    shiftBits.in <== in[2];

    component incomingOwnershipBits = Num2Bits(32);
    incomingOwnershipBits.in <== in[3];

    component previousOwnershipBits = Num2Bits(32);
    previousOwnershipBits.in <== in[6];

    signal sourceByte[32];
    signal directionOrientedByte[32];
    signal shiftStage[6][32];
    signal shiftedByte[32];
    signal maskedByte[32];
    signal ownershipSum[32];

    for (var byte = 0; byte < 32; byte++) {
        var sourceValue = 0;
        for (var bit = 0; bit < 8; bit++) {
            if (byte < 16) {
                sourceValue += sourceBits[0].out[8 * byte + bit] * (1 << bit);
            } else {
                sourceValue += sourceBits[1].out[8 * (byte - 16) + bit] * (1 << bit);
            }
        }
        sourceByte[byte] <== sourceValue;
    }

    for (var byte = 0; byte < 32; byte++) {
        // Reversing before and after one left barrel implements right shift
        // without a second barrel.
        directionOrientedByte[byte] <== sourceByte[byte]
            + shiftBits.out[5] * (sourceByte[31 - byte] - sourceByte[byte]);
        shiftStage[0][byte] <== directionOrientedByte[byte];
    }

    for (var level = 0; level < 5; level++) {
        var distance = 1 << level;
        for (var byte = 0; byte < 32; byte++) {
            if (byte >= distance) {
                shiftStage[level + 1][byte] <== shiftStage[level][byte]
                    + shiftBits.out[level]
                    * (shiftStage[level][byte - distance] - shiftStage[level][byte]);
            } else {
                shiftStage[level + 1][byte] <== shiftStage[level][byte]
                    - shiftBits.out[level] * shiftStage[level][byte];
            }
        }
    }

    for (var byte = 0; byte < 32; byte++) {
        shiftedByte[byte] <== shiftStage[5][byte]
            + shiftBits.out[5] * (shiftStage[5][31 - byte] - shiftStage[5][byte]);
        maskedByte[byte] <== shiftedByte[byte] * incomingOwnershipBits.out[byte];

        ownershipSum[byte] <== previousOwnershipBits.out[byte]
            + incomingOwnershipBits.out[byte];
        ownershipSum[byte] * (ownershipSum[byte] - 1) === 0;
    }

    var lowAddition = 0;
    var highAddition = 0;
    for (var byte = 0; byte < 16; byte++) {
        lowAddition += maskedByte[byte] * (1 << (8 * byte));
        highAddition += maskedByte[byte + 16] * (1 << (8 * byte));
    }
    out[0] <== in[4] + lowAddition;
    out[1] <== in[5] + highAddition;
    out[2] <== in[6] + in[3];
}
