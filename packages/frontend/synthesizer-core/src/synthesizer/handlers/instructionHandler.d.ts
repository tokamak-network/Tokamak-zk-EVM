import { ISynthesizerProvider, SynthesizerSupportedBlkInfOpcodes, type DataPt, type SynthesizerSupportedOpcodes } from '../types/index.ts';
import { Address } from '@ethereumjs/util';
import { InterpreterStep } from '@ethereumjs/evm';
import { MemoryPt, StackPt } from '../dataStructure/index.ts';
import { ContextManager } from './stateManager.ts';
import { IMTMerkleProof } from '@zk-kit/imt';
export interface HandlerOpts {
    op: SynthesizerSupportedOpcodes;
    pc: bigint;
    thisAddress: Address;
    codeAddress: Address;
    originAddress: Address;
    callerAddress: Address;
    callDepth: number;
    thisContext: ContextManager;
    prevStepResult: InterpreterStep;
    stackPt: StackPt;
    memoryPt: MemoryPt;
    memOut?: Uint8Array;
}
export interface SynthesizerOpHandler {
    (context: ContextManager, stepResult: InterpreterStep): void | Promise<void>;
}
export declare class InstructionHandler {
    private parent;
    synthesizerHandlers: Map<number, SynthesizerOpHandler>;
    private cachedOpts;
    constructor(parent: ISynthesizerProvider);
    private _createHandlerOpts;
    private _createSynthesizerHandlers;
    getOriginAddressPt(): DataPt;
    buildStorageProof(address: Address, keyPt: DataPt): Promise<{
        merkleProof: IMTMerkleProof;
        indexPt: DataPt;
        siblingPts: DataPt[][];
    }>;
    getLatestCachedRootPt(refAddress: bigint): DataPt;
    loadStorage(address: Address, keyPt: DataPt, valueGiven?: bigint): Promise<DataPt>;
    storeStorage(address: Address, keyPt: DataPt, symbolDataPt: DataPt): Promise<void>;
    handleArith: (ins: bigint[], out: bigint, opts: HandlerOpts) => void;
    handleBlkInf: (op: SynthesizerSupportedBlkInfOpcodes, inVal: bigint | undefined, out: bigint, opts: HandlerOpts) => void;
    private _getStaticInDataPt;
    private _popStackPtAndCheckInputConsistency;
    handleEnvInf(ins: bigint[], out: bigint | null, opts: HandlerOpts): void;
    handleLoggers(ins: bigint[], out: bigint | null, opts: HandlerOpts): void;
    handleSysFlow(ins: bigint[], out: bigint | null, opts: HandlerOpts): Promise<void>;
    private _prepareCodeMemoryPts;
    private _chunkMemory;
}
//# sourceMappingURL=instructionHandler.d.ts.map