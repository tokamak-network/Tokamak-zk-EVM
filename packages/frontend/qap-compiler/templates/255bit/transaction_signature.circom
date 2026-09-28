pragma circom 2.1.6;

include "./jubjub.circom";
include "./fr_to_limbs.circom";

// This file owns the reusable relations used by the production transaction-
// signature composition. Templates with an _unsafe suffix require the exact
// upstream bit, point, or accumulator relation documented at their interface.

function tsvFixedJubjubAdd(point1, point2) {
    var constants[3] = jubjubconst();
    var product = point1[0] * point2[0] * point1[1] * point2[1];
    var denominatorX = 1 + constants[1] * product;
    var denominatorY = 1 - constants[1] * product;
    var numeratorX = point1[0] * point2[1] + point1[1] * point2[0];
    var numeratorY = point1[1] * point2[1] - constants[0] * point1[0] * point2[0];
    return [numeratorX / denominatorX, numeratorY / denominatorY];
}

function tsvBitCount(value, width) {
    var count = 0;
    for (var bit = 0; bit < width; bit++) {
        count += (value >> bit) & 1;
    }
    return count;
}

function tsvOnlyBitIndex(value, width) {
    var index = 0;
    for (var bit = 0; bit < width; bit++) {
        if (((value >> bit) & 1) == 1) {
            index = bit;
        }
    }
    return index;
}

template TSVSelectPointByBits_unsafe(W) {
    assert(W == 2);

    var TABLE_SIZE = 1 << W;
    signal input table[TABLE_SIZE][2];
    signal input bits[W];
    signal output point[2];

    signal nodes[2 * TABLE_SIZE - 1][2];
    for (var index = 0; index < TABLE_SIZE; index++) {
        nodes[index] <== table[index];
    }

    var sourceStart = 0;
    var destinationStart = TABLE_SIZE;
    var sourceCount = TABLE_SIZE;
    for (var bit = 0; bit < W; bit++) {
        for (var pair = 0; pair < sourceCount \ 2; pair++) {
            for (var coordinate = 0; coordinate < 2; coordinate++) {
                nodes[destinationStart + pair][coordinate] <==
                    nodes[sourceStart + 2 * pair][coordinate]
                    + bits[bit] * (
                        nodes[sourceStart + 2 * pair + 1][coordinate]
                        - nodes[sourceStart + 2 * pair][coordinate]
                    );
            }
        }
        sourceStart = destinationStart;
        destinationStart += sourceCount \ 2;
        sourceCount \= 2;
    }

    point <== nodes[2 * TABLE_SIZE - 2];
}

template TSVCanonicalFrBitsOnly() {
    signal input in;
    signal output bits[255];

    component decomposition = Num2Bits(255);
    decomposition.in <== in;

    var lowExpression = 0;
    var highExpression = 0;
    for (var bit = 0; bit < 128; bit++) {
        bits[bit] <== decomposition.out[bit];
        lowExpression += decomposition.out[bit] * (1 << bit);
    }
    for (var bit = 128; bit < 255; bit++) {
        bits[bit] <== decomposition.out[bit];
        highExpression += decomposition.out[bit] * (1 << (bit - 128));
    }

    component fieldBound = StrictBls12381FrBoundFromLimbs();
    fieldBound.low <== lowExpression;
    fieldBound.high <== highExpression;
}

template TSVExtendedDouble_unsafe(INCLUDE_T) {
    assert(INCLUDE_T == 0 || INCLUDE_T == 1);
    signal input point[3];
    signal output result[3 + INCLUDE_T];

    signal A <== point[0] * point[0];
    signal B <== point[1] * point[1];
    signal C <== 2 * point[2] * point[2];
    signal E <== (point[0] + point[1]) * (point[0] + point[1]) - A - B;

    result[0] <== E * (-A + B - C);
    result[1] <== (-A + B) * (-A - B);
    result[2] <== (-A + B - C) * (-A + B);
    if (INCLUDE_T == 1) {
        result[3] <== E * (-A - B);
    }
}

