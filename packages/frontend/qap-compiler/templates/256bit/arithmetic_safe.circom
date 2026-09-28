pragma circom 2.1.6;
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/gates.circom";
include "../128bit/arithmetic.circom";
include "mux.circom";
include "compare_safe.circom";
include "../../functions/arithmetic.circom";

template Split128To64() {
    var BASE64 = 1 << 64;

    signal input in;
    signal output words[2];

    words[0] <-- in % BASE64;
    words[1] <-- in \ BASE64;

    component wordBits[2];
    for (var word = 0; word < 2; word++) {
        wordBits[word] = Num2Bits(64);
        wordBits[word].in <== words[word];
    }

    in === words[0] + BASE64 * words[1];
}

template Mul256Full() {
    var BASE64 = 1 << 64;

    signal input in1[2], in2[2];
    signal output productWords[8];

    component in1Split[2];
    component in2Split[2];
    signal in1Words[4];
    signal in2Words[4];
    for (var limb = 0; limb < 2; limb++) {
        in1Split[limb] = Split128To64();
        in2Split[limb] = Split128To64();
        in1Split[limb].in <== in1[limb];
        in2Split[limb].in <== in2[limb];
        in1Words[2 * limb] <== in1Split[limb].words[0];
        in1Words[2 * limb + 1] <== in1Split[limb].words[1];
        in2Words[2 * limb] <== in2Split[limb].words[0];
        in2Words[2 * limb + 1] <== in2Split[limb].words[1];
    }

    signal products[4][4];
    for (var lhsWord = 0; lhsWord < 4; lhsWord++) {
        for (var rhsWord = 0; rhsWord < 4; rhsWord++) {
            products[lhsWord][rhsWord]
                <== in1Words[lhsWord] * in2Words[rhsWord];
        }
    }

    signal carry[7];
    component productWordBits[8];
    component carryBits[6];
    for (var degree = 0; degree < 7; degree++) {
        var coefficient = 0;
        for (var lhsWord = 0; lhsWord < 4; lhsWord++) {
            var rhsWord = degree - lhsWord;
            if (rhsWord >= 0 && rhsWord < 4) {
                coefficient += products[lhsWord][rhsWord];
            }
        }

        var previousCarry = 0;
        if (degree > 0) {
            previousCarry = carry[degree - 1];
        }
        productWords[degree] <-- (coefficient + previousCarry) % BASE64;
        carry[degree] <-- (coefficient + previousCarry) \ BASE64;
        coefficient + previousCarry
            === productWords[degree] + BASE64 * carry[degree];

        productWordBits[degree] = Num2Bits(64);
        productWordBits[degree].in <== productWords[degree];
        if (degree < 6) {
            carryBits[degree] = Num2Bits(66);
            carryBits[degree].in <== carry[degree];
        }
    }

    productWords[7] <== carry[6];
    productWordBits[7] = Num2Bits(64);
    productWordBits[7].in <== productWords[7];
}

