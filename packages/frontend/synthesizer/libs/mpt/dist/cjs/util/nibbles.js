"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchingNibbleLength = exports.nibblesCompare = exports.nibblesTypeToPackedBytes = exports.bytesToNibbles = void 0;
const util_1 = require("@ethereumjs/util");
/**
 * Converts a bytes to a nibble array.
 * @private
 * @param key
 */
function bytesToNibbles(key) {
    const bKey = (0, util_1.toBytes)(key);
    const nibbles = [];
    for (let i = 0; i < bKey.length; i++) {
        let q = i * 2;
        nibbles[q] = bKey[i] >> 4;
        ++q;
        nibbles[q] = bKey[i] % 16;
    }
    return nibbles;
}
exports.bytesToNibbles = bytesToNibbles;
/**
 * Converts a nibble array into bytes.
 * @private
 * @param arr - Nibble array
 */
function nibblesTypeToPackedBytes(arr) {
    const buf = new Uint8Array(arr.length / 2);
    for (let i = 0; i < buf.length; i++) {
        let q = i * 2;
        buf[i] = (arr[q] << 4) + arr[++q];
    }
    return buf;
}
exports.nibblesTypeToPackedBytes = nibblesTypeToPackedBytes;
/**
 * Compare two nibble array.
 * * `0` is returned if `n2` === `n1`.
 * * `1` is returned if `n2` > `n1`.
 * * `-1` is returned if `n2` < `n1`.
 * @param n1 - Nibble array
 * @param n2 - Nibble array
 */
function nibblesCompare(n1, n2) {
    const cmpLength = Math.min(n1.length, n2.length);
    let res = 0;
    for (let i = 0; i < cmpLength; i++) {
        if (n1[i] < n2[i]) {
            res = -1;
            break;
        }
        else if (n1[i] > n2[i]) {
            res = 1;
            break;
        }
    }
    if (res === 0) {
        if (n1.length < n2.length) {
            res = -1;
        }
        else if (n1.length > n2.length) {
            res = 1;
        }
    }
    return res;
}
exports.nibblesCompare = nibblesCompare;
/**
 * Returns the number of in order matching nibbles of two give nibble arrays.
 * @private
 * @param nib1
 * @param nib2
 */
function matchingNibbleLength(nib1, nib2) {
    let i = 0;
    while (nib1[i] === nib2[i] && nib1.length > i) {
        i++;
    }
    return i;
}
exports.matchingNibbleLength = matchingNibbleLength;
//# sourceMappingURL=nibbles.js.map