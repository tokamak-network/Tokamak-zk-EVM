import { DataPt, ISynthesizerProvider, ReservedVariable } from '../types/index.ts';
export declare class BufferManager {
    private parent;
    private cachedOpts;
    constructor(parent: ISynthesizerProvider);
    addReservedVariableToBufferIn(varName: ReservedVariable, value?: bigint, dynamic?: boolean, message?: string): DataPt;
    addReservedVariableToBufferOut(varName: ReservedVariable, symbolDataPt: DataPt, dynamic?: boolean, message?: string): DataPt;
    loadArbitraryStatic(value: bigint, bitSize?: number, desc?: string): DataPt;
    /**
     * Initializes the default placements for public/private inputs and outputs.
     */
    private _initBuffers;
    private _initTransactionBuffer;
    getReservedVariableFromBuffer(varName: ReservedVariable): DataPt;
}
//# sourceMappingURL=bufferManager.d.ts.map