// numeratorWords must be eight canonical 64-bit words supplied by the
// numerator relation in the same compiled circuit.
template Reduce512By256FromCanonical64() {
    var BASE64 = 1 << 64;

    signal input numeratorWords[8], modulus[2];
    signal output remainder[2];

    component modulusSplit[2];
    signal modulusWords[4];
    for (var limb = 0; limb < 2; limb++) {
        modulusSplit[limb] = Split128To64();
        modulusSplit[limb].in <== modulus[limb];
        modulusWords[2 * limb] <== modulusSplit[limb].words[0];
        modulusWords[2 * limb + 1] <== modulusSplit[limb].words[1];
    }

    signal modulusIsZero <== IsZero256()(modulus);
    signal safeModulus[2] <== [modulus[0] + modulusIsZero, modulus[1]];
    signal safeModulusWords[4] <== [
        modulusWords[0] + modulusIsZero,
        modulusWords[1],
        modulusWords[2],
        modulusWords[3]
    ];

    signal numerator[4];
    for (var limb = 0; limb < 4; limb++) {
        numerator[limb]
            <== numeratorWords[2 * limb]
            + BASE64 * numeratorWords[2 * limb + 1];
    }

    signal division[2][4] <-- _div512by256(numerator, safeModulus);
    signal quotient[4] <== division[0];
    signal remainderWide[4] <== division[1];
    remainderWide[2] === 0;
    remainderWide[3] === 0;

    component quotientSplit[4];
    signal quotientWords[8];
    for (var limb = 0; limb < 4; limb++) {
        quotientSplit[limb] = Split128To64();
        quotientSplit[limb].in <== quotient[limb];
        quotientWords[2 * limb] <== quotientSplit[limb].words[0];
        quotientWords[2 * limb + 1] <== quotientSplit[limb].words[1];
    }

    component remainderSplit[2];
    signal remainderWords[4];
    for (var limb = 0; limb < 2; limb++) {
        remainderSplit[limb] = Split128To64();
        remainderSplit[limb].in <== remainderWide[limb];
        remainderWords[2 * limb] <== remainderSplit[limb].words[0];
        remainderWords[2 * limb + 1] <== remainderSplit[limb].words[1];
        remainder[limb] <== remainderWide[limb];
    }

    signal products[8][4];
    for (var quotientWord = 0; quotientWord < 8; quotientWord++) {
        for (var modulusWord = 0; modulusWord < 4; modulusWord++) {
            products[quotientWord][modulusWord]
                <== quotientWords[quotientWord]
                * safeModulusWords[modulusWord];
        }
    }

    signal carry[11];
    component carryBits[10];
    for (var degree = 0; degree < 11; degree++) {
        var coefficient = 0;
        for (var quotientWord = 0; quotientWord < 8; quotientWord++) {
            var modulusWord = degree - quotientWord;
            if (modulusWord >= 0 && modulusWord < 4) {
                coefficient += products[quotientWord][modulusWord];
            }
        }

        var previousCarry = 0;
        if (degree > 0) {
            previousCarry = carry[degree - 1];
        }
        var remainderWord = 0;
        if (degree < 4) {
            remainderWord = remainderWords[degree];
        }
        var numeratorWord = 0;
        if (degree < 8) {
            numeratorWord = numeratorWords[degree];
        }

        carry[degree] <-- (
            coefficient + previousCarry + remainderWord - numeratorWord
        ) \ BASE64;
        coefficient + previousCarry + remainderWord
            === numeratorWord + BASE64 * carry[degree];

        if (degree < 10) {
            carryBits[degree] = Num2Bits(66);
            carryBits[degree].in <== carry[degree];
        }
    }
    carry[10] === 0;

    signal remainderLowerLess
        <== LessThan(128)([remainder[0], safeModulus[0]]);
    signal remainderUpperLess
        <== LessThan(128)([remainder[1], safeModulus[1]]);
    signal remainderUpperEqual
        <== IsEqual()([remainder[1], safeModulus[1]]);
    signal remainderInRange
        <== remainderUpperLess
        + remainderUpperEqual * remainderLowerLess;
    remainderInRange === 1;
}

function _addmodSafeModulusWitness(modulus) {
    if (modulus[0] == 0 && modulus[1] == 0) {
        return [1, 0];
    }
    return modulus;
}

template Split256ToRadix86() {
    signal input in[2];
    signal output words[3];

    component bits[2];
    for (var limb = 0; limb < 2; limb++) {
        bits[limb] = Num2Bits(128);
        bits[limb].in <== in[limb];
    }

    var powers[86];
    powers[0] = 1;
    for (var bit = 1; bit < 86; bit++) {
        powers[bit] = 2 * powers[bit - 1];
    }

    var word0 = 0;
    var word1 = 0;
    var word2 = 0;
    for (var bit = 0; bit < 86; bit++) {
        word0 += powers[bit] * bits[0].out[bit];
    }
    for (var bit = 86; bit < 128; bit++) {
        word1 += powers[bit - 86] * bits[0].out[bit];
    }
    for (var bit = 0; bit < 44; bit++) {
        word1 += powers[42 + bit] * bits[1].out[bit];
    }
    for (var bit = 44; bit < 128; bit++) {
        word2 += powers[bit - 44] * bits[1].out[bit];
    }

    words[0] <== word0;
    words[1] <== word1;
    words[2] <== word2;
}

