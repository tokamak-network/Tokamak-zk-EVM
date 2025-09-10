import { DataAliasInfos, MemoryPts } from '../../pointers/index.js';
import type {
  ArithmeticOperator,
  DataPt,
  Placements,
  ReservedVariable,
  SubcircuitNames,
} from '../../types/index.js';
import type { PlacementEntry, SynthesizerOpts } from '../../types/index.ts';
import { ArithmeticHandler, BufferManager, DataLoader, ISynthesizerProvider, MemoryManager, StateManager } from '../handlers/index.ts';
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
  private _transactions: LegacyTx[];
  private arithmeticHandler: ArithmeticHandler;
  private dataLoader: DataLoader;
  private memoryManager: MemoryManager;
  private bufferManager: BufferManager;
  
  constructor(opts: SynthesizerOpts) {
    this._state = new StateManager(opts)
    this.bufferManager = new BufferManager(this, opts)
    this.dataLoader = new DataLoader(this)
    this.arithmeticHandler = new ArithmeticHandler(this)
    this.memoryManager = new MemoryManager(this)
    
    this._transactions = Array.from(opts.transactions, l2TxData => createLegacyTxFromL2Tx(l2TxData))
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
    return this._transactions
  }

  public place(name: SubcircuitNames, inPts: DataPt[], outPts: DataPt[], usage: ArithmeticOperator): void {
    this._state.place(name, inPts, outPts, usage)
  }

  public addWireToInBuffer(inPt: DataPt, placementId: number): DataPt {
    return this.bufferManager.addWireToInBuffer(inPt, placementId);
  }

  public addWireToOutBuffer(
    inPt: DataPt,
    outPt: DataPt,
    placementId: number,
  ): void {
    this.bufferManager.addWireToOutBuffer(inPt, outPt, placementId)
  }

  public readReservedVariableFromInputBuffer(
    varName: ReservedVariable, 
    txNonce?: number
  ): DataPt {
    return this.bufferManager.readReservedVariableFromInputBuffer(varName, txNonce)
  }

  public loadArbitraryStatic(
    value: bigint,
    size?: number,
    desc?: string,
  ): DataPt {
    return this.dataLoader.loadArbitraryStatic(value, size, desc)
  }

  public placeArith(name: ArithmeticOperator, inPts: DataPt[]): DataPt[] {
    return this.arithmeticHandler.placeArith(name, inPts);
  }

  public loadPUSH(
    codeAddress: string,
    programCounter: number,
    value: bigint,
    size: number,
  ): DataPt {
    return this.dataLoader.loadPUSH(codeAddress, programCounter, value, size);
  }

  public loadStorage(codeAddress: string, key: bigint, value: bigint): DataPt {
    return this.dataLoader.loadStorage(codeAddress, key, value);
  }

  public storeStorage(codeAddress: string, key: bigint, inPt: DataPt): void {
    this.dataLoader.storeStorage(codeAddress, key, inPt);
  }

  public storeLog(valPts: DataPt[], topicPts: DataPt[]): void {
    this.dataLoader.storeLog(valPts, topicPts);
  }

  public loadBlkInf(blkNumber: bigint, type: string, value: bigint): DataPt {
    return this.dataLoader.loadBlkInf(blkNumber, type, value);
  }

  public loadAndStoreKeccak(
    inPts: DataPt[],
    outValue: bigint,
    length: bigint,
  ): DataPt {
    return this.dataLoader.loadAndStoreKeccak(inPts, outValue, length);
  }

  public placeMSTORE(dataPt: DataPt, truncSize: number): DataPt {
    return this.memoryManager.placeMSTORE(dataPt, truncSize);
  }

  public placeMemoryToStack(dataAliasInfos: DataAliasInfos): DataPt {
    return this.memoryManager.placeMemoryToStack(dataAliasInfos);
  }

  public placeMemoryToMemory(dataAliasInfos: DataAliasInfos): DataPt[] {
    return this.memoryManager.placeMemoryToMemory(dataAliasInfos);
  }

  

  public adjustMemoryPts(
    dataPts: DataPt[],
    memoryPts: MemoryPts,
    srcOffset: number,
    dstOffset: number,
    viewLength: number,
  ): void {
    this.memoryManager.adjustMemoryPts(
      dataPts,
      memoryPts,
      srcOffset,
      dstOffset,
      viewLength,
    );
  }

  
}
