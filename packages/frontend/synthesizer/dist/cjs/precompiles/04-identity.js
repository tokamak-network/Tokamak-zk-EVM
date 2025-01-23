"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.precompile04 = void 0;
const index_js_1 = require("@ethereumjs/util/index.js");
const evm_js_1 = require("../evm.js");
const util_js_1 = require("./util.js");
const index_js_2 = require("./index.js");
function precompile04(opts) {
    const pName = (0, index_js_2.getPrecompileName)('04');
    const data = opts.data;
    let gasUsed = opts.common.param('identityGas');
    gasUsed += opts.common.param('identityWordGas') * BigInt(Math.ceil(data.length / 32));
    if (!(0, util_js_1.gasLimitCheck)(opts, gasUsed, pName)) {
        return (0, evm_js_1.OOGResult)(opts.gasLimit);
    }
    if (opts._debug !== undefined) {
        opts._debug(`${pName} return data=${(0, index_js_1.short)(opts.data)}`);
    }
    return {
        executionGasUsed: gasUsed,
        returnValue: Uint8Array.from(data), // Copy the memory (`Uint8Array.from()`)
    };
}
exports.precompile04 = precompile04;
//# sourceMappingURL=04-identity.js.map