template AddMod257Prepare() {
    var BASE86 = 1 << 86;

    signal input in1[2], in2[2], modulus[2];
    signal output numeratorWords[3];
    signal output quotientWords[3];
    signal output remainder[2];

    component in1Split = Split256ToRadix86();
    component in2Split = Split256ToRadix86();
    in1Split.in <== in1;
    in2Split.in <== in2;

    signal carry[2];
    component carryBits[2];
    component numeratorBits[2];
    for (var degree = 0; degree < 2; degree++) {
        var previousCarry = 0;
        if (degree > 0) {
            previousCarry = carry[degree - 1];
        }
        numeratorWords[degree]
            <-- (in1Split.words[degree] + in2Split.words[degree] + previousCarry) % BASE86;
        carry[degree]
            <-- (in1Split.words[degree] + in2Split.words[degree] + previousCarry) \ BASE86;
        in1Split.words[degree] + in2Split.words[degree] + previousCarry
            === numeratorWords[degree] + BASE86 * carry[degree];
        carryBits[degree] = Num2Bits(1);
        carryBits[degree].in <== carry[degree];
        numeratorBits[degree] = Num2Bits(86);
        numeratorBits[degree].in <== numeratorWords[degree];
    }
    numeratorWords[2]
        <== in1Split.words[2] + in2Split.words[2] + carry[1];

    signal sum[3] <-- _add256(in1, in2);
    signal safeModulus[2] <-- _addmodSafeModulusWitness(modulus);
    signal numerator128[4] <-- [sum[0], sum[1], sum[2], 0];
    signal division[2][4] <-- _div512by256(numerator128, safeModulus);

    quotientWords[0] <-- division[0][0] % BASE86;
    quotientWords[1]
        <-- (division[0][0] \ BASE86)
        + (division[0][1] % (1 << 44)) * (1 << 42);
    quotientWords[2]
        <-- (division[0][1] \ (1 << 44))
        + division[0][2] * (1 << 84);
    component quotientBits[3];
    quotientBits[0] = Num2Bits(86);
    quotientBits[1] = Num2Bits(86);
    quotientBits[2] = Num2Bits(85);
    for (var word = 0; word < 3; word++) {
        quotientBits[word].in <== quotientWords[word];
    }

    remainder <-- [division[1][0], division[1][1]];
}

