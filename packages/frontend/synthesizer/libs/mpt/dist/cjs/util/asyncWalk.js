"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports._walkTrie = void 0;
const rlp_1 = require("@ethereumjs/rlp");
const util_1 = require("@ethereumjs/util");
const branch_js_1 = require("../node/branch.js");
const extension_js_1 = require("../node/extension.js");
/**
 * Walk MerklePatriciaTrie via async generator
 * @param nodeHash - The root key to walk on.
 * @param currentKey - The current (partial) key.
 * @param onFound - Called on every node found (before filter)
 * @param filter - Filter nodes yielded by the generator.
 * @param visited - Set of visited nodes
 * @returns AsyncIterable<{ node: MPTNode; currentKey: number[] }>
 * Iterate through nodes with
 * `for await (const { node, currentKey } of trie._walkTrie(root)) { ... }`
 */
async function* _walkTrie(nodeHash, currentKey = [], onFound = async (_trieNode, _key) => { }, filter = async (_trieNode, _key) => true, visited = new Set()) {
    if ((0, util_1.equalsBytes)(nodeHash, this.EMPTY_TRIE_ROOT)) {
        return;
    }
    try {
        const node = await this.lookupNode(nodeHash);
        if (node === undefined || visited.has((0, util_1.bytesToHex)(this.hash(node.serialize())))) {
            return;
        }
        visited.add((0, util_1.bytesToHex)(this.hash(node.serialize())));
        await onFound(node, currentKey);
        if (await filter(node, currentKey)) {
            yield { node: node, currentKey };
        }
        if (node instanceof branch_js_1.BranchMPTNode) {
            for (const [nibble, childNode] of node._branches.entries()) {
                const nextKey = [...currentKey, nibble];
                const _childNode = childNode instanceof Uint8Array ? childNode : this.hash(rlp_1.RLP.encode(childNode));
                yield* _walkTrie.bind(this)(_childNode, nextKey, onFound, filter, visited);
            }
        }
        else if (node instanceof extension_js_1.ExtensionMPTNode) {
            const childNode = node.value();
            const nextKey = [...currentKey, ...node._nibbles];
            yield* _walkTrie.bind(this)(childNode, nextKey, onFound, filter, visited);
        }
    }
    catch (e) {
        return;
    }
}
exports._walkTrie = _walkTrie;
//# sourceMappingURL=asyncWalk.js.map