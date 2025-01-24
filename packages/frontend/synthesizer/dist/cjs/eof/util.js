"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isEOF = exports.EOFHASH = exports.EOFBYTES = void 0;
const keccak_js_1 = require("ethereum-cryptography/keccak.js");
const utils_1 = require("ethereum-cryptography/utils");
const constants_js_1 = require("./constants.js");
exports.EOFBYTES = new Uint8Array([constants_js_1.FORMAT, constants_js_1.MAGIC]);
exports.EOFHASH = (0, keccak_js_1.keccak256)(exports.EOFBYTES);
/**
 * Returns `true` if `code` is an EOF contract, otherwise `false`
 * @param code Code to test
 */
function isEOF(code) {
    const check = code.subarray(0, exports.EOFBYTES.length);
    return (0, utils_1.equalsBytes)(exports.EOFBYTES, check);
}
exports.isEOF = isEOF;
//# sourceMappingURL=util.js.map