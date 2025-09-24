import { DataAliasInfos, MemoryPts } from '../../pointers/index.js';
import type {
  ArithmeticOperator,
  DataPt,
  Placements,
  ReservedVariable,
  SubcircuitNames,
  SynthesizerSupportedOpcodes,
} from '../../types/index.js';
import type { PlacementEntry, SynthesizerOpts } from '../../types/index.ts';
import { ArithmeticHandler, BufferManager, DataLoader, EnvInfHandlerOpts, InstructionHandlers, ISynthesizerProvider, MemoryManager, StateManager } from '../handlers/index.ts';
import { LegacyTx } from '@ethereumjs/tx';
import { createLegacyTxFromL2Tx } from '@tokamak/utils';

/**
 * The Synthesizer class manages data related to subcircuits.
 * It acts as a facade, delegating tasks to various handler classes.
 */
export class Synthesizer
  implements ISynthesizerProvider
{
  private _state: StateManager;
  private _arithmeticHandler: ArithmeticHandler;
  private _dataLoader: DataLoader;
  private _memoryManager: MemoryManager;
  private _bufferManager: BufferManager;
  private _instructionHandlers: InstructionHandlers
  
  constructor(opts: SynthesizerOpts) {
    this._state = new StateManager(opts)
    this._bufferManager = new BufferManager(this, opts)
    this._dataLoader = new DataLoader(this, opts)
    this._arithmeticHandler = new ArithmeticHandler(this)
    this._memoryManager = new MemoryManager(this)
    this._instructionHandlers =  new InstructionHandlers(this)
  }

  public get state(): StateManager {
    return this._state;
  }

  public get placementIndex(): number {
    return this._state.placementIndex
  }
  
  public get placements(): Placements {
    return this._state.placements
  }

  public get transactions(): LegacyTx[] {
    return this._dataLoader.transactions
  }

  get envMemoryPts(): {
    calldataMemroyPts: MemoryPts,
    returnMemoryPts: MemoryPts
  } {
    return {
      calldataMemroyPts: this._memoryManager.envCalldataMemorypts,
      returnMemoryPts: this._memoryManager.envReturnMemorypts
    }
  }

  public place(name: SubcircuitNames, inPts: DataPt[], outPts: DataPt[], usage: ArithmeticOperator): void {
    this._state.place(name, inPts, outPts, usage)
  }

  public addWireToInBuffer(inPt: DataPt, placementId: number): DataPt {
    return this._bufferManager.addWireToInBuffer(inPt, placementId);
  }

  public addWireToOutBuffer(
    inPt: DataPt,
    outPt: DataPt,
    placementId: number,
  ): void {
    this._bufferManager.addWireToOutBuffer(inPt, outPt, placementId)
  }

  public loadReservedVariableFromBuffer(
    varName: ReservedVariable, 
    txNonce?: number
  ): DataPt {
    return this._dataLoader.loadReservedVariableFromBuffer(varName, txNonce)
  }

  public loadArbitraryStatic(
    value: bigint,
    size?: number,
    desc?: string,
  ): DataPt {
    return this._dataLoader.loadArbitraryStatic(value, size, desc)
  }

  public loadStorage(key: bigint): DataPt {
    return this._dataLoader.loadStorage(key);
  }

  public storeStorage(key: bigint, inPt: DataPt): void {
    this._dataLoader.storeStorage(key, inPt);
  }

  public placeArith(name: ArithmeticOperator, inPts: DataPt[]): DataPt[] {
    return this._arithmeticHandler.placeArith(name, inPts);
  }

  public placeExp(inPts: DataPt[]): DataPt {
    return this._arithmeticHandler.placeExp(inPts)
  }
  public placeJubjubExp(inPts: DataPt[], PoI: DataPt[]): DataPt[] {
    return this._arithmeticHandler.placeJubjubExp(inPts, PoI)
  }

  public placeMemoryToStack(dataAliasInfos: DataAliasInfos): DataPt {
    return this._memoryManager.placeMemoryToStack(dataAliasInfos);
  }

  public placeMemoryToMemory(dataAliasInfos: DataAliasInfos): DataPt[] {
    return this._memoryManager.placeMemoryToMemory(dataAliasInfos);
  }

  public placeMSTORE(dataPt: DataPt, truncSize: number): DataPt {
    return this._memoryManager.placeMSTORE(dataPt, truncSize);
  }

  public handleArith(
      op: SynthesizerSupportedOpcodes,
      ins: bigint[],
      out: bigint,
    ): void {
      return this._instructionHandlers.handleArith(op, ins, out)
    }
  public handleBlkInf (
    op: SynthesizerSupportedOpcodes,
    output: bigint,
    target?: bigint,
  ): void {
    return this._instructionHandlers.handleBlkInf(op, output, target)
  }
  public handleEnvInf(
    output: bigint,
    opts: EnvInfHandlerOpts,
  ): void {
    return this._instructionHandlers.handleEnvInf(output, opts)
  }

  // public loadPUSH(
  //   codeAddress: string,
  //   programCounter: number,
  //   value: bigint,
  //   size: number,
  // ): DataPt {
  //   return this.dataLoader.loadPUSH(codeAddress, programCounter, value, size);
  // }

  // public storeLog(valPts: DataPt[], topicPts: DataPt[]): void {
  //   this.dataLoader.storeLog(valPts, topicPts);
  // }

  // public loadBlkInf(blkNumber: bigint, type: string, value: bigint): DataPt {
  //   return this.dataLoader.loadBlkInf(blkNumber, type, value);
  // }

  // public loadAndStoreKeccak(
  //   inPts: DataPt[],
  //   outValue: bigint,
  //   length: bigint,
  // ): DataPt {
  //   return this.dataLoader.loadAndStoreKeccak(inPts, outValue, length);
  // }

  

  

  

  // public adjustMemoryPts(
  //   dataPts: DataPt[],
  //   memoryPts: MemoryPts,
  //   srcOffset: number,
  //   dstOffset: number,
  //   viewLength: number,
  // ): void {
  //   this.memoryManager.adjustMemoryPts(
  //     dataPts,
  //     memoryPts,
  //     srcOffset,
  //     dstOffset,
  //     viewLength,
  //   );
  // }

  
}