template AddMod257Verify() {
    var BASE86 = 1 << 86;

    signal input numeratorWords[3];
    signal input modulus[2];
    signal input quotientWords[3];
    signal input remainder[2];
    signal output out[2];

    component modulusSplit = Split256ToRadix86();
    component remainderSplit = Split256ToRadix86();
    modulusSplit.in <== modulus;
    remainderSplit.in <== remainder;

    signal modulusWordSum
        <== modulusSplit.words[0] + modulusSplit.words[1] + modulusSplit.words[2];
    signal modulusIsZero <== IsZero()(modulusWordSum);
    signal safeModulusWords[3] <== [
        modulusSplit.words[0] + modulusIsZero,
        modulusSplit.words[1],
        modulusSplit.words[2]
    ];

    signal products[3][3];
    for (var quotientWord = 0; quotientWord < 3; quotientWord++) {
        for (var modulusWord = 0; modulusWord < 3; modulusWord++) {
            products[quotientWord][modulusWord]
                <== quotientWords[quotientWord] * safeModulusWords[modulusWord];
        }
    }

    signal carry[2];
    component carryBits[2];
    for (var degree = 0; degree < 2; degree++) {
        var coefficient = 0;
        for (var quotientWord = 0; quotientWord < 3; quotientWord++) {
            var modulusWord = degree - quotientWord;
            if (modulusWord >= 0 && modulusWord < 3) {
                coefficient += products[quotientWord][modulusWord];
            }
        }
        var previousCarry = 0;
        if (degree > 0) {
            previousCarry = carry[degree - 1];
        }
        carry[degree]
            <-- (coefficient + previousCarry + remainderSplit.words[degree]
                - numeratorWords[degree]) \ BASE86;
        coefficient + previousCarry + remainderSplit.words[degree]
            === numeratorWords[degree] + BASE86 * carry[degree];
        carryBits[degree] = Num2Bits(86 + degree);
        carryBits[degree].in <== carry[degree];
    }

    products[0][2] + products[1][1] + products[2][0]
        + carry[1] + remainderSplit.words[2]
        === numeratorWords[2];
    products[1][2] + products[2][1] === 0;
    products[2][2] === 0;

    signal safeModulus[2] <== [
        modulus[0] + modulusIsZero,
        modulus[1]
    ];
    signal remainderLowerLess
        <== LessThan(128)([remainder[0], safeModulus[0]]);
    signal remainderUpperLess
        <== LessThan(128)([remainder[1], safeModulus[1]]);
    signal remainderUpperEqual
        <== IsEqual()([remainder[1], safeModulus[1]]);
    signal remainderInRange
        <== remainderUpperLess
        + remainderUpperEqual * remainderLowerLess;
    remainderInRange === 1;

    out <== remainder;
}

template MulMod256() {
    signal input in1[2], in2[2], modulus[2];
    signal output out[2];

    signal numeratorWords[8] <== Mul256Full()(in1, in2);
    out <== Reduce512By256FromCanonical64()(numeratorWords, modulus);
}

template FindShiftingTwosPower256(N) {
    signal input shift;
    signal output twos_power[2], is_shift_gt_255;

    // case 1
    is_shift_gt_255 <== GreaterThan(N)([shift, 255]);
    // case 2
    signal is_shift_gt_127 <== GreaterThan(N)([shift, 127]);
    // case 3: !is_shift_gt_127

    signal shift_up_inter <== (shift - 128) * is_shift_gt_127;
    signal shift_up <== (1 - is_shift_gt_255) * shift_up_inter;
    signal shift_masked <== shift * (1 - is_shift_gt_127);

    // case 2 and 3
    signal (exp_shift_case2, exp_shift_case3) <== TwosExp128TwoInput()(shift_up, shift_masked);
    signal case23_out[2] <== Mux256()(is_shift_gt_127, [0, exp_shift_case2], [exp_shift_case3, 0]);
    twos_power <== Mux256()(is_shift_gt_255, [0, 0], case23_out);
}

template FindShiftingTwosPower256TwoInput(N1, N2) {
    signal input shift1, shift2;
    signal output twos_power1[2], is_shift1_gt_255, twos_power2[2], is_shift2_gt_255;

    // case 1
    is_shift1_gt_255 <== GreaterThan(N1)([shift1, 255]);
    is_shift2_gt_255 <== GreaterThan(N2)([shift2, 255]);
    // case 2
    signal is_shift1_gt_127 <== GreaterThan(N1)([shift1, 127]);
    signal is_shift2_gt_127 <== GreaterThan(N2)([shift2, 127]);
    // case 3: !is_shift_gt_127

    signal shift1_up_inter <== (shift1 - 128) * is_shift1_gt_127;
    signal shift1_up <== (1 - is_shift1_gt_255) * shift1_up_inter;
    signal shift1_masked <== shift1 * (1 - is_shift1_gt_127);

    signal shift2_up_inter <== (shift2 - 128) * is_shift2_gt_127;
    signal shift2_up <== (1 - is_shift2_gt_255) * shift2_up_inter;
    signal shift2_masked <== shift2 * (1 - is_shift2_gt_127);

    // case 2 and 3
    signal (exp_shift1_case2, exp_shift1_case3, exp_shift2_case2, exp_shift2_case3) <== TwosExp128FourInput()(shift1_up, shift1_masked, shift2_up, shift2_masked);
    signal case23_out1[2] <== Mux256()(is_shift1_gt_127, [0, exp_shift1_case2], [exp_shift1_case3, 0]);
    signal case23_out2[2] <== Mux256()(is_shift2_gt_127, [0, exp_shift2_case2], [exp_shift2_case3, 0]);
    twos_power1 <== Mux256()(is_shift1_gt_255, [0, 0], case23_out1);
    twos_power2 <== Mux256()(is_shift2_gt_255, [0, 0], case23_out2);
}

