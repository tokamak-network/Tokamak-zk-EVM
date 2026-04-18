/**
 * @property {string | number } source - Where the data is from. If the source is a string, it should be a stringfied address of which the code is running. If it is a number, it is a placement key.  See "functions.ts" for detail
 * @property {string} type? - The type of data, when the source is either an address or 'block'. E.g., 'hardcoded', 'BLOCKHASH', 'CALLDATA'. See "functions.ts" for detail
 * @property {number} wireIndex? - The index of wire at which the data is from, when the source is a placement key (= subcircuit).
 * @property {number} offset? - The offset at which the data is read, when the source is string and the type either 'hardcoded' or 'CALLDATA'.
 * @property {number} sourceSize - Actual size of the data.
 * @property {bigint} value - Data value.
 */
export type DataPtDescription = {
    extSource?: string;
    extDest?: string;
    source: number;
    wireIndex: number;
    sourceBitSize: number;
};
export type DataPt = DataPtDescription & {
    value: bigint;
    valueHex: string;
};
/**
 * Structure representing data alias information.
 * @property {DataPt} dataPt - Original data pointer
 * @property {number} shift - Number of bit shifts (positive for SHL, negative for SHR)
 * @property {string} masker - Hexadecimal string representing valid bytes (FF) or invalid bytes (00)
 */
export type DataAliasInfoEntry = {
    dataPt: DataPt;
    shift: number;
    masker: string;
};
export type DataAliasInfos = DataAliasInfoEntry[];
/**
 * Structure representing memory information.
 * @property {number} memOffset - Memory offset
 * @property {number} containerSize - Container size
 * @property {DataPt} dataPt - Data pointer
 */
export type MemoryPtEntry = {
    memByteOffset: number;
    containerByteSize: number;
    dataPt: DataPt;
};
/**
 * Array of memory information. Lower indices represent older memory information.
 */
export type MemoryPts = MemoryPtEntry[];
//# sourceMappingURL=dataStructure.d.ts.map