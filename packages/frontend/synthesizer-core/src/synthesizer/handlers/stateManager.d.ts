import { ISynthesizerProvider, MemoryPts, type DataPt, type Placements } from '../types/index.ts';
import { MemoryPt, StackPt } from '../dataStructure/index.ts';
import { SubcircuitInfoByName, SubcircuitNames } from '../../interface/qapCompiler/configuredTypes.ts';
import { InterpreterStep } from '@ethereumjs/evm';
export type ContextConstructionData = {
    callerPt: DataPt;
    toAddressPt: DataPt;
    callDataMemoryPts: MemoryPts;
};
export type CachedMerkleProof = {
    indexPt: DataPt;
    siblingPts: DataPt[][];
};
export declare class ContextManager {
    stackPt: StackPt;
    memoryPt: MemoryPt;
    callerPt: DataPt;
    toAddressPt: DataPt;
    returnDataMemoryPts: MemoryPts;
    callDataMemoryPts: MemoryPts;
    prevInterpreterStep: InterpreterStep | null;
    resultMemoryPts: MemoryPts;
    constructor(data: ContextConstructionData);
}
/**
 * Manages the state of the synthesizer, including placements, auxin, and subcircuit information.
 */
export declare class StateManager {
    private parent;
    private cachedOpts;
    private _placements;
    subcircuitInfoByName: SubcircuitInfoByName;
    cachedEVMIn: Map<bigint, Map<number, DataPt>>;
    cachedOrigin: DataPt | undefined;
    cachedRoots: Map<bigint, DataPt[]>;
    cachedMerkleProof: CachedMerkleProof | null;
    contextByDepth: ContextManager[];
    constructor(parent: ISynthesizerProvider);
    get placements(): Placements;
    place(name: SubcircuitNames, inPts: DataPt[], outPts: DataPt[], usage: string): void;
    addWirePairToBufferIn(inPt: DataPt, outPt: DataPt, dynamic: boolean): DataPt;
}
//# sourceMappingURL=stateManager.d.ts.map