"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.precompile08 = void 0;
const index_js_1 = require("@ethereumjs/util/index.js");
const evm_js_1 = require("../evm.js");
const exceptions_js_1 = require("../exceptions.js");
const util_js_1 = require("./util.js");
const index_js_2 = require("./index.js");
function precompile08(opts) {
    const pName = (0, index_js_2.getPrecompileName)('08');
    if (!(0, util_js_1.moduloLengthCheck)(opts, 192, pName)) {
        return (0, evm_js_1.EvmErrorResult)(new exceptions_js_1.EvmError(exceptions_js_1.ERROR.INVALID_INPUT_LENGTH), opts.gasLimit);
    }
    const inputDataSize = BigInt(Math.floor(opts.data.length / 192));
    const gasUsed = opts.common.param('bn254PairingGas') + inputDataSize * opts.common.param('bn254PairingWordGas');
    if (!(0, util_js_1.gasLimitCheck)(opts, gasUsed, pName)) {
        return (0, evm_js_1.OOGResult)(opts.gasLimit);
    }
    let returnData;
    try {
        returnData = opts._EVM['_bn254'].pairing(opts.data);
    }
    catch (e) {
        if (opts._debug !== undefined) {
            opts._debug(`${pName} failed: ${e.message}`);
        }
        return (0, evm_js_1.EvmErrorResult)(e, opts.gasLimit);
    }
    // check ecpairing success or failure by comparing the output length
    if (returnData.length !== 32) {
        if (opts._debug !== undefined) {
            opts._debug(`${pName} failed: OOG`);
        }
        // TODO: should this really return OOG?
        return (0, evm_js_1.OOGResult)(opts.gasLimit);
    }
    if (opts._debug !== undefined) {
        opts._debug(`${pName} return value=${(0, index_js_1.bytesToHex)(returnData)}`);
    }
    return {
        executionGasUsed: gasUsed,
        returnValue: returnData,
    };
}
exports.precompile08 = precompile08;
//# sourceMappingURL=08-bn254-pairing.js.map