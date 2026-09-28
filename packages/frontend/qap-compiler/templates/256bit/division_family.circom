pragma circom 2.1.6;

include "arithmetic_safe.circom";

// Converts a canonical 256-bit word to its unsigned magnitude when isSigned is
// enabled. Prefix-zero flags determine every two's-complement borrow, so each
// selected 64-bit output word is canonical without another bit decomposition.
template ConditionalMagnitudeFromBits() {
    var BASE64 = 1 << 64;

    signal input bits[256];
    signal input isSigned;
    signal output magnitude[2];
    signal output words[4];
    signal output sign;
    signal output isZero;

    sign <== bits[255];
    signal negate <== isSigned * sign;

    signal originalWords[4];
    signal prefixIsZero[4];
    signal borrow[5];
    signal negativeWords[4];
    var prefixSum = 0;
    borrow[0] <== 0;

    for (var word = 0; word < 4; word++) {
        var originalWord = 0;
        for (var bit = 0; bit < 64; bit++) {
            var bitIndex = 64 * word + bit;
            originalWord += bits[bitIndex] * (1 << bit);
            prefixSum += bits[bitIndex];
        }
        originalWords[word] <== originalWord;
        prefixIsZero[word] <== IsZero()(prefixSum);
        borrow[word + 1] <== 1 - prefixIsZero[word];

        negativeWords[word]
            <== BASE64 * borrow[word + 1]
            - originalWords[word]
            - borrow[word];
        words[word]
            <== originalWords[word]
            + negate * (negativeWords[word] - originalWords[word]);
    }

    magnitude[0] <== words[0] + BASE64 * words[1];
    magnitude[1] <== words[2] + BASE64 * words[3];
    isZero <== prefixIsZero[3];
}

template DivisionFamilyPart1() {
    signal input selector;
    signal input dividend[2], divisor[2];

    signal output absDividend[2];
    signal output absQuotient[2];
    signal output absRemainder[2];
    signal output absDivisorWords[4];
    signal output divisorIsZero;
    signal output resultIsNegative;
    signal output useMod;

    signal isSigned
        <-- selector == (1 << 4) || selector == (1 << 6) ? 1 : 0;
    useMod <-- selector == (1 << 5) || selector == (1 << 6) ? 1 : 0;
    isSigned * (1 - isSigned) === 0;
    useMod * (1 - useMod) === 0;
    selector
        === 8
        + 8 * isSigned
        + 24 * useMod
        + 24 * isSigned * useMod;

    component dividendBits[2];
    component divisorBits[2];
    component dividendMagnitude = ConditionalMagnitudeFromBits();
    component divisorMagnitude = ConditionalMagnitudeFromBits();
    dividendMagnitude.isSigned <== isSigned;
    divisorMagnitude.isSigned <== isSigned;

    for (var limb = 0; limb < 2; limb++) {
        dividendBits[limb] = Num2Bits(128);
        divisorBits[limb] = Num2Bits(128);
        dividendBits[limb].in <== dividend[limb];
        divisorBits[limb].in <== divisor[limb];

        for (var bit = 0; bit < 128; bit++) {
            dividendMagnitude.bits[128 * limb + bit]
                <== dividendBits[limb].out[bit];
            divisorMagnitude.bits[128 * limb + bit]
                <== divisorBits[limb].out[bit];
        }
    }

    for (var limb = 0; limb < 2; limb++) {
        absDividend[limb] <== dividendMagnitude.magnitude[limb];
    }

    for (var word = 0; word < 4; word++) {
        absDivisorWords[word] <== divisorMagnitude.words[word];
    }
    divisorIsZero <== divisorMagnitude.isZero;

    signal safeAbsDivisor[2] <== [
        divisorMagnitude.magnitude[0] + divisorIsZero,
        divisorMagnitude.magnitude[1]
    ];
    var division[2][2] = _div256(absDividend, safeAbsDivisor);
    for (var limb = 0; limb < 2; limb++) {
        absQuotient[limb] <-- division[0][limb];
        absRemainder[limb] <-- division[1][limb];
    }

    // The second part checks the other remainder limb and both quotient limbs.
    // This one decomposition balances the two composed placements.
    component remainderLowBits = Num2Bits(128);
    remainderLowBits.in <== absRemainder[0];

    signal quotientIsNegative
        <== XOR()(dividendMagnitude.sign, divisorMagnitude.sign);
    signal selectedSign <== quotientIsNegative
        + useMod * (dividendMagnitude.sign - quotientIsNegative);
    resultIsNegative <== isSigned * selectedSign;
}

