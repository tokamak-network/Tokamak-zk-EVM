import { createVM, runBlock, RunBlockOpts, RunBlockResult, runTx, RunTxOpts, RunTxResult, VM, VMOpts } from '@ethereumjs/vm';
import { DataAliasInfos, MemoryPt, MemoryPts } from '../../pointers/index.ts';
import type {
  ArithmeticOperator,
  DataPt,
  Placements,
  ReservedVariable,
  SubcircuitNames,
  SynthesizerSupportedArithOpcodes,
  SynthesizerSupportedBlkInfOpcodes,
  SynthesizerSupportedOpcodes,
} from '../../types/index.ts';
import type { PlacementEntry, SynthesizerOpts } from '../../types/index.ts';
import { ArithmeticManager, BufferManager, HandlerOpts, InstructionHandlers, ISynthesizerProvider, MemoryManager, StateManager, SynthesizerInterface, SynthesizerOpHandler } from './handlers/index.ts';
import { LegacyTx } from '@ethereumjs/tx';
import { createLegacyTxFromL2Tx } from '@tokamak/utils';
import { Common, CommonOpts, Mainnet, CustomCrypto, Sepolia } from '@ethereumjs/common';
import { BlockData, BlockHeader, BlockOptions, createBlock, createBlockHeader, HeaderData } from '@ethereumjs/block';
import { createAddressFromBigInt } from '@ethereumjs/util';
import { poseidon, TokamakL2Tx } from 'src/tokamak/TokamakL2JS/index.ts';
import { getEddsaPublicKey } from 'src/tokamak/TokamakL2JS/crypto/index.ts';
import { MAX_TX_NUMBER } from 'src/tokamak/constant/constants.ts';
import { createEVM, EVM, EVMInterface, EVMOpts, EVMResult, InterpreterStep, Message } from '@ethereumjs/evm';
import { recoverJubJubPoint } from 'src/tokamak/TokamakL2JS/utils/index.ts';
import { apply } from 'core-js/fn/reflect';

/**
 * The Synthesizer class manages data related to subcircuits.
 * It acts as a facade, delegating tasks to various handler classes.
 */
export class Synthesizer implements SynthesizerInterface
{
  protected _state: StateManager
  protected _arithmeticManager: ArithmeticManager
  protected _memoryManager: MemoryManager
  protected _bufferManager: BufferManager
  protected _instructionHandlers: InstructionHandlers
  public readonly cachedOpts: SynthesizerOpts
  protected _prevInterpreterStep: InterpreterStep | null = null

  // @deprecated
  constructor(opts: SynthesizerOpts) {
    this.cachedOpts = opts
    this._state = new StateManager(this, opts)
    this._bufferManager = new BufferManager(this)
    this._arithmeticManager = new ArithmeticManager(this)
    this._memoryManager = new MemoryManager(this)
    this._instructionHandlers =  new InstructionHandlers(this)
  }

