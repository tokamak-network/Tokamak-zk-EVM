import { RunTxResult } from '@ethereumjs/vm';
import { DataAliasInfos, DataPt, MemoryPts, Placements, ReservedVariable, SynthesizerInterface, SynthesizerOpts, SynthesizerStepLogEntry } from './types/index.ts';
import { ArithmeticManager, BufferManager, InstructionHandler, MemoryManager, StateManager, SynthesizerOpHandler } from './handlers/index.ts';
import { ArithmeticOperator, SubcircuitNames } from '../interface/qapCompiler/configuredTypes.ts';
import type { ResolvedSubcircuitLibrary } from '../interface/qapCompiler/libraryTypes.ts';
/**
 * The Synthesizer class manages data related to subcircuits.
 * It acts as a facade, delegating tasks to various handler classes.
 */
export declare class Synthesizer implements SynthesizerInterface {
    protected _state: StateManager;
    protected _arithmeticManager: ArithmeticManager;
    protected _memoryManager: MemoryManager;
    protected _bufferManager: BufferManager;
    protected _instructionHandlers: InstructionHandler;
    readonly cachedOpts: SynthesizerOpts;
    readonly subcircuitLibrary: ResolvedSubcircuitLibrary;
    private _stepLogs;
    private _messageCodeAddresses;
    constructor(opts: SynthesizerOpts, subcircuitLibrary: ResolvedSubcircuitLibrary);
    private _attachSynthesizerToVM;
    private _prepareSynthesizeTransaction;
    private _returnMessageCall;
    private _prepareMessageCall;
    private _finalizeStorage;
    synthesizeTX(): Promise<RunTxResult>;
    private _applySynthesizerHandler;
    private _updateStoragePreStep;
    get state(): StateManager;
    get stepLogs(): SynthesizerStepLogEntry[];
    get messageCodeAddresses(): Set<`0x${string}`>;
    get placements(): Placements;
    get synthesizerHandlers(): Map<number, SynthesizerOpHandler>;
    place(name: SubcircuitNames, inPts: DataPt[], outPts: DataPt[], usage: string): void;
    getReservedVariableFromBuffer(varName: ReservedVariable): DataPt;
    addWirePairToBufferIn(inPt: DataPt, outPt: DataPt, dynamic: boolean): DataPt;
    addReservedVariableToBufferIn(varName: ReservedVariable, value?: bigint, dynamic?: boolean, message?: string): DataPt;
    addReservedVariableToBufferOut(varName: ReservedVariable, symbolDataPt: DataPt, dynamic?: boolean, message?: string): DataPt;
    loadArbitraryStatic(value: bigint, bitSize?: number, desc?: string): DataPt;
    placeArith(name: ArithmeticOperator, inPts: DataPt[]): DataPt[];
    placeExp(inPts: DataPt[], reference?: bigint): DataPt;
    placeJubjubExp(inPts: DataPt[], PoI: DataPt[], reference?: bigint): DataPt[];
    placePoseidon(inPts: DataPt[]): DataPt;
    placeMerkleProofVerification(indexPt: DataPt, leafPt: DataPt, siblingPts: DataPt[][], rootPt: DataPt): void;
    placeMemoryToStack(dataAliasInfos: DataAliasInfos): DataPt;
    placeMemoryToMemory(dataAliasInfos: DataAliasInfos): DataPt[];
    placeMSTORE(dataPt: DataPt, truncBitSize: number): DataPt;
    copyMemoryPts(target: MemoryPts, srcOffset: bigint, length: bigint, dstOffset?: bigint): MemoryPts;
}
//# sourceMappingURL=synthesizer.d.ts.map