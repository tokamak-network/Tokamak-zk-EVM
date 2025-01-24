import { Address } from './address.js';
import type { AddressLike, BigIntLike, PrefixedHexString } from './types.js';
/**
 * Flexible input data type for EIP-4895 withdrawal data with amount in Gwei to
 * match CL representation and for eventual ssz withdrawalsRoot
 */
export type WithdrawalData = {
    index: BigIntLike;
    validatorIndex: BigIntLike;
    address: AddressLike;
    amount: BigIntLike;
};
/**
 * JSON RPC interface for EIP-4895 withdrawal data with amount in Gwei to
 * match CL representation and for eventual ssz withdrawalsRoot
 */
export interface JSONRPCWithdrawal {
    index: PrefixedHexString;
    validatorIndex: PrefixedHexString;
    address: PrefixedHexString;
    amount: PrefixedHexString;
}
export type WithdrawalBytes = [Uint8Array, Uint8Array, Uint8Array, Uint8Array];
/**
 * Convert a withdrawal to a byte array
 * @param withdrawal the withdrawal to convert
 * @returns byte array of the withdrawal
 */
export declare function withdrawalToBytesArray(withdrawal: Withdrawal | WithdrawalData): WithdrawalBytes;
/**
 * Representation of EIP-4895 withdrawal data
 */
export declare class Withdrawal {
    readonly index: bigint;
    readonly validatorIndex: bigint;
    readonly address: Address;
    /**
     * withdrawal amount in Gwei to match the CL representation and eventually ssz withdrawalsRoot
     */
    readonly amount: bigint;
    /**
     * This constructor assigns and validates the values.
     * Use the static factory methods to assist in creating a Withdrawal object from varying data types.
     * Its amount is in Gwei to match CL representation and for eventual ssz withdrawalsRoot
     */
    constructor(index: bigint, validatorIndex: bigint, address: Address, 
    /**
     * withdrawal amount in Gwei to match the CL representation and eventually ssz withdrawalsRoot
     */
    amount: bigint);
    raw(): WithdrawalBytes;
    toValue(): {
        index: bigint;
        validatorIndex: bigint;
        address: Uint8Array;
        amount: bigint;
    };
    toJSON(): {
        index: `0x${string}`;
        validatorIndex: `0x${string}`;
        address: `0x${string}`;
        amount: `0x${string}`;
    };
}
/**
 * Creates a validator withdrawal request to be submitted to the consensus layer
 * @param withdrawalData the consensus layer index and validator index values for the
 * validator requesting the withdrawal and the address and withdrawal amount of the request
 * @returns a {@link Withdrawal} object
 */
export declare function createWithdrawal(withdrawalData: WithdrawalData): Withdrawal;
/**
 * Creates a validator withdrawal request to be submitted to the consensus layer from
 * an RLP list
 * @param withdrawalArray decoded RLP list of withdrawal data elements
 * @returns a {@link Withdrawal} object
 */
export declare function createWithdrawalFromBytesArray(withdrawalArray: WithdrawalBytes): Withdrawal;
//# sourceMappingURL=withdrawal.d.ts.map