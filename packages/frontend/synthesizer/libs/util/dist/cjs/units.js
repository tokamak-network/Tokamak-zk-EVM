"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Units = exports.formatBigDecimal = exports.ETHER_TO_WEI = exports.GWEI_TO_WEI = void 0;
const constants_js_1 = require("./constants.js");
/** Conversion constants to wei */
exports.GWEI_TO_WEI = BigInt(10 ** 9); // Multiplier to convert from Gwei to Wei
exports.ETHER_TO_WEI = BigInt(10 ** 18); // Multiplier to convert from Ether to Wei
function formatBigDecimal(numerator, denominator, maxDecimalFactor) {
    if (denominator === constants_js_1.BIGINT_0) {
        denominator = constants_js_1.BIGINT_1;
    }
    const full = numerator / denominator;
    const fraction = ((numerator - full * denominator) * maxDecimalFactor) / denominator;
    // zeros to be added post decimal are number of zeros in maxDecimalFactor - number of digits in fraction
    const zerosPostDecimal = String(maxDecimalFactor).length - 1 - String(fraction).length;
    return `${full}.${'0'.repeat(zerosPostDecimal)}${fraction}`;
}
exports.formatBigDecimal = formatBigDecimal;
class Units {
    static validateInput(amount) {
        if (typeof amount === 'number' && !Number.isInteger(amount)) {
            throw new Error('Input must be an integer number');
        }
        if (BigInt(amount) < 0) {
            throw new Error('Input must be a positive number');
        }
    }
    /**
     * Convert a number or bigint input of ether to wei
     *
     * @param {number | bigint} amount amount of units of ether to convert to wei
     * @returns {bigint} amount of units in wei
     */
    static ether(amount) {
        Units.validateInput(amount);
        return BigInt(amount) * exports.ETHER_TO_WEI;
    }
    /**
     * Convert a number or bigint input of gwei to wei
     *
     * @param amount amount of units of gwei to convert to wei
     * @returns {bigint} amount of units in wei
     */
    static gwei(amount) {
        Units.validateInput(amount);
        return BigInt(amount) * exports.GWEI_TO_WEI;
    }
}
exports.Units = Units;
//# sourceMappingURL=units.js.map