template TSVExtendedAddAffineWithT_unsafe(INCLUDE_T) {
    assert(INCLUDE_T == 0 || INCLUDE_T == 1);
    signal input point[4];
    signal input affine[3];
    signal output result[3 + INCLUDE_T];

    var constants[3] = jubjubconst();
    var K = 2 * constants[1];

    signal A <== (point[1] - point[0]) * (affine[1] - affine[0]);
    signal B <== (point[1] + point[0]) * (affine[1] + affine[0]);
    signal C <== K * point[3] * affine[2];

    result[0] <== (B - A) * (2 * point[2] - C);
    result[1] <== (2 * point[2] + C) * (B + A);
    result[2] <== (2 * point[2] - C) * (2 * point[2] + C);
    if (INCLUDE_T == 1) {
        result[3] <== (B - A) * (B + A);
    }
}

template TSVExtendedAddAffine_unsafe() {
    signal input point[4];
    signal input affine[2];
    signal output result[4];

    signal affineT <== affine[0] * affine[1];
    component addition = TSVExtendedAddAffineWithT_unsafe(1);
    addition.point <== point;
    addition.affine <== [affine[0], affine[1], affineT];
    result <== addition.result;
}

template TSVExtendedAdd_unsafe() {
    signal input point1[4];
    signal input point2[4];
    signal output result[3];

    var constants[3] = jubjubconst();
    var K = 2 * constants[1];

    signal A <== (point1[1] - point1[0]) * (point2[1] - point2[0]);
    signal B <== (point1[1] + point1[0]) * (point2[1] + point2[0]);
    signal C <== K * point1[3] * point2[3];
    signal D <== 2 * point1[2] * point2[2];

    result[0] <== (B - A) * (D - C);
    result[1] <== (D + C) * (B + A);
    result[2] <== (D - C) * (D + C);
}

template TSVPointTimesCofactor8_unsafe(INCLUDE_T) {
    assert(INCLUDE_T == 0 || INCLUDE_T == 1);
    signal input point[2];
    signal output point8[3 + INCLUDE_T];

    component point2 = TSVExtendedDouble_unsafe(0);
    component point4 = TSVExtendedDouble_unsafe(0);
    component point8Component = TSVExtendedDouble_unsafe(INCLUDE_T);
    point2.point <== [point[0], point[1], 1];
    point4.point <== point2.result;
    point8Component.point <== point4.result;
    point8 <== point8Component.result;
}

// Both inputs must already be valid affine points. The complete Jubjub
// addition law guarantees nonzero denominators for this curve.
template TSVFactoredAffineAdd_unsafe() {
    signal input point1[2];
    signal input point2[2];
    signal output result[2];

    var constants[3] = jubjubconst();
    signal xProduct <== point1[0] * point2[0];
    signal yProduct <== point1[1] * point2[1];
    signal coordinateProduct <== xProduct * yProduct;
    signal sumProduct <== (point1[0] + point1[1]) * (point2[0] + point2[1]);
    signal denominatorTerm <== constants[1] * coordinateProduct;
    signal numeratorX <== sumProduct - xProduct - yProduct;
    signal numeratorY <== yProduct + xProduct;

    result[0] <-- numeratorX / (1 + denominatorTerm);
    result[1] <-- numeratorY / (1 - denominatorTerm);
    numeratorX === result[0] * (1 + denominatorTerm);
    numeratorY === result[1] * (1 - denominatorTerm);
}

template TSVExtendedToAffine_unsafe() {
    signal input point[3];
    signal output affine[2];

    affine[0] <-- point[0] / point[2];
    affine[1] <-- point[1] / point[2];
    point[0] === affine[0] * point[2];
    point[1] === affine[1] * point[2];
}

template TSVRejectIdentityFromValidatedY_unsafe() {
    signal input y;
    signal inverse <-- 1 / (y - 1);
    (y - 1) * inverse === 1;
}

