"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.precompile11 = void 0;
const index_js_1 = require("@ethereumjs/util/index.js");
const evm_js_1 = require("../evm.js");
const exceptions_js_1 = require("../exceptions.js");
const index_js_2 = require("./bls12_381/index.js");
const util_js_1 = require("./util.js");
const index_js_3 = require("./index.js");
async function precompile11(opts) {
    const pName = (0, index_js_3.getPrecompileName)('11');
    const bls = opts._EVM._bls;
    const baseGas = opts.common.paramByEIP('bls12381PairingBaseGas', 2537) ?? BigInt(0);
    // TODO: confirm that this is not a thing for the other precompiles
    if (opts.data.length === 0) {
        if (opts._debug !== undefined) {
            opts._debug(`${pName} failed: Empty input`);
        }
        return (0, evm_js_1.EvmErrorResult)(new exceptions_js_1.EvmError(exceptions_js_1.ERROR.BLS_12_381_INPUT_EMPTY), opts.gasLimit);
    }
    const gasUsedPerPair = opts.common.paramByEIP('bls12381PairingPerPairGas', 2537) ?? BigInt(0);
    // TODO: For this precompile it is the only exception that the length check is placed before the
    // gas check. I will keep it there to not side-change the existing implementation, but we should
    // check (respectively Jochem can maybe have a word) if this is something intended or not
    if (!(0, util_js_1.moduloLengthCheck)(opts, 384, pName)) {
        return (0, evm_js_1.EvmErrorResult)(new exceptions_js_1.EvmError(exceptions_js_1.ERROR.BLS_12_381_INVALID_INPUT_LENGTH), opts.gasLimit);
    }
    const gasUsed = baseGas + gasUsedPerPair * BigInt(Math.floor(opts.data.length / 384));
    if (!(0, util_js_1.gasLimitCheck)(opts, gasUsed, pName)) {
        return (0, evm_js_1.OOGResult)(opts.gasLimit);
    }
    // check for mandatory zero bytes
    const zeroByteRanges = [
        [0, 16],
        [64, 80],
        [128, 144],
        [192, 208],
        [256, 272],
        [320, 336],
    ];
    for (let k = 0; k < opts.data.length / 384; k++) {
        // zero bytes check
        const pairStart = 384 * k;
        if (!(0, index_js_2.leading16ZeroBytesCheck)(opts, zeroByteRanges, pName, pairStart)) {
            return (0, evm_js_1.EvmErrorResult)(new exceptions_js_1.EvmError(exceptions_js_1.ERROR.BLS_12_381_POINT_NOT_ON_CURVE), opts.gasLimit);
        }
    }
    let returnValue;
    try {
        returnValue = bls.pairingCheck(opts.data);
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
exports.precompile11 = precompile11;
//# sourceMappingURL=11-bls12-pairing.js.map