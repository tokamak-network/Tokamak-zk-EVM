pragma circom 2.1.6;
include "arithmetic_unsafe_type1.circom";

// Performs one LSB-first square-and-multiply step. `in[4..5]` is the
// complete current exponent remainder in two 128-bit limbs. The local
// binary shift preserves the logical uint256 boundary between placements.
template SubExp() {
    signal input in[6];
    signal output out[6];

    component accumulatorSplit[2];
    component basePowerSplit[2];
    signal accumulatorWords[4];
    signal basePowerWords[4];
    for (var limb = 0; limb < 2; limb++) {
        accumulatorSplit[limb] = Split128To64();
        basePowerSplit[limb] = Split128To64();
        accumulatorSplit[limb].in <== in[limb];
        basePowerSplit[limb].in <== in[2 + limb];
        accumulatorWords[2 * limb] <== accumulatorSplit[limb].words[0];
        accumulatorWords[2 * limb + 1] <== accumulatorSplit[limb].words[1];
        basePowerWords[2 * limb] <== basePowerSplit[limb].words[0];
        basePowerWords[2 * limb + 1] <== basePowerSplit[limb].words[1];
    }

    var LIMB_BASE = 1 << 128;
    var HALF_LIMB_BASE = 1 << 127;
    signal bit;
    signal carry;
    signal nextRemainderLow;
    signal nextRemainderHigh;
    bit <-- in[4] % 2;
    carry <-- in[5] % 2;
    nextRemainderLow <-- ((in[4] - bit) \ 2) + carry * HALF_LIMB_BASE;
    nextRemainderHigh <-- (in[5] - carry) \ 2;
    bit * (bit - 1) === 0;
    carry * (carry - 1) === 0;
    in[4] + LIMB_BASE * carry === 2 * nextRemainderLow + bit;
    in[5] === 2 * nextRemainderHigh + carry;

    signal factorWords[4];
    factorWords[0] <== 1 - bit + bit * basePowerWords[0];
    for (var word = 1; word < 4; word++) {
        factorWords[word] <== bit * basePowerWords[word];
    }

    component square = Square256TruncatedFrom64_unsafe();
    square.in <== basePowerWords;

    component accumulate = Mul256TruncatedFrom64_unsafe();
    accumulate.in1 <== accumulatorWords;
    accumulate.in2 <== factorWords;

    out <== [
        accumulate.out[0],
        accumulate.out[1],
        square.out[0],
        square.out[1],
        nextRemainderLow,
        nextRemainderHigh
    ];
}

template AssertZeroWord() {
    signal input in[2];
    in[0] === 0;
    in[1] === 0;
}
