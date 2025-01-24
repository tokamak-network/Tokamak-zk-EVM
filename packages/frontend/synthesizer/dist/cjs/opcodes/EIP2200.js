"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSstoreGasEIP2200 = void 0;
const index_js_1 = require("@ethereumjs/util/index.js");
const exceptions_js_1 = require("../exceptions.js");
const EIP2929_js_1 = require("./EIP2929.js");
const util_js_1 = require("./util.js");
/**
 * Adjusts gas usage and refunds of SStore ops per EIP-2200 (Istanbul)
 *
 * @param {RunState} runState
 * @param {Uint8Array}   currentStorage
 * @param {Uint8Array}   originalStorage
 * @param {Uint8Array}   value
 * @param {Common}   common
 */
function updateSstoreGasEIP2200(runState, currentStorage, originalStorage, value, key, common) {
    // Fail if not enough gas is left
    if (runState.interpreter.getGasLeft() <= common.param('sstoreSentryEIP2200Gas')) {
        (0, util_js_1.trap)(exceptions_js_1.ERROR.OUT_OF_GAS);
    }
    // Noop
    if ((0, index_js_1.equalsBytes)(currentStorage, value)) {
        const sstoreNoopCost = common.param('sstoreNoopEIP2200Gas');
        return (0, EIP2929_js_1.adjustSstoreGasEIP2929)(runState, key, sstoreNoopCost, 'noop', common);
    }
    if ((0, index_js_1.equalsBytes)(originalStorage, currentStorage)) {
        // Create slot
        if (originalStorage.length === 0) {
            return common.param('sstoreInitEIP2200Gas');
        }
        // Delete slot
        if (value.length === 0) {
            runState.interpreter.refundGas(common.param('sstoreClearRefundEIP2200Gas'), 'EIP-2200 -> sstoreClearRefundEIP2200');
        }
        // Write existing slot
        return common.param('sstoreCleanEIP2200Gas');
    }
    if (originalStorage.length > 0) {
        if (currentStorage.length === 0) {
            // Recreate slot
            runState.interpreter.subRefund(common.param('sstoreClearRefundEIP2200Gas'), 'EIP-2200 -> sstoreClearRefundEIP2200');
        }
        else if (value.length === 0) {
            // Delete slot
            runState.interpreter.refundGas(common.param('sstoreClearRefundEIP2200Gas'), 'EIP-2200 -> sstoreClearRefundEIP2200');
        }
    }
    if ((0, index_js_1.equalsBytes)(originalStorage, value)) {
        if (originalStorage.length === 0) {
            // Reset to original non-existent slot
            const sstoreInitRefund = common.param('sstoreInitRefundEIP2200Gas');
            runState.interpreter.refundGas((0, EIP2929_js_1.adjustSstoreGasEIP2929)(runState, key, sstoreInitRefund, 'initRefund', common), 'EIP-2200 -> initRefund');
        }
        else {
            // Reset to original existing slot
            const sstoreCleanRefund = common.param('sstoreCleanRefundEIP2200Gas');
            runState.interpreter.refundGas(BigInt((0, EIP2929_js_1.adjustSstoreGasEIP2929)(runState, key, sstoreCleanRefund, 'cleanRefund', common)), 'EIP-2200 -> cleanRefund');
        }
    }
    // Dirty update
    return common.param('sstoreDirtyEIP2200Gas');
}
exports.updateSstoreGasEIP2200 = updateSstoreGasEIP2200;
//# sourceMappingURL=EIP2200.js.map