"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.precompile07 = void 0;
const index_js_1 = require("@ethereumjs/util/index.js");
const evm_js_1 = require("../evm.js");
const util_js_1 = require("./util.js");
const index_js_2 = require("./index.js");
function precompile07(opts) {
    const pName = (0, index_js_2.getPrecompileName)('07');
    const gasUsed = opts.common.param('bn254MulGas');
    if (!(0, util_js_1.gasLimitCheck)(opts, gasUsed, pName)) {
        return (0, evm_js_1.OOGResult)(opts.gasLimit);
    }
    // > 128 bytes: chop off extra bytes
    // < 128 bytes: right-pad with 0-s
    const input = (0, index_js_1.setLengthRight)(opts.data.subarray(0, 128), 128);
    let returnData;
    try {
        returnData = opts._EVM['_bn254'].mul(input);
    }
    catch (e) {
        if (opts._debug !== undefined) {
            opts._debug(`${pName} failed: ${e.message}`);
        }
        return (0, evm_js_1.EvmErrorResult)(e, opts.gasLimit);
    }
    // check ecmul success or failure by comparing the output length
    if (returnData.length !== 64) {
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
exports.precompile07 = precompile07;
//# sourceMappingURL=07-bn254-mul.js.map