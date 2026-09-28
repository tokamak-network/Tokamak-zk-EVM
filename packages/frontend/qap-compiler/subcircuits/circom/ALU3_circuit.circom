pragma circom 2.1.6;

include "../../templates/256bit/arithmetic_unsafe_type2.circom";

template ALU3_() {
    signal input in[5];
    signal output out[2];
    signal indexOrShift[2] <== [in[1], in[2]];
    signal value[2] <== [in[3], in[4]];

    component valueBits[2];
    for (var limb = 0; limb < 2; limb++) {
        valueBits[limb] = Num2Bits(128);
        valueBits[limb].in <== value[limb];
    }

    signal indexShiftBits[8];
    var indexShiftLow = 0;
    for (var bit = 0; bit < 8; bit++) {
        indexShiftBits[bit] <-- (indexOrShift[0] >> bit) & 1;
        indexShiftBits[bit] * (1 - indexShiftBits[bit]) === 0;
        indexShiftLow += indexShiftBits[bit] * (1 << bit);
    }
    component lowPartMatches = IsZero();
    component highLimbIsZero = IsZero();
    lowPartMatches.in <== indexOrShift[0] - indexShiftLow;
    highLimbIsZero.in <== indexOrShift[1];
    signal shiftInRange <== lowPartMatches.out * highLimbIsZero.out;
    signal byteIndexBitsFiveAndSixAreZero <== (1 - indexShiftBits[5])
        * (1 - indexShiftBits[6]);
    signal byteIndexHighBitsAreZero <== byteIndexBitsFiveAndSixAreZero
        * (1 - indexShiftBits[7]);
    signal indexInRange <== shiftInRange * byteIndexHighBitsAreZero;

    signal selectedByte[6][32];
    for (var byte = 0; byte < 32; byte++) {
        var sourceByte = 31 - byte;
        var byteValue = 0;
        for (var bit = 0; bit < 8; bit++) {
            if (sourceByte < 16) {
                byteValue += valueBits[0].out[8 * sourceByte + bit] * (1 << bit);
            } else {
                byteValue += valueBits[1].out[8 * (sourceByte - 16) + bit] * (1 << bit);
            }
        }
        selectedByte[0][byte] <== byteValue;
    }
    for (var step = 0; step < 5; step++) {
        var active = 32 \ (1 << (step + 1));
        for (var candidate = 0; candidate < 32; candidate++) {
            if (candidate < active) {
                selectedByte[step + 1][candidate] <== selectedByte[step][2 * candidate]
                    + indexShiftBits[step] * (selectedByte[step][2 * candidate + 1]
                        - selectedByte[step][2 * candidate]);
            } else {
                selectedByte[step + 1][candidate] <== 0;
            }
        }
    }
    signal byteResult[2] <== [indexInRange * selectedByte[5][0], 0];

    signal indexMatch[6][32];
    indexMatch[0][0] <== 1;
    for (var candidate = 1; candidate < 32; candidate++) {
        indexMatch[0][candidate] <== 0;
    }
    for (var step = 0; step < 5; step++) {
        var active = 1 << step;
        for (var candidate = 0; candidate < 32; candidate++) {
            if (candidate < active) {
                indexMatch[step + 1][candidate + active] <== indexMatch[step][candidate] * indexShiftBits[step];
                indexMatch[step + 1][candidate] <== indexMatch[step][candidate] - indexMatch[step + 1][candidate + active];
            } else if (candidate >= 2 * active) {
                indexMatch[step + 1][candidate] <== 0;
            }
        }
    }

    signal signDifference[31];
    var selectedSignValue = valueBits[1].out[127];
    for (var byte = 0; byte < 31; byte++) {
        if (byte < 16) {
            signDifference[byte] <== indexMatch[5][byte] * (valueBits[0].out[8 * byte + 7] - valueBits[1].out[127]);
        } else {
            signDifference[byte] <== indexMatch[5][byte] * (valueBits[1].out[8 * (byte - 16) + 7] - valueBits[1].out[127]);
        }
        selectedSignValue += signDifference[byte];
    }
    signal selectedSign <== selectedSignValue;

    signal originalByte[32];
    signal signExtendedByte[32];
    signal fillActive[31];
    var lowerIndexSum = 0;
    var signExtendedLow = 0;
    var signExtendedHigh = 0;
    for (var byte = 0; byte < 32; byte++) {
        var byteValue = 0;
        for (var bit = 0; bit < 8; bit++) {
            if (byte < 16) {
                byteValue += valueBits[0].out[8 * byte + bit] * (1 << bit);
            } else {
                byteValue += valueBits[1].out[8 * (byte - 16) + bit] * (1 << bit);
            }
        }
        originalByte[byte] <== byteValue;
        if (byte == 0) {
            signExtendedByte[byte] <== originalByte[byte];
        } else {
            lowerIndexSum += indexMatch[5][byte - 1];
            fillActive[byte - 1] <== indexInRange * lowerIndexSum;
            signExtendedByte[byte] <== originalByte[byte] + fillActive[byte - 1] * (255 * selectedSign - originalByte[byte]);
        }
        if (byte < 16) {
            signExtendedLow += signExtendedByte[byte] * (1 << (8 * byte));
        } else {
            signExtendedHigh += signExtendedByte[byte] * (1 << (8 * (byte - 16)));
        }
    }
    signal signExtendResult[2] <== [signExtendedLow, signExtendedHigh];

    component shiftCore = ShiftLeft256FromBits_unsafe();
    shiftCore.shiftHighContribution <== 1 - shiftInRange;
    for (var bit = 0; bit < 128; bit++) {
        if (bit < 8) {
            shiftCore.shiftLowBits[bit] <== indexShiftBits[bit];
        } else {
            shiftCore.shiftLowBits[bit] <== 0;
        }
    }
    for (var limb = 0; limb < 2; limb++) {
        for (var bit = 0; bit < 128; bit++) {
            var reversed = 255 - (128 * limb + bit);
            var reversedLimb = reversed \ 128;
            var reversedBit = reversed % 128;
            shiftCore.valueBits[limb][bit] <== valueBits[reversedLimb].out[reversedBit];
        }
    }

    signal logicalShift[2];
    for (var limb = 0; limb < 2; limb++) {
        var logicalShiftLimb = 0;
        for (var bit = 0; bit < 128; bit++) {
            var reversed = 255 - (128 * limb + bit);
            var reversedLimb = reversed \ 128;
            var reversedBit = reversed % 128;
            logicalShiftLimb += shiftCore.outBits[reversedLimb][reversedBit] * (1 << bit);
        }
        logicalShift[limb] <== logicalShiftLimb;
    }

    component inversePower = InverseShiftPower256FromBits_unsafe();
    for (var bit = 0; bit < 8; bit++) {
        inversePower.shiftBits[bit] <== indexShiftBits[bit];
    }
    var MAX_LIMB = (1 << 128) - 1;
    signal adjustedFiller[2];
    for (var limb = 0; limb < 2; limb++) {
        adjustedFiller[limb] <== inversePower.negativeFiller[limb]
            + (1 - shiftCore.inRange) * (MAX_LIMB - inversePower.negativeFiller[limb]);
    }
    signal applySignFill <== valueBits[1].out[127];
    signal sarResult[2];
    for (var limb = 0; limb < 2; limb++) {
        sarResult[limb] <== logicalShift[limb] + applySignFill * adjustedFiller[limb];
    }

    var BYTE_SELECTOR = 1 << 1;
    var SIGNEXTEND_SELECTOR = 1 << 0;
    var SAR_SELECTOR = 1 << 2;
    signal byteAndSignDifference <== (in[0] - BYTE_SELECTOR) * (in[0] - SIGNEXTEND_SELECTOR);
    byteAndSignDifference * (in[0] - SAR_SELECTOR) === 0;
    signal sarSelector <== byteAndSignDifference
        / ((SAR_SELECTOR - BYTE_SELECTOR) * (SAR_SELECTOR - SIGNEXTEND_SELECTOR));
    signal signExtendSelector <== (in[0] - BYTE_SELECTOR) * (in[0] - SAR_SELECTOR)
        / ((SIGNEXTEND_SELECTOR - BYTE_SELECTOR) * (SIGNEXTEND_SELECTOR - SAR_SELECTOR));
    signal byteOrSignExtend[2];
    for (var limb = 0; limb < 2; limb++) {
        byteOrSignExtend[limb] <== byteResult[limb]
            + signExtendSelector * (signExtendResult[limb] - byteResult[limb]);
        out[limb] <== byteOrSignExtend[limb]
            + sarSelector * (sarResult[limb] - byteOrSignExtend[limb]);
    }
}

component main {public [in]} = ALU3_();
