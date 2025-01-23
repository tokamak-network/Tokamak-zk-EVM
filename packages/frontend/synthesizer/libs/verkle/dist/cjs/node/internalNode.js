"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalVerkleNode = void 0;
const baseVerkleNode_js_1 = require("./baseVerkleNode.js");
const types_js_1 = require("./types.js");
class InternalVerkleNode extends baseVerkleNode_js_1.BaseVerkleNode {
    constructor(options) {
        super(options);
        this.type = types_js_1.VerkleNodeType.Internal;
        this.children = options.children ?? new Array(256).fill(null);
    }
    // Updates the commitment value for a child node at the corresponding index
    setChild(childIndex, child) {
        // Get previous child commitment at `index`
        const oldChildReference = this.children[childIndex] !== null
            ? this.children[childIndex]
            : {
                commitment: this.verkleCrypto.zeroCommitment,
                path: new Uint8Array(),
            };
        // Updates the commitment to the child node at `index`
        this.children[childIndex] = { ...child };
        // Updates the overall node commitment based on the update to this child
        this.commitment = this.verkleCrypto.updateCommitment(this.commitment, childIndex, 
        // The hashed child commitments are used when updating the internal node commitment
        this.verkleCrypto.hashCommitment(oldChildReference.commitment), this.verkleCrypto.hashCommitment(child.commitment));
    }
    static fromRawNode(rawNode, verkleCrypto) {
        const nodeType = rawNode[0][0];
        if (nodeType !== types_js_1.VerkleNodeType.Internal) {
            throw new Error('Invalid node type');
        }
        // The length of the rawNode should be the # of children * 2 (for commitments and paths) + 2 for the node type and the commitment
        if (rawNode.length !== types_js_1.NODE_WIDTH * 2 + 2) {
            throw new Error('Invalid node length');
        }
        const commitment = rawNode[rawNode.length - 1];
        const childrenCommitments = rawNode.slice(1, types_js_1.NODE_WIDTH + 1);
        const childrenPaths = rawNode.slice(types_js_1.NODE_WIDTH + 1, types_js_1.NODE_WIDTH * 2 + 1);
        const children = childrenCommitments.map((commitment, idx) => {
            if (commitment.length > 0)
                return { commitment, path: childrenPaths[idx] };
            return null;
        });
        return new InternalVerkleNode({ commitment, verkleCrypto, children });
    }
    /**
     * Generates a new Internal node with default commitment
     */
    static create(verkleCrypto) {
        const node = new InternalVerkleNode({
            commitment: verkleCrypto.zeroCommitment,
            verkleCrypto,
        });
        return node;
    }
    /**
     *
     * @param index The index in the children array to retrieve the child node commitment from
     * @returns the uncompressed 64byte commitment for the child node at the `index` position in the children array
     */
    getChildren(index) {
        return this.children[index];
    }
    raw() {
        return [
            new Uint8Array([types_js_1.VerkleNodeType.Internal]),
            ...this.children.map((child) => (child !== null ? child.commitment : new Uint8Array())),
            ...this.children.map((child) => (child !== null ? child.path : new Uint8Array())),
            this.commitment,
        ];
    }
}
exports.InternalVerkleNode = InternalVerkleNode;
//# sourceMappingURL=internalNode.js.map