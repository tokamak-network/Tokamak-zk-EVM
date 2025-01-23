import type { PrefixedHexString } from './types.js';
/**
 * Handling and generating Ethereum addresses
 */
export declare class Address {
    readonly bytes: Uint8Array;
    constructor(bytes: Uint8Array);
    /**
     * Is address equal to another.
     */
    equals(address: Address): boolean;
    /**
     * Is address zero.
     */
    isZero(): boolean;
    /**
     * True if address is in the address range defined
     * by EIP-1352
     */
    isPrecompileOrSystemAddress(): boolean;
    /**
     * Returns hex encoding of address.
     */
    toString(): PrefixedHexString;
    /**
     * Returns a new Uint8Array representation of address.
     */
    toBytes(): Uint8Array;
}
/**
 * Returns the zero address.
 */
export declare function createZeroAddress(): Address;
/**
 * Returns an Address object from a bigint address (they are stored as bigints on the stack)
 * @param value The bigint address
 */
export declare function createAddressFromBigInt(value: bigint): Address;
/**
 * Returns an Address object from a hex-encoded string.
 * @param str - Hex-encoded address
 */
export declare function createAddressFromString(str: string): Address;
/**
 * Returns an address for a given public key.
 * @param pubKey The two points of an uncompressed key
 */
export declare function createAddressFromPublicKey(pubKey: Uint8Array): Address;
/**
 * Returns an address for a given private key.
 * @param privateKey A private key must be 256 bits wide
 */
export declare function createAddressFromPrivateKey(privateKey: Uint8Array): Address;
/**
 * Generates an address for a newly created contract.
 * @param from The address which is creating this new address
 * @param nonce The nonce of the from account
 */
export declare function createContractAddress(from: Address, nonce: bigint): Address;
/**
 * Generates an address for a contract created using CREATE2.
 * @param from The address which is creating this new address
 * @param salt A salt
 * @param initCode The init code of the contract being created
 */
export declare function createContractAddress2(from: Address, salt: Uint8Array, initCode: Uint8Array): Address;
//# sourceMappingURL=address.d.ts.map