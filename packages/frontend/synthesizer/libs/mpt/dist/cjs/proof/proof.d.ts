import { MerklePatriciaTrie } from '../index.js';
import type { MPTOpts, Proof } from '../index.js';
/**
 * An (EIP-1186)[https://eips.ethereum.org/EIPS/eip-1186] proof contains the encoded trie nodes
 * from the root node to the leaf node storing state data.
 * @param rootHash Root hash of the trie that this proof was created from and is being verified for
 * @param key Key that is being verified and that the proof is created for
 * @param proof An (EIP-1186)[https://eips.ethereum.org/EIPS/eip-1186] proof contains the encoded trie nodes from the root node to the leaf node storing state data.
 * @param opts optional, the opts may include a custom hashing function to use with the trie for proof verification
 * @throws If proof is found to be invalid.
 * @returns The value from the key, or null if valid proof of non-existence.
 */
export declare function verifyMerkleProof(key: Uint8Array, proof: Proof, opts?: MPTOpts): Promise<Uint8Array | null>;
export declare function verifyMerkleRangeProof(rootHash: Uint8Array, firstKey: Uint8Array | null, lastKey: Uint8Array | null, keys: Uint8Array[], values: Uint8Array[], proof: Uint8Array[] | null, opts?: MPTOpts): Promise<boolean>;
/**
 * Creates a proof from a trie and key that can be verified using {@link verifyMPTWithMerkleProof}. An (EIP-1186)[https://eips.ethereum.org/EIPS/eip-1186] proof contains
 * the encoded trie nodes from the root node to the leaf node storing state data. The returned proof will be in the format of an array that contains Uint8Arrays of
 * serialized branch, extension, and/or leaf nodes.
 * @param key key to create a proof for
 */
export declare function createMerkleProof(trie: MerklePatriciaTrie, key: Uint8Array): Promise<Proof>;
/**
 * Updates a trie from a proof by putting all the nodes in the proof into the trie. Pass {@param shouldVerifyRoot} as true to check
 * that root key of proof matches root of trie and throw if not.
 * An (EIP-1186)[https://eips.ethereum.org/EIPS/eip-1186] proof contains the encoded trie nodes from the root node to the leaf node storing state data.
 * @param trie The trie to update from the proof.
 * @param proof An (EIP-1186)[https://eips.ethereum.org/EIPS/eip-1186] proof to update the trie from.
 * @param shouldVerifyRoot - defaults to false. If `true`, verifies that the root key of the proof matches the trie root and throws if not (i.e invalid proof).
 * @returns The root of the proof
 */
export declare function updateMPTFromMerkleProof(trie: MerklePatriciaTrie, proof: Proof, shouldVerifyRoot?: boolean): Promise<Uint8Array | undefined>;
/**
 * Verifies a proof by putting all of its nodes into a trie and attempting to get the proven key. An (EIP-1186)[https://eips.ethereum.org/EIPS/eip-1186] proof
 * contains the encoded trie nodes from the root node to the leaf node storing state data.
 * @param trie The trie to verify the proof against
 * @param rootHash Root hash of the trie that this proof was created from and is being verified for
 * @param key Key that is being verified and that the proof is created for
 * @param proof an EIP-1186 proof to verify the key against
 * @throws If proof is found to be invalid.
 * @returns The value from the key, or null if valid proof of non-existence.
 */
export declare function verifyMPTWithMerkleProof(trie: MerklePatriciaTrie, rootHash: Uint8Array, key: Uint8Array, proof: Proof): Promise<Uint8Array | null>;
//# sourceMappingURL=proof.d.ts.map