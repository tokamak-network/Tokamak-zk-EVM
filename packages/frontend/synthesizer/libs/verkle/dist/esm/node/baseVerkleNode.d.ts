import { type VerkleNodeInterface, type VerkleNodeOptions, type VerkleNodeType } from './types.js';
import type { VerkleCrypto } from '@ethereumjs/util';
export declare abstract class BaseVerkleNode<T extends VerkleNodeType> implements VerkleNodeInterface {
    commitment: Uint8Array;
    protected verkleCrypto: VerkleCrypto;
    constructor(options: VerkleNodeOptions[T]);
    hash(): Uint8Array;
    abstract raw(): Uint8Array[];
    /**
     * @returns the RLP serialized node
     */
    serialize(): Uint8Array;
}
//# sourceMappingURL=baseVerkleNode.d.ts.map