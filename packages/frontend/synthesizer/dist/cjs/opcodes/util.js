"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exponentiation = exports.abs = exports.toTwos = exports.fromTwos = exports.mod = exports.updateSstoreGas = exports.writeCallOutput = exports.subMemUsage = exports.maxCallGas = exports.jumpIsValid = exports.getFullname = exports.getDataSlice = exports.divCeil = exports.describeLocation = exports.trap = exports.setLengthLeftStorage = exports.createAddressFromStackBigInt = void 0;
const index_js_1 = require("@ethereumjs/common/dist/esm/index.js");
const index_js_2 = require("@ethereumjs/util/index.js");
const keccak_js_1 = require("ethereum-cryptography/keccak.js");
const exceptions_js_1 = require("../exceptions.js");
const index_js_3 = require("../tokamak/pointers/index.js");
const MASK_160 = (index_js_2.BIGINT_1 << index_js_2.BIGINT_160) - index_js_2.BIGINT_1;
/**
 * Create an address from a stack item (256 bit integer).
 * This wrapper ensures that the value is masked to 160 bits.
 * @param value 160-bit integer
 */
function createAddressFromStackBigInt(value) {
    const maskedValue = value & MASK_160;
    return (0, index_js_2.createAddressFromBigInt)(maskedValue);
}
exports.createAddressFromStackBigInt = createAddressFromStackBigInt;
/**
 * Proxy function for @ethereumjs/util's setLengthLeft, except it returns a zero
 * length Uint8Array in case the Uint8Array is full of zeros.
 * @param value Uint8Array which we want to pad
 */
function setLengthLeftStorage(value) {
    if ((0, index_js_2.equalsBytes)(value, new Uint8Array(value.length))) {
        // return the empty Uint8Array (the value is zero)
        return new Uint8Array(0);
    }
    else {
        return (0, index_js_2.setLengthLeft)(value, 32);
    }
}
exports.setLengthLeftStorage = setLengthLeftStorage;
/**
 * Wraps error message as EvmError
 */
function trap(err) {
    // TODO: facilitate extra data along with errors
    throw new exceptions_js_1.EvmError(err);
}
exports.trap = trap;
/**
 * Error message helper - generates location string
 */
function describeLocation(runState) {
    const keccakFunction = runState.interpreter._evm.common.customCrypto.keccak256 ?? keccak_js_1.keccak256;
    const hash = (0, index_js_2.bytesToHex)(keccakFunction(runState.interpreter.getCode()));
    const address = runState.interpreter.getAddress().toString();
    const pc = runState.programCounter - 1;
    return `${hash}/${address}:${pc}`;
}
exports.describeLocation = describeLocation;
/**
 * Find Ceil(a / b)
 *
 * @param {bigint} a
 * @param {bigint} b
 * @return {bigint}
 */
function divCeil(a, b) {
    const div = a / b;
    const modulus = mod(a, b);
    // Fast case - exact division
    if (modulus === index_js_2.BIGINT_0)
        return div;
    // Round up
    return div < index_js_2.BIGINT_0 ? div - index_js_2.BIGINT_1 : div + index_js_2.BIGINT_1;
}
exports.divCeil = divCeil;
/**
 * Returns an overflow-safe slice of an array. It right-pads
 * the data with zeros to `length`.
 */
function getDataSlice(data, offset, length) {
    const len = BigInt(data.length);
    if (offset > len) {
        offset = len;
    }
    let end = offset + length;
    if (end > len) {
        end = len;
    }
    data = data.subarray(Number(offset), Number(end));
    // Right-pad with zeros to fill dataLength bytes
    data = (0, index_js_2.setLengthRight)(data, Number(length));
    return data;
}
exports.getDataSlice = getDataSlice;
/**
 * Get full opcode name from its name and code.
 *
 * @param code Integer code of opcode.
 * @param name Short name of the opcode.
 * @returns Full opcode name
 */
function getFullname(code, name) {
    switch (name) {
        case 'LOG':
            name += code - 0xa0;
            break;
        case 'PUSH':
            name += code - 0x5f;
            break;
        case 'DUP':
            name += code - 0x7f;
            break;
        case 'SWAP':
            name += code - 0x8f;
            break;
    }
    return name;
}
exports.getFullname = getFullname;
/**
 * Checks if a jump is valid given a destination (defined as a 1 in the validJumps array)
 */
function jumpIsValid(runState, dest) {
    return runState.validJumps[dest] === 1;
}
exports.jumpIsValid = jumpIsValid;
/**
 * Returns an overflow-safe slice of an array. It right-pads
 * the data with zeros to `length`.
 * @param gasLimit requested gas Limit
 * @param gasLeft current gas left
 * @param runState the current runState
 * @param common the common
 */