template TSVFixedWindowBatch_unsafe(START_WINDOW, NUM_WINDOWS, INCLUDE_T) {
    assert(START_WINDOW >= 0);
    assert(NUM_WINDOWS > 0);
    assert(START_WINDOW + NUM_WINDOWS <= 84);
    assert(INCLUDE_T == 0 || INCLUDE_T == 1);

    signal input bits[NUM_WINDOWS * 3];
    signal input previous[4];
    signal output next[3 + INCLUDE_T];

    var TABLE_SIZE = 8;
    var NUM_PRODUCTS = 4;
    var G8[2] = [
        52363696936650001301287582521711853146588465673974699354184720335305084401224,
        12024993157431732930272824407495979791132374572895036891122288541794509830761
    ];
    var windowBase[2] = G8;
    for (var skippedBit = 0; skippedBit < START_WINDOW * 3; skippedBit++) {
        windowBase = tsvFixedJubjubAdd(windowBase, windowBase);
    }

    var table[NUM_WINDOWS][TABLE_SIZE][3];
    var coefficients[NUM_WINDOWS][TABLE_SIZE][3];
    for (var window = 0; window < NUM_WINDOWS; window++) {
        table[window][0] = [0, 1, 0];
        for (var digit = 1; digit < TABLE_SIZE; digit++) {
            var point[2] = tsvFixedJubjubAdd(
                [table[window][digit - 1][0], table[window][digit - 1][1]],
                windowBase
            );
            table[window][digit] = [point[0], point[1], point[0] * point[1]];
        }
        for (var digit = 0; digit < TABLE_SIZE; digit++) {
            coefficients[window][digit] = table[window][digit];
        }
        for (var bit = 0; bit < 3; bit++) {
            for (var mask = 0; mask < TABLE_SIZE; mask++) {
                if (((mask >> bit) & 1) == 1) {
                    for (var coordinate = 0; coordinate < 3; coordinate++) {
                        coefficients[window][mask][coordinate] -=
                            coefficients[window][mask - (1 << bit)][coordinate];
                    }
                }
            }
        }
        for (var bit = 0; bit < 3; bit++) {
            windowBase = tsvFixedJubjubAdd(windowBase, windowBase);
        }
    }

    var productIndex[TABLE_SIZE];
    var nextProduct = 0;
    for (var mask = 0; mask < TABLE_SIZE; mask++) {
        productIndex[mask] = -1;
        if (tsvBitCount(mask, 3) >= 2) {
            productIndex[mask] = nextProduct;
            nextProduct++;
        }
    }

    signal products[NUM_WINDOWS][NUM_PRODUCTS];
    signal accumulators[NUM_WINDOWS][4];
    accumulators[0] <== previous;
    component additions[NUM_WINDOWS];
    for (var window = 0; window < NUM_WINDOWS; window++) {
        for (var mask = 1; mask < TABLE_SIZE; mask++) {
            if (tsvBitCount(mask, 3) >= 2) {
                var factorBit = tsvOnlyBitIndex(mask & (0 - mask), 3);
                var previousMask = mask - (1 << factorBit);
                if (tsvBitCount(previousMask, 3) == 1) {
                    var previousBit = tsvOnlyBitIndex(previousMask, 3);
                    products[window][productIndex[mask]] <==
                        bits[window * 3 + factorBit] * bits[window * 3 + previousBit];
                } else {
                    products[window][productIndex[mask]] <==
                        bits[window * 3 + factorBit]
                        * products[window][productIndex[previousMask]];
                }
            }
        }

        var isLastWindow = window + 1 == NUM_WINDOWS;
        var additionIncludesT = isLastWindow ? INCLUDE_T : 1;
        additions[window] = TSVExtendedAddAffineWithT_unsafe(additionIncludesT);
        additions[window].point <== accumulators[window];
        for (var coordinate = 0; coordinate < 3; coordinate++) {
            var selectedExpression = coefficients[window][0][coordinate];
            for (var mask = 1; mask < TABLE_SIZE; mask++) {
                if (tsvBitCount(mask, 3) == 1) {
                    var selectedBit = tsvOnlyBitIndex(mask, 3);
                    selectedExpression += coefficients[window][mask][coordinate]
                        * bits[window * 3 + selectedBit];
                } else {
                    selectedExpression += coefficients[window][mask][coordinate]
                        * products[window][productIndex[mask]];
                }
            }
            additions[window].affine[coordinate] <== selectedExpression;
        }
        if (isLastWindow) {
            next <== additions[window].result;
        } else {
            accumulators[window + 1] <== additions[window].result;
        }
    }
}

