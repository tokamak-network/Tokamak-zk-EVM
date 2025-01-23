import type { PrecompileInput } from './index.js';
/**
 * Checks that the gas used remain under the gas limit.
 *
 * @param opts
 * @param gasUsed
 * @param pName
 * @returns
 */
export declare const gasLimitCheck: (opts: PrecompileInput, gasUsed: bigint, pName: string) => boolean;
/**
 * Checks that the length of the provided data is equal to `length`.
 *
 * @param opts
 * @param length
 * @param pName
 * @returns
 */
export declare const equalityLengthCheck: (opts: PrecompileInput, length: number, pName: string) => boolean;
/**
 * Checks that the total length of the provided data input can be subdivided into k equal parts
 * with `length` (without leaving some remainder bytes).
 *
 * @param opts
 * @param length
 * @param pName
 * @returns
 */
export declare const moduloLengthCheck: (opts: PrecompileInput, length: number, pName: string) => boolean;
//# sourceMappingURL=util.d.ts.map