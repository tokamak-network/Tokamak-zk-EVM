import { RLP } from '@ethereumjs/rlp';
import { setLengthRight } from '@synthesizer-libs/util';
import { InternalVerkleNode } from './internalNode.js';
import { LeafVerkleNode } from './leafNode.js';
import { LeafVerkleNodeValue, VerkleNodeType } from './types.js';
export function decodeRawVerkleNode(raw, verkleCrypto) {
    const nodeType = raw[0][0];
    switch (nodeType) {
        case VerkleNodeType.Internal:
            return InternalVerkleNode.fromRawNode(raw, verkleCrypto);
        case VerkleNodeType.Leaf:
            return LeafVerkleNode.fromRawNode(raw, verkleCrypto);
        default:
            throw new Error('Invalid node type');
    }
}
export function decodeVerkleNode(raw, verkleCrypto) {
    const decoded = RLP.decode(Uint8Array.from(raw));
    if (!Array.isArray(decoded)) {
        throw new Error('Invalid node');
    }
    return decodeRawVerkleNode(decoded, verkleCrypto);
}
export function isRawVerkleNode(node) {
    return Array.isArray(node) && !(node instanceof Uint8Array);
}
export function isLeafVerkleNode(node) {
    return node.type === VerkleNodeType.Leaf;
}
export function isInternalVerkleNode(node) {
    return node.type === VerkleNodeType.Internal;
}
export const createZeroesLeafValue = () => new Uint8Array(32);
export const createDefaultLeafVerkleValues = () => new Array(256).fill(0);
/***
 * Converts 128 32byte values of a leaf node into an array of 256 32 byte values representing
 * the first and second 16 bytes of each value right padded with zeroes for generating a
 * commitment for half of a leaf node's values
 * @param values - an array of Uint8Arrays representing the first or second set of 128 values
 * stored by the verkle trie leaf node
 * Returns an array of 256 32 byte UintArrays with the leaf marker set for each value that is
 * deleted
 */
export const createCValues = (values) => {
    if (values.length !== 128)
        throw new Error(`got wrong number of values, expected 128, got ${values.length}`);
    const expandedValues = new Array(256);
    for (let x = 0; x < 128; x++) {
        const retrievedValue = values[x];
        let val;
        switch (retrievedValue) {
            case LeafVerkleNodeValue.Untouched: // Leaf value that has never been written before
            case LeafVerkleNodeValue.Deleted: // Leaf value that has been written with zeros (either zeroes or a deleted value)
                val = createZeroesLeafValue();
                break;
            default:
                val = retrievedValue;
                break;
        }
        // We add 16 trailing zeros to each value since all commitments are little endian and padded to 32 bytes
        expandedValues[x * 2] = setLengthRight(val.slice(0, 16), 32);
        // Apply leaf marker to all touched values (i.e. flip 129th bit) of the lower value (the 16 lower bytes
        // of the original 32 byte value array)
        // This is counterintuitive since the 129th bit is little endian byte encoding so 10000000 in bits but
        // each byte in a Javascript Uint8Array is still "big endian" so the 16th byte (which contains the 129-137th bits)
        // should be 1 and not 256.  In other words, the little endian value 10000000 is represented as an integer 1 in the byte
        // at index 16 of the Uint8Array since each byte is big endian at the system level so we have to invert that
        // value to get the correct representation
        if (retrievedValue !== LeafVerkleNodeValue.Untouched)
            expandedValues[x * 2][16] = 1;
        expandedValues[x * 2 + 1] = setLengthRight(val.slice(16), 32);
    }
    return expandedValues;
};
//# sourceMappingURL=util.js.map