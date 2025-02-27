import type { Nibbles } from '../types.js';
export declare const nibblesToBytes: (nibbles: Uint8Array) => Uint8Array;
export declare const hexToKeybytes: (hex: Uint8Array) => Uint8Array;
export declare const nibblesToCompactBytes: (nibbles: Uint8Array) => Uint8Array;
export declare const bytesToNibbles: (str: Uint8Array) => Uint8Array;
export declare const compactBytesToNibbles: (compact: Uint8Array) => Uint8Array;
/**
 * Converts each nibble into a single byte
 *
 * @param arr Nibble typed nibble array
 * @returns Uint8Array typed byte array
 */
export declare const nibbleTypeToByteType: (arr: Nibbles) => Uint8Array;
/**
 * Turns each byte into a single nibble, only extracting the lower nibble of each byte
 *
 * @param key Uint8Array typed byte array
 * @returns Nibble typed nibble array
 */
export declare const byteTypeToNibbleType: (key: Uint8Array) => Nibbles;
/**
 * Takes a string path and extends it by the given extension nibbles
 *
 * @param path String node path
 * @param extension nibbles to extend by
 * @param retType string indicating whether to return the key in "keybyte" or "hex" encoding
 * @returns hex-encoded key
 */
export declare const pathToHexKey: (path: string, extension: Nibbles, retType: string) => Uint8Array;
export declare const mergeAndFormatKeyPaths: (pathStrings: string[]) => Uint8Array[][];
//# sourceMappingURL=encoding.d.ts.map