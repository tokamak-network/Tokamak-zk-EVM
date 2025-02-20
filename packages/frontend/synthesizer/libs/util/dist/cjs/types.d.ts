import type { Address } from './address.js';
import type { ToBytesInputTypes } from './bytes.js';
export type BigIntLike = bigint | PrefixedHexString | number | Uint8Array;
export type BytesLike = Uint8Array | number[] | number | bigint | TransformableToBytes | PrefixedHexString;
export type NumericString = `${number}`;
export type PrefixedHexString = `0x${string}`;
/**
 * A type that represents an input that can be converted to an Address.
 */
export type AddressLike = Address | Uint8Array | PrefixedHexString;
export interface TransformableToBytes {
    toBytes?(): Uint8Array;
}
export type NestedUint8Array = Array<Uint8Array | NestedUint8Array>;
export declare function isNestedUint8Array(value: unknown): value is NestedUint8Array;
/**
 * Type output options
 */
export declare enum TypeOutput {
    Number = 0,
    BigInt = 1,
    Uint8Array = 2,
    PrefixedHexString = 3
}
export type TypeOutputReturnType = {
    [TypeOutput.Number]: number;
    [TypeOutput.BigInt]: bigint;
    [TypeOutput.Uint8Array]: Uint8Array;
    [TypeOutput.PrefixedHexString]: PrefixedHexString;
};
/**
 * Convert an input to a specified type.
 * Input of null/undefined returns null/undefined regardless of the output type.
 * @param input value to convert
 * @param outputType type to output
 */
export declare function toType<T extends TypeOutput>(input: null, outputType: T): null;
export declare function toType<T extends TypeOutput>(input: undefined, outputType: T): undefined;
export declare function toType<T extends TypeOutput>(input: ToBytesInputTypes, outputType: T): TypeOutputReturnType[T];
//# sourceMappingURL=types.d.ts.map