"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adjustSstoreGasEIP2929 = exports.accessStorageEIP2929 = exports.accessAddressEIP2929 = void 0;
const index_js_1 = require("@ethereumjs/util/index.js");
/**
 * Adds address to accessedAddresses set if not already included.
 * Adjusts cost incurred for executing opcode based on whether address read
 * is warm/cold. (EIP 2929)
 * @param {RunState} runState
 * @param {Address}  address
 * @param {Common}   common
 * @param {Boolean}  chargeGas (default: true)
 * @param {Boolean}  isSelfdestruct (default: false)
 */
function accessAddressEIP2929(runState, address, common, chargeGas = true, isSelfdestruct = false) {
    if (!common.isActivatedEIP(2929))
        return index_js_1.BIGINT_0;
    // Cold
    if (!runState.interpreter.journal.isWarmedAddress(address)) {
        runState.interpreter.journal.addWarmedAddress(address);
        // CREATE, CREATE2 opcodes have the address warmed for free.
        // selfdestruct beneficiary address reads are charged an *additional* cold access
        // if verkle not activated
        if (chargeGas && !common.isActivatedEIP(6800)) {
            return common.param('coldaccountaccessGas');
        }
        // Warm: (selfdestruct beneficiary address reads are not charged when warm)
    }
    else if (chargeGas && !isSelfdestruct) {
        return common.param('warmstoragereadGas');
    }
    return index_js_1.BIGINT_0;
}
exports.accessAddressEIP2929 = accessAddressEIP2929;
/**
 * Adds (address, key) to accessedStorage tuple set if not already included.
 * Adjusts cost incurred for executing opcode based on whether storage read
 * is warm/cold. (EIP 2929)
 * @param {RunState} runState
 * @param {Uint8Array} key (to storage slot)
 * @param {Common} common
 */
function accessStorageEIP2929(runState, key, isSstore, common, chargeGas = true) {
    if (!common.isActivatedEIP(2929))
        return index_js_1.BIGINT_0;
    const address = runState.interpreter.getAddress().bytes;
    const slotIsCold = !runState.interpreter.journal.isWarmedStorage(address, key);
    // Cold (SLOAD and SSTORE)
    if (slotIsCold) {
        runState.interpreter.journal.addWarmedStorage(address, key);
        if (chargeGas && !common.isActivatedEIP(6800)) {
            return common.param('coldsloadGas');
        }
    }
    else if (chargeGas && (!isSstore || common.isActivatedEIP(6800))) {
        return common.param('warmstoragereadGas');
    }
    return index_js_1.BIGINT_0;
}
exports.accessStorageEIP2929 = accessStorageEIP2929;
/**
 * Adjusts cost of SSTORE_RESET_GAS or SLOAD (aka sstorenoop) (EIP-2200) downward when storage
 * location is already warm
 * @param  {RunState} runState
 * @param  {Uint8Array}   key          storage slot
 * @param  {BigInt}   defaultCost  SSTORE_RESET_GAS / SLOAD
 * @param  {string}   costName     parameter name ('noop')
 * @param  {Common}   common
 * @return {BigInt}                adjusted cost
 */
function adjustSstoreGasEIP2929(runState, key, defaultCost, costName, common) {
    if (!common.isActivatedEIP(2929))
        return defaultCost;
    const address = runState.interpreter.getAddress().bytes;
    const warmRead = common.param('warmstoragereadGas');
    const coldSload = common.param('coldsloadGas');
    if (runState.interpreter.journal.isWarmedStorage(address, key)) {
        switch (costName) {
            case 'noop':
                return warmRead;
            case 'initRefund':
                return common.param('sstoreInitEIP2200Gas') - warmRead;
            case 'cleanRefund':
                return common.param('sstoreResetGas') - coldSload - warmRead;
        }
    }
    return defaultCost;
}
exports.adjustSstoreGasEIP2929 = adjustSstoreGasEIP2929;
//# sourceMappingURL=EIP2929.js.map