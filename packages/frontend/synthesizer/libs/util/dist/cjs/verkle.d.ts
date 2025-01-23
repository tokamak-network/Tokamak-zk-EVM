import type { Account } from './account.js';
import type { Address } from './address.js';
import type { PrefixedHexString } from './types.js';
/**
 * Verkle related constants and helper functions
 *
 * Experimental (do not use in production!)
 */
export interface VerkleCrypto {
    getTreeKey: (address: Uint8Array, treeIndex: Uint8Array, subIndex: number) => Uint8Array;
    getTreeKeyHash: (address: Uint8Array, treeIndexLE: Uint8Array) => Uint8Array;
    updateCommitment: (commitment: Uint8Array, commitmentIndex: number, oldScalarValue: Uint8Array, newScalarValue: Uint8Array) => Uint8Array;
    zeroCommitment: Uint8Array;
    verifyExecutionWitnessPreState: (prestateRoot: string, execution_witness_json: string) => boolean;
    hashCommitment: (commitment: Uint8Array) => Uint8Array;
    serializeCommitment: (commitment: Uint8Array) => Uint8Array;
    createProof: (bytes: ProverInput[]) => Uint8Array;
    verifyProof: (proof: Uint8Array, verifierInput: VerifierInput[]) => boolean;
    commitToScalars: (vector: Uint8Array[]) => Uint8Array;
}
export interface ProverInput {
    serializedCommitment: Uint8Array;
    vector: Uint8Array[];
    indices: number[];
}
export interface VerifierInput {
    serializedCommitment: Uint8Array;
    indexValuePairs: Array<{
        index: number;
        value: Uint8Array;
    }>;
}
/**
 * @dev Returns the 31-bytes verkle tree stem for a given address and tree index.
 * @dev Assumes that the verkle node width = 256
 * @param {VerkleCrypto} verkleCrypto The {@link VerkleCrypto} foreign function interface object from verkle-cryptography-wasm.
 * @param {Address} address The address to generate the tree key for.
 * @param treeIndex The index of the tree to generate the key for. Defaults to 0.
 * @return The 31-bytes verkle tree stem as a Uint8Array.
 */
export declare function getVerkleStem(verkleCrypto: VerkleCrypto, address: Address, treeIndex?: number | bigint): Uint8Array;
/**
 * Verifies that the executionWitness is valid for the given prestateRoot.
 * @param {VerkleCrypto} verkleCrypto The {@link VerkleCrypto} foreign function interface object from verkle-cryptography-wasm.
 * @param {VerkleExecutionWitness} executionWitness The verkle execution witness.
 * @returns {boolean} Whether or not the executionWitness belongs to the prestateRoot.
 */
export declare function verifyVerkleProof(verkleCrypto: VerkleCrypto, executionWitness: VerkleExecutionWitness): boolean;
export interface VerkleProof {
    commitmentsByPath: PrefixedHexString[];
    d: PrefixedHexString;
    depthExtensionPresent: PrefixedHexString;
    ipaProof: {
        cl: PrefixedHexString[];
        cr: PrefixedHexString[];
        finalEvaluation: PrefixedHexString;
    };
    otherStems: PrefixedHexString[];
}
export interface VerkleStateDiff {
    stem: PrefixedHexString;
    suffixDiffs: {
        currentValue: PrefixedHexString | null;
        newValue: PrefixedHexString | null;
        suffix: number | string;
    }[];
}
/**
 * Experimental, object format could eventual change.
 * An object that provides the state and proof necessary for verkle stateless execution
 * */
export interface VerkleExecutionWitness {
    /**
     * The stateRoot of the parent block
     */
    parentStateRoot: PrefixedHexString;
    /**
     * An array of state diffs.
     * Each item corresponding to state accesses or state modifications of the block.
     * In the current design, it also contains the resulting state of the block execution (post-state).
     */
    stateDiff: VerkleStateDiff[];
    /**
     * The verkle proof for the block.
     * Proves that the provided stateDiff belongs to the canonical verkle tree.
     */
    verkleProof: VerkleProof;
}
export declare enum VerkleLeafType {
    BasicData = 0,
    CodeHash = 1
}
export type VerkleLeafBasicData = {
    version: number;
    nonce: bigint;
    balance: bigint;
    codeSize: number;
};
export declare const VERKLE_VERSION_OFFSET = 0;
export declare const VERKLE_CODE_SIZE_OFFSET = 5;
export declare const VERKLE_NONCE_OFFSET = 8;
export declare const VERKLE_BALANCE_OFFSET = 16;
export declare const VERKLE_VERSION_BYTES_LENGTH = 1;
export declare const VERKLE_CODE_SIZE_BYTES_LENGTH = 3;
export declare const VERKLE_NONCE_BYTES_LENGTH = 8;
export declare const VERKLE_BALANCE_BYTES_LENGTH = 16;
export declare const VERKLE_BASIC_DATA_LEAF_KEY: Uint8Array;
export declare const VERKLE_CODE_HASH_LEAF_KEY: Uint8Array;
export declare const VERKLE_CODE_CHUNK_SIZE = 31;
export declare const VERKLE_HEADER_STORAGE_OFFSET = 64;
export declare const VERKLE_CODE_OFFSET = 128;
export declare const VERKLE_NODE_WIDTH = 256;
export declare const VERKLE_MAIN_STORAGE_OFFSET: bigint;
/**
 * @dev Returns the tree key for a given verkle tree stem, and sub index.
 * @dev Assumes that the verkle node width = 256
 * @param stem The 31-bytes verkle tree stem as a Uint8Array.
 * @param subIndex The sub index of the tree to generate the key for as a Uint8Array.
 * @return The tree key as a Uint8Array.
 */
export declare const getVerkleKey: (stem: Uint8Array, leaf: VerkleLeafType | Uint8Array) => Uint8Array;
/**
 * Calculates the position of the storage key in the Verkle tree, determining
 * both the tree index (the node in the tree) and the subindex (the position within the node).
 * @param {bigint} storageKey - The key representing a specific storage slot.
 * @returns {Object} - An object containing the tree index and subindex
 */
export declare function getVerkleTreeIndicesForStorageSlot(storageKey: bigint): {
    treeIndex: bigint;
    subIndex: number;
};
/**
 * Calculates the position of the code chunks in the Verkle tree, determining
 * both the tree index (the node in the tree) and the subindex (the position within the node).
 * @param {bigint} chunkId - The ID representing a specific chunk.
 * @returns {Object} - An object containing the tree index and subindex
 */
export declare function getVerkleTreeIndicesForCodeChunk(chunkId: number): {
    treeIndex: number;
    subIndex: number;
};
/**
 * Asynchronously calculates the Verkle tree key for the specified code chunk ID.
 * @param {Address} address - The account address to access code for.
 * @param {number} chunkId - The ID of the code chunk to retrieve.
 * @param {VerkleCrypto} verkleCrypto - The cryptographic object used for Verkle-related operations.
 * @returns {Promise<Uint8Array>} - A promise that resolves to the Verkle tree key as a byte array.
 */
export declare const getVerkleTreeKeyForCodeChunk: (address: Address, chunkId: number, verkleCrypto: VerkleCrypto) => Promise<Uint8Array>;
export declare const chunkifyCode: (code: Uint8Array) => Uint8Array[];
/**
 * Asynchronously calculates the Verkle tree key for the specified storage slot.
 * @param {Address} address - The account address to access code for.
 * @param {bigint} storageKey - The storage slot key to retrieve the verkle key for.
 * @param {VerkleCrypto} verkleCrypto - The cryptographic object used for Verkle-related operations.
 * @returns {Promise<Uint8Array>} - A promise that resolves to the Verkle tree key as a byte array.
 */
export declare const getVerkleTreeKeyForStorageSlot: (address: Address, storageKey: bigint, verkleCrypto: VerkleCrypto) => Promise<Uint8Array>;
/**
 * This function extracts and decodes account header elements (version, nonce, code size, and balance)
 * from an encoded `Uint8Array` representation of raw Verkle leaf-node basic data. Each component is sliced
 * from the `encodedBasicData` array based on predefined offsets and lengths, and then converted
 * to its appropriate type (integer or BigInt).
 * @param {Uint8Array} encodedBasicData - The encoded Verkle leaf basic data containing the version, nonce,
 * code size, and balance in a compact Uint8Array format.
 * @returns {VerkleLeafBasicData} - An object containing the decoded version, nonce, code size, and balance.
 */
export declare function decodeVerkleLeafBasicData(encodedBasicData: Uint8Array): VerkleLeafBasicData;
/**
 * This function takes a `VerkleLeafBasicData` object and encodes its properties
 * (version, nonce, code size, and balance) into a compact `Uint8Array` format. Each
 * property is serialized and padded to match the required byte lengths defined by
 * EIP-6800. Additionally, 4 bytes are reserved for future use as specified
 * in EIP-6800.
 * @param {VerkleLeafBasicData} basicData - An object containing the version, nonce,
 *   code size, and balance to be encoded.
 * @returns {Uint8Array} - A compact bytes representation of the account header basic data.
 */
export declare function encodeVerkleLeafBasicData(account: Account): Uint8Array;
/**
 * Helper method to generate the suffixes for code chunks for putting code
 * @param numChunks number of chunks to generate suffixes for
 * @returns number[] - an array of numbers corresponding to the code chunks being put
 */
export declare const generateChunkSuffixes: (numChunks: number) => number[];
/**
 * Helper method for generating the code stems necessary for putting code
 * @param numChunks the number of code chunks to be put
 * @param address the address of the account getting the code
 * @param verkleCrypto an initialized {@link VerkleCrypto} object
 * @returns an array of stems for putting code
 */
export declare const generateCodeStems: (numChunks: number, address: Address, verkleCrypto: VerkleCrypto) => Promise<Uint8Array[]>;
//# sourceMappingURL=verkle.d.ts.map