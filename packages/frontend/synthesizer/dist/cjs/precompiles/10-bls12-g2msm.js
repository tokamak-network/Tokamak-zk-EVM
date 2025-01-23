"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.precompile10 = void 0;
const index_js_1 = require("@ethereumjs/util/index.js");
const evm_js_1 = require("../evm.js");
const exceptions_js_1 = require("../exceptions.js");
const index_js_2 = require("./bls12_381/index.js");
const util_js_1 = require("./util.js");
const index_js_3 = require("./index.js");
async function precompile10(opts) {
    const pName = (0, index_js_3.getPrecompileName)('10');
    const bls = opts._EVM._bls;
    if (opts.data.length === 0) {
        if (opts._debug !== undefined) {
            opts._debug(`${pName} failed: Empty input`);
        }
        return (0, evm_js_1.EvmErrorResult)(new exceptions_js_1.EvmError(exceptions_js_1.ERROR.BLS_12_381_INPUT_EMPTY), opts.gasLimit); // follow Geth's implementation
    }
    const numPairs = Math.floor(opts.data.length / 288);
    const gasUsedPerPair = opts.common.paramByEIP('bls12381G2MulGas', 2537) ?? BigInt(0);
    const gasUsed = (0, index_js_2.msmGasUsed)(numPairs, gasUsedPerPair);
    if (!(0, util_js_1.gasLimitCheck)(opts, gasUsed, pName)) {
        return (0, evm_js_1.OOGResult)(opts.gasLimit);
    }
    if (!(0, util_js_1.moduloLengthCheck)(opts, 288, pName)) {
        return (0, evm_js_1.EvmErrorResult)(new exceptions_js_1.EvmError(exceptions_js_1.ERROR.BLS_12_381_INVALID_INPUT_LENGTH), opts.gasLimit);
    }
    // prepare pairing list and check for mandatory zero bytes
    const zeroByteRanges = [
        [0, 16],
        [64, 80],
        [128, 144],
        [192, 208],
    ];
    for (let k = 0; k < numPairs; k++) {
        // zero bytes check
        const pairStart = 288 * k;
        if (!(0, index_js_2.leading16ZeroBytesCheck)(opts, zeroByteRanges, pName, pairStart)) {
            return (0, evm_js_1.EvmErrorResult)(new exceptions_js_1.EvmError(exceptions_js_1.ERROR.BLS_12_381_POINT_NOT_ON_CURVE), opts.gasLimit);
        }
    }
    let returnValue;
    try {
        returnValue = bls.msmG2(opts.data);
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
exports.precompile10 = precompile10;
//# sourceMappingURL=10-bls12-g2msm.js.map