template DivMod256() {
    var BASE64 = 1 << 64;
    var BASE128 = 1 << 128;

    signal input dividend[2], divisor[2];
    signal output quotient[2], remainder[2];

    component divisorBits[2];
    component dividendBits[2];
    component quotientBits[2];
    component remainderBits[2];
    signal divisorWords[4];
    signal quotientWords[4];
    var divisorBitSum = 0;
    for (var limb = 0; limb < 2; limb++) {
        divisorBits[limb] = Num2Bits(128);
        dividendBits[limb] = Num2Bits(128);
        divisorBits[limb].in <== divisor[limb];
        dividendBits[limb].in <== dividend[limb];

        var divisorLow = 0;
        var divisorHigh = 0;
        for (var bit = 0; bit < 64; bit++) {
            divisorLow += divisorBits[limb].out[bit] * (1 << bit);
            divisorHigh += divisorBits[limb].out[bit + 64] * (1 << bit);
            divisorBitSum += divisorBits[limb].out[bit]
                + divisorBits[limb].out[bit + 64];
        }
        divisorWords[2 * limb] <== divisorLow;
        divisorWords[2 * limb + 1] <== divisorHigh;
    }

    signal divisorIsZero <== IsZero()(divisorBitSum);
    signal safeDivisor[2] <== [divisor[0] + divisorIsZero, divisor[1]];
    signal safeDivisorWords[4] <== [
        divisorWords[0] + divisorIsZero,
        divisorWords[1],
        divisorWords[2],
        divisorWords[3]
    ];

    var division[2][2] = _div256(dividend, safeDivisor);
    signal relationQuotient[2] <-- division[0];
    signal relationRemainder[2] <-- division[1];

    for (var limb = 0; limb < 2; limb++) {
        quotientBits[limb] = Num2Bits(128);
        remainderBits[limb] = Num2Bits(128);
        quotientBits[limb].in <== relationQuotient[limb];
        remainderBits[limb].in <== relationRemainder[limb];

        var quotientLow = 0;
        var quotientHigh = 0;
        for (var bit = 0; bit < 64; bit++) {
            quotientLow += quotientBits[limb].out[bit] * (1 << bit);
            quotientHigh += quotientBits[limb].out[bit + 64] * (1 << bit);
        }
        quotientWords[2 * limb] <== quotientLow;
        quotientWords[2 * limb + 1] <== quotientHigh;
    }

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
        + relationRemainder[0]
    ) \ BASE128;
    carry[1] <-- (
        coefficient[2]
        + BASE64 * coefficient[3]
        + relationRemainder[1]
        + carry[0]
    ) \ BASE128;
    component carryLowBits = Num2Bits(65);
    component carryMiddleBits = Num2Bits(66);
    carryLowBits.in <== carry[0];
    carryMiddleBits.in <== carry[1];

    coefficient[0]
        + BASE64 * coefficient[1]
        + relationRemainder[0]
        === dividend[0] + BASE128 * carry[0];
    coefficient[2]
        + BASE64 * coefficient[3]
        + relationRemainder[1]
        + carry[0]
        === dividend[1] + BASE128 * carry[1];
    coefficient[4]
        + BASE64 * coefficient[5]
        + carry[1]
        === 0;
    coefficient[6] === 0;

    signal remainderLowerLess
        <== LessThan(128)([relationRemainder[0], safeDivisor[0]]);
    signal remainderUpperLess
        <== LessThan(128)([relationRemainder[1], safeDivisor[1]]);
    signal remainderUpperEqual
        <== IsEqual()([relationRemainder[1], safeDivisor[1]]);
    signal remainderInRange
        <== remainderUpperLess
        + remainderUpperEqual * remainderLowerLess;
    remainderInRange === 1;

    for (var limb = 0; limb < 2; limb++) {
        quotient[limb]
            <== (1 - divisorIsZero) * relationQuotient[limb];
        remainder[limb] <== relationRemainder[limb];
    }
}

