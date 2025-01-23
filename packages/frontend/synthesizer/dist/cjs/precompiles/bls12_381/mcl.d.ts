import type { EVMBLSInterface } from '../../types.js';
/**
 * Converts an Uint8Array to a MCL G1 point. Raises errors if the point is not on the curve
 * and (if activated) if the point is in the subgroup / order check.
 * @param input Input Uint8Array. Should be 128 bytes
 * @param mcl MCL instance
 * @param verifyOrder Perform the subgroup check (defaults to true)
 * @returns MCL G1 point
 */
declare function BLS12_381_ToG1Point(input: Uint8Array, mcl: any, verifyOrder?: boolean): any;
declare function BLS12_381_FromG1Point(input: any): Uint8Array;
/**
 * Converts an Uint8Array to a MCL G2 point. Raises errors if the point is not on the curve
 * and (if activated) if the point is in the subgroup / order check.
 * @param input Input Uint8Array. Should be 256 bytes
 * @param mcl MCL instance
 * @param verifyOrder Perform the subgroup check (defaults to true)
 * @returns MCL G2 point
 */
declare function BLS12_381_ToG2Point(input: Uint8Array, mcl: any, verifyOrder?: boolean): any;
declare function BLS12_381_FromG2Point(input: any): Uint8Array;
declare function BLS12_381_ToFrPoint(input: Uint8Array, mcl: any): any;
declare function BLS12_381_ToFpPoint(fpCoordinate: Uint8Array, mcl: any): any;
declare function BLS12_381_ToFp2Point(fpXCoordinate: Uint8Array, fpYCoordinate: Uint8Array, mcl: any): any;
/**
 * Implementation of the `EVMBLSInterface` using the `mcl-wasm` WASM `mcl` wrapper library,
 * see https://github.com/herumi/mcl-wasm.
 *
 * This can be optionally used to replace the build-in Noble implementation (`NobleBLS`) with
 * a more performant WASM variant. See EVM `bls` constructor option on how to use.
 */
export declare class MCLBLS implements EVMBLSInterface {
    protected readonly _mcl: any;
    constructor(mcl: any);
    init(): void;
    addG1(input: Uint8Array): Uint8Array;
    mulG1(input: Uint8Array): Uint8Array;
    addG2(input: Uint8Array): Uint8Array;
    mulG2(input: Uint8Array): Uint8Array;
    mapFPtoG1(input: Uint8Array): Uint8Array;
    mapFP2toG2(input: Uint8Array): Uint8Array;
    msmG1(input: Uint8Array): Uint8Array;
    msmG2(input: Uint8Array): Uint8Array;
    pairingCheck(input: Uint8Array): Uint8Array;
}
export { BLS12_381_FromG1Point, BLS12_381_FromG2Point, BLS12_381_ToFp2Point, BLS12_381_ToFpPoint, BLS12_381_ToFrPoint, BLS12_381_ToG1Point, BLS12_381_ToG2Point, };
//# sourceMappingURL=mcl.d.ts.map