import type { EVMBN254Interface } from '../../types.js';
export type AffinePoint<T> = {
    x: T;
    y: T;
} & {
    z?: never;
    t?: never;
};
/**
 * Implementation of the `EVMBN254Interface` using the `ethereum-cryptography (`@noble/curves`)
 * JS library, see https://github.com/ethereum/js-ethereum-cryptography.
 *
 * This is the EVM default implementation.
 */
export declare class NobleBN254 implements EVMBN254Interface {
    add(input: Uint8Array): Uint8Array;
    mul(input: Uint8Array): Uint8Array;
    pairing(input: Uint8Array): Uint8Array;
}
//# sourceMappingURL=noble.d.ts.map