template Byte256() {
    signal input index[2], value[2];
    signal output out[2];

    component indexBits[2];
    component valueBits[2];
    for (var limb = 0; limb < 2; limb++) {
        indexBits[limb] = Num2Bits(128);
        valueBits[limb] = Num2Bits(128);
        indexBits[limb].in <== index[limb];
        valueBits[limb].in <== value[limb];
    }

    var oversizedSum = 0;
    for (var bit = 5; bit < 128; bit++) {
        oversizedSum += indexBits[0].out[bit];
    }
    for (var bit = 0; bit < 128; bit++) {
        oversizedSum += indexBits[1].out[bit];
    }
    signal inRange <== IsZero()(oversizedSum);

    signal selected[6][32];
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
        selected[0][byte] <== byteValue;
    }

    for (var step = 0; step < 5; step++) {
        var active = 32 \ (1 << (step + 1));
        for (var candidate = 0; candidate < 32; candidate++) {
            if (candidate < active) {
                selected[step + 1][candidate] <== selected[step][2 * candidate]
                    + indexBits[0].out[step]
                    * (selected[step][2 * candidate + 1] - selected[step][2 * candidate]);
            } else {
                selected[step + 1][candidate] <== 0;
            }
        }
    }

    out[0] <== inRange * selected[5][0];
    out[1] <== 0;
}

template SignExtend256() {
    signal input index[2], value[2];
    signal output out[2];

    component indexBits[2];
    component valueBits[2];
    for (var limb = 0; limb < 2; limb++) {
        indexBits[limb] = Num2Bits(128);
        valueBits[limb] = Num2Bits(128);
        indexBits[limb].in <== index[limb];
        valueBits[limb].in <== value[limb];
    }

    var oversizedSum = 0;
    for (var bit = 5; bit < 128; bit++) {
        oversizedSum += indexBits[0].out[bit];
    }
    for (var bit = 0; bit < 128; bit++) {
        oversizedSum += indexBits[1].out[bit];
    }
    signal inRange <== IsZero()(oversizedSum);

    signal indexMatch[6][32];
    indexMatch[0][0] <== 1;
    for (var candidate = 1; candidate < 32; candidate++) {
        indexMatch[0][candidate] <== 0;
    }
    for (var step = 0; step < 5; step++) {
        var active = 1 << step;
        for (var candidate = 0; candidate < 32; candidate++) {
            if (candidate < active) {
                indexMatch[step + 1][candidate + active]
                    <== indexMatch[step][candidate] * indexBits[0].out[step];
                indexMatch[step + 1][candidate]
                    <== indexMatch[step][candidate]
                    - indexMatch[step + 1][candidate + active];
            } else if (candidate >= 2 * active) {
                indexMatch[step + 1][candidate] <== 0;
            }
        }
    }

    signal signDifference[31];
    var selectedSignValue = valueBits[1].out[127];
    for (var byte = 0; byte < 31; byte++) {
        if (byte < 16) {
            signDifference[byte] <== indexMatch[5][byte]
                * (valueBits[0].out[8 * byte + 7] - valueBits[1].out[127]);
        } else {
            signDifference[byte] <== indexMatch[5][byte]
                * (valueBits[1].out[8 * (byte - 16) + 7] - valueBits[1].out[127]);
        }
        selectedSignValue += signDifference[byte];
    }
    signal selectedSign <== selectedSignValue;

    signal originalByte[32];
    signal resultByte[32];
    signal fillActive[31];
    var lowerIndexSum = 0;
    var low = 0;
    var high = 0;
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
            resultByte[byte] <== originalByte[byte];
        } else {
            lowerIndexSum += indexMatch[5][byte - 1];
            fillActive[byte - 1] <== inRange * lowerIndexSum;
            resultByte[byte] <== originalByte[byte]
                + fillActive[byte - 1] * (255 * selectedSign - originalByte[byte]);
        }

        if (byte < 16) {
            low += resultByte[byte] * (1 << (8 * byte));
        } else {
            high += resultByte[byte] * (1 << (8 * (byte - 16)));
        }
    }

    out[0] <== low;
    out[1] <== high;
}

