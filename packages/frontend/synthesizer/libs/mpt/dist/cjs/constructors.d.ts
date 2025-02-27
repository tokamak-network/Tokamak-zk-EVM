import { MerklePatriciaTrie } from './index.js';
import type { MPTOpts, Proof } from './index.js';
export declare function createMPT(opts?: MPTOpts): Promise<MerklePatriciaTrie>;
/**
 * Create a trie from a given (EIP-1186)[https://eips.ethereum.org/EIPS/eip-1186] proof. A proof contains the encoded trie nodes
 * from the root node to the leaf node storing state data.
 * @param proof an EIP-1186 proof to create trie from
 * @param trieOpts trie opts to be applied to returned trie
 * @returns new trie created from given proof
 */
export declare function createMPTFromProof(proof: Proof, trieOpts?: MPTOpts): Promise<MerklePatriciaTrie>;
//# sourceMappingURL=constructors.d.ts.map