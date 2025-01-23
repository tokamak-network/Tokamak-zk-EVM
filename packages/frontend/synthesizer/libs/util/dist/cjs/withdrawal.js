"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWithdrawalFromBytesArray = exports.createWithdrawal = exports.Withdrawal = exports.withdrawalToBytesArray = void 0;
const address_js_1 = require("./address.js");
const bytes_js_1 = require("./bytes.js");
const constants_js_1 = require("./constants.js");
const types_js_1 = require("./types.js");
/**
 * Convert a withdrawal to a byte array
 * @param withdrawal the withdrawal to convert
 * @returns byte array of the withdrawal
 */
function withdrawalToBytesArray(withdrawal) {
    const { index, validatorIndex, address, amount } = withdrawal;
    const indexBytes = (0, types_js_1.toType)(index, types_js_1.TypeOutput.BigInt) === constants_js_1.BIGINT_0
        ? new Uint8Array()
        : (0, types_js_1.toType)(index, types_js_1.TypeOutput.Uint8Array);
    const validatorIndexBytes = (0, types_js_1.toType)(validatorIndex, types_js_1.TypeOutput.BigInt) === constants_js_1.BIGINT_0
        ? new Uint8Array()
        : (0, types_js_1.toType)(validatorIndex, types_js_1.TypeOutput.Uint8Array);
    const addressBytes = address instanceof address_js_1.Address ? address.bytes : (0, types_js_1.toType)(address, types_js_1.TypeOutput.Uint8Array);
    const amountBytes = (0, types_js_1.toType)(amount, types_js_1.TypeOutput.BigInt) === constants_js_1.BIGINT_0
        ? new Uint8Array()
        : (0, types_js_1.toType)(amount, types_js_1.TypeOutput.Uint8Array);
    return [indexBytes, validatorIndexBytes, addressBytes, amountBytes];
}
exports.withdrawalToBytesArray = withdrawalToBytesArray;
/**
 * Representation of EIP-4895 withdrawal data
 */
class Withdrawal {
    /**
     * This constructor assigns and validates the values.
     * Use the static factory methods to assist in creating a Withdrawal object from varying data types.
     * Its amount is in Gwei to match CL representation and for eventual ssz withdrawalsRoot
     */
    constructor(index, validatorIndex, address, 
    /**
     * withdrawal amount in Gwei to match the CL representation and eventually ssz withdrawalsRoot
     */
    amount) {
        this.index = index;
        this.validatorIndex = validatorIndex;
        this.address = address;
        this.amount = amount;
    }
    raw() {
        return withdrawalToBytesArray(this);
    }
    toValue() {
        return {
            index: this.index,
            validatorIndex: this.validatorIndex,
            address: this.address.bytes,
            amount: this.amount,
        };
    }
    toJSON() {
        return {
            index: (0, bytes_js_1.bigIntToHex)(this.index),
            validatorIndex: (0, bytes_js_1.bigIntToHex)(this.validatorIndex),
            address: (0, bytes_js_1.bytesToHex)(this.address.bytes),
            amount: (0, bytes_js_1.bigIntToHex)(this.amount),
        };
    }
}
exports.Withdrawal = Withdrawal;
/**
 * Creates a validator withdrawal request to be submitted to the consensus layer
 * @param withdrawalData the consensus layer index and validator index values for the
 * validator requesting the withdrawal and the address and withdrawal amount of the request
 * @returns a {@link Withdrawal} object
 */
function createWithdrawal(withdrawalData) {
    const { index: indexData, validatorIndex: validatorIndexData, address: addressData, amount: amountData, } = withdrawalData;
    const index = (0, types_js_1.toType)(indexData, types_js_1.TypeOutput.BigInt);
    const validatorIndex = (0, types_js_1.toType)(validatorIndexData, types_js_1.TypeOutput.BigInt);
    const address = addressData instanceof address_js_1.Address ? addressData : new address_js_1.Address((0, bytes_js_1.toBytes)(addressData));
    const amount = (0, types_js_1.toType)(amountData, types_js_1.TypeOutput.BigInt);
    return new Withdrawal(index, validatorIndex, address, amount);
}
exports.createWithdrawal = createWithdrawal;
/**
 * Creates a validator withdrawal request to be submitted to the consensus layer from
 * an RLP list
 * @param withdrawalArray decoded RLP list of withdrawal data elements
 * @returns a {@link Withdrawal} object
 */
function createWithdrawalFromBytesArray(withdrawalArray) {
    if (withdrawalArray.length !== 4) {
        throw Error(`Invalid withdrawalArray length expected=4 actual=${withdrawalArray.length}`);
    }
    const [index, validatorIndex, address, amount] = withdrawalArray;
    return createWithdrawal({ index, validatorIndex, address, amount });
}
exports.createWithdrawalFromBytesArray = createWithdrawalFromBytesArray;
//# sourceMappingURL=withdrawal.js.map