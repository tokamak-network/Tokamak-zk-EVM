import type { PlacementEntry, Placements } from '../types/index.js';
export declare const powMod: (base: bigint, exponent: bigint, modulus: bigint) => bigint;
export declare const byteSize: (value: bigint) => number;
export declare const addPlacement: (map: Placements, value: PlacementEntry) => void;
export declare const convertToSigned: (value: bigint) => bigint;
export declare const mapToStr: (map: Map<any, any>) => any;
export declare function arrToStr(key: string, value: any): any;
export declare function split256BitInteger(value: bigint): bigint[];
export declare const merge128BitIntegers: (low: bigint, high: bigint) => bigint;
//# sourceMappingURL=utils.d.ts.map