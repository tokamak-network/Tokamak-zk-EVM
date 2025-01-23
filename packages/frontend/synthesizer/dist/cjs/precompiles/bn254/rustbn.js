"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RustBN254 = void 0;
const index_js_1 = require("@ethereumjs/util/index.js");
/**
 * Implementation of the `EVMBN254Interface` using a WASM wrapper https://github.com/ethereumjs/rustbn.js
 * around the Parity fork of the Zcash bn pairing cryptography library.
 *
 * This can be optionally used to replace the build-in Noble implementation (`NobleBN254`) with
 * a more performant WASM variant. See EVM `bls` constructor option on how to use.
 */
class RustBN254 {
    constructor(rustbn) {
        this._rustbn = rustbn;
    }
    add(input) {
        const inputStr = (0, index_js_1.bytesToUnprefixedHex)(input);
        return (0, index_js_1.hexToBytes)(this._rustbn.ec_add(inputStr));
    }
    mul(input) {
        const inputHex = (0, index_js_1.bytesToUnprefixedHex)(input);
        return (0, index_js_1.hexToBytes)(this._rustbn.ec_mul(inputHex));
    }
    pairing(input) {
        const inputStr = (0, index_js_1.bytesToUnprefixedHex)(input);
        return (0, index_js_1.hexToBytes)(this._rustbn.ec_pairing(inputStr));
    }
}
exports.RustBN254 = RustBN254;
//# sourceMappingURL=rustbn.js.map