import { RLP } from '@ethereumjs/rlp';
export class BaseVerkleNode {
    constructor(options) {
        this.commitment = options.commitment;
        this.verkleCrypto = options.verkleCrypto;
    }
    // Hash returns the field representation of the commitment.
    hash() {
        return this.verkleCrypto.hashCommitment(this.commitment);
    }
    /**
     * @returns the RLP serialized node
     */
    serialize() {
        return RLP.encode(this.raw());
    }
}
//# sourceMappingURL=baseVerkleNode.js.map