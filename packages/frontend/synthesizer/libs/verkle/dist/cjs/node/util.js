"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCValues = exports.createDefaultLeafVerkleValues = exports.createZeroesLeafValue = exports.isInternalVerkleNode = exports.isLeafVerkleNode = exports.isRawVerkleNode = exports.decodeVerkleNode = exports.decodeRawVerkleNode = void 0;
const rlp_1 = require("@ethereumjs/rlp");
const util_1 = require("@ethereumjs/util");
const internalNode_js_1 = require("./internalNode.js");
const leafNode_js_1 = require("./leafNode.js");
const types_js_1 = require("./types.js");
function decodeRawVerkleNode(raw, verkleCrypto) {
    const nodeType = raw[0][0];
    switch (nodeType) {
        case types_js_1.VerkleNodeType.Internal:
            return internalNode_js_1.InternalVerkleNode.fromRawNode(raw, verkleCrypto);
        case types_js_1.VerkleNodeType.Leaf:
            return leafNode_js_1.LeafVerkleNode.fromRawNode(raw, verkleCrypto);
        default:
            throw new Error('Invalid node type');
    }
}
exports.decodeRawVerkleNode = decodeRawVerkleNode;
function decodeVerkleNode(raw, verkleCrypto) {
    const decoded = rlp_1.RLP.decode(Uint8Array.from(raw));
    if (!Array.isArray(decoded)) {
        throw new Error('Invalid node');
    }
    return decodeRawVerkleNode(decoded, verkleCrypto);
}
exports.decodeVerkleNode = decodeVerkleNode;
function isRawVerkleNode(node) {
    return Array.isArray(node) && !(node instanceof Uint8Array);
}
exports.isRawVerkleNode = isRawVerkleNode;
function isLeafVerkleNode(node) {
    return node.type === types_js_1.VerkleNodeType.Leaf;
}
exports.isLeafVerkleNode = isLeafVerkleNode;
function isInternalVerkleNode(node) {
    return node.type === types_js_1.VerkleNodeType.Internal;
}
exports.isInternalVerkleNode = isInternalVerkleNode;
const createZeroesLeafValue = () => new Uint8Array(32);
exports.createZeroesLeafValue = createZeroesLeafValue;
const createDefaultLeafVerkleValues = () => new Array(256).fill(0);
exports.createDefaultLeafVerkleValues = createDefaultLeafVerkleValues;
/***
 * Converts 128 32byte values of a leaf node into an array of 256 32 byte values representing
 * the first and second 16 bytes of each value right padded with zeroes for generating a
 * commitment for half of a leaf node's values
 * @param values - an array of Uint8Arrays representing the first or second set of 128 values
 * stored by the verkle trie leaf node
 * Returns an array of 256 32 byte UintArrays with the leaf marker set for each value that is
 * deleted
 */
const createCValues = (values) => {
    if (values.length !== 128)
        throw new Error(`got wrong number of values, expected 128, got ${values.length}`);
    const expandedValues = new Array(256);
    for (let x = 0; x < 128; x++) {
        const retrievedValue = values[x];
        let val;
        switch (retrievedValue) {
            case types_js_1.LeafVerkleNodeValue.Untouched: // Leaf value that has never been written before
            case types_js_1.LeafVerkleNodeValue.Deleted: // Leaf value that has been written with zeros (either zeroes or a deleted value)
                val = (0, exports.createZeroesLeafValue)();
                break;
            default:
                val = retrievedValue;
                break;
        }
        // We add 16 trailing zeros to each value since all commitments are little endian and padded to 32 bytes
        expandedValues[x * 2] = (0, util_1.setLengthRight)(val.slice(0, 16), 32);
        // Apply leaf marker to all touched values (i.e. flip 129th bit) of the lower value (the 16 lower bytes
        // of the original 32 byte value array)
        // This is counterintuitive since the 129th bit is little endian byte encoding so 10000000 in bits but
        // each byte in a Javascript Uint8Array is still "big endian" so the 16th byte (which contains the 129-137th bits)
        // should be 1 and not 256.  In other words, the little endian value 10000000 is represented as an integer 1 in the byte
        // at index 16 of the Uint8Array since each byte is big endian at the system level so we have to invert that
        // value to get the correct representation
        if (retrievedValue !== types_js_1.LeafVerkleNodeValue.Untouched)
            expandedValues[x * 2][16] = 1;
        expandedValues[x * 2 + 1] = (0, util_1.setLengthRight)(val.slice(16), 32);
    }
    return expandedValues;
};
exports.createCValues = createCValues;
//# sourceMappingURL=util.js.map