// This helper assumes that magnitude is canonical and isNegative is boolean.
// Those properties are supplied by the exact first-part wires and the local
// quotient/remainder checks in DivisionFamilyPart2.
template RecoverSignedMagnitudeFromCanonical_unsafe() {
    var BASE128 = 1 << 128;

    signal input magnitude[2];
    signal input isNegative;
    signal output signedValue[2];

    signal lowIsZero <== IsZero()(magnitude[0]);
    signal magnitudeIsZero <== IsZero()(magnitude[0] + magnitude[1]);
    signal lowBorrow <== 1 - lowIsZero;
    signal finalBorrow <== 1 - magnitudeIsZero;
    signal negativeValue[2] <== [
        BASE128 * lowBorrow - magnitude[0],
        BASE128 * finalBorrow - magnitude[1] - lowBorrow
    ];

    for (var limb = 0; limb < 2; limb++) {
        signedValue[limb]
            <== magnitude[limb]
            + isNegative * (negativeValue[limb] - magnitude[limb]);
    }
}

template DivisionFamilyPart2() {
    var BASE64 = 1 << 64;
    var BASE128 = 1 << 128;

    signal input absDividend[2];
    signal input absQuotient[2];
    signal input absRemainder[2];
    signal input absDivisorWords[4];
    signal input divisorIsZero;
    signal input resultIsNegative;
    signal input useMod;
    signal output out[2];

    component quotientBits[2];
    signal quotientWords[4];
    for (var limb = 0; limb < 2; limb++) {
        quotientBits[limb] = Num2Bits(128);
        quotientBits[limb].in <== absQuotient[limb];

        var quotientLow = 0;
        var quotientHigh = 0;
        for (var bit = 0; bit < 64; bit++) {
            quotientLow += quotientBits[limb].out[bit] * (1 << bit);
            quotientHigh += quotientBits[limb].out[bit + 64] * (1 << bit);
        }
        quotientWords[2 * limb] <== quotientLow;
        quotientWords[2 * limb + 1] <== quotientHigh;
    }

    component remainderHighBits = Num2Bits(128);
    remainderHighBits.in <== absRemainder[1];

    signal safeDivisorWords[4] <== [
        absDivisorWords[0] + divisorIsZero,
        absDivisorWords[1],
        absDivisorWords[2],
        absDivisorWords[3]
    ];
    signal safeDivisor[2] <== [
        safeDivisorWords[0] + BASE64 * safeDivisorWords[1],
        safeDivisorWords[2] + BASE64 * safeDivisorWords[3]
    ];

    signal products[4][4];
    for (var quotientWord = 0; quotientWord < 4; quotientWord++) {
        for (var divisorWord = 0; divisorWord < 4; divisorWord++) {
            products[quotientWord][divisorWord]
                <== quotientWords[quotientWord] * safeDivisorWords[divisorWord];
        }
    }

    signal coefficient[7];
    for (var degree = 0; degree < 7; degree++) {
        var coefficientSum = 0;
        for (var quotientWord = 0; quotientWord < 4; quotientWord++) {
            var divisorWord = degree - quotientWord;
            if (divisorWord >= 0 && divisorWord < 4) {
                coefficientSum += products[quotientWord][divisorWord];
            }
        }
        coefficient[degree] <== coefficientSum;
    }

    signal carry[2];
    carry[0] <-- (
        coefficient[0]
        + BASE64 * coefficient[1]
        + absRemainder[0]
    ) \ BASE128;
    carry[1] <-- (
        coefficient[2]
        + BASE64 * coefficient[3]
        + absRemainder[1]
        + carry[0]
    ) \ BASE128;
    component carryLowBits = Num2Bits(65);
    component carryMiddleBits = Num2Bits(66);
    carryLowBits.in <== carry[0];
    carryMiddleBits.in <== carry[1];

    coefficient[0]
        + BASE64 * coefficient[1]
        + absRemainder[0]
        === absDividend[0] + BASE128 * carry[0];
    coefficient[2]
        + BASE64 * coefficient[3]
        + absRemainder[1]
        + carry[0]
        === absDividend[1] + BASE128 * carry[1];
    coefficient[4]
        + BASE64 * coefficient[5]
        + carry[1]
        === 0;
    coefficient[6] === 0;

    signal remainderLowerLess
        <== LessThan(128)([absRemainder[0], safeDivisor[0]]);
    signal remainderUpperLess
        <== LessThan(128)([absRemainder[1], safeDivisor[1]]);
    signal remainderUpperEqual
        <== IsEqual()([absRemainder[1], safeDivisor[1]]);
    signal remainderInRange
        <== remainderUpperLess
        + remainderUpperEqual * remainderLowerLess;
    remainderInRange === 1;

    signal evmQuotient[2];
    signal selectedMagnitude[2];
    for (var limb = 0; limb < 2; limb++) {
        evmQuotient[limb]
            <== (1 - divisorIsZero) * absQuotient[limb];
        selectedMagnitude[limb]
            <== evmQuotient[limb]
            + useMod * (absRemainder[limb] - evmQuotient[limb]);
    }

    out <== RecoverSignedMagnitudeFromCanonical_unsafe()(
        selectedMagnitude,
        resultIsNegative
    );
}
