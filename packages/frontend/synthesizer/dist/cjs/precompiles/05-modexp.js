"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.precompile05 = exports.expMod = void 0;
const index_js_1 = require("@ethereumjs/util/index.js");
const evm_js_1 = require("../evm.js");
const util_js_1 = require("./util.js");
const index_js_2 = require("./index.js");
const BIGINT_4 = BigInt(4);
const BIGINT_16 = BigInt(16);
const BIGINT_200 = BigInt(200);
const BIGINT_480 = BigInt(480);
const BIGINT_1024 = BigInt(1024);
const BIGINT_3072 = BigInt(3072);
const BIGINT_199680 = BigInt(199680);
const maxInt = BigInt(Number.MAX_SAFE_INTEGER);
const maxSize = BigInt(2147483647); // @ethereumjs/util setLengthRight limitation
function multiplicationComplexity(x) {
    let fac1;
    let fac2;
    if (x <= index_js_1.BIGINT_64) {
        return x ** index_js_1.BIGINT_2;
    }
    else if (x <= BIGINT_1024) {
        // return Math.floor(Math.pow(x, 2) / 4) + 96 * x - 3072
        fac1 = x ** index_js_1.BIGINT_2 / BIGINT_4;
        fac2 = x * index_js_1.BIGINT_96;
        return fac1 + fac2 - BIGINT_3072;
    }
    else {
        // return Math.floor(Math.pow(x, 2) / 16) + 480 * x - 199680
        fac1 = x ** index_js_1.BIGINT_2 / BIGINT_16;
        fac2 = x * BIGINT_480;
        return fac1 + fac2 - BIGINT_199680;
    }
}
function multiplicationComplexityEIP2565(x) {
    const words = (x + index_js_1.BIGINT_7) / index_js_1.BIGINT_8;
    return words * words;
}
function getAdjustedExponentLength(data) {
    let expBytesStart;
    try {
        const baseLen = (0, index_js_1.bytesToBigInt)(data.subarray(0, 32));
        expBytesStart = 96 + Number(baseLen); // 96 for base length, then exponent length, and modulus length, then baseLen for the base data, then exponent bytes start
    }
    catch (e) {
        expBytesStart = Number.MAX_SAFE_INTEGER - 32;
    }
    const expLen = (0, index_js_1.bytesToBigInt)(data.subarray(32, 64));
    let firstExpBytes = data.subarray(expBytesStart, expBytesStart + 32); // first word of the exponent data
    firstExpBytes = (0, index_js_1.setLengthRight)(firstExpBytes, 32); // reading past the data reads virtual zeros
    let firstExpBigInt = (0, index_js_1.bytesToBigInt)(firstExpBytes);
    let max32expLen = 0;
    if (expLen < index_js_1.BIGINT_32) {
        max32expLen = 32 - Number(expLen);
    }
    firstExpBigInt = firstExpBigInt >> (index_js_1.BIGINT_8 * BigInt(Math.max(max32expLen, 0)));
    let bitLen = -1;
    while (firstExpBigInt > index_js_1.BIGINT_0) {
        bitLen = bitLen + 1;
        firstExpBigInt = firstExpBigInt >> index_js_1.BIGINT_1;
    }
    let expLenMinus32OrZero = expLen - index_js_1.BIGINT_32;
    if (expLenMinus32OrZero < index_js_1.BIGINT_0) {
        expLenMinus32OrZero = index_js_1.BIGINT_0;
    }
    const eightTimesExpLenMinus32OrZero = expLenMinus32OrZero * index_js_1.BIGINT_8;
    let adjustedExpLen = eightTimesExpLenMinus32OrZero;
    if (bitLen > 0) {
        adjustedExpLen += BigInt(bitLen);
    }
    return adjustedExpLen;
}
function expMod(a, power, modulo) {
    if (power === index_js_1.BIGINT_0) {
        return index_js_1.BIGINT_1 % modulo;
    }
    let res = index_js_1.BIGINT_1;
    while (power > index_js_1.BIGINT_0) {
        if (power & index_js_1.BIGINT_1)
            res = (res * a) % modulo;
        a = (a * a) % modulo;
        power >>= index_js_1.BIGINT_1;
    }
    return res;
}
exports.expMod = expMod;
function precompile05(opts) {
    const pName = (0, index_js_2.getPrecompileName)('05');
    const data = opts.data.length < 96 ? (0, index_js_1.setLengthRight)(opts.data, 96) : opts.data;
    let adjustedELen = getAdjustedExponentLength(data);
    if (adjustedELen < index_js_1.BIGINT_1) {
        adjustedELen = index_js_1.BIGINT_1;
    }
    const bLen = (0, index_js_1.bytesToBigInt)(data.subarray(0, 32));
    const eLen = (0, index_js_1.bytesToBigInt)(data.subarray(32, 64));
    const mLen = (0, index_js_1.bytesToBigInt)(data.subarray(64, 96));
    let maxLen = bLen;
    if (maxLen < mLen) {
        maxLen = mLen;
    }
    const Gquaddivisor = opts.common.param('modexpGquaddivisorGas');
    let gasUsed;
    const bStart = index_js_1.BIGINT_96;
    const bEnd = bStart + bLen;
    const eStart = bEnd;
    const eEnd = eStart + eLen;
    const mStart = eEnd;
    const mEnd = mStart + mLen;
    if (!opts.common.isActivatedEIP(2565)) {
        gasUsed = (adjustedELen * multiplicationComplexity(maxLen)) / Gquaddivisor;
    }
    else {
        gasUsed = (adjustedELen * multiplicationComplexityEIP2565(maxLen)) / Gquaddivisor;
        if (gasUsed < BIGINT_200) {
            gasUsed = BIGINT_200;
        }
    }
    if (!(0, util_js_1.gasLimitCheck)(opts, gasUsed, pName)) {
        return (0, evm_js_1.OOGResult)(opts.gasLimit);
    }
    if (bLen === index_js_1.BIGINT_0 && mLen === index_js_1.BIGINT_0) {
        return {
            executionGasUsed: gasUsed,
            returnValue: new Uint8Array(),
        };
    }
    if (bLen > maxSize || eLen > maxSize || mLen > maxSize) {
        if (opts._debug !== undefined) {
            opts._debug(`${pName} failed: OOG`);
        }
        return (0, evm_js_1.OOGResult)(opts.gasLimit);
    }
    if (mEnd > maxInt) {
        if (opts._debug !== undefined) {
            opts._debug(`${pName} failed: OOG`);
        }
        return (0, evm_js_1.OOGResult)(opts.gasLimit);
    }
    const B = (0, index_js_1.bytesToBigInt)((0, index_js_1.setLengthRight)(data.subarray(Number(bStart), Number(bEnd)), Number(bLen)));
    const E = (0, index_js_1.bytesToBigInt)((0, index_js_1.setLengthRight)(data.subarray(Number(eStart), Number(eEnd)), Number(eLen)));
    const M = (0, index_js_1.bytesToBigInt)((0, index_js_1.setLengthRight)(data.subarray(Number(mStart), Number(mEnd)), Number(mLen)));
    let R;
    if (M === index_js_1.BIGINT_0) {
        R = new Uint8Array();
    }
    else {
        R = expMod(B, E, M);
        if (R === index_js_1.BIGINT_0) {
            R = new Uint8Array();
        }
        else {
            R = (0, index_js_1.bigIntToBytes)(R);
        }
    }
    const res = (0, index_js_1.setLengthLeft)(R, Number(mLen));
    if (opts._debug !== undefined) {
        opts._debug(`${pName} return value=${(0, index_js_1.bytesToHex)(res)}`);
    }
    return {
        executionGasUsed: gasUsed,
        returnValue: res,
    };
}
exports.precompile05 = precompile05;
//# sourceMappingURL=05-modexp.js.map