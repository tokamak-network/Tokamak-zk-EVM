"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.precompile02 = void 0;
const index_js_1 = require("@ethereumjs/util/index.js");
const sha256_js_1 = require("ethereum-cryptography/sha256.js");
const evm_js_1 = require("../evm.js");
const util_js_1 = require("./util.js");
const index_js_2 = require("./index.js");
function precompile02(opts) {
    const pName = (0, index_js_2.getPrecompileName)('02');
    const data = opts.data;
    const sha256Function = opts.common.customCrypto.sha256 ?? sha256_js_1.sha256;
    let gasUsed = opts.common.param('sha256Gas');
    gasUsed += opts.common.param('sha256WordGas') * BigInt(Math.ceil(data.length / 32));
    if (!(0, util_js_1.gasLimitCheck)(opts, gasUsed, pName)) {
        return (0, evm_js_1.OOGResult)(opts.gasLimit);
    }
    const hash = sha256Function(data);
    if (opts._debug !== undefined) {
        opts._debug(`${pName} return hash=${(0, index_js_1.bytesToHex)(hash)}`);
    }
    return {
        executionGasUsed: gasUsed,
        returnValue: hash,
    };
}
exports.precompile02 = precompile02;
//# sourceMappingURL=02-sha256.js.map