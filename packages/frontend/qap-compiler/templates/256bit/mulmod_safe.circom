pragma circom 2.1.6;

include "arithmetic_safe.circom";

function _mul256Full128Witness(lhs, rhs) {
    var BASE128 = 1 << 128;
    var p00[2] = mul128(lhs[0], rhs[0]);
    var p01[2] = mul128(lhs[0], rhs[1]);
    var p10[2] = mul128(lhs[1], rhs[0]);
    var p11[2] = mul128(lhs[1], rhs[1]);

    var sum1 = p00[1] + p01[0] + p10[0];
    var sum2 = p01[1] + p10[1] + p11[0] + sum1 \ BASE128;
    return [
        p00[0],
        sum1 % BASE128,
        sum2 % BASE128,
        p11[1] + sum2 \ BASE128
    ];
}

function _safeModulusWitness(modulus) {
    if (modulus[0] == 0 && modulus[1] == 0) {
        return [1, 0];
    }
    return modulus;
}

template MulModPrepare() {
    signal input lhs[2];
    signal input rhs[2];
    signal input modulus[2];
    signal output lhsWords[4];
    signal output rhsWords[4];
    signal output modulusWords[4];
    signal output quotient[4];
    signal output remainder[2];

    component lhsSplit[2];
    component rhsSplit[2];
    component modulusSplit[2];
    for (var limb = 0; limb < 2; limb++) {
        lhsSplit[limb] = Split128To64();
        rhsSplit[limb] = Split128To64();
        modulusSplit[limb] = Split128To64();
        lhsSplit[limb].in <== lhs[limb];
        rhsSplit[limb].in <== rhs[limb];
        modulusSplit[limb].in <== modulus[limb];
        lhsWords[2 * limb] <== lhsSplit[limb].words[0];
        lhsWords[2 * limb + 1] <== lhsSplit[limb].words[1];
        rhsWords[2 * limb] <== rhsSplit[limb].words[0];
        rhsWords[2 * limb + 1] <== rhsSplit[limb].words[1];
        modulusWords[2 * limb] <== modulusSplit[limb].words[0];
        modulusWords[2 * limb + 1] <== modulusSplit[limb].words[1];
    }

    signal numerator[4] <-- _mul256Full128Witness(lhs, rhs);
    signal safeModulus[2] <-- _safeModulusWitness(modulus);
    signal division[2][4] <-- _div512by256(numerator, safeModulus);
    quotient <-- division[0];
    remainder <-- [division[1][0], division[1][1]];
}

template MulModCandidate() {
    signal input quotient[4];
    signal input remainder[2];
    signal output quotientWords[8];
    signal output remainderWords[4];

    component quotientSplit[4];
    for (var limb = 0; limb < 4; limb++) {
        quotientSplit[limb] = Split128To64();
        quotientSplit[limb].in <== quotient[limb];
        quotientWords[2 * limb] <== quotientSplit[limb].words[0];
        quotientWords[2 * limb + 1] <== quotientSplit[limb].words[1];
    }
    component remainderSplit[2];
    for (var limb = 0; limb < 2; limb++) {
        remainderSplit[limb] = Split128To64();
        remainderSplit[limb].in <== remainder[limb];
        remainderWords[2 * limb] <== remainderSplit[limb].words[0];
        remainderWords[2 * limb + 1] <== remainderSplit[limb].words[1];
    }
}

template MulModVerify() {
    var BASE64 = 1 << 64;
    var CARRY_OFFSET = 4 * BASE64;

    signal input lhsWords[4];
    signal input rhsWords[4];
    signal input modulusWords[4];
    signal input quotientWords[8];
    signal input remainderWords[4];
    signal output remainder[2];

    var modulusWordSum = 0;
    for (var word = 0; word < 4; word++) {
        modulusWordSum += modulusWords[word];
    }
    signal modulusIsZero <== IsZero()(modulusWordSum);
    signal safeModulusWords[4] <== [
        modulusWords[0] + modulusIsZero,
        modulusWords[1],
        modulusWords[2],
        modulusWords[3]
    ];

    signal lhsProducts[4][4];
    for (var lhsWord = 0; lhsWord < 4; lhsWord++) {
        for (var rhsWord = 0; rhsWord < 4; rhsWord++) {
            lhsProducts[lhsWord][rhsWord]
                <== lhsWords[lhsWord] * rhsWords[rhsWord];
        }
    }
    signal quotientProducts[8][4];
    for (var quotientWord = 0; quotientWord < 8; quotientWord++) {
        for (var modulusWord = 0; modulusWord < 4; modulusWord++) {
            quotientProducts[quotientWord][modulusWord]
                <== quotientWords[quotientWord]
                * safeModulusWords[modulusWord];
        }
    }

    signal shiftedCarry[10];
    component shiftedCarryBits[10];
    for (var degree = 0; degree < 10; degree++) {
        var lhsCoefficient = 0;
        for (var lhsWord = 0; lhsWord < 4; lhsWord++) {
            var rhsWord = degree - lhsWord;
            if (rhsWord >= 0 && rhsWord < 4) {
                lhsCoefficient += lhsProducts[lhsWord][rhsWord];
            }
        }
        var quotientCoefficient = 0;
        for (var quotientWord = 0; quotientWord < 8; quotientWord++) {
            var modulusWord = degree - quotientWord;
            if (modulusWord >= 0 && modulusWord < 4) {
                quotientCoefficient += quotientProducts[quotientWord][modulusWord];
            }
        }
        var remainderWord = 0;
        if (degree < 4) {
            remainderWord = remainderWords[degree];
        }
        var previousCarry = 0;
        if (degree > 0) {
            previousCarry = shiftedCarry[degree - 1] - CARRY_OFFSET;
        }

        shiftedCarry[degree] <-- (
            lhsCoefficient + previousCarry + BASE64 * CARRY_OFFSET
            - quotientCoefficient - remainderWord
        ) \ BASE64;
        lhsCoefficient + previousCarry + BASE64 * CARRY_OFFSET
            === quotientCoefficient + remainderWord
            + BASE64 * shiftedCarry[degree];

        shiftedCarryBits[degree] = Num2Bits(67);
        shiftedCarryBits[degree].in <== shiftedCarry[degree];
    }

    var finalQuotientCoefficient = 0;
    for (var quotientWord = 0; quotientWord < 8; quotientWord++) {
        var modulusWord = 10 - quotientWord;
        if (modulusWord >= 0 && modulusWord < 4) {
            finalQuotientCoefficient += quotientProducts[quotientWord][modulusWord];
        }
    }
    shiftedCarry[9] - CARRY_OFFSET === finalQuotientCoefficient;

    remainder <== [
        remainderWords[0] + BASE64 * remainderWords[1],
        remainderWords[2] + BASE64 * remainderWords[3]
    ];
    signal safeModulus[2] <== [
        safeModulusWords[0] + BASE64 * safeModulusWords[1],
        safeModulusWords[2] + BASE64 * safeModulusWords[3]
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
}