function maxCallGas(gasLimit, gasLeft, runState, common) {
    if (common.gteHardfork(index_js_1.Hardfork.TangerineWhistle)) {
        const gasAllowed = gasLeft - gasLeft / index_js_2.BIGINT_64;
        return gasLimit > gasAllowed ? gasAllowed : gasLimit;
    }
    else {
        return gasLimit;
    }
}
exports.maxCallGas = maxCallGas;
/**
 * Subtracts the amount needed for memory usage from `runState.gasLeft`
 */
function subMemUsage(runState, offset, length, common) {
    // YP (225): access with zero length will not extend the memory
    if (length === index_js_2.BIGINT_0)
        return index_js_2.BIGINT_0;
    const newMemoryWordCount = divCeil(offset + length, index_js_2.BIGINT_32);
    if (newMemoryWordCount <= runState.memoryWordCount)
        return index_js_2.BIGINT_0;
    const words = newMemoryWordCount;
    const fee = common.param('memoryGas');
    const quadCoefficient = common.param('quadCoefficientDivGas');
    // words * 3 + words ^2 / 512
    let cost = words * fee + (words * words) / quadCoefficient;
    if (cost > runState.highestMemCost) {
        const currentHighestMemCost = runState.highestMemCost;
        runState.highestMemCost = cost;
        cost -= currentHighestMemCost;
    }
    runState.memoryWordCount = newMemoryWordCount;
    return cost;
}
exports.subMemUsage = subMemUsage;
/**
 * Writes data returned by evm.call* methods to memory
 */
function writeCallOutput(runState, outOffset, outLength) {
    const returnData = runState.interpreter.getReturnData();
    if (returnData.length > 0) {
        const memOffset = Number(outOffset);
        let dataLength = Number(outLength);
        if (BigInt(returnData.length) < dataLength) {
            dataLength = returnData.length;
        }
        const data = getDataSlice(returnData, index_js_2.BIGINT_0, BigInt(dataLength));
        runState.memory.extend(memOffset, dataLength);
        runState.memory.write(memOffset, dataLength, data);
    }
    // For synthesizer
    const returnMemoryPts = runState.interpreter.getReturnMemoryPts();
    if (returnMemoryPts.length > 0) {
        const acceptMemoryPts = (0, index_js_3.copyMemoryRegion)(runState, index_js_2.BIGINT_0, outLength, returnMemoryPts);
        for (const entry of acceptMemoryPts) {
            // the lower index, the older data
            runState.memoryPt.write(Number(outOffset) + entry.memOffset, entry.containerSize, entry.dataPt);
        }
    }
}
exports.writeCallOutput = writeCallOutput;
/**
 * The first rule set of SSTORE rules, which are the rules pre-Constantinople and in Petersburg
 */
function updateSstoreGas(runState, currentStorage, value, common) {
    if ((value.length === 0 && currentStorage.length === 0) ||
        (value.length > 0 && currentStorage.length > 0)) {
        const gas = common.param('sstoreResetGas');
        return gas;
    }
    else if (value.length === 0 && currentStorage.length > 0) {
        const gas = common.param('sstoreResetGas');
        runState.interpreter.refundGas(common.param('sstoreRefundGas'), 'updateSstoreGas');
        return gas;
    }
    else {
        /*
          The situations checked above are:
          -> Value/Slot are both 0
          -> Value/Slot are both nonzero
          -> Value is zero, but slot is nonzero
          Thus, the remaining case is where value is nonzero, but slot is zero, which is this clause
        */
        return common.param('sstoreSetGas');
    }
}
exports.updateSstoreGas = updateSstoreGas;
function mod(a, b) {
    let r = a % b;
    if (r < index_js_2.BIGINT_0) {
        r = b + r;
    }
    return r;
}
exports.mod = mod;
function fromTwos(a) {
    return BigInt.asIntN(256, a);
}
exports.fromTwos = fromTwos;
function toTwos(a) {
    return BigInt.asUintN(256, a);
}
exports.toTwos = toTwos;
function abs(a) {
    if (a > 0) {
        return a;
    }
    return a * index_js_2.BIGINT_NEG1;
}
exports.abs = abs;
const N = BigInt(115792089237316195423570985008687907853269984665640564039457584007913129639936);
function exponentiation(bas, exp) {
    let t = index_js_2.BIGINT_1;
    while (exp > index_js_2.BIGINT_0) {
        if (exp % index_js_2.BIGINT_2 !== index_js_2.BIGINT_0) {
            t = (t * bas) % N;
        }
        bas = (bas * bas) % N;
        exp = exp / index_js_2.BIGINT_2;
    }
    return t;
}
exports.exponentiation = exponentiation;
//# sourceMappingURL=util.js.map