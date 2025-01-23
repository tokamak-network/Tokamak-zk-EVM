"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.moduloLengthCheck = exports.equalityLengthCheck = exports.gasLimitCheck = void 0;
const index_js_1 = require("@ethereumjs/util/index.js");
/**
 * Checks that the gas used remain under the gas limit.
 *
 * @param opts
 * @param gasUsed
 * @param pName
 * @returns
 */
const gasLimitCheck = (opts, gasUsed, pName) => {
    if (opts._debug !== undefined) {
        opts._debug(`Run ${pName} precompile data=${(0, index_js_1.short)(opts.data)} length=${opts.data.length} gasLimit=${opts.gasLimit} gasUsed=${gasUsed}`);
    }
    if (opts.gasLimit < gasUsed) {
        if (opts._debug !== undefined) {
            opts._debug(`${pName} failed: OOG`);
        }
        return false;
    }
    return true;
};
exports.gasLimitCheck = gasLimitCheck;
/**
 * Checks that the length of the provided data is equal to `length`.
 *
 * @param opts
 * @param length
 * @param pName
 * @returns
 */
const equalityLengthCheck = (opts, length, pName) => {
    if (opts.data.length !== length) {
        if (opts._debug !== undefined) {
            opts._debug(`${pName} failed: Invalid input length length=${opts.data.length} (expected: ${length})`);
        }
        return false;
    }
    return true;
};
exports.equalityLengthCheck = equalityLengthCheck;
/**
 * Checks that the total length of the provided data input can be subdivided into k equal parts
 * with `length` (without leaving some remainder bytes).
 *
 * @param opts
 * @param length
 * @param pName
 * @returns
 */
const moduloLengthCheck = (opts, length, pName) => {
    if (opts.data.length % length !== 0) {
        if (opts._debug !== undefined) {
            opts._debug(`${pName} failed: Invalid input length length=${opts.data.length} (expected: ${length}*k bytes)`);
        }
        return false;
    }
    return true;
};
exports.moduloLengthCheck = moduloLengthCheck;
//# sourceMappingURL=util.js.map