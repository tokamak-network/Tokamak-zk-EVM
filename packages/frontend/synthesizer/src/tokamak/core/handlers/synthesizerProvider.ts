import { LegacyTx } from '@ethereumjs/tx';
import type { ArithmeticOperator } from '../../types/arithmetic.js';
import type { DataPt, Placements, ReservedVariable, SubcircuitNames, SynthesizerSupportedOpcodes } from '../../types/index.js';
import { StateManager } from './stateManager.ts';
import { DataAliasInfos, MemoryPts } from 'src/tokamak/pointers/memoryPt.ts';
import { EnvInfHandlerOpts } from './instructionHandlers.ts';

export interface ISynthesizerProvider {
  // from StateManager
  get state(): StateManager
  get placementIndex(): number
  get placements(): Placements
  get transactions(): LegacyTx[]
  get envMemoryPts(): {
    calldataMemroyPts: MemoryPts,
    returnMemoryPts: MemoryPts
  }
  place(
    name: SubcircuitNames,
    inPts: DataPt[],
    outPts: DataPt[],
    usage: ArithmeticOperator,
  ): void;
  //from BufferManager
  addWireToInBuffer(inPt: DataPt, placementId: number): DataPt
  addWireToOutBuffer(inPt: DataPt, outPt: DataPt, placementId: number): void
  //from DataLoader
  loadReservedVariableFromBuffer(varName: ReservedVariable, txNonce?: number): DataPt
  loadArbitraryStatic(value: bigint, size?: number, desc?: string): DataPt
  loadStorage(key: bigint): DataPt
  storeStorage(key: bigint, inPt: DataPt): void
  //from ArithmeticHandler
  placeArith(name: ArithmeticOperator, inPts: DataPt[]): DataPt[];
  placeExp(inPts: DataPt[]): DataPt
  placeJubjubExp(inPts: DataPt[], PoI: DataPt[]): DataPt[]
  //from memoryManager
  placeMemoryToMemory(dataAliasInfos: DataAliasInfos): DataPt[]
  placeMemoryToStack(dataAliasInfos: DataAliasInfos): DataPt
  placeMSTORE(dataPt: DataPt, truncSize: number): DataPt
  //from instructionHandler
  handleArith(
      op: SynthesizerSupportedOpcodes,
      ins: bigint[],
      out: bigint,
    ): void
  handleBlkInf (
    op: SynthesizerSupportedOpcodes,
    output: bigint,
    target?: bigint,
  ): void
  handleEnvInf(
    output: bigint,
    opts: EnvInfHandlerOpts,
  ): void
}
