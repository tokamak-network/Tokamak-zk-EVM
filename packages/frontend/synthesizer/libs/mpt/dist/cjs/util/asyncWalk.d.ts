import type { MerklePatriciaTrie } from '../mpt.js';
import type { MPTNode } from '../types.js';
export type NodeFilter = (node: MPTNode, key: number[]) => Promise<boolean>;
export type OnFound = (node: MPTNode, key: number[]) => Promise<any>;
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
export declare function _walkTrie(this: MerklePatriciaTrie, nodeHash: Uint8Array, currentKey?: number[], onFound?: OnFound, filter?: NodeFilter, visited?: Set<string>): AsyncIterable<{
    node: MPTNode;
    currentKey: number[];
}>;
//# sourceMappingURL=asyncWalk.d.ts.map