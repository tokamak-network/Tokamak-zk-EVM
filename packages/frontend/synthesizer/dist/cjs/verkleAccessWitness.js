"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeAccessedState = exports.VerkleAccessWitness = void 0;
const index_js_1 = require("@ethereumjs/common/dist/esm/index.js");
const index_js_2 = require("@ethereumjs/util/index.js");
const debug_1 = require("debug");
const debug = (0, debug_1.default)('statemanager:verkle:aw');
/**
 * Tree key constants.
 */
const WitnessBranchReadCost = BigInt(1900);
const WitnessChunkReadCost = BigInt(200);
const WitnessBranchWriteCost = BigInt(3000);
const WitnessChunkWriteCost = BigInt(500);
const WitnessChunkFillCost = BigInt(6200);
class VerkleAccessWitness {
    constructor(opts) {
        if (opts.verkleCrypto === undefined) {
            throw new Error('verkle crypto required');
        }
        this.verkleCrypto = opts.verkleCrypto;
        this.stems = opts.stems ?? new Map();
        this.chunks = opts.chunks ?? new Map();
    }
    touchAndChargeProofOfAbsence(address) {
        let gas = index_js_2.BIGINT_0;
        gas += this.touchAddressOnReadAndComputeGas(address, 0, index_js_2.VERKLE_BASIC_DATA_LEAF_KEY);
        gas += this.touchAddressOnReadAndComputeGas(address, 0, index_js_2.VERKLE_CODE_HASH_LEAF_KEY);
        return gas;
    }
    touchAndChargeMessageCall(address) {
        let gas = index_js_2.BIGINT_0;
        gas += this.touchAddressOnReadAndComputeGas(address, 0, index_js_2.VERKLE_BASIC_DATA_LEAF_KEY);
        return gas;
    }
    touchAndChargeValueTransfer(target) {
        let gas = index_js_2.BIGINT_0;
        gas += this.touchAddressOnWriteAndComputeGas(target, 0, index_js_2.VERKLE_BASIC_DATA_LEAF_KEY);
        return gas;
    }
    touchAndChargeContractCreateInit(address) {
        let gas = index_js_2.BIGINT_0;
        gas += this.touchAddressOnWriteAndComputeGas(address, 0, index_js_2.VERKLE_BASIC_DATA_LEAF_KEY);
        return gas;
    }
    touchAndChargeContractCreateCompleted(address) {
        let gas = index_js_2.BIGINT_0;
        gas += this.touchAddressOnWriteAndComputeGas(address, 0, index_js_2.VERKLE_BASIC_DATA_LEAF_KEY);
        gas += this.touchAddressOnWriteAndComputeGas(address, 0, index_js_2.VERKLE_CODE_HASH_LEAF_KEY);
        return gas;
    }
    touchTxOriginAndComputeGas(origin) {
        let gas = index_js_2.BIGINT_0;
        gas += this.touchAddressOnReadAndComputeGas(origin, 0, index_js_2.VERKLE_BASIC_DATA_LEAF_KEY);
        gas += this.touchAddressOnReadAndComputeGas(origin, 0, index_js_2.VERKLE_CODE_HASH_LEAF_KEY);
        return gas;
    }
    touchTxTargetAndComputeGas(target, { sendsValue } = {}) {
        let gas = index_js_2.BIGINT_0;
        gas += this.touchAddressOnReadAndComputeGas(target, 0, index_js_2.VERKLE_CODE_HASH_LEAF_KEY);
        if (sendsValue === true) {
            gas += this.touchAddressOnWriteAndComputeGas(target, 0, index_js_2.VERKLE_BASIC_DATA_LEAF_KEY);
        }
        else {
            gas += this.touchAddressOnReadAndComputeGas(target, 0, index_js_2.VERKLE_BASIC_DATA_LEAF_KEY);
        }
        return gas;
    }
    touchCodeChunksRangeOnReadAndChargeGas(contact, startPc, endPc) {
        let gas = index_js_2.BIGINT_0;
        for (let chunkNum = Math.floor(startPc / 31); chunkNum <= Math.floor(endPc / 31); chunkNum++) {
            const { treeIndex, subIndex } = (0, index_js_2.getVerkleTreeIndicesForCodeChunk)(chunkNum);
            gas += this.touchAddressOnReadAndComputeGas(contact, treeIndex, subIndex);
        }
        return gas;
    }
    touchCodeChunksRangeOnWriteAndChargeGas(contact, startPc, endPc) {
        let gas = index_js_2.BIGINT_0;
        for (let chunkNum = Math.floor(startPc / 31); chunkNum <= Math.floor(endPc / 31); chunkNum++) {
            const { treeIndex, subIndex } = (0, index_js_2.getVerkleTreeIndicesForCodeChunk)(chunkNum);
            gas += this.touchAddressOnWriteAndComputeGas(contact, treeIndex, subIndex);
        }
        return gas;
    }
    touchAddressOnWriteAndComputeGas(address, treeIndex, subIndex) {
        return this.touchAddressAndChargeGas(address, treeIndex, subIndex, { isWrite: true });
    }
    touchAddressOnReadAndComputeGas(address, treeIndex, subIndex) {
        return this.touchAddressAndChargeGas(address, treeIndex, subIndex, { isWrite: false });
    }
    touchAddressAndChargeGas(address, treeIndex, subIndex, { isWrite }) {
        let gas = index_js_2.BIGINT_0;
        const { stemRead, stemWrite, chunkRead, chunkWrite, chunkFill } = this.touchAddress(address, treeIndex, subIndex, { isWrite });
        if (stemRead === true) {
            gas += WitnessBranchReadCost;
        }
        if (stemWrite === true) {
            gas += WitnessBranchWriteCost;
        }
        if (chunkRead === true) {
            gas += WitnessChunkReadCost;
        }
        if (chunkWrite === true) {
            gas += WitnessChunkWriteCost;
        }
        if (chunkFill === true) {
            gas += WitnessChunkFillCost;
        }
        debug(`touchAddressAndChargeGas=${gas} address=${address} treeIndex=${treeIndex} subIndex=${subIndex}`);
        return gas;
    }
    touchAddress(address, treeIndex, subIndex, { isWrite } = {}) {
        let stemRead = false, stemWrite = false, chunkRead = false, chunkWrite = false;
        // currently there are no gas charges for setting the chunk for the first time
        // i.e. no fill cost is charged right now
        const chunkFill = false;
        const accessedStemKey = (0, index_js_2.getVerkleStem)(this.verkleCrypto, address, treeIndex);
        const accessedStemHex = (0, index_js_2.bytesToHex)(accessedStemKey);
        let accessedStem = this.stems.get(accessedStemHex);
        if (accessedStem === undefined) {
            stemRead = true;
            accessedStem = { address, treeIndex };
            this.stems.set(accessedStemHex, accessedStem);
        }
        const accessedChunkKey = (0, index_js_2.getVerkleKey)(accessedStemKey, typeof subIndex === 'number' ? (0, index_js_2.intToBytes)(subIndex) : subIndex);
        const accessedChunkKeyHex = (0, index_js_2.bytesToHex)(accessedChunkKey);
        let accessedChunk = this.chunks.get(accessedChunkKeyHex);
        if (accessedChunk === undefined) {
            chunkRead = true;
            accessedChunk = {};
            this.chunks.set(accessedChunkKeyHex, accessedChunk);
        }
        if (isWrite === true) {
            if (accessedStem.write !== true) {
                stemWrite = true;
                // this would also directly modify in the map
                accessedStem.write = true;
            }
            if (accessedChunk.write !== true) {
                chunkWrite = true;
                // this would also directly modify in the map
                accessedChunk.write = true;
            }
        }
        debug(`${accessedChunkKeyHex}: isWrite=${isWrite} for steamRead=${stemRead} stemWrite=${stemWrite} chunkRead=${chunkRead} chunkWrite=${chunkWrite} chunkFill=${chunkFill}`);
        return { stemRead, stemWrite, chunkRead, chunkWrite, chunkFill };
    }
    merge(accessWitness) {
        for (const [chunkKey, chunkValue] of accessWitness.chunks.entries()) {
            const stemKey = chunkKey.slice(0, chunkKey.length - 2);
            const stem = accessWitness.stems.get(stemKey);
            if (stem === undefined) {
                throw Error(`Internal error: missing stem for the chunkKey=${chunkKey}`);
            }
            const thisStem = this.stems.get(stemKey);
            if (thisStem === undefined) {
                this.stems.set(stemKey, stem);
            }
            else {
                thisStem.write = thisStem.write !== true ? stem.write : true;
            }
            const thisChunk = this.chunks.get(chunkKey);
            if (thisChunk === undefined) {
                this.chunks.set(chunkKey, chunkValue);
            }
            else {
                thisChunk.write = thisChunk.write !== true ? chunkValue.write : true;
                thisChunk.fill = thisChunk.fill !== true ? thisChunk.fill : true;
            }
        }
    }
    *rawAccesses() {
        for (const chunkKey of this.chunks.keys()) {
            // drop the last byte
            const stemKey = chunkKey.slice(0, chunkKey.length - 2);
            const stem = this.stems.get(stemKey);
            if (stem === undefined) {
                throw Error(`Internal error: missing stem for the chunkKey=${chunkKey}`);
            }
            const { address, treeIndex } = stem;
            const chunkIndex = Number(`0x${chunkKey.slice(chunkKey.length - 2)}`);
            const accessedState = { address, treeIndex, chunkIndex, chunkKey };
            yield accessedState;
        }
    }
    *accesses() {
        for (const rawAccess of this.rawAccesses()) {
            const { address, treeIndex, chunkIndex, chunkKey } = rawAccess;
            const accessedState = decodeAccessedState(treeIndex, chunkIndex);
            yield { ...accessedState, address, chunkKey };
        }
    }
}
exports.VerkleAccessWitness = VerkleAccessWitness;
function decodeAccessedState(treeIndex, chunkIndex) {
    const position = BigInt(treeIndex) * BigInt(index_js_2.VERKLE_NODE_WIDTH) + BigInt(chunkIndex);
    switch (position) {
        case BigInt(0):
            return { type: index_js_1.VerkleAccessedStateType.BasicData };
        case BigInt(1):
            return { type: index_js_1.VerkleAccessedStateType.CodeHash };
        default:
            if (position < index_js_2.VERKLE_HEADER_STORAGE_OFFSET) {
                throw Error(`No attribute yet stored >=2 and <${index_js_2.VERKLE_HEADER_STORAGE_OFFSET}`);
            }
            if (position >= index_js_2.VERKLE_HEADER_STORAGE_OFFSET && position < index_js_2.VERKLE_CODE_OFFSET) {
                const slot = position - BigInt(index_js_2.VERKLE_HEADER_STORAGE_OFFSET);
                return { type: index_js_1.VerkleAccessedStateType.Storage, slot };
            }
            else if (position >= index_js_2.VERKLE_CODE_OFFSET && position < index_js_2.VERKLE_MAIN_STORAGE_OFFSET) {
                const codeChunkIdx = Number(position) - index_js_2.VERKLE_CODE_OFFSET;
                return { type: index_js_1.VerkleAccessedStateType.Code, codeOffset: codeChunkIdx * 31 };
            }
            else if (position >= index_js_2.VERKLE_MAIN_STORAGE_OFFSET) {
                const slot = BigInt(position - index_js_2.VERKLE_MAIN_STORAGE_OFFSET);
                return { type: index_js_1.VerkleAccessedStateType.Storage, slot };
            }
            else {
                throw Error(`Invalid treeIndex=${treeIndex} chunkIndex=${chunkIndex} for verkle tree access`);
            }
    }
}
exports.decodeAccessedState = decodeAccessedState;
//# sourceMappingURL=verkleAccessWitness.js.map