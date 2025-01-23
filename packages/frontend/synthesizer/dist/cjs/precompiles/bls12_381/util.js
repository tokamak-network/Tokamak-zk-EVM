"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.leading16ZeroBytesCheck = exports.msmGasUsed = void 0;
const index_js_1 = require("@ethereumjs/util/index.js");
const constants_js_1 = require("./constants.js");
const ZERO_BYTES_16 = new Uint8Array(16);
/**
 * Calculates the gas used for the MSM precompiles based on the number of pairs and
 * calculating in some discount in relation to the number of pairs.
 *
 * @param numPairs
 * @param gasUsedPerPair
 * @returns
 */
const msmGasUsed = (numPairs, gasUsedPerPair) => {
    const gasDiscountMax = constants_js_1.BLS_GAS_DISCOUNT_PAIRS[constants_js_1.BLS_GAS_DISCOUNT_PAIRS.length - 1][1];
    let gasDiscountMultiplier;
    if (numPairs <= constants_js_1.BLS_GAS_DISCOUNT_PAIRS.length) {
        if (numPairs === 0) {
            gasDiscountMultiplier = 0; // this implicitly sets gasUsed to 0 as per the EIP.
        }
        else {
            gasDiscountMultiplier = constants_js_1.BLS_GAS_DISCOUNT_PAIRS[numPairs - 1][1];
        }
    }
    else {
        gasDiscountMultiplier = gasDiscountMax;
    }
    // (numPairs * multiplication_cost * discount) / multiplier
    return (BigInt(numPairs) * gasUsedPerPair * BigInt(gasDiscountMultiplier)) / BigInt(1000);
};
exports.msmGasUsed = msmGasUsed;
/**
 * BLS-specific zero check to check that the top 16 bytes of a 64 byte field element provided
 * are always zero (see EIP notes on field element encoding).
 *
 * Zero byte ranges are expected to be passed in the following format (and so each referencing
 * 16-byte ranges):
 *
 * ```ts
 * const zeroByteRanges = [
 *   [0, 16],
 *   [64, 80],
 *   [128, 144]
 *
 * ]
 * ```
 *
 * @param opts
 * @param zeroByteRanges
 * @param pName
 * @param pairStart
 * @returns
 */
const leading16ZeroBytesCheck = (opts, zeroByteRanges, pName, pairStart = 0) => {
    for (const index in zeroByteRanges) {
        const slicedBuffer = opts.data.subarray(zeroByteRanges[index][0] + pairStart, zeroByteRanges[index][1] + pairStart);
        if (!((0, index_js_1.equalsBytes)(slicedBuffer, ZERO_BYTES_16) === true)) {
            if (opts._debug !== undefined) {
                opts._debug(`${pName} failed: Point not on curve`);
            }
            return false;
        }
    }
    return true;
};
exports.leading16ZeroBytesCheck = leading16ZeroBytesCheck;
//# sourceMappingURL=util.js.map