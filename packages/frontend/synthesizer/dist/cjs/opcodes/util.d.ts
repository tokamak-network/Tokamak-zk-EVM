import type { RunState } from '../interpreter.js';
import type { Common } from '@ethereumjs/common/dist/esm/index.js';
import type { Address } from "@ethereumjs/util/index.js";
/**
 * Create an address from a stack item (256 bit integer).
 * This wrapper ensures that the value is masked to 160 bits.
 * @param value 160-bit integer
 */
export declare function createAddressFromStackBigInt(value: bigint): Address;
/**
 * Proxy function for @ethereumjs/util's setLengthLeft, except it returns a zero
 * length Uint8Array in case the Uint8Array is full of zeros.
 * @param value Uint8Array which we want to pad
 */
export declare function setLengthLeftStorage(value: Uint8Array): Uint8Array;
/**
 * Wraps error message as EvmError
 */
export declare function trap(err: string): void;
/**
 * Error message helper - generates location string
 */
export declare function describeLocation(runState: RunState): string;
/**
 * Find Ceil(a / b)
 *
 * @param {bigint} a
 * @param {bigint} b
 * @return {bigint}
 */
export declare function divCeil(a: bigint, b: bigint): bigint;
/**
 * Returns an overflow-safe slice of an array. It right-pads
 * the data with zeros to `length`.
 */
export declare function getDataSlice(data: Uint8Array, offset: bigint, length: bigint): Uint8Array;
/**
 * Get full opcode name from its name and code.
 *
 * @param code Integer code of opcode.
 * @param name Short name of the opcode.
 * @returns Full opcode name
 */
export declare function getFullname(code: number, name: string): string;
/**
 * Checks if a jump is valid given a destination (defined as a 1 in the validJumps array)
 */
export declare function jumpIsValid(runState: RunState, dest: number): boolean;
/**
 * Returns an overflow-safe slice of an array. It right-pads
 * the data with zeros to `length`.
 * @param gasLimit requested gas Limit
 * @param gasLeft current gas left
 * @param runState the current runState
 * @param common the common
 */
export declare function maxCallGas(gasLimit: bigint, gasLeft: bigint, runState: RunState, common: Common): bigint;
/**
 * Subtracts the amount needed for memory usage from `runState.gasLeft`
 */
export declare function subMemUsage(runState: RunState, offset: bigint, length: bigint, common: Common): bigint;
/**
 * Writes data returned by evm.call* methods to memory
 */
export declare function writeCallOutput(runState: RunState, outOffset: bigint, outLength: bigint): void;
/**
 * The first rule set of SSTORE rules, which are the rules pre-Constantinople and in Petersburg
 */
export declare function updateSstoreGas(runState: RunState, currentStorage: Uint8Array, value: Uint8Array, common: Common): bigint;
export declare function mod(a: bigint, b: bigint): bigint;
export declare function fromTwos(a: bigint): bigint;
export declare function toTwos(a: bigint): bigint;
export declare function abs(a: bigint): bigint;
export declare function exponentiation(bas: bigint, exp: bigint): bigint;
//# sourceMappingURL=util.d.ts.map