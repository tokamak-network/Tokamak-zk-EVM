import { BaseVerkleNode } from './baseVerkleNode.js';
import { LeafVerkleNodeValue, VerkleNodeType } from './types.js';
import type { VerkleNodeOptions } from './types.js';
import type { VerkleCrypto } from '@ethereumjs/util';
export declare class LeafVerkleNode extends BaseVerkleNode<VerkleNodeType.Leaf> {
    stem: Uint8Array;
    values: (Uint8Array | LeafVerkleNodeValue)[];
    c1?: Uint8Array;
    c2?: Uint8Array;
    type: VerkleNodeType;
    constructor(options: VerkleNodeOptions[VerkleNodeType.Leaf]);
    /**
     * Create a new leaf node from a stem and values
     * @param stem the 31 byte stem corresponding to the where the leaf node should be placed in the trie
     * @param values the 256 element array of 32 byte values stored in the leaf node
     * @param verkleCrypto the verkle cryptography interface
     * @returns an instantiated leaf node with commitments defined
     */
    static create(stem: Uint8Array, verkleCrypto: VerkleCrypto, values?: (Uint8Array | LeafVerkleNodeValue)[]): Promise<LeafVerkleNode>;
    static fromRawNode(rawNode: Uint8Array[], verkleCrypto: VerkleCrypto): LeafVerkleNode;
    getValue(index: number): Uint8Array | undefined;
    /**
     * Set the value at the provided index from the values array and update the node commitments
     * @param index the index of the specific leaf value to be updated
     * @param value the value to insert into the leaf value at `index`
     */
    setValue(index: number, value: Uint8Array | LeafVerkleNodeValue): void;
    raw(): Uint8Array[];
}
//# sourceMappingURL=leafNode.d.ts.map