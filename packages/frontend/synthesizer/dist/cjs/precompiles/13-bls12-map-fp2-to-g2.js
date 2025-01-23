"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.precompile13 = void 0;
const index_js_1 = require("@ethereumjs/util/index.js");
const evm_js_1 = require("../evm.js");
const exceptions_js_1 = require("../exceptions.js");
const index_js_2 = require("./bls12_381/index.js");
const util_js_1 = require("./util.js");
const index_js_3 = require("./index.js");
async function precompile13(opts) {
    const pName = (0, index_js_3.getPrecompileName)('13');
    const bls = opts._EVM._bls;
    // note: the gas used is constant; even if the input is incorrect.
    const gasUsed = opts.common.paramByEIP('bls12381MapG2Gas', 2537) ?? BigInt(0);
    if (!(0, util_js_1.gasLimitCheck)(opts, gasUsed, pName)) {
        return (0, evm_js_1.OOGResult)(opts.gasLimit);
    }
    if (!(0, util_js_1.equalityLengthCheck)(opts, 128, pName)) {
        return (0, evm_js_1.EvmErrorResult)(new exceptions_js_1.EvmError(exceptions_js_1.ERROR.BLS_12_381_INVALID_INPUT_LENGTH), opts.gasLimit);
    }
    // check if some parts of input are zero bytes.
    const zeroByteRanges = [
        [0, 16],
        [64, 80],
    ];
    if (!(0, index_js_2.leading16ZeroBytesCheck)(opts, zeroByteRanges, pName)) {
        return (0, evm_js_1.EvmErrorResult)(new exceptions_js_1.EvmError(exceptions_js_1.ERROR.BLS_12_381_POINT_NOT_ON_CURVE), opts.gasLimit);
    }
    let returnValue;
    try {
        returnValue = bls.mapFP2toG2(opts.data);
    }
    catch (e) {
        if (opts._debug !== undefined) {
            opts._debug(`${pName} failed: ${e.message}`);
        }
        return (0, evm_js_1.EvmErrorResult)(e, opts.gasLimit);
    }
    if (opts._debug !== undefined) {
        opts._debug(`${pName} return value=${(0, index_js_1.bytesToHex)(returnValue)}`);
    }
    return {
        executionGasUsed: gasUsed,
        returnValue,
    };
}
exports.precompile13 = precompile13;
//# sourceMappingURL=13-bls12-map-fp2-to-g2.js.map