  private _attachSynthesizerToEVM(evm: EVM): void {
    evm.events.on('beforeMessage', (data: Message, resolve?: (result?: any) => void) => {
      this._prevInterpreterStep = null
      this.loadNextTransactionPt()
      resolve?.()
    })
    evm.events.on('step', (data: InterpreterStep, resolve?: (result?: any) => void) => {
      try {
        const currentInterpreterStep = data
        
        this._applySynthesizerHandler(this._prevInterpreterStep, currentInterpreterStep)

        this._prevInterpreterStep = currentInterpreterStep
      } finally {
        resolve?.()
      }
    })
    evm.events.on('afterMessage', (data: EVMResult, resolve?: (result?: any) => void) => {
      try {
        const _runState = data.execResult.runState
        if (_runState === undefined) {
          throw new Error('Failed to capture the final state')
        }
        const _interpreter = data.execResult.runState!.interpreter
        const opcodeInfo = _interpreter.lookupOpInfo(_runState.opCode).opcodeInfo
        const memorySize = 8192n
        let error = undefined
        if (opcodeInfo.code === 0xfd) {
          // If opcode is REVERT, read error data and return in trace
          const [offset, length] = _runState.stack.peek(2)
          error = new Uint8Array(0)
          if (length !== 0n) {
            error = _runState.memory.read(Number(offset), Number(length))
          }
        }
        const currentInterpreterStep: InterpreterStep = {
          pc: _runState.programCounter,
          gasLeft: _interpreter.getGasLeft(),
          gasRefund: _runState.gasRefund,
          opcode: {
            name: opcodeInfo.fullName,
            fee: opcodeInfo.fee,
            dynamicFee: undefined,
            isAsync: opcodeInfo.isAsync,
            code: opcodeInfo.code,
          },
          stack: _runState.stack.getStack(),
          depth: _interpreter._env.depth,
          address: _interpreter._env.address,
          account: _interpreter._env.contract,
          memory: _runState.memory._store.subarray(0, Number(memorySize) * 32),
          memoryWordCount: memorySize,
          codeAddress: _interpreter._env.codeAddress,
          stateManager: _runState.stateManager,
          eofSection: _interpreter._env.eof?.container.header.getSectionFromProgramCounter(
            _runState.programCounter,
          ),
          immediate: undefined,
          error,
          eofFunctionDepth:
            _interpreter._env.eof !== undefined ? _interpreter._env.eof?.eofRunState.returnStack.length + 1 : undefined,
        }

        this._applySynthesizerHandler(this._prevInterpreterStep, currentInterpreterStep)

      } finally {
        resolve?.()
      }
    })
  }

  public async synthesizeTX(): Promise<RunTxResult> {
    const common = this.cachedOpts.signedTransaction.common

    const headerData: HeaderData = {
      parentHash: this.loadReservedVariableFromBuffer('BLOCKHASH_1').value,
      coinbase: createAddressFromBigInt(this.loadReservedVariableFromBuffer('COINBASE').value),
      difficulty: this.loadReservedVariableFromBuffer('PREVRANDAO').value,
      number: this.loadReservedVariableFromBuffer('NUMBER').value,
      gasLimit: this.loadReservedVariableFromBuffer('GASLIMIT').value,
      timestamp: this.loadReservedVariableFromBuffer('TIMESTAMP').value,
      baseFeePerGas: this.loadReservedVariableFromBuffer('BASEFEE').value,
    }
    const blockData: BlockData = {
      header: headerData,
    }
    const blockOpts: BlockOptions = {
      common
    }
    const evmOpts: EVMOpts= {
      common: blockOpts.common,
      stateManager: this.cachedOpts.stateManager,
      profiler: {enabled: true},
    }
    const block = createBlock(blockData, blockOpts)

    const evm = await createEVM(evmOpts)
    this._attachSynthesizerToEVM(evm)
    
    const vmOpts: VMOpts = {
      common,
      stateManager: this.cachedOpts.stateManager,
      evm,
      profilerOpts: {reportAfterTx: true}
    }
    const vm = await createVM(vmOpts)
    const runTxOpts: RunTxOpts = {
      block,
      tx: this.cachedOpts.signedTransaction,
      skipBalance: true,
      skipBlockGasLimitValidation: true,
      skipHardForkValidation: true,
      reportPreimages: true,
    }
    return await runTx(vm, runTxOpts)
  }

  private _applySynthesizerHandler = (prevInterpreterStep: InterpreterStep | null, currentInterpreterStep: InterpreterStep): void => {
    if (prevInterpreterStep) {
      const opcode = prevInterpreterStep?.opcode
      const opHandler = this.synthesizerHandlers.get(opcode.code)
      if (opHandler === undefined) {
        throw new Error(`Undefined synthesizer handler for opcode ${opcode.name}`)
      }
      opHandler.apply(null, [prevInterpreterStep, currentInterpreterStep])
    }

    // This function works if the input opcode is one of the follows: CALL, CALLCODE, DELEGATECALL, STATICCALL
    this._preTasksForCalls(
      currentInterpreterStep.opcode.name as SynthesizerSupportedOpcodes,
      currentInterpreterStep
    )
  }

