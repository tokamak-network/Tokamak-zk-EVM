import { bytesToUnprefixedHex, hexToBytes } from "@ethereumjs/util/index.js";
/**
 * Implementation of the `EVMBN254Interface` using a WASM wrapper https://github.com/ethereumjs/rustbn.js
 * around the Parity fork of the Zcash bn pairing cryptography library.
 *
 * This can be optionally used to replace the build-in Noble implementation (`NobleBN254`) with
 * a more performant WASM variant. See EVM `bls` constructor option on how to use.
 */
export class RustBN254 {
    constructor(rustbn) {
        this._rustbn = rustbn;
    }
    add(input) {
        const inputStr = bytesToUnprefixedHex(input);
        return hexToBytes(this._rustbn.ec_add(inputStr));
    }
    mul(input) {
        const inputHex = bytesToUnprefixedHex(input);
        return hexToBytes(this._rustbn.ec_mul(inputHex));
    }
    pairing(input) {
        const inputStr = bytesToUnprefixedHex(input);
        return hexToBytes(this._rustbn.ec_pairing(inputStr));
    }
}
//# sourceMappingURL=rustbn.js.map