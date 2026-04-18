import { RunTxResult } from '@ethereumjs/vm';
import { TokamakL2StateManager, TokamakL2Tx } from 'tokamak-l2js';
import { StateManager } from '../handlers/index.ts';
import { DataAliasInfos, DataPt, MemoryPts, Placements, ReservedVariable } from './index.ts';
import { SynthesizerOpHandler } from '../handlers/instructionHandler.ts';
import { ArithmeticOperator, SubcircuitNames } from '../../interface/qapCompiler/configuredTypes.ts';
import type { ResolvedSubcircuitLibrary } from '../../interface/qapCompiler/libraryTypes.ts';
import { SynthesizerBlockInfo } from 'src/interface/rpc/types.ts';
export interface SynthesizerOpts {
    signedTransaction: TokamakL2Tx;
    blockInfo: SynthesizerBlockInfo;
    stateManager: TokamakL2StateManager;
}
export interface SynthesizerStepLogEntry {
    stack: string[];
    pc: number;
    opcode: string;
    keccak256Input?: string[];
}
export interface SynthesizerInterface {
    get state(): StateManager;
    get placements(): Placements;
    get stepLogs(): SynthesizerStepLogEntry[];
    get messageCodeAddresses(): Set<`0x${string}`>;
    readonly subcircuitLibrary: ResolvedSubcircuitLibrary;
    synthesizeTX(): Promise<RunTxResult>;
    cachedOpts: SynthesizerOpts;
}
export interface ISynthesizerProvider extends SynthesizerInterface {
    place(name: SubcircuitNames, inPts: DataPt[], outPts: DataPt[], usage: string): void;
    loadArbitraryStatic(value: bigint, bitSize?: number, desc?: string): DataPt;
    getReservedVariableFromBuffer(varName: ReservedVariable): DataPt;
    addWirePairToBufferIn(inPt: DataPt, outPt: DataPt, dynamic?: boolean): DataPt;
    addReservedVariableToBufferIn(varName: ReservedVariable, value?: bigint, dynamic?: boolean, message?: string): DataPt;
    addReservedVariableToBufferOut(varName: ReservedVariable, symbolDataPt: DataPt, dynamic?: boolean, message?: string): DataPt;
    placeArith(name: ArithmeticOperator, inPts: DataPt[]): DataPt[];
    placeExp(inPts: DataPt[], reference?: bigint): DataPt;
    placeJubjubExp(inPts: DataPt[], PoI: DataPt[], reference?: bigint): DataPt[];
    placePoseidon(inPts: DataPt[]): DataPt;
    placeMerkleProofVerification(indexPt: DataPt, leafPt: DataPt, siblingPts: DataPt[][], rootPt: DataPt): void;
    placeMemoryToMemory(dataAliasInfos: DataAliasInfos): DataPt[];
    placeMemoryToStack(dataAliasInfos: DataAliasInfos): DataPt;
    placeMSTORE(dataPt: DataPt, truncBitSize: number): DataPt;
    copyMemoryPts(target: MemoryPts, srcOffset: bigint, length: bigint, dstOffset?: bigint): MemoryPts;
    get synthesizerHandlers(): Map<number, SynthesizerOpHandler>;
}
//# sourceMappingURL=synthesizer.d.ts.map