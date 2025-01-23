"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.precompile0a = exports.BLS_MODULUS = void 0;
const index_js_1 = require("@ethereumjs/util/index.js");
const evm_js_1 = require("../evm.js");
const exceptions_js_1 = require("../exceptions.js");
const util_js_1 = require("./util.js");
const index_js_2 = require("./index.js");
exports.BLS_MODULUS = BigInt('52435875175126190479447740508185965837690552500527637822603658699938581184513');
const modulusBuffer = (0, index_js_1.setLengthLeft)((0, index_js_1.bigIntToBytes)(exports.BLS_MODULUS), 32);
async function precompile0a(opts) {
    const pName = (0, index_js_2.getPrecompileName)('0a');
    if (opts.common.customCrypto?.kzg === undefined) {
        throw new Error('kzg not initialized');
    }
    const gasUsed = opts.common.param('kzgPointEvaluationPrecompileGas');
    if (!(0, util_js_1.gasLimitCheck)(opts, gasUsed, pName)) {
        return (0, evm_js_1.OOGResult)(opts.gasLimit);
    }
    if (opts.data.length !== 192) {
        return (0, evm_js_1.EvmErrorResult)(new exceptions_js_1.EvmError(exceptions_js_1.ERROR.INVALID_INPUT_LENGTH), opts.gasLimit);
    }
    const version = Number(opts.common.param('blobCommitmentVersionKzg'));
    const fieldElementsPerBlob = opts.common.param('fieldElementsPerBlob');
    const versionedHash = (0, index_js_1.bytesToHex)(opts.data.subarray(0, 32));
    const z = (0, index_js_1.bytesToHex)(opts.data.subarray(32, 64));
    const y = (0, index_js_1.bytesToHex)(opts.data.subarray(64, 96));
    const commitment = (0, index_js_1.bytesToHex)(opts.data.subarray(96, 144));
    const kzgProof = (0, index_js_1.bytesToHex)(opts.data.subarray(144, 192));
    if ((0, index_js_1.computeVersionedHash)(commitment, version) !== versionedHash) {
        if (opts._debug !== undefined) {
            opts._debug(`${pName} failed: INVALID_COMMITMENT`);
        }
        return (0, evm_js_1.EvmErrorResult)(new exceptions_js_1.EvmError(exceptions_js_1.ERROR.INVALID_COMMITMENT), opts.gasLimit);
    }
    if (opts._debug !== undefined) {
        opts._debug(`${pName}: proof verification with commitment=${commitment} z=${z} y=${y} kzgProof=${kzgProof}`);
    }
    try {
        const res = opts.common.customCrypto?.kzg?.verifyProof(commitment, z, y, kzgProof);
        if (res === false) {
            return (0, evm_js_1.EvmErrorResult)(new exceptions_js_1.EvmError(exceptions_js_1.ERROR.INVALID_PROOF), opts.gasLimit);
        }
    }
    catch (err) {
        if (err.message.includes('C_KZG_BADARGS') === true) {
            if (opts._debug !== undefined) {
                opts._debug(`${pName} failed: INVALID_INPUTS`);
            }
            return (0, evm_js_1.EvmErrorResult)(new exceptions_js_1.EvmError(exceptions_js_1.ERROR.INVALID_INPUTS), opts.gasLimit);
        }
        if (opts._debug !== undefined) {
            opts._debug(`${pName} failed: Unknown error - ${err.message}`);
        }
        return (0, evm_js_1.EvmErrorResult)(new exceptions_js_1.EvmError(exceptions_js_1.ERROR.REVERT), opts.gasLimit);
    }
    // Return value - FIELD_ELEMENTS_PER_BLOB and BLS_MODULUS as padded 32 byte big endian values
    const fieldElementsBuffer = (0, index_js_1.setLengthLeft)((0, index_js_1.bigIntToBytes)(fieldElementsPerBlob), 32);
    if (opts._debug !== undefined) {
        opts._debug(`${pName} return fieldElements=${(0, index_js_1.bytesToHex)(fieldElementsBuffer)} modulus=${(0, index_js_1.bytesToHex)(modulusBuffer)}`);
    }
    return {
        executionGasUsed: gasUsed,
        returnValue: (0, index_js_1.concatBytes)(fieldElementsBuffer, modulusBuffer),
    };
}
exports.precompile0a = precompile0a;
//# sourceMappingURL=0a-kzg-point-evaluation.js.map