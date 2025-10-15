import { createVM, VMOpts } from '@ethereumjs/vm';
import { DataAliasInfos, MemoryPt, MemoryPts } from '../../pointers/index.js';
import type {
  ArithmeticOperator,
  DataPt,
  Placements,
  ReservedVariable,
  SubcircuitNames,
  SynthesizerSupportedArithOpcodes,
  SynthesizerSupportedBlkInfOpcodes,
  SynthesizerSupportedOpcodes,
} from '../../types/index.js';
import type { PlacementEntry, SynthesizerOpts } from '../../types/index.ts';
import { ArithmeticManager, BufferManager, HandlerOpts, InstructionHandlers, ISynthesizerProvider, MemoryManager, StateManager } from './handlers/index.ts';
import { LegacyTx } from '@ethereumjs/tx';
import { createLegacyTxFromL2Tx } from '@tokamak/utils';
import { Common, CommonOpts, Mainnet } from '@ethereumjs/common';
import { customCrypto } from 'src/tokamak/VMExtension/index.ts';
import { BlockHeader, HeaderData } from '@ethereumjs/block';
import { createAddressFromBigInt } from '@ethereumjs/util';

/**
 * The Synthesizer class manages data related to subcircuits.
 * It acts as a facade, delegating tasks to various handler classes.
 */
export class Synthesizer
  implements ISynthesizerProvider
{
  private _state: StateManager
  private _arithmeticManager: ArithmeticManager
  private _memoryManager: MemoryManager
  private _bufferManager: BufferManager
  private _instructionHandlers: InstructionHandlers
  private _synthesizerOpts: SynthesizerOpts
  
  constructor(opts: SynthesizerOpts) {
    this._synthesizerOpts = opts
    this._state = new StateManager(this, this._synthesizerOpts)
    this._bufferManager = new BufferManager(this, this._synthesizerOpts)
    this._arithmeticManager = new ArithmeticManager(this)
    this._memoryManager = new MemoryManager(this)
    this._instructionHandlers =  new InstructionHandlers(this)
    
  }

  public synthesizeTransactions(
    synthesizerOpts: SynthesizerOpts, 
  ): void {
    const commonOpts: CommonOpts = {
      chain: {
        ...Mainnet, 
        chainId: Number(this.loadReservedVariableFromBuffer('CHAINID').value)
      },
      customCrypto: new customCrypto()
    }
    const blockOpts: HeaderData = {
      parentHash: this.loadReservedVariableFromBuffer('BLOCKHASH_1').value,
      coinbase: createAddressFromBigInt(this.loadReservedVariableFromBuffer('COINBASE').value),
      difficulty: this.loadReservedVariableFromBuffer('PREVRANDAO').value,
      number: this.loadReservedVariableFromBuffer('NUMBER').value,
      gasLimit: this.loadReservedVariableFromBuffer('GASLIMIT').value,
      timestamp: this.loadReservedVariableFromBuffer('TIMESTAMP').value,
      baseFeePerGas: this.loadReservedVariableFromBuffer('BASEFEE').value,
    }
    const vmOpts: VMOpts = {
      common: new Common(commonOpts)
    }
    const vm = createVM(vmOpts)
    
  }

  public loadTransaction(): void {
    const nonce = this._state.txNonce++
    this._state.callMemoryPtsStack = []
    const selectorPt = this.loadReservedVariableFromBuffer('FUNCTION_SELECTOR', nonce)
    const inPts: DataPt[] = Array.from({ length: 9 }, (_, i) =>
      this.loadReservedVariableFromBuffer(`TRANSACTION_INPUT${i}` as ReservedVariable, nonce)
    )
    this._state.callMemoryPtsStack[0] = [
      { memByteOffset: 0, containerByteSize: 4, dataPt: selectorPt },
      ...inPts.map((dataPt, i) => ({
        memByteOffset: 4 + 32 * i,
        containerByteSize: 32,
        dataPt,
      })),
    ]
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
    return this._bufferManager.loadReservedVariableFromBuffer(varName, txNonce)
  }

  public loadArbitraryStatic(
    value: bigint,
    bitSize?: number,
    desc?: string,
  ): DataPt {
    return this._state.loadArbitraryStatic(value, bitSize, desc)
  }

  public loadStorage(key: bigint): DataPt {
    return this._state.loadStorage(key);
  }

  public storeStorage(key: bigint, inPt: DataPt): void {
    this._state.storeStorage(key, inPt);
  }

  public placeArith(name: ArithmeticOperator, inPts: DataPt[]): DataPt[] {
    return this._arithmeticManager.placeArith(name, inPts);
  }

  public placeExp(inPts: DataPt[]): DataPt {
    return this._arithmeticManager.placeExp(inPts)
  }
  public placeJubjubExp(inPts: DataPt[], PoI: DataPt[]): DataPt[] {
    return this._arithmeticManager.placeJubjubExp(inPts, PoI)
  }

  public placeMemoryToStack(dataAliasInfos: DataAliasInfos): DataPt {
    return this._memoryManager.placeMemoryToStack(dataAliasInfos);
  }
  public placeMemoryToMemory(dataAliasInfos: DataAliasInfos): DataPt[] {
    return this._memoryManager.placeMemoryToMemory(dataAliasInfos);
  }
  public placeMSTORE(dataPt: DataPt, truncBitSize: number): DataPt {
    return this._memoryManager.placeMSTORE(dataPt, truncBitSize);
  }
  public copyMemoryPts(
    target: MemoryPts,
    srcOffset: bigint,
    length: bigint,
    dstOffset?: bigint,
  ): MemoryPts {
    return this._memoryManager.copyMemoryPts(target, srcOffset, length, dstOffset)
  }

  public handleArith(
      op: SynthesizerSupportedArithOpcodes,
      ins: bigint[],
      out: bigint,
    ): void {
      return this._instructionHandlers.handleArith(op, ins, out)
    }
  public handleBlkInf (
    op: SynthesizerSupportedBlkInfOpcodes,
    output: bigint,
    target?: bigint,
  ): void {
    return this._instructionHandlers.handleBlkInf(op, output, target)
  }
  public handleEnvInf(
    ins: bigint[],
    out: bigint,
    opts: HandlerOpts,
  ): void {
    return this._instructionHandlers.handleEnvInf(ins, out, opts)
  }

  public handleSysFlow(
    ins: bigint[],
    out: bigint,
    opts: HandlerOpts,
  ): void {
    return this._instructionHandlers.handleSysFlow(ins, out, opts)
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