// Every input must be connected to a locally constrained bit decomposition.
template ShiftLeft256FromBits_unsafe() {
    signal input shiftLowBits[128], shiftHighContribution, valueBits[2][128];
    signal output out[2], outBits[2][128], inRange;

    signal valueWords[4];
    for (var limb = 0; limb < 2; limb++) {
        var lowWord = 0;
        var highWord = 0;
        for (var bit = 0; bit < 64; bit++) {
            lowWord += valueBits[limb][bit] * (1 << bit);
            highWord += valueBits[limb][bit + 64] * (1 << bit);
        }
        valueWords[2 * limb] <== lowWord;
        valueWords[2 * limb + 1] <== highWord;
    }

    var oversizedSum = shiftHighContribution;
    for (var bit = 8; bit < 128; bit++) {
        oversizedSum += shiftLowBits[bit];
    }
    inRange <== IsZero()(oversizedSum);

    signal wordPower[7];
    wordPower[0] <== 1;
    for (var bit = 0; bit < 6; bit++) {
        var selectedFactor = (1 << (1 << bit)) - 1;
        wordPower[bit + 1] <== wordPower[bit]
            * (1 + shiftLowBits[bit] * selectedFactor);
    }

    signal shiftWords[4];
    signal lowPair <== wordPower[6] * (1 - shiftLowBits[7]);
    signal highPair <== wordPower[6] - lowPair;
    shiftWords[1] <== lowPair * shiftLowBits[6];
    shiftWords[0] <== lowPair - shiftWords[1];
    shiftWords[3] <== highPair * shiftLowBits[6];
    shiftWords[2] <== highPair - shiftWords[3];

    component shifted = Mul256TruncatedFrom64_unsafe();
    shifted.in1 <== valueWords;
    shifted.in2 <== shiftWords;
    out[0] <== inRange * shifted.out[0];
    out[1] <== inRange * shifted.out[1];
    component canonicalOutput[2];
    for (var limb = 0; limb < 2; limb++) {
        canonicalOutput[limb] = Num2Bits(128);
        canonicalOutput[limb].in <== out[limb];
        for (var bit = 0; bit < 128; bit++) {
            outBits[limb][bit] <== canonicalOutput[limb].out[bit];
        }
    }
}

template ShiftLeft256() {
    signal input shift[2], value[2];
    signal output out[2];

    component shiftLowBits = Num2Bits(128);
    component shiftHighIsZero = IsZero();
    component valueBits[2];
    component core = ShiftLeft256FromBits_unsafe();
    shiftLowBits.in <== shift[0];
    shiftHighIsZero.in <== shift[1];
    core.shiftHighContribution <== 1 - shiftHighIsZero.out;
    for (var bit = 0; bit < 128; bit++) {
        core.shiftLowBits[bit] <== shiftLowBits.out[bit];
    }
    for (var limb = 0; limb < 2; limb++) {
        valueBits[limb] = Num2Bits(128);
        valueBits[limb].in <== value[limb];
        for (var bit = 0; bit < 128; bit++) {
            core.valueBits[limb][bit] <== valueBits[limb].out[bit];
        }
    }
    out <== core.out;
}

