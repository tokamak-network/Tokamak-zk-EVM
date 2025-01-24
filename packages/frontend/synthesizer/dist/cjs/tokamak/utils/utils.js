"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.merge128BitIntegers = exports.split256BitInteger = exports.arrToStr = exports.mapToStr = exports.convertToSigned = exports.addPlacement = exports.byteSize = exports.powMod = void 0;
const powMod = (base, exponent, modulus) => {
    if (modulus === 1n)
        return 0n;
    let result = 1n;
    base = base % modulus;
    while (exponent > 0n) {
        if (exponent % 2n === 1n) {
            result = (result * base) % modulus;
        }
        base = (base * base) % modulus;
        exponent = exponent >> 1n;
    }
    return result;
};
exports.powMod = powMod;
const byteSize = (value) => {
    const hexLength = value.toString(16).length;
    return Math.max(Math.ceil(hexLength / 2), 1);
};
exports.byteSize = byteSize;
const addPlacement = (map, value) => {
    const key = map.size;
    map.set(key, value);
};
exports.addPlacement = addPlacement;
// Convert to signed integer (256-bit)
const convertToSigned = (value) => {
    const SIGN_BIT = 1n << 255n;
    return (value & SIGN_BIT) !== 0n ? value - (1n << 256n) : value;
};
exports.convertToSigned = convertToSigned;
// Debugging tool
const mapToStr = (map) => {
    return Object.fromEntries(Array.from(map, ([key, value]) => [
        key,
        JSON.parse(JSON.stringify(value, (k, v) => (typeof v === 'bigint' ? v.toString() : v))),
    ]));
};
exports.mapToStr = mapToStr;
// Debugging tool
function arrToStr(key, value) {
    return typeof value === 'bigint' ? value.toString() : value;
}
exports.arrToStr = arrToStr;
function split256BitInteger(value) {
    // Calculate the lower and upper parts
    const lower = (value & ((1n << 128n) - 1n)) % 2n ** 128n;
    const upper = (value >> 128n) % 2n ** 128n;
    return [lower, upper];
}
exports.split256BitInteger = split256BitInteger;
const merge128BitIntegers = (low, high) => {
    // assume the inputs are in 128bit (Todo: check the input validity)
    return (high << 128n) + low;
};
exports.merge128BitIntegers = merge128BitIntegers;
//# sourceMappingURL=utils.js.map