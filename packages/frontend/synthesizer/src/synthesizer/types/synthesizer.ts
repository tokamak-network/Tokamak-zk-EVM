import { LegacyTx } from '@ethereumjs/tx';
import { InterpreterStep } from '@ethereumjs/evm';
import { RunTxResult } from '@ethereumjs/vm';
import { TokamakL2StateManager, TokamakL2Tx } from 'src/TokamakL2JS/index.ts';
import { StateManager } from '../handlers/index.ts';
import { DataAliasInfos, DataPt, MemoryPts, Placements, ReservedVariable } from './index.ts';
import { SynthesizerOpHandler } from '../handlers/instructionHandler.ts';
import { ArithmeticOperator, SubcircuitNames } from 'src/interface/qapCompiler/configuredTypes.ts';

export type SynthesizerBlockInfo = {
  coinBase: bigint,
  timeStamp: bigint,
  blockNumber: bigint,
  prevRanDao: bigint,
  gasLimit: bigint,
  chainId: bigint,
  selfBalance: bigint,
  baseFee: bigint | undefined,
  blockHashes: bigint[],
}

export interface SynthesizerOpts {
  signedTransaction: TokamakL2Tx
  blockInfo: SynthesizerBlockInfo
  stateManager: TokamakL2StateManager
}

export interface SynthesizerInterface {
  get state(): StateManager
  get placements(): Placements
  synthesizeTX(): Promise<RunTxResult>
}

export interface ISynthesizerProvider extends SynthesizerInterface {
  cachedOpts: SynthesizerOpts,
  // from StateManager
  place(
    name: SubcircuitNames,
    inPts: DataPt[],
    outPts: DataPt[],
    usage: string,
  ): void;
  loadStorage(key: bigint, value?: bigint): Promise<DataPt>
  // storeStorage(key: bigint, inPt: DataPt): void
  //from BufferManager
  loadArbitraryStatic(value: bigint, bitSize?: number, desc?: string): DataPt
  getReservedVariableFromBuffer(varName: ReservedVariable): DataPt
  addWirePairToBufferIn(inPt: DataPt, outPt: DataPt, dynamic?: boolean): DataPt
  addReservedVariableToBufferIn(varName: ReservedVariable, value?: bigint, dynamic?: boolean, message?: string): DataPt
  addReservedVariableToBufferOut(varName: ReservedVariable, symbolDataPt: DataPt, dynamic?: boolean, message?: string): DataPt
  //from ArithmeticHandler
  placeArith(name: ArithmeticOperator, inPts: DataPt[]): DataPt[];
  placeExp(inPts: DataPt[], reference?: bigint): DataPt
  placeJubjubExp(inPts: DataPt[], PoI: DataPt[], reference?: bigint): DataPt[]
  placePoseidon(inPts: DataPt[]): DataPt
  //from memoryManager
  placeMemoryToMemory(dataAliasInfos: DataAliasInfos): DataPt[]
  placeMemoryToStack(dataAliasInfos: DataAliasInfos): DataPt
  placeMSTORE(dataPt: DataPt, truncBitSize: number): DataPt
  copyMemoryPts(target: MemoryPts, srcOffset: bigint, length: bigint, dstOffset?: bigint): MemoryPts
  //from instructionHandler
  get synthesizerHandlers(): Map<number, SynthesizerOpHandler>
}