template ShiftRight256() {
    signal input shift[2], value[2];
    signal output out[2], inRange, valueSign, shiftLowBits[8];

    component shiftLowBitsComponent = Num2Bits(128);
    component shiftHighIsZero = IsZero();
    component valueBits[2];
    component core = ShiftLeft256FromBits_unsafe();
    shiftLowBitsComponent.in <== shift[0];
    shiftHighIsZero.in <== shift[1];
    core.shiftHighContribution <== 1 - shiftHighIsZero.out;
    for (var bit = 0; bit < 128; bit++) {
        core.shiftLowBits[bit] <== shiftLowBitsComponent.out[bit];
    }
    for (var limb = 0; limb < 2; limb++) {
        valueBits[limb] = Num2Bits(128);
        valueBits[limb].in <== value[limb];
    }
    for (var limb = 0; limb < 2; limb++) {
        for (var bit = 0; bit < 128; bit++) {
            var reversed = 255 - (128 * limb + bit);
            var reversedLimb = reversed \ 128;
            var reversedBit = reversed % 128;
            core.valueBits[limb][bit]
                <== valueBits[reversedLimb].out[reversedBit];
        }
    }

    for (var limb = 0; limb < 2; limb++) {
        var result = 0;
        for (var bit = 0; bit < 128; bit++) {
            var reversed = 255 - (128 * limb + bit);
            var reversedLimb = reversed \ 128;
            var reversedBit = reversed % 128;
            result += core.outBits[reversedLimb][reversedBit] * (1 << bit);
        }
        out[limb] <== result;
    }
    inRange <== core.inRange;
    valueSign <== valueBits[1].out[127];
    for (var bit = 0; bit < 8; bit++) {
        shiftLowBits[bit] <== shiftLowBitsComponent.out[bit];
    }
}

// The input bits must come from a constrained decomposition. For a nonzero
// shift byte, negativeFiller is 2^256 - 2^(256 - shift). A zero shift produces
// a zero filler.
template InverseShiftPower256FromBits_unsafe() {
    var BASE64 = 1 << 64;
    var BASE128 = 1 << 128;

    signal input shiftBits[8];
    signal output negativeFiller[2];

    signal borrow[9];
    signal borrowedBit[8];
    signal shiftMinusOneBits[8];
    signal inverseBits[8];
    borrow[0] <== 1;
    for (var bit = 0; bit < 8; bit++) {
        borrowedBit[bit] <== shiftBits[bit] * borrow[bit];
        shiftMinusOneBits[bit]
            <== shiftBits[bit] + borrow[bit] - 2 * borrowedBit[bit];
        borrow[bit + 1] <== borrow[bit] - borrowedBit[bit];
        inverseBits[bit] <== 1 - shiftMinusOneBits[bit];
    }

    signal wordPower[7];
    wordPower[0] <== 1;
    for (var bit = 0; bit < 6; bit++) {
        var selectedFactor = (1 << (1 << bit)) - 1;
        wordPower[bit + 1] <== wordPower[bit]
            * (1 + inverseBits[bit] * selectedFactor);
    }

    signal powerWords[4];
    signal lowPair <== wordPower[6] * (1 - inverseBits[7]);
    signal highPair <== wordPower[6] - lowPair;
    powerWords[1] <== lowPair * inverseBits[6];
    powerWords[0] <== lowPair - powerWords[1] - borrow[8];
    powerWords[3] <== highPair * inverseBits[6];
    powerWords[2] <== highPair - powerWords[3];

    signal power[2];
    power[0] <== powerWords[0] + BASE64 * powerWords[1];
    power[1] <== powerWords[2] + BASE64 * powerWords[3];

    signal lowPower <== 1 - borrow[8] - inverseBits[7];
    negativeFiller[0] <== lowPower * BASE128 - power[0];
    negativeFiller[1] <== lowPower * (BASE128 - 1)
        + inverseBits[7] * BASE128 - power[1];
}
