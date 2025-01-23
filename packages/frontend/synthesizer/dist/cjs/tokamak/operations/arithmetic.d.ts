import type { ArithmeticOperator } from '../types/index.js';
export type ArithmeticFunction = (...args: bigint[]) => bigint | bigint[];
/**
/**
 * Synthesizer 산술 연산을 처리하는 유틸리티 클래스
 */
export declare class ArithmeticOperations {
    private static readonly MAX_UINT256;
    private static readonly SIGN_BIT;
    private static readonly N;
    /**
     * 기본 산술 연산
     */
    static add(a: bigint, b: bigint): bigint;
    static mul(a: bigint, b: bigint): bigint;
    static sub(a: bigint, b: bigint): bigint;
    static div(a: bigint, b: bigint): bigint;
    static sdiv(a: bigint, b: bigint): bigint;
    /**
     * 모듈로 연산
     */
    static mod(a: bigint, b: bigint): bigint;
    static smod(a: bigint, b: bigint): bigint;
    static addmod(a: bigint, b: bigint, N: bigint): bigint;
    static mulmod(a: bigint, b: bigint, N: bigint): bigint;
    /**
     * @deprecated
     * 지수 연산
     */
    static exp(base: bigint, exponent: bigint): bigint;
    /**
     * 비교 연산
     */
    static lt(a: bigint, b: bigint): bigint;
    static gt(a: bigint, b: bigint): bigint;
    static slt(a: bigint, b: bigint): bigint;
    static sgt(a: bigint, b: bigint): bigint;
    static eq(a: bigint, b: bigint): bigint;
    static iszero(a: bigint): bigint;
    /**
     * 비트 연산
     */
    static and(a: bigint, b: bigint): bigint;
    static or(a: bigint, b: bigint): bigint;
    static xor(a: bigint, b: bigint): bigint;
    static not(a: bigint): bigint;
    /**
     * 시프트 연산
     */
    static shl(shift: bigint, value: bigint): bigint;
    static shr(shift: bigint, value: bigint): bigint;
    static sar(shift: bigint, value: bigint): bigint;
    /**
     * 바이트 연산
     */
    static byte(index: bigint, value: bigint): bigint;
    /**
     * 부호 확장
     */
    static signextend(k: bigint, value: bigint): bigint;
    /**
     * Decimal to Bit
     */
    static decToBit(dec: bigint): bigint[];
    /**
     * Subroutine for EXP
     */
    static subEXP(c: bigint, a: bigint, b: bigint): bigint[];
}
export declare const OPERATION_MAPPING: Record<ArithmeticOperator, ArithmeticFunction>;
//# sourceMappingURL=arithmetic.d.ts.map