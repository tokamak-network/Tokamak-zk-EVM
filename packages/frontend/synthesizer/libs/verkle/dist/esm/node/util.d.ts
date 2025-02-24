import { InternalVerkleNode } from './internalNode.js';
import { LeafVerkleNode } from './leafNode.js';
import { LeafVerkleNodeValue, type VerkleNode } from './types.js';
import type { VerkleCrypto } from '@synthesizer-libs/util';
export declare function decodeRawVerkleNode(raw: Uint8Array[], verkleCrypto: VerkleCrypto): VerkleNode;
export declare function decodeVerkleNode(raw: Uint8Array, verkleCrypto: VerkleCrypto): VerkleNode;
export declare function isRawVerkleNode(node: Uint8Array | Uint8Array[]): node is Uint8Array[];
export declare function isLeafVerkleNode(node: VerkleNode): node is LeafVerkleNode;
export declare function isInternalVerkleNode(node: VerkleNode): node is InternalVerkleNode;
export declare const createZeroesLeafValue: () => Uint8Array;
export declare const createDefaultLeafVerkleValues: () => any[];
/***
 * Converts 128 32byte values of a leaf node into an array of 256 32 byte values representing
 * the first and second 16 bytes of each value right padded with zeroes for generating a
 * commitment for half of a leaf node's values
 * @param values - an array of Uint8Arrays representing the first or second set of 128 values
 * stored by the verkle trie leaf node
 * Returns an array of 256 32 byte UintArrays with the leaf marker set for each value that is
 * deleted
 */
export declare const createCValues: (values: (Uint8Array | LeafVerkleNodeValue)[]) => Uint8Array[];
//# sourceMappingURL=util.d.ts.map