  public loadNextTransactionPt(): number {
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
    const originAddressPt = this.getOriginAddressPt()
    if (this.state.cachedOrigin === undefined) {
      throw new Error(`Empty sender address`)
    }
    if (originAddressPt.value !== this.state.cachedOrigin.value) {
      throw new Error(`Sender address has not been updated.`)
    }
    return nonce
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

  public get synthesizerHandlers(): Map<number, SynthesizerOpHandler> {
      return this._instructionHandlers.synthesizerHandlers
    }

  get envMemoryPts(): {
    calldataMemroyPts: MemoryPts,
    returnMemoryPts: MemoryPts
  } {
    return {
      calldataMemroyPts: this._memoryManager.envCalldataMemoryPts,
      returnMemoryPts: this._memoryManager.envReturnMemoryPts
    }
  }

  place(name: SubcircuitNames, inPts: DataPt[], outPts: DataPt[], usage: ArithmeticOperator): void {
    this._state.place(name, inPts, outPts, usage)
  }

  async initBuffers(): Promise<void> {
    await this._bufferManager.initBuffers()
  }

  addWireToInBuffer(inPt: DataPt, placementId: number): DataPt {
    return this._bufferManager.addWireToInBuffer(inPt, placementId);
  }

  addWireToOutBuffer(
    inPt: DataPt,
    outPt: DataPt,
    placementId: number,
  ): void {
    this._bufferManager.addWireToOutBuffer(inPt, outPt, placementId)
  }

  loadReservedVariableFromBuffer(
    varName: ReservedVariable, 
    txNonce?: number
  ): DataPt {
    return this._bufferManager.loadReservedVariableFromBuffer(varName, txNonce)
  }

  loadArbitraryStatic(
    value: bigint,
    bitSize?: number,
    desc?: string,
  ): DataPt {
    return this._state.loadArbitraryStatic(value, bitSize, desc)
  }

  loadStorage(key: bigint): DataPt {
    return this._state.loadStorage(key);
  }

  storeStorage(key: bigint, inPt: DataPt): void {
    this._state.storeStorage(key, inPt);
  }

  placeArith(name: ArithmeticOperator, inPts: DataPt[]): DataPt[] {
    return this._arithmeticManager.placeArith(name, inPts);
  }

  placeExp(inPts: DataPt[]): DataPt {
    return this._arithmeticManager.placeExp(inPts)
  }
  placeJubjubExp(inPts: DataPt[], PoI: DataPt[]): DataPt[] {
    return this._arithmeticManager.placeJubjubExp(inPts, PoI)
  }

  placeMemoryToStack(dataAliasInfos: DataAliasInfos): DataPt {
    return this._memoryManager.placeMemoryToStack(dataAliasInfos);
  }
  placeMemoryToMemory(dataAliasInfos: DataAliasInfos): DataPt[] {
    return this._memoryManager.placeMemoryToMemory(dataAliasInfos);
  }
  placeMSTORE(dataPt: DataPt, truncBitSize: number): DataPt {
    return this._memoryManager.placeMSTORE(dataPt, truncBitSize);
  }
  copyMemoryPts(
    target: MemoryPts,
    srcOffset: bigint,
    length: bigint,
    dstOffset?: bigint,
  ): MemoryPts {
    return this._memoryManager.copyMemoryPts(target, srcOffset, length, dstOffset)
  }

  getOriginAddressPt(): DataPt {
    return this._instructionHandlers.getOriginAddressPt()
  }

  private _preTasksForCalls(op: SynthesizerSupportedOpcodes, prevStepResult: InterpreterStep): void {
    return this._instructionHandlers.preTasksForCalls(op, prevStepResult)
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
