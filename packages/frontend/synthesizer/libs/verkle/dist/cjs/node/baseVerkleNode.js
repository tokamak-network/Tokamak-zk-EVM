"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseVerkleNode = void 0;
const rlp_1 = require("@ethereumjs/rlp");
class BaseVerkleNode {
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
        return rlp_1.RLP.encode(this.raw());
    }
}
exports.BaseVerkleNode = BaseVerkleNode;
//# sourceMappingURL=baseVerkleNode.js.map