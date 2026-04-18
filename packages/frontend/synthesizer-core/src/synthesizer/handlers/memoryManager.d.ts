import { DataAliasInfos, DataPt, ISynthesizerProvider, MemoryPts } from '../types/index.ts';
export declare class MemoryManager {
    private parent;
    constructor(parent: ISynthesizerProvider);
    placeMSTORE(dataPt: DataPt, truncBitSize: number): DataPt;
    placeMemoryToStack(dataAliasInfos: DataAliasInfos): DataPt;
    placeMemoryToMemory(dataAliasInfos: DataAliasInfos): DataPt[];
    private calculateViewAdjustment;
    adjustMemoryPts(dataPts: DataPt[], memoryPts: MemoryPts, srcOffset: number, dstOffset: number, viewLength: number): void;
    copyMemoryPts(target: MemoryPts, srcOffset: bigint, length: bigint, dstOffset?: bigint): MemoryPts;
    private truncateDataPt;
    private combineMemorySlices;
    private transformMemorySlice;
    private applyShift;
    private applyMask;
}
//# sourceMappingURL=memoryManager.d.ts.map