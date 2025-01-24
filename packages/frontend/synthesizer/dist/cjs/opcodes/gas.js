"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dynamicGasHandlers = void 0;
const index_js_1 = require("@ethereumjs/common/dist/esm/index.js");
const index_js_2 = require("@ethereumjs/util/index.js");
const errors_js_1 = require("../eof/errors.js");
const exceptions_js_1 = require("../exceptions.js");
const types_js_1 = require("../types.js");
const EIP1283_js_1 = require("./EIP1283.js");
const EIP2200_js_1 = require("./EIP2200.js");
const EIP2929_js_1 = require("./EIP2929.js");
const util_js_1 = require("./util.js");
const EXTCALL_TARGET_MAX = BigInt(2) ** BigInt(8 * 20) - BigInt(1);
async function eip7702GasCost(runState, common, address, charge2929Gas) {
    const code = await runState.stateManager.getCode(address);
    if ((0, index_js_2.equalsBytes)(code.slice(0, 3), types_js_1.DELEGATION_7702_FLAG)) {
        return (0, EIP2929_js_1.accessAddressEIP2929)(runState, code.slice(3, 24), common, charge2929Gas);
    }
    return index_js_2.BIGINT_0;
}
exports.dynamicGasHandlers = new Map([
    [
        /* EXP */
        0x0a,
        async function (runState, gas, common) {
            const [_base, exponent] = runState.stack.peek(2);
            if (exponent === index_js_2.BIGINT_0) {
                return gas;
            }
            let byteLength = exponent.toString(2).length / 8;
            if (byteLength > Math.trunc(byteLength)) {
                byteLength = Math.trunc(byteLength) + 1;
            }
            if (byteLength < 1 || byteLength > 32) {
                (0, util_js_1.trap)(exceptions_js_1.ERROR.OUT_OF_RANGE);
            }
            const expPricePerByte = common.param('expByteGas');
            gas += BigInt(byteLength) * expPricePerByte;
            return gas;
        },
    ],
    [
        /* KECCAK256 */
        0x20,
        async function (runState, gas, common) {
            const [offset, length] = runState.stack.peek(2);
            gas += (0, util_js_1.subMemUsage)(runState, offset, length, common);
            gas += common.param('keccak256WordGas') * (0, util_js_1.divCeil)(length, index_js_2.BIGINT_32);
            return gas;
        },
    ],
    [
        /* BALANCE */
        0x31,
        async function (runState, gas, common) {
            const address = (0, util_js_1.createAddressFromStackBigInt)(runState.stack.peek()[0]);
            let charge2929Gas = true;
            if (common.isActivatedEIP(6800)) {
                const coldAccessGas = runState.env.accessWitness.touchAddressOnReadAndComputeGas(address, 0, index_js_2.VERKLE_BASIC_DATA_LEAF_KEY);
                gas += coldAccessGas;
                charge2929Gas = coldAccessGas === index_js_2.BIGINT_0;
            }
            if (common.isActivatedEIP(2929)) {
                gas += (0, EIP2929_js_1.accessAddressEIP2929)(runState, address.bytes, common, charge2929Gas);
            }
            return gas;
        },
    ],
    [
        /* CALLDATACOPY */
        0x37,
        async function (runState, gas, common) {
            const [memOffset, _dataOffset, dataLength] = runState.stack.peek(3);
            gas += (0, util_js_1.subMemUsage)(runState, memOffset, dataLength, common);
            if (dataLength !== index_js_2.BIGINT_0) {
                gas += common.param('copyGas') * (0, util_js_1.divCeil)(dataLength, index_js_2.BIGINT_32);
            }
            return gas;
        },
    ],
    [
        /* CODECOPY */
        0x39,
        async function (runState, gas, common) {
            const [memOffset, _codeOffset, dataLength] = runState.stack.peek(3);
            gas += (0, util_js_1.subMemUsage)(runState, memOffset, dataLength, common);
            if (dataLength !== index_js_2.BIGINT_0) {
                gas += common.param('copyGas') * (0, util_js_1.divCeil)(dataLength, index_js_2.BIGINT_32);
                if (common.isActivatedEIP(6800) && runState.env.chargeCodeAccesses === true) {
                    const contract = runState.interpreter.getAddress();
                    let codeEnd = _codeOffset + dataLength;
                    const codeSize = runState.interpreter.getCodeSize();
                    if (codeEnd > codeSize) {
                        codeEnd = codeSize;
                    }
                    gas += runState.env.accessWitness.touchCodeChunksRangeOnReadAndChargeGas(contract, Number(_codeOffset), Number(codeEnd));
                }
            }
            return gas;
        },
    ],
    [
        /* EXTCODESIZE */
        0x3b,
        async function (runState, gas, common) {
            const address = (0, util_js_1.createAddressFromStackBigInt)(runState.stack.peek()[0]);
            let charge2929Gas = true;
            if (common.isActivatedEIP(6800) &&
                runState.interpreter._evm.getPrecompile(address) === undefined) {
                let coldAccessGas = index_js_2.BIGINT_0;
                coldAccessGas += runState.env.accessWitness.touchAddressOnReadAndComputeGas(address, 0, index_js_2.VERKLE_BASIC_DATA_LEAF_KEY);
                gas += coldAccessGas;
                // if cold access gas has been charged 2929 gas shouldn't be charged
                charge2929Gas = coldAccessGas === index_js_2.BIGINT_0;
            }
            if (common.isActivatedEIP(2929)) {
                gas += (0, EIP2929_js_1.accessAddressEIP2929)(runState, address.bytes, common, charge2929Gas);
            }
            if (common.isActivatedEIP(7702)) {
                gas += await eip7702GasCost(runState, common, address, charge2929Gas);
            }
            return gas;
        },
    ],
    [
        /* EXTCODECOPY */
        0x3c,
        async function (runState, gas, common) {
            const [addressBigInt, memOffset, _codeOffset, dataLength] = runState.stack.peek(4);
            const address = (0, util_js_1.createAddressFromStackBigInt)(addressBigInt);
            gas += (0, util_js_1.subMemUsage)(runState, memOffset, dataLength, common);
            let charge2929Gas = true;
            if (common.isActivatedEIP(6800) &&
                runState.interpreter._evm.getPrecompile(address) === undefined) {
                let coldAccessGas = index_js_2.BIGINT_0;
                coldAccessGas += runState.env.accessWitness.touchAddressOnReadAndComputeGas(address, 0, index_js_2.VERKLE_BASIC_DATA_LEAF_KEY);
                gas += coldAccessGas;
                // if cold access gas has been charged 2929 gas shouldn't be charged
                charge2929Gas = coldAccessGas === index_js_2.BIGINT_0;
            }
            if (common.isActivatedEIP(2929)) {
                gas += (0, EIP2929_js_1.accessAddressEIP2929)(runState, address.bytes, common, charge2929Gas);
            }
            if (common.isActivatedEIP(7702)) {
                gas += await eip7702GasCost(runState, common, address, charge2929Gas);
            }
            if (dataLength !== index_js_2.BIGINT_0) {
                gas += common.param('copyGas') * (0, util_js_1.divCeil)(dataLength, index_js_2.BIGINT_32);
                if (common.isActivatedEIP(6800)) {
                    let codeEnd = _codeOffset + dataLength;
                    const codeSize = BigInt((await runState.stateManager.getCode(address)).length);
                    if (codeEnd > codeSize) {
                        codeEnd = codeSize;
                    }
                    gas += runState.env.accessWitness.touchCodeChunksRangeOnReadAndChargeGas(address, Number(_codeOffset), Number(codeEnd));
                }
            }
            return gas;
        },
    ],
    [
        /* RETURNDATACOPY */
        0x3e,
        async function (runState, gas, common) {
            const [memOffset, returnDataOffset, dataLength] = runState.stack.peek(3);
            if (returnDataOffset + dataLength > runState.interpreter.getReturnDataSize()) {
                // For an EOF contract, the behavior is changed (see EIP 7069)
                // RETURNDATACOPY in that case does not throw OOG when reading out-of-bounds
                if (runState.env.eof === undefined) {
                    (0, util_js_1.trap)(exceptions_js_1.ERROR.OUT_OF_GAS);
                }
            }
            gas += (0, util_js_1.subMemUsage)(runState, memOffset, dataLength, common);
            if (dataLength !== index_js_2.BIGINT_0) {
                gas += common.param('copyGas') * (0, util_js_1.divCeil)(dataLength, index_js_2.BIGINT_32);
            }
            return gas;
        },
    ],
    [
        /* EXTCODEHASH */
        0x3f,
        async function (runState, gas, common) {
            const address = (0, util_js_1.createAddressFromStackBigInt)(runState.stack.peek()[0]);
            let charge2929Gas = true;
            if (common.isActivatedEIP(6800)) {
                let coldAccessGas = index_js_2.BIGINT_0;
                coldAccessGas += runState.env.accessWitness.touchAddressOnReadAndComputeGas(address, 0, index_js_2.VERKLE_CODE_HASH_LEAF_KEY);
                gas += coldAccessGas;
                charge2929Gas = coldAccessGas === index_js_2.BIGINT_0;
            }
            if (common.isActivatedEIP(2929)) {
                gas += (0, EIP2929_js_1.accessAddressEIP2929)(runState, address.bytes, common, charge2929Gas);
            }
            if (common.isActivatedEIP(7702)) {
                gas += await eip7702GasCost(runState, common, address, charge2929Gas);
            }
            return gas;
        },
    ],
    [
        /* MLOAD */
        0x51,
        async function (runState, gas, common) {
            const pos = runState.stack.peek()[0];
            gas += (0, util_js_1.subMemUsage)(runState, pos, index_js_2.BIGINT_32, common);
            return gas;
        },
    ],
    [
        /* MSTORE */
        0x52,
        async function (runState, gas, common) {
            const offset = runState.stack.peek()[0];
            gas += (0, util_js_1.subMemUsage)(runState, offset, index_js_2.BIGINT_32, common);
            return gas;
        },
    ],
    [
        /* MSTORE8 */
        0x53,
        async function (runState, gas, common) {
            const offset = runState.stack.peek()[0];
            gas += (0, util_js_1.subMemUsage)(runState, offset, index_js_2.BIGINT_1, common);
            return gas;
        },
    ],
    [
        /* SLOAD */
        0x54,
        async function (runState, gas, common) {
            const key = runState.stack.peek()[0];
            const keyBuf = (0, index_js_2.setLengthLeft)((0, index_js_2.bigIntToBytes)(key), 32);
            let charge2929Gas = true;
            if (common.isActivatedEIP(6800)) {
                const address = runState.interpreter.getAddress();
                const { treeIndex, subIndex } = (0, index_js_2.getVerkleTreeIndicesForStorageSlot)(key);
                const coldAccessGas = runState.env.accessWitness.touchAddressOnReadAndComputeGas(address, treeIndex, subIndex);
                gas += coldAccessGas;
                charge2929Gas = coldAccessGas === index_js_2.BIGINT_0;
            }
            if (common.isActivatedEIP(2929)) {
                gas += (0, EIP2929_js_1.accessStorageEIP2929)(runState, keyBuf, false, common, charge2929Gas);
            }
            return gas;
        },
    ],
    [
        /* SSTORE */
        0x55,
        async function (runState, gas, common) {
            if (runState.interpreter.isStatic()) {
                (0, util_js_1.trap)(exceptions_js_1.ERROR.STATIC_STATE_CHANGE);
            }
            const [key, val] = runState.stack.peek(2);
            const keyBytes = (0, index_js_2.setLengthLeft)((0, index_js_2.bigIntToBytes)(key), 32);
            // NOTE: this should be the shortest representation
            let value;
            if (val === index_js_2.BIGINT_0) {
                value = Uint8Array.from([]);
            }
            else {
                value = (0, index_js_2.bigIntToBytes)(val);
            }
            const currentStorage = (0, util_js_1.setLengthLeftStorage)(await runState.interpreter.storageLoad(keyBytes));
            const originalStorage = (0, util_js_1.setLengthLeftStorage)(await runState.interpreter.storageLoad(keyBytes, true));
            if (common.hardfork() === index_js_1.Hardfork.Constantinople) {
                gas += (0, EIP1283_js_1.updateSstoreGasEIP1283)(runState, currentStorage, originalStorage, (0, util_js_1.setLengthLeftStorage)(value), common);
            }
            else if (common.gteHardfork(index_js_1.Hardfork.Istanbul)) {
                if (!common.isActivatedEIP(6800)) {
                    gas += (0, EIP2200_js_1.updateSstoreGasEIP2200)(runState, currentStorage, originalStorage, (0, util_js_1.setLengthLeftStorage)(value), keyBytes, common);
                }
            }
            else {
                gas += (0, util_js_1.updateSstoreGas)(runState, currentStorage, (0, util_js_1.setLengthLeftStorage)(value), common);
            }
            let charge2929Gas = true;
            if (common.isActivatedEIP(6800)) {
                const contract = runState.interpreter.getAddress();
                const { treeIndex, subIndex } = (0, index_js_2.getVerkleTreeIndicesForStorageSlot)(key);
                const coldAccessGas = runState.env.accessWitness.touchAddressOnWriteAndComputeGas(contract, treeIndex, subIndex);
                gas += coldAccessGas;
                charge2929Gas = coldAccessGas === index_js_2.BIGINT_0;
            }
            if (common.isActivatedEIP(2929)) {
                // We have to do this after the Istanbul (EIP2200) checks.
                // Otherwise, we might run out of gas, due to "sentry check" of 2300 gas,
                // if we deduct extra gas first.
                gas += (0, EIP2929_js_1.accessStorageEIP2929)(runState, keyBytes, true, common, charge2929Gas);
            }
            return gas;
        },
    ],
    [
        /* MCOPY */
        0x5e,
        async function (runState, gas, common) {
            const [dst, src, length] = runState.stack.peek(3);
            const wordsCopied = (length + index_js_2.BIGINT_31) / index_js_2.BIGINT_32;
            gas += index_js_2.BIGINT_3 * wordsCopied;
            gas += (0, util_js_1.subMemUsage)(runState, src, length, common);
            gas += (0, util_js_1.subMemUsage)(runState, dst, length, common);
            return gas;
        },
    ],
    [
        /* LOG */
        0xa0,
        async function (runState, gas, common) {
            if (runState.interpreter.isStatic()) {
                (0, util_js_1.trap)(exceptions_js_1.ERROR.STATIC_STATE_CHANGE);
            }
            const [memOffset, memLength] = runState.stack.peek(2);
            const topicsCount = runState.opCode - 0xa0;
            if (topicsCount < 0 || topicsCount > 4) {
                (0, util_js_1.trap)(exceptions_js_1.ERROR.OUT_OF_RANGE);
            }
            gas += (0, util_js_1.subMemUsage)(runState, memOffset, memLength, common);
            gas +=
                common.param('logTopicGas') * BigInt(topicsCount) + memLength * common.param('logDataGas');
            return gas;
        },
    ],
    /* DATACOPY */
    [
        0xd3,
        async function (runState, gas, common) {
            const [memOffset, _dataOffset, dataLength] = runState.stack.peek(3);
            gas += (0, util_js_1.subMemUsage)(runState, memOffset, dataLength, common);
            if (dataLength !== index_js_2.BIGINT_0) {
                gas += common.param('copyGas') * (0, util_js_1.divCeil)(dataLength, index_js_2.BIGINT_32);
            }
            return gas;
        },
    ],
    /* EOFCREATE */
    [
        0xec,
        async function (runState, gas, common) {
            // Note: TX_CREATE_COST is in the base fee (this is 32000 and same as CREATE / CREATE2)
            // Note: in `gas.ts` programCounter is not yet incremented (which it is in `functions.ts`)
            // So have to manually add to programCounter here to get the right container index
            // Read container index
            const containerIndex = runState.env.code[runState.programCounter + 1];
            // Pop stack values
            const [_value, _salt, inputOffset, inputSize] = runState.stack.peek(4);
            //if (common.isActivatedEIP(2929)) {
            // TODO: adding or not adding this makes test
            // --test=tests/prague/eip7692_eof_v1/eip7620_eof_create/test_eofcreate.py::test_eofcreate_then_call[fork_CancunEIP7692-blockchain_test]
            // still succeed. This only warms the current address?? This is also in CREATE/CREATE2
            // Can this be removed in both?
            /*gas += accessAddressEIP2929(
                runState,
                runState.interpreter.getAddress().bytes,
                common,
                false
              )
            }*/
            // Expand memory
            gas += (0, util_js_1.subMemUsage)(runState, inputOffset, inputSize, common);
            // Read container
            const container = runState.env.eof.container.body.containerSections[containerIndex];
            // Charge for hashing cost
            gas += common.param('keccak256WordGas') * (0, util_js_1.divCeil)(BigInt(container.length), index_js_2.BIGINT_32);
            const gasLeft = runState.interpreter.getGasLeft() - gas;
            runState.messageGasLimit = (0, util_js_1.maxCallGas)(gasLeft, gasLeft, runState, common);
            return gas;
        },
    ],
    /* RETURNCONTRACT */
    [
        0xee,
        async function (runState, gas, common) {
            // Pop stack values
            const [auxDataOffset, auxDataSize] = runState.stack.peek(2);
            // Expand memory
            gas += (0, util_js_1.subMemUsage)(runState, auxDataOffset, auxDataSize, common);
            return gas;
        },
    ],
    [
        /* CREATE */
        0xf0,
        async function (runState, gas, common) {
            if (runState.interpreter.isStatic()) {
                (0, util_js_1.trap)(exceptions_js_1.ERROR.STATIC_STATE_CHANGE);
            }
            const [_value, offset, length] = runState.stack.peek(3);
            if (common.isActivatedEIP(2929)) {
                gas += (0, EIP2929_js_1.accessAddressEIP2929)(runState, runState.interpreter.getAddress().bytes, common, false);
            }
            if (common.isActivatedEIP(3860)) {
                gas += ((length + index_js_2.BIGINT_31) / index_js_2.BIGINT_32) * common.param('initCodeWordGas');
            }
            gas += (0, util_js_1.subMemUsage)(runState, offset, length, common);
            let gasLimit = BigInt(runState.interpreter.getGasLeft()) - gas;
            gasLimit = (0, util_js_1.maxCallGas)(gasLimit, gasLimit, runState, common);
            runState.messageGasLimit = gasLimit;
            return gas;
        },
    ],
    [
        /* CALL */
        0xf1,
        async function (runState, gas, common) {
            const [currentGasLimit, toAddr, value, inOffset, inLength, outOffset, outLength] = runState.stack.peek(7);
            const toAddress = (0, util_js_1.createAddressFromStackBigInt)(toAddr);
            if (runState.interpreter.isStatic() && value !== index_js_2.BIGINT_0) {
                (0, util_js_1.trap)(exceptions_js_1.ERROR.STATIC_STATE_CHANGE);
            }
            gas += (0, util_js_1.subMemUsage)(runState, inOffset, inLength, common);
            gas += (0, util_js_1.subMemUsage)(runState, outOffset, outLength, common);
            let charge2929Gas = true;
            if (common.isActivatedEIP(6800) &&
                runState.interpreter._evm.getPrecompile(toAddress) === undefined) {
                // TODO: add check if toAddress is not a precompile
                const coldAccessGas = runState.env.accessWitness.touchAndChargeMessageCall(toAddress);
                if (value !== index_js_2.BIGINT_0) {
                    const contractAddress = runState.interpreter.getAddress();
                    gas += runState.env.accessWitness.touchAddressOnWriteAndComputeGas(contractAddress, 0, index_js_2.VERKLE_BASIC_DATA_LEAF_KEY);
                    gas += runState.env.accessWitness.touchAndChargeValueTransfer(toAddress);
                }
                gas += coldAccessGas;
                charge2929Gas = coldAccessGas === index_js_2.BIGINT_0;
            }
            if (common.isActivatedEIP(2929)) {
                gas += (0, EIP2929_js_1.accessAddressEIP2929)(runState, toAddress.bytes, common, charge2929Gas);
            }
            if (common.isActivatedEIP(7702)) {
                gas += await eip7702GasCost(runState, common, toAddress, charge2929Gas);
            }
            if (value !== index_js_2.BIGINT_0 && !common.isActivatedEIP(6800)) {
                gas += common.param('callValueTransferGas');
            }
            if (common.gteHardfork(index_js_1.Hardfork.SpuriousDragon)) {
                // We are at or after Spurious Dragon
                // Call new account gas: account is DEAD and we transfer nonzero value
                const account = await runState.stateManager.getAccount(toAddress);
                let deadAccount = false;
                if (account === undefined || account.isEmpty()) {
                    deadAccount = true;
                }
                if (deadAccount && !(value === index_js_2.BIGINT_0)) {
                    gas += common.param('callNewAccountGas');
                }
            }
            else if ((await runState.stateManager.getAccount(toAddress)) === undefined) {
                // We are before Spurious Dragon and the account does not exist.
                // Call new account gas: account does not exist (it is not in the state trie, not even as an "empty" account)
                gas += common.param('callNewAccountGas');
            }
            const gasLimit = (0, util_js_1.maxCallGas)(currentGasLimit, runState.interpreter.getGasLeft() - gas, runState, common);
            // note that TangerineWhistle or later this cannot happen
            // (it could have ran out of gas prior to getting here though)
            if (gasLimit > runState.interpreter.getGasLeft() - gas) {
                (0, util_js_1.trap)(exceptions_js_1.ERROR.OUT_OF_GAS);
            }
            if (gas > runState.interpreter.getGasLeft()) {
                (0, util_js_1.trap)(exceptions_js_1.ERROR.OUT_OF_GAS);
            }
            runState.messageGasLimit = gasLimit;
            return gas;
        },
    ],
    [
        /* CALLCODE */
        0xf2,
        async function (runState, gas, common) {
            const [currentGasLimit, toAddr, value, inOffset, inLength, outOffset, outLength] = runState.stack.peek(7);
            const toAddress = (0, util_js_1.createAddressFromStackBigInt)(toAddr);
            gas += (0, util_js_1.subMemUsage)(runState, inOffset, inLength, common);
            gas += (0, util_js_1.subMemUsage)(runState, outOffset, outLength, common);
            let charge2929Gas = true;
            if (common.isActivatedEIP(6800) &&
                runState.interpreter._evm.getPrecompile(toAddress) === undefined) {
                const coldAccessGas = runState.env.accessWitness.touchAndChargeMessageCall(toAddress);
                gas += coldAccessGas;
                charge2929Gas = coldAccessGas === index_js_2.BIGINT_0;
            }
            if (common.isActivatedEIP(2929)) {
                gas += (0, EIP2929_js_1.accessAddressEIP2929)(runState, (0, util_js_1.createAddressFromStackBigInt)(toAddr).bytes, common, charge2929Gas);
            }
            if (common.isActivatedEIP(7702)) {
                gas += await eip7702GasCost(runState, common, toAddress, charge2929Gas);
            }
            if (value !== index_js_2.BIGINT_0) {
                gas += common.param('callValueTransferGas');
            }
            const gasLimit = (0, util_js_1.maxCallGas)(currentGasLimit, runState.interpreter.getGasLeft() - gas, runState, common);
            // note that TangerineWhistle or later this cannot happen
            // (it could have ran out of gas prior to getting here though)
            if (gasLimit > runState.interpreter.getGasLeft() - gas) {
                (0, util_js_1.trap)(exceptions_js_1.ERROR.OUT_OF_GAS);
            }
            runState.messageGasLimit = gasLimit;
            return gas;
        },
    ],
    [
        /* RETURN */
        0xf3,
        async function (runState, gas, common) {
            const [offset, length] = runState.stack.peek(2);
            gas += (0, util_js_1.subMemUsage)(runState, offset, length, common);
            return gas;
        },
    ],
    [
        /* DELEGATECALL */
        0xf4,
        async function (runState, gas, common) {
            const [currentGasLimit, toAddr, inOffset, inLength, outOffset, outLength] = runState.stack.peek(6);
            const toAddress = (0, util_js_1.createAddressFromStackBigInt)(toAddr);
            gas += (0, util_js_1.subMemUsage)(runState, inOffset, inLength, common);
            gas += (0, util_js_1.subMemUsage)(runState, outOffset, outLength, common);
            let charge2929Gas = true;
            if (common.isActivatedEIP(6800) &&
                runState.interpreter._evm.getPrecompile(toAddress) === undefined) {
                // TODO: add check if toAddress is not a precompile
                const coldAccessGas = runState.env.accessWitness.touchAndChargeMessageCall(toAddress);
                gas += coldAccessGas;
                charge2929Gas = coldAccessGas === index_js_2.BIGINT_0;
            }
            if (common.isActivatedEIP(2929)) {
                gas += (0, EIP2929_js_1.accessAddressEIP2929)(runState, (0, util_js_1.createAddressFromStackBigInt)(toAddr).bytes, common, charge2929Gas);
            }
            if (common.isActivatedEIP(7702)) {
                gas += await eip7702GasCost(runState, common, toAddress, charge2929Gas);
            }
            const gasLimit = (0, util_js_1.maxCallGas)(currentGasLimit, runState.interpreter.getGasLeft() - gas, runState, common);
            // note that TangerineWhistle or later this cannot happen
            // (it could have ran out of gas prior to getting here though)
            if (gasLimit > runState.interpreter.getGasLeft() - gas) {
                (0, util_js_1.trap)(exceptions_js_1.ERROR.OUT_OF_GAS);
            }
            runState.messageGasLimit = gasLimit;
            return gas;
        },
    ],
    [
        /* CREATE2 */
        0xf5,
        async function (runState, gas, common) {
            if (runState.interpreter.isStatic()) {
                (0, util_js_1.trap)(exceptions_js_1.ERROR.STATIC_STATE_CHANGE);
            }
            const [_value, offset, length, _salt] = runState.stack.peek(4);
            gas += (0, util_js_1.subMemUsage)(runState, offset, length, common);
            if (common.isActivatedEIP(2929)) {
                gas += (0, EIP2929_js_1.accessAddressEIP2929)(runState, runState.interpreter.getAddress().bytes, common, false);
            }
            if (common.isActivatedEIP(3860)) {
                gas += ((length + index_js_2.BIGINT_31) / index_js_2.BIGINT_32) * common.param('initCodeWordGas');
            }
            gas += common.param('keccak256WordGas') * (0, util_js_1.divCeil)(length, index_js_2.BIGINT_32);
            let gasLimit = runState.interpreter.getGasLeft() - gas;
            gasLimit = (0, util_js_1.maxCallGas)(gasLimit, gasLimit, runState, common); // CREATE2 is only available after TangerineWhistle (Constantinople introduced this opcode)
            runState.messageGasLimit = gasLimit;
            return gas;
        },
    ],
    /* EXTCALL */
    [
        0xf8,
        async function (runState, gas, common) {
            // Charge WARM_STORAGE_READ_COST (100) -> done in accessAddressEIP2929
            // Peek stack values
            const [toAddr, inOffset, inLength, value] = runState.stack.peek(4);
            // If value is nonzero and in static mode, throw:
            if (runState.interpreter.isStatic() && value !== index_js_2.BIGINT_0) {
                (0, util_js_1.trap)(exceptions_js_1.ERROR.STATIC_STATE_CHANGE);
            }
            // If value > 0, charge CALL_VALUE_COST
            if (value > index_js_2.BIGINT_0) {
                gas += common.param('callValueTransferGas');
            }
            // Check if the target address > 20 bytes
            if (toAddr > EXTCALL_TARGET_MAX) {
                (0, util_js_1.trap)(errors_js_1.EOFError.InvalidExtcallTarget);
            }
            // Charge for memory expansion
            gas += (0, util_js_1.subMemUsage)(runState, inOffset, inLength, common);
            const toAddress = (0, util_js_1.createAddressFromStackBigInt)(toAddr);
            // Charge to make address warm (2600 gas)
            // (in case if address is already warm, this charges the 100 gas)
            gas += (0, EIP2929_js_1.accessAddressEIP2929)(runState, toAddress.bytes, common);
            // Charge account creation cost if value is nonzero
            if (value > index_js_2.BIGINT_0) {
                const account = await runState.stateManager.getAccount(toAddress);
                const deadAccount = account === undefined || account.isEmpty();
                if (deadAccount) {
                    gas += common.param('callNewAccountGas');
                }
            }
            const minRetainedGas = common.param('minRetainedGas');
            const minCalleeGas = common.param('minCalleeGas');
            const currentGasAvailable = runState.interpreter.getGasLeft() - gas;
            const reducedGas = currentGasAvailable / index_js_2.BIGINT_64;
            // Calculate the gas limit for the callee
            // (this is the gas available for the next call frame)
            let gasLimit;
            if (reducedGas < minRetainedGas) {
                gasLimit = currentGasAvailable - minRetainedGas;
            }
            else {
                gasLimit = currentGasAvailable - reducedGas;
            }
            if (runState.env.depth >= Number(common.param('stackLimit')) ||
                runState.env.contract.balance < value ||
                gasLimit < minCalleeGas) {
                // Note: this is a hack, TODO: get around this hack and clean this up
                // This special case will ensure that the actual EXT*CALL is being ran,
                // But, the code in `function.ts` will note that `runState.messageGasLimit` is set to a negative number
                // This special number signals that `1` should be put on the stack (per spec)
                gasLimit = -index_js_2.BIGINT_1;
            }
            runState.messageGasLimit = gasLimit;
            return gas;
        },
    ],
    /* EXTDELEGATECALL */
    [
        0xf9,
        async function (runState, gas, common) {
            // Charge WARM_STORAGE_READ_COST (100) -> done in accessAddressEIP2929
            // Peek stack values
            const [toAddr, inOffset, inLength] = runState.stack.peek(3);
            // Check if the target address > 20 bytes
            if (toAddr > EXTCALL_TARGET_MAX) {
                (0, util_js_1.trap)(errors_js_1.EOFError.InvalidExtcallTarget);
            }
            // Charge for memory expansion
            gas += (0, util_js_1.subMemUsage)(runState, inOffset, inLength, common);
            const toAddress = (0, util_js_1.createAddressFromStackBigInt)(toAddr);
            // Charge to make address warm (2600 gas)
            // (in case if address is already warm, this charges the 100 gas)
            gas += (0, EIP2929_js_1.accessAddressEIP2929)(runState, toAddress.bytes, common);
            const minRetainedGas = common.param('minRetainedGas');
            const minCalleeGas = common.param('minCalleeGas');
            const currentGasAvailable = runState.interpreter.getGasLeft() - gas;
            const reducedGas = currentGasAvailable / index_js_2.BIGINT_64;
            // Calculate the gas limit for the callee
            // (this is the gas available for the next call frame)
            let gasLimit;
            if (reducedGas < minRetainedGas) {
                gasLimit = currentGasAvailable - minRetainedGas;
            }
            else {
                gasLimit = currentGasAvailable - reducedGas;
            }
            if (runState.env.depth >= Number(common.param('stackLimit')) || gasLimit < minCalleeGas) {
                // Note: this is a hack, TODO: get around this hack and clean this up
                // This special case will ensure that the actual EXT*CALL is being ran,
                // But, the code in `function.ts` will note that `runState.messageGasLimit` is set to a negative number
                // This special number signals that `1` should be put on the stack (per spec)
                gasLimit = -index_js_2.BIGINT_1;
            }
            runState.messageGasLimit = gasLimit;
            return gas;
        },
    ],
    [
        /* STATICCALL */
        0xfa,
        async function (runState, gas, common) {
            const [currentGasLimit, toAddr, inOffset, inLength, outOffset, outLength] = runState.stack.peek(6);
            gas += (0, util_js_1.subMemUsage)(runState, inOffset, inLength, common);
            gas += (0, util_js_1.subMemUsage)(runState, outOffset, outLength, common);
            let charge2929Gas = true;
            if (common.isActivatedEIP(6800)) {
                const toAddress = (0, util_js_1.createAddressFromStackBigInt)(toAddr);
                // TODO: add check if toAddress is not a precompile
                const coldAccessGas = runState.env.accessWitness.touchAndChargeMessageCall(toAddress);
                gas += coldAccessGas;
                charge2929Gas = coldAccessGas === index_js_2.BIGINT_0;
            }
            if (common.isActivatedEIP(2929)) {
                gas += (0, EIP2929_js_1.accessAddressEIP2929)(runState, (0, util_js_1.createAddressFromStackBigInt)(toAddr).bytes, common, charge2929Gas);
            }
            if (common.isActivatedEIP(7702)) {
                gas += await eip7702GasCost(runState, common, (0, util_js_1.createAddressFromStackBigInt)(toAddr), charge2929Gas);
            }
            const gasLimit = (0, util_js_1.maxCallGas)(currentGasLimit, runState.interpreter.getGasLeft() - gas, runState, common); // we set TangerineWhistle or later to true here, as STATICCALL was available from Byzantium (which is after TangerineWhistle)
            runState.messageGasLimit = gasLimit;
            return gas;
        },
    ],
    /* EXTSTATICCALL */
    [
        0xfb,
        async function (runState, gas, common) {
            // Charge WARM_STORAGE_READ_COST (100) -> done in accessAddressEIP2929
            // Peek stack values
            const [toAddr, inOffset, inLength] = runState.stack.peek(3);
            // Check if the target address > 20 bytes
            if (toAddr > EXTCALL_TARGET_MAX) {
                (0, util_js_1.trap)(errors_js_1.EOFError.InvalidExtcallTarget);
            }
            // Charge for memory expansion
            gas += (0, util_js_1.subMemUsage)(runState, inOffset, inLength, common);
            const toAddress = (0, util_js_1.createAddressFromStackBigInt)(toAddr);
            // Charge to make address warm (2600 gas)
            // (in case if address is already warm, this charges the 100 gas)
            gas += (0, EIP2929_js_1.accessAddressEIP2929)(runState, toAddress.bytes, common);
            const minRetainedGas = common.param('minRetainedGas');
            const minCalleeGas = common.param('minCalleeGas');
            const currentGasAvailable = runState.interpreter.getGasLeft() - gas;
            const reducedGas = currentGasAvailable / index_js_2.BIGINT_64;
            // Calculate the gas limit for the callee
            // (this is the gas available for the next call frame)
            let gasLimit;
            if (reducedGas < minRetainedGas) {
                gasLimit = currentGasAvailable - minRetainedGas;
            }
            else {
                gasLimit = currentGasAvailable - reducedGas;
            }
            if (runState.env.depth >= Number(common.param('stackLimit')) || gasLimit < minCalleeGas) {
                // Note: this is a hack, TODO: get around this hack and clean this up
                // This special case will ensure that the actual EXT*CALL is being ran,
                // But, the code in `function.ts` will note that `runState.messageGasLimit` is set to a negative number
                // This special number signals that `1` should be put on the stack (per spec)
                gasLimit = -index_js_2.BIGINT_1;
            }
            runState.messageGasLimit = gasLimit;
            return gas;
        },
    ],
    [
        /* REVERT */
        0xfd,
        async function (runState, gas, common) {
            const [offset, length] = runState.stack.peek(2);
            gas += (0, util_js_1.subMemUsage)(runState, offset, length, common);
            return gas;
        },
    ],
    [
        /* SELFDESTRUCT */
        0xff,
        async function (runState, gas, common) {
            if (runState.interpreter.isStatic()) {
                (0, util_js_1.trap)(exceptions_js_1.ERROR.STATIC_STATE_CHANGE);
            }
            const selfdestructToaddressBigInt = runState.stack.peek()[0];
            const selfdestructToAddress = (0, util_js_1.createAddressFromStackBigInt)(selfdestructToaddressBigInt);
            const contractAddress = runState.interpreter.getAddress();
            let deductGas = false;
            const balance = await runState.interpreter.getExternalBalance(contractAddress);
            if (common.gteHardfork(index_js_1.Hardfork.SpuriousDragon)) {
                // EIP-161: State Trie Clearing
                if (balance > index_js_2.BIGINT_0) {
                    // This technically checks if account is empty or non-existent
                    const account = await runState.stateManager.getAccount(selfdestructToAddress);
                    if (account === undefined || account.isEmpty()) {
                        deductGas = true;
                    }
                }
            }
            else if (common.gteHardfork(index_js_1.Hardfork.TangerineWhistle)) {
                // EIP-150 (Tangerine Whistle) gas semantics
                const exists = (await runState.stateManager.getAccount(selfdestructToAddress)) !== undefined;
                if (!exists) {
                    deductGas = true;
                }
            }
            if (deductGas) {
                gas += common.param('callNewAccountGas');
            }
            let selfDestructToCharge2929Gas = true;
            if (common.isActivatedEIP(6800)) {
                gas += runState.env.accessWitness.touchAddressOnReadAndComputeGas(contractAddress, 0, index_js_2.VERKLE_BASIC_DATA_LEAF_KEY);
                if (balance > index_js_2.BIGINT_0) {
                    gas += runState.env.accessWitness.touchAddressOnWriteAndComputeGas(contractAddress, 0, index_js_2.VERKLE_BASIC_DATA_LEAF_KEY);
                }
                let selfDestructToColdAccessGas = runState.env.accessWitness.touchAddressOnReadAndComputeGas(selfdestructToAddress, 0, index_js_2.VERKLE_BASIC_DATA_LEAF_KEY);
                if (balance > index_js_2.BIGINT_0) {
                    selfDestructToColdAccessGas +=
                        runState.env.accessWitness.touchAddressOnWriteAndComputeGas(selfdestructToAddress, 0, index_js_2.VERKLE_BASIC_DATA_LEAF_KEY);
                }
                gas += selfDestructToColdAccessGas;
                selfDestructToCharge2929Gas = selfDestructToColdAccessGas === index_js_2.BIGINT_0;
            }
            if (common.isActivatedEIP(2929)) {
                gas += (0, EIP2929_js_1.accessAddressEIP2929)(runState, selfdestructToAddress.bytes, common, selfDestructToCharge2929Gas, true);
            }
            return gas;
        },
    ],
]);
// Set the range [0xa0, 0xa4] to the LOG handler
const logDynamicFunc = exports.dynamicGasHandlers.get(0xa0);
for (let i = 0xa1; i <= 0xa4; i++) {
    exports.dynamicGasHandlers.set(i, logDynamicFunc);
}
//# sourceMappingURL=gas.js.map