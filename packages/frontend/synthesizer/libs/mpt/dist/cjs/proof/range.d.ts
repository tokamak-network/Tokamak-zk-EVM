import type { HashKeysFunction, Nibbles } from '../types.js';
/**
 * verifyRangeProof checks whether the given leaf nodes and edge proof
 * can prove the given trie leaves range is matched with the specific root.
 * Used internally by the verifyMerkleRangeProof wrapper function.
 *
 * There are four situations:
 *
 * - All elements proof. In this case the proof can be null, but the range should
 *   be all the leaves in the trie.
 *
 * - One element proof. In this case no matter the edge proof is a non-existent
 *   proof or not, we can always verify the correctness of the proof.
 *
 * - Zero element proof. In this case a single non-existent proof is enough to prove.
 *   Besides, if there are still some other leaves available on the right side, then
 *   an error will be returned.
 *
 * - Two edge elements proof. In this case two existent or non-existent proof(first and last) should be provided.
 *
 * NOTE: Currently only supports verification when the length of firstKey and lastKey are the same.
 *
 * @param rootHash - root hash of state trie this proof is being verified against.
 * @param firstKey - first key of range being proven.
 * @param lastKey - last key of range being proven.
 * @param keys - key list of leaf data being proven.
 * @param values - value list of leaf data being proven, one-to-one correspondence with keys.
 * @param proof - proof node list, if all-elements-proof where no proof is needed, proof should be null, and both `firstKey` and `lastKey` must be null as well
 * @returns a flag to indicate whether there exists more trie node in the trie
 */
export declare function verifyRangeProof(rootHash: Uint8Array, firstKey: Nibbles | null, lastKey: Nibbles | null, keys: Nibbles[], values: Uint8Array[], proof: Uint8Array[] | null, useKeyHashingFunction: HashKeysFunction): Promise<boolean>;
//# sourceMappingURL=range.d.ts.map