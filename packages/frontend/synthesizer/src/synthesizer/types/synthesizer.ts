import { LegacyTx } from '@ethereumjs/tx';
import { InterpreterStep } from '@ethereumjs/evm';
import { RunTxResult } from '@ethereumjs/vm';
import { TokamakL2StateManager, TokamakL2Tx } from 'tokamak-l2js';
import { StateManager } from '../handlers/index.ts';
import { DataAliasInfos, DataPt, MemoryPts, Placements, ReservedVariable } from './index.ts';
import { SynthesizerOpHandler } from '../handlers/instructionHandler.ts';
import { ArithmeticOperator, SubcircuitNames } from '../../interface/qapCompiler/configuredTypes.ts';

export type SynthesizerBlockInfo = {
  coinBase: `0x${string}`,
  timeStamp: `0x${string}`,
  blockNumber: `0x${string}`,
  prevRanDao: `0x${string}`,
  gasLimit: `0x${string}`,
  chainId: `0x${string}`,
  selfBalance: `0x${string}`,
  baseFee: `0x${string}`,
  blockHashes: `0x${string}`[],
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
  cachedOpts: SynthesizerOpts
}

export interface ISynthesizerProvider extends SynthesizerInterface {
  // from StateManager
  place(
    name: SubcircuitNames,
    inPts: DataPt[],
    outPts: DataPt[],
    usage: string,
  ): void;
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
  placeMerkleProofVerification(indexPt: DataPt, leafPt: DataPt, siblings: bigint[][], rootPt: DataPt): void
  //from memoryManager
  placeMemoryToMemory(dataAliasInfos: DataAliasInfos): DataPt[]
  placeMemoryToStack(dataAliasInfos: DataAliasInfos): DataPt
  placeMSTORE(dataPt: DataPt, truncBitSize: number): DataPt
  copyMemoryPts(target: MemoryPts, srcOffset: bigint, length: bigint, dstOffset?: bigint): MemoryPts
  //from instructionHandler
  get synthesizerHandlers(): Map<number, SynthesizerOpHandler>
}