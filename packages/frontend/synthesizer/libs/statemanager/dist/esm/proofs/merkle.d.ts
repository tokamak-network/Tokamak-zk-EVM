import { MerkleStateManager } from '../merkleStateManager.js';
import type { MerkleStateManagerOpts } from '../index.js';
import type { Proof, StorageProof } from '@synthesizer-libs/common';
import type { Address, PrefixedHexString } from '@ethereumjs/util';
/**
 * Get an EIP-1186 proof
 * @param address address to get proof of
 * @param storageSlots storage slots to get proof of
 */
export declare function getMerkleStateProof(sm: MerkleStateManager, address: Address, storageSlots?: Uint8Array[]): Promise<Proof>;
/**
 * Adds a storage proof to the state manager
 * @param storageProof The storage proof
 * @param storageHash The root hash of the storage trie
 * @param address The address
 * @param safe Whether or not to verify if the reported roots match the current storage root
 */
export declare function addMerkleStateStorageProof(sm: MerkleStateManager, storageProof: StorageProof[], storageHash: PrefixedHexString, address: Address, safe?: boolean): Promise<void>;
/**
 * Create a StateManager and initialize this with proof(s) gotten previously from getProof
 * This generates a (partial) StateManager where one can retrieve all items from the proof
 * @param proof Either a proof retrieved from `getProof`, or an array of those proofs
 * @param safe Whether or not to verify that the roots of the proof items match the reported roots
 * @param opts a dictionary of StateManager opts
 * @returns A new MerkleStateManager with elements from the given proof included in its backing state trie
 */
export declare function fromMerkleStateProof(proof: Proof | Proof[], safe?: boolean, opts?: MerkleStateManagerOpts): Promise<MerkleStateManager>;
/**
 * Add proof(s) into an already existing trie
 * @param proof The proof(s) retrieved from `getProof`
 * @param verifyRoot verify that all proof root nodes match statemanager's stateroot - should be
 * set to `false` when constructing a state manager where the underlying trie has proof nodes from different state roots
 */
export declare function addMerkleStateProofData(sm: MerkleStateManager, proof: Proof | Proof[], safe?: boolean): Promise<void>;
/**
 * Verify an EIP-1186 proof. Throws if proof is invalid, otherwise returns true.
 * @param proof the proof to prove
 */
export declare function verifyMerkleStateProof(sm: MerkleStateManager, proof: Proof): Promise<boolean>;
//# sourceMappingURL=merkle.d.ts.map