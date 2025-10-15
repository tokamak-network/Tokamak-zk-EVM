import { LegacyTx } from '@ethereumjs/tx';
import type { ArithmeticOperator } from '../../../types/arithmetic.ts';
import type { DataPt, Placements, ReservedVariable, SubcircuitNames, SynthesizerSupportedOpcodes } from '../../../types/index.ts';
import { StateManager } from './stateManager.ts';
import { DataAliasInfos, MemoryPts } from 'src/tokamak/pointers/memoryPt.ts';
import { HandlerOpts } from './instructionHandlers.ts';

export interface ISynthesizerProvider {
  // from StateManager
  get state(): StateManager
  get placementIndex(): number
  get placements(): Placements
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
  loadArbitraryStatic(value: bigint, bitSize?: number, desc?: string): DataPt
  loadStorage(key: bigint): DataPt
  storeStorage(key: bigint, inPt: DataPt): void
  //from ArithmeticHandler
  placeArith(name: ArithmeticOperator, inPts: DataPt[]): DataPt[];
  placeExp(inPts: DataPt[]): DataPt
  placeJubjubExp(inPts: DataPt[], PoI: DataPt[]): DataPt[]
  //from memoryManager
  placeMemoryToMemory(dataAliasInfos: DataAliasInfos): DataPt[]
  placeMemoryToStack(dataAliasInfos: DataAliasInfos): DataPt
  placeMSTORE(dataPt: DataPt, truncBitSize: number): DataPt
  copyMemoryPts(target: MemoryPts, srcOffset: bigint, length: bigint, dstOffset?: bigint): MemoryPts
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
    ins: bigint[],
    out: bigint,
    opts: HandlerOpts,
  ): void
  handleSysFlow(
    ins: bigint[],
    out: bigint,
    opts: HandlerOpts,
  ): void
}
