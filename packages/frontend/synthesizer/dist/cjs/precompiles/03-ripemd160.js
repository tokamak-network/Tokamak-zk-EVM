"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.precompile03 = void 0;
const index_js_1 = require("@ethereumjs/util/index.js");
const ripemd160_js_1 = require("ethereum-cryptography/ripemd160.js");
const evm_js_1 = require("../evm.js");
const util_js_1 = require("./util.js");
const index_js_2 = require("./index.js");
function precompile03(opts) {
    const pName = (0, index_js_2.getPrecompileName)('03');
    const data = opts.data;
    let gasUsed = opts.common.param('ripemd160Gas');
    gasUsed += opts.common.param('ripemd160WordGas') * BigInt(Math.ceil(data.length / 32));
    if (!(0, util_js_1.gasLimitCheck)(opts, gasUsed, pName)) {
        return (0, evm_js_1.OOGResult)(opts.gasLimit);
    }
    const hash = (0, index_js_1.setLengthLeft)((0, ripemd160_js_1.ripemd160)(data), 32);
    if (opts._debug !== undefined) {
        opts._debug(`${pName} return hash=${(0, index_js_1.bytesToHex)(hash)}`);
    }
    return {
        executionGasUsed: gasUsed,
        returnValue: (0, index_js_1.setLengthLeft)((0, ripemd160_js_1.ripemd160)(data), 32),
    };
}
exports.precompile03 = precompile03;
//# sourceMappingURL=03-ripemd160.js.map