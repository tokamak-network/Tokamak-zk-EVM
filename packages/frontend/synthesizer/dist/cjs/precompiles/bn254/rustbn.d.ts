import type { EVMBN254Interface } from '../../types.js';
/**
 * Implementation of the `EVMBN254Interface` using a WASM wrapper https://github.com/ethereumjs/rustbn.js
 * around the Parity fork of the Zcash bn pairing cryptography library.
 *
 * This can be optionally used to replace the build-in Noble implementation (`NobleBN254`) with
 * a more performant WASM variant. See EVM `bls` constructor option on how to use.
 */
export declare class RustBN254 implements EVMBN254Interface {
    protected readonly _rustbn: any;
    constructor(rustbn: any);
    add(input: Uint8Array): Uint8Array;
    mul(input: Uint8Array): Uint8Array;
    pairing(input: Uint8Array): Uint8Array;
}
//# sourceMappingURL=rustbn.d.ts.map