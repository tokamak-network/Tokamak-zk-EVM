import type { EVMBLSInterface } from '../../types.js';
type Fp2 = {
    c0: bigint;
    c1: bigint;
};
type AffinePoint<T> = {
    x: T;
    y: T;
} & {
    z?: never;
    t?: never;
};
/**
 * Converts an Uint8Array to a Noble G1 point. Raises errors if the point is not on the curve
 * and (if activated) if the point is in the subgroup / order check.
 * @param input Input Uint8Array. Should be 128 bytes
 * @returns Noble G1 point
 */
declare function BLS12_381_ToG1Point(input: Uint8Array, verifyOrder?: boolean): import("@noble/curves/abstract/weierstrass").ProjPointType<bigint>;
declare function BLS12_381_FromG1Point(input: AffinePoint<bigint>): Uint8Array;
/**
 * Converts an Uint8Array to a Noble G2 point. Raises errors if the point is not on the curve
 * and (if activated) if the point is in the subgroup / order check.
 * @param input Input Uint8Array. Should be 256 bytes
 * @returns Noble G2 point
 */
declare function BLS12_381_ToG2Point(input: Uint8Array, verifyOrder?: boolean): import("@noble/curves/abstract/weierstrass").ProjPointType<import("@noble/curves/abstract/tower").Fp2>;
declare function BLS12_381_FromG2Point(input: AffinePoint<Fp2>): Uint8Array;
declare function BLS12_381_ToFrPoint(input: Uint8Array): bigint;
declare function BLS12_381_ToFpPoint(fpCoordinate: Uint8Array): bigint;
declare function BLS12_381_ToFp2Point(fpXCoordinate: Uint8Array, fpYCoordinate: Uint8Array): import("@noble/curves/abstract/tower").Fp2;
/**
 * Implementation of the `EVMBLSInterface` using the `ethereum-cryptography (`@noble/curves`)
 * JS library, see https://github.com/ethereum/js-ethereum-cryptography.
 *
 * This is the EVM default implementation.
 */
export declare class NobleBLS implements EVMBLSInterface {
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
//# sourceMappingURL=noble.d.ts.map