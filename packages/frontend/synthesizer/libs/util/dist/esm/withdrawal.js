import { Address } from './address.js';
import { bigIntToHex, bytesToHex, toBytes } from './bytes.js';
import { BIGINT_0 } from './constants.js';
import { TypeOutput, toType } from './types.js';
/**
 * Convert a withdrawal to a byte array
 * @param withdrawal the withdrawal to convert
 * @returns byte array of the withdrawal
 */
export function withdrawalToBytesArray(withdrawal) {
    const { index, validatorIndex, address, amount } = withdrawal;
    const indexBytes = toType(index, TypeOutput.BigInt) === BIGINT_0
        ? new Uint8Array()
        : toType(index, TypeOutput.Uint8Array);
    const validatorIndexBytes = toType(validatorIndex, TypeOutput.BigInt) === BIGINT_0
        ? new Uint8Array()
        : toType(validatorIndex, TypeOutput.Uint8Array);
    const addressBytes = address instanceof Address ? address.bytes : toType(address, TypeOutput.Uint8Array);
    const amountBytes = toType(amount, TypeOutput.BigInt) === BIGINT_0
        ? new Uint8Array()
        : toType(amount, TypeOutput.Uint8Array);
    return [indexBytes, validatorIndexBytes, addressBytes, amountBytes];
}
/**
 * Representation of EIP-4895 withdrawal data
 */
export class Withdrawal {
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
            index: bigIntToHex(this.index),
            validatorIndex: bigIntToHex(this.validatorIndex),
            address: bytesToHex(this.address.bytes),
            amount: bigIntToHex(this.amount),
        };
    }
}
/**
 * Creates a validator withdrawal request to be submitted to the consensus layer
 * @param withdrawalData the consensus layer index and validator index values for the
 * validator requesting the withdrawal and the address and withdrawal amount of the request
 * @returns a {@link Withdrawal} object
 */
export function createWithdrawal(withdrawalData) {
    const { index: indexData, validatorIndex: validatorIndexData, address: addressData, amount: amountData, } = withdrawalData;
    const index = toType(indexData, TypeOutput.BigInt);
    const validatorIndex = toType(validatorIndexData, TypeOutput.BigInt);
    const address = addressData instanceof Address ? addressData : new Address(toBytes(addressData));
    const amount = toType(amountData, TypeOutput.BigInt);
    return new Withdrawal(index, validatorIndex, address, amount);
}
/**
 * Creates a validator withdrawal request to be submitted to the consensus layer from
 * an RLP list
 * @param withdrawalArray decoded RLP list of withdrawal data elements
 * @returns a {@link Withdrawal} object
 */
export function createWithdrawalFromBytesArray(withdrawalArray) {
    if (withdrawalArray.length !== 4) {
        throw Error(`Invalid withdrawalArray length expected=4 actual=${withdrawalArray.length}`);
    }
    const [index, validatorIndex, address, amount] = withdrawalArray;
    return createWithdrawal({ index, validatorIndex, address, amount });
}
//# sourceMappingURL=withdrawal.js.map