import { type VerkleCrypto } from '@ethereumjs/util';
import { BaseVerkleNode } from './baseVerkleNode.js';
import { VerkleNodeType } from './types.js';
import type { ChildNode, VerkleNodeOptions } from './types.js';
export declare class InternalVerkleNode extends BaseVerkleNode<VerkleNodeType.Internal> {
    children: Array<ChildNode>;
    type: VerkleNodeType;
    constructor(options: VerkleNodeOptions[VerkleNodeType.Internal]);
    setChild(childIndex: number, child: ChildNode): void;
    static fromRawNode(rawNode: Uint8Array[], verkleCrypto: VerkleCrypto): InternalVerkleNode;
    /**
     * Generates a new Internal node with default commitment
     */
    static create(verkleCrypto: VerkleCrypto): InternalVerkleNode;
    /**
     *
     * @param index The index in the children array to retrieve the child node commitment from
     * @returns the uncompressed 64byte commitment for the child node at the `index` position in the children array
     */
    getChildren(index: number): ChildNode | null;
    raw(): Uint8Array[];
}
//# sourceMappingURL=internalNode.d.ts.map