template TSVRuntimeTable_unsafe() {
    signal input identity[2];
    signal input base[2];
    signal output table[4][2];

    table[0] <== identity;
    table[1] <== base;
    component additions[2];
    for (var digit = 2; digit < 4; digit++) {
        additions[digit - 2] = TSVFactoredAffineAdd_unsafe();
        additions[digit - 2].point1 <== table[digit - 1];
        additions[digit - 2].point2 <== base;
        table[digit] <== additions[digit - 2].result;
    }
}

// Bits are supplied in increasing scalar-bit order. Processing is MSB-first.
// HAS_TOP_PADDING is one only for the first batch, whose missing bit 255 is 0.
template TSVVariableWindowBatch_unsafe(NUM_WINDOWS, HAS_TOP_PADDING, IS_FIRST) {
    assert(NUM_WINDOWS > 0);
    assert(HAS_TOP_PADDING == 0 || HAS_TOP_PADDING == 1);
    assert(IS_FIRST == 0 || IS_FIRST == 1);
    assert(HAS_TOP_PADDING <= IS_FIRST);

    var NUM_BITS = NUM_WINDOWS * 2 - HAS_TOP_PADDING;
    signal input bits[NUM_BITS];
    signal input table[4][2];
    signal input previous[4];
    signal output next[4];

    component selectors[NUM_WINDOWS];
    for (var step = 0; step < NUM_WINDOWS; step++) {
        selectors[step] = TSVSelectPointByBits_unsafe(2);
        selectors[step].table <== table;
        if (HAS_TOP_PADDING == 1 && step == 0) {
            selectors[step].bits[0] <== bits[NUM_BITS - 1];
            selectors[step].bits[1] <== 0;
        } else {
            var sourceStart = NUM_BITS - 2 * (step + 1) + HAS_TOP_PADDING;
            selectors[step].bits[0] <== bits[sourceStart];
            selectors[step].bits[1] <== bits[sourceStart + 1];
        }
    }

    signal accumulators[NUM_WINDOWS + 1][4];
    accumulators[0] <== previous;
    component firstDoublings[NUM_WINDOWS];
    component secondDoublings[NUM_WINDOWS];
    component additions[NUM_WINDOWS];
    for (var step = 0; step < NUM_WINDOWS; step++) {
        additions[step] = TSVExtendedAddAffine_unsafe();
        if (IS_FIRST == 1 && step == 0) {
            additions[step].point <== accumulators[step];
        } else {
            firstDoublings[step] = TSVExtendedDouble_unsafe(0);
            secondDoublings[step] = TSVExtendedDouble_unsafe(1);
            for (var coordinate = 0; coordinate < 3; coordinate++) {
                firstDoublings[step].point[coordinate] <== accumulators[step][coordinate];
            }
            secondDoublings[step].point <== firstDoublings[step].result;
            additions[step].point <== secondDoublings[step].result;
        }
        additions[step].affine <== selectors[step].point;
        accumulators[step + 1] <== additions[step].result;
    }
    next <== accumulators[NUM_WINDOWS];
}

template TSVAssertExtendedEqual_unsafe() {
    signal input lhs[3];
    signal input rhs[3];

    signal scale <-- lhs[2] / rhs[2];
    for (var coordinate = 0; coordinate < 3; coordinate++) {
        lhs[coordinate] === scale * rhs[coordinate];
    }
}

template TransactionSignaturePoseidonBatch4() {
    signal input in[7];
    signal output out[2];

    signal mode <== in[0];
    mode * (mode - 1) === 0;

    component firstHash = Poseidon255(2);
    firstHash.in <== [in[1], in[2]];
    signal secondLeft <== in[3] + mode * (firstHash.out - in[3]);
    component secondHash = Poseidon255(2);
    secondHash.in <== [secondLeft, in[4]];
    component thirdHash = Poseidon255(2);
    thirdHash.in <== [secondHash.out, in[5]];
    component fourthHash = Poseidon255(2);
    fourthHash.in <== [thirdHash.out, in[6]];
    out <== [firstHash.out, fourthHash.out];
}

template TransactionSignaturePoseidonTail1() {
    signal input in[4];
    signal output out[2];

    component publicKeyHash = Poseidon255(2);
    publicKeyHash.in <== [in[0], in[1]];
    component challengeHash = Poseidon255(2);
    challengeHash.in <== [in[2], in[3]];
    out <== [publicKeyHash.out, challengeHash.out];
}

template TransactionSignaturePoseidonTail2() {
    signal input in[5];
    signal output out[2];

    component publicKeyHash = Poseidon255(2);
    publicKeyHash.in <== [in[0], in[1]];
    component firstChallengeHash = Poseidon255(2);
    firstChallengeHash.in <== [in[2], in[3]];
    component finalChallengeHash = Poseidon255(2);
    finalChallengeHash.in <== [firstChallengeHash.out, in[4]];
    out <== [publicKeyHash.out, finalChallengeHash.out];
}

template TransactionSignaturePointPolicy() {
    signal input in[8];
    signal output out[16];

    component contractBits = Num2Bits(160);
    contractBits.in <== in[4];
    out[0] <== in[5];
    out[1] <== 0;
    var contractAddressLow = 0;
    for (var limbBit = 0; limbBit < 128; limbBit++) {
        contractAddressLow += contractBits.out[limbBit] * (1 << limbBit);
    }
    out[2] <== contractAddressLow;
    var contractAddressHigh = 0;
    for (var limbBit = 128; limbBit < 160; limbBit++) {
        contractAddressHigh += contractBits.out[limbBit] * (1 << (limbBit - 128));
    }
    out[3] <== contractAddressHigh;

    component checkA = jubjubCheck();
    checkA.in <== [in[2], in[3]];
    component checkR = jubjubCheck();
    checkR.in <== [in[0], in[1]];

    component publicKeyCofactor = TSVPointTimesCofactor8_unsafe(0);
    publicKeyCofactor.point <== [in[2], in[3]];
    component publicKeyAffine = TSVExtendedToAffine_unsafe();
    publicKeyAffine.point <== publicKeyCofactor.point8;
    component rejectPublicKeyIdentity = TSVRejectIdentityFromValidatedY_unsafe();
    rejectPublicKeyIdentity.y <== publicKeyAffine.affine[1];
    component rejectRandomizerIdentity = TSVRejectIdentityFromValidatedY_unsafe();
    rejectRandomizerIdentity.y <== in[1];

    component randomizerCofactor = TSVPointTimesCofactor8_unsafe(1);
    randomizerCofactor.point <== [in[0], in[1]];

    component runtimeTable = TSVRuntimeTable_unsafe();
    runtimeTable.identity <== [in[6], in[7]];
    runtimeTable.base <== publicKeyAffine.affine;
    for (var digit = 0; digit < 4; digit++) {
        for (var coordinate = 0; coordinate < 2; coordinate++) {
            out[4 + digit * 2 + coordinate] <== runtimeTable.table[digit][coordinate];
        }
    }
    for (var coordinate = 0; coordinate < 4; coordinate++) {
        out[12 + coordinate] <== randomizerCofactor.point8[coordinate];
    }
}

template TransactionSignaturePointPolicyWithHash() {
    signal input in[8];
    signal output out[17];

    component pointPolicy = TransactionSignaturePointPolicy();
    pointPolicy.in <== in;
    for (var index = 0; index < 16; index++) {
        out[index] <== pointPolicy.out[index];
    }
    component publicKeyHash = Poseidon255(2);
    publicKeyHash.in <== [in[2], in[3]];
    out[16] <== publicKeyHash.out;
}

template TransactionSignatureFixedPrefix70() {
    signal input in[1];
    signal output out[5];

    component signatureBits = Num2Bits(252);
    signatureBits.in <== in[0];
    component fixedPrefix = TSVFixedWindowBatch_unsafe(0, 70, 1);
    fixedPrefix.previous <== [0, 1, 1, 0];
    for (var bit = 0; bit < 210; bit++) {
        fixedPrefix.bits[bit] <== signatureBits.out[bit];
    }
    var responseTail = 0;
    for (var bit = 0; bit < 42; bit++) {
        responseTail += signatureBits.out[210 + bit] * (1 << bit);
    }
    out[0] <== responseTail;
    for (var coordinate = 0; coordinate < 4; coordinate++) {
        out[1 + coordinate] <== fixedPrefix.next[coordinate];
    }
}

template TransactionSignatureChallengeChunks() {
    signal input in[1];
    signal output out[4];

    component challenge = TSVCanonicalFrBitsOnly();
    challenge.in <== in[0];

    var leadingChunk = 0;
    for (var bit = 0; bit < 63; bit++) {
        leadingChunk += challenge.bits[192 + bit] * (1 << bit);
    }
    out[0] <== leadingChunk;

    for (var chunk = 0; chunk < 3; chunk++) {
        var chunkValue = 0;
        for (var bit = 0; bit < 64; bit++) {
            chunkValue += challenge.bits[128 - 64 * chunk + bit] * (1 << bit);
        }
        out[1 + chunk] <== chunkValue;
    }
}

template TransactionSignatureVariableFirstBatch32() {
    signal input in[9];
    signal output out[4];

    component bits = Num2Bits(63);
    bits.in <== in[0];
    component batch = TSVVariableWindowBatch_unsafe(32, 1, 1);
    for (var bit = 0; bit < 63; bit++) {
        batch.bits[bit] <== bits.out[bit];
    }
    for (var digit = 0; digit < 4; digit++) {
        for (var coordinate = 0; coordinate < 2; coordinate++) {
            batch.table[digit][coordinate] <== in[1 + digit * 2 + coordinate];
        }
    }
    batch.previous <== [in[1], in[2], 1, 0];
    out <== batch.next;
}

template TransactionSignatureVariableBatch32() {
    signal input in[13];
    signal output out[4];

    component bits = Num2Bits(64);
    bits.in <== in[0];
    component batch = TSVVariableWindowBatch_unsafe(32, 0, 0);
    for (var bit = 0; bit < 64; bit++) {
        batch.bits[bit] <== bits.out[bit];
    }
    for (var digit = 0; digit < 4; digit++) {
        for (var coordinate = 0; coordinate < 2; coordinate++) {
            batch.table[digit][coordinate] <== in[1 + digit * 2 + coordinate];
        }
    }
    for (var coordinate = 0; coordinate < 4; coordinate++) {
        batch.previous[coordinate] <== in[9 + coordinate];
    }
    out <== batch.next;
}

template TransactionSignatureFinal() {
    signal input in[14];
    signal output out[2];

    component responseBits = Num2Bits(42);
    responseBits.in <== in[0];
    component fixedTail = TSVFixedWindowBatch_unsafe(70, 14, 0);
    for (var bit = 0; bit < 42; bit++) {
        fixedTail.bits[bit] <== responseBits.out[bit];
    }
    for (var coordinate = 0; coordinate < 4; coordinate++) {
        fixedTail.previous[coordinate] <== in[1 + coordinate];
    }

    component terminalAddition = TSVExtendedAdd_unsafe();
    terminalAddition.point1 <== [in[5], in[6], in[7], in[8]];
    for (var coordinate = 0; coordinate < 4; coordinate++) {
        terminalAddition.point2[coordinate] <== in[9 + coordinate];
    }
    component terminalEquality = TSVAssertExtendedEqual_unsafe();
    terminalEquality.lhs <== fixedTail.next;
    terminalEquality.rhs <== terminalAddition.result;

    component publicKeyHash = TSVCanonicalFrBitsOnly();
    publicKeyHash.in <== in[13];

    var originLow = 0;
    var originHigh = 0;
    for (var bit = 0; bit < 128; bit++) {
        originLow += publicKeyHash.bits[bit] * (1 << bit);
    }
    for (var bit = 128; bit < 160; bit++) {
        originHigh += publicKeyHash.bits[bit] * (1 << (bit - 128));
    }
    out[0] <== originLow;
    out[1] <== originHigh;
}
