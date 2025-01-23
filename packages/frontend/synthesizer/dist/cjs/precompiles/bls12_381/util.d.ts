import type { PrecompileInput } from '../types.js';
/**
 * Calculates the gas used for the MSM precompiles based on the number of pairs and
 * calculating in some discount in relation to the number of pairs.
 *
 * @param numPairs
 * @param gasUsedPerPair
 * @returns
 */
export declare const msmGasUsed: (numPairs: number, gasUsedPerPair: bigint) => bigint;
/**
 * BLS-specific zero check to check that the top 16 bytes of a 64 byte field element provided
 * are always zero (see EIP notes on field element encoding).
 *
 * Zero byte ranges are expected to be passed in the following format (and so each referencing
 * 16-byte ranges):
 *
 * ```ts
 * const zeroByteRanges = [
 *   [0, 16],
 *   [64, 80],
 *   [128, 144]
 *
 * ]
 * ```
 *
 * @param opts
 * @param zeroByteRanges
 * @param pName
 * @param pairStart
 * @returns
 */
export declare const leading16ZeroBytesCheck: (opts: PrecompileInput, zeroByteRanges: number[][], pName: string, pairStart?: number) => boolean;
//# sourceMappingURL=util.d.ts.map