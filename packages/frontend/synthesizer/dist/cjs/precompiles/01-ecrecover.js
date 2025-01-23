"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.precompile01 = void 0;
const index_js_1 = require("@ethereumjs/util/index.js");
const evm_js_1 = require("../evm.js");
const util_js_1 = require("./util.js");
const index_js_2 = require("./index.js");
function precompile01(opts) {
    const pName = (0, index_js_2.getPrecompileName)('01');
    const ecrecoverFunction = opts.common.customCrypto.ecrecover ?? index_js_1.ecrecover;
    const gasUsed = opts.common.param('ecRecoverGas');
    if (!(0, util_js_1.gasLimitCheck)(opts, gasUsed, pName)) {
        return (0, evm_js_1.OOGResult)(opts.gasLimit);
    }
    const data = (0, index_js_1.setLengthRight)(opts.data, 128);
    const msgHash = data.subarray(0, 32);
    const v = data.subarray(32, 64);
    const vBigInt = (0, index_js_1.bytesToBigInt)(v);
    // Guard against util's `ecrecover`: without providing chainId this will return
    // a signature in most of the cases in the cases that `v=0` or `v=1`
    // However, this should throw, only 27 and 28 is allowed as input
    if (vBigInt !== index_js_1.BIGINT_27 && vBigInt !== index_js_1.BIGINT_28) {
        if (opts._debug !== undefined) {
            opts._debug(`${pName} failed: v neither 27 nor 28`);
        }
        return {
            executionGasUsed: gasUsed,
            returnValue: new Uint8Array(),
        };
    }
    const r = data.subarray(64, 96);
    const s = data.subarray(96, 128);
    let publicKey;
    try {
        if (opts._debug !== undefined) {
            opts._debug(`${pName}: PK recovery with msgHash=${(0, index_js_1.bytesToHex)(msgHash)} v=${(0, index_js_1.bytesToHex)(v)} r=${(0, index_js_1.bytesToHex)(r)}s=${(0, index_js_1.bytesToHex)(s)}}`);
        }
        publicKey = ecrecoverFunction(msgHash, (0, index_js_1.bytesToBigInt)(v), r, s);
    }
    catch (e) {
        if (opts._debug !== undefined) {
            opts._debug(`${pName} failed: PK recovery failed`);
        }
        return {
            executionGasUsed: gasUsed,
            returnValue: new Uint8Array(0),
        };
    }
    const address = (0, index_js_1.setLengthLeft)((0, index_js_1.publicToAddress)(publicKey), 32);
    if (opts._debug !== undefined) {
        opts._debug(`${pName} return address=${(0, index_js_1.bytesToHex)(address)}`);
    }
    return {
        executionGasUsed: gasUsed,
        returnValue: address,
    };
}
exports.precompile01 = precompile01;
//# sourceMappingURL=01-ecrecover.js.map