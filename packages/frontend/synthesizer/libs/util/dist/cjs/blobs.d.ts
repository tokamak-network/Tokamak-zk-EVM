import type { KZG } from './kzg.js';
import type { PrefixedHexString } from './types.js';
export declare const getBlobs: (input: string) => `0x${string}`[];
export declare const blobsToCommitments: (kzg: KZG, blobs: PrefixedHexString[]) => `0x${string}`[];
export declare const blobsToProofs: (kzg: KZG, blobs: PrefixedHexString[], commitments: PrefixedHexString[]) => `0x${string}`[];
/**
 * Converts a vector commitment for a given data blob to its versioned hash.  For 4844, this version
 * number will be 0x01 for KZG vector commitments but could be different if future vector commitment
 * types are introduced
 * @param commitment a vector commitment to a blob
 * @param blobCommitmentVersion the version number corresponding to the type of vector commitment
 * @returns a versioned hash corresponding to a given blob vector commitment
 */
export declare const computeVersionedHash: (commitment: PrefixedHexString, blobCommitmentVersion: number) => `0x${string}`;
/**
 * Generate an array of versioned hashes from corresponding kzg commitments
 * @param commitments array of kzg commitments
 * @returns array of versioned hashes
 * Note: assumes KZG commitments (version 1 version hashes)
 */
export declare const commitmentsToVersionedHashes: (commitments: PrefixedHexString[]) => `0x${string}`[];
//# sourceMappingURL=blobs.d.ts.map