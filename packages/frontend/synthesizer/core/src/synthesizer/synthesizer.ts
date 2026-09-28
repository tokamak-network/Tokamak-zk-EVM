import { createVM, runTx, RunTxOpts, RunTxResult, VM, VMOpts } from '@ethereumjs/vm';

import { BlockData, BlockOptions, createBlock, HeaderData } from '@ethereumjs/block';
import {
  bigIntToBytes,
  bigIntToHex,
  bytesToBigInt,
  bytesToHex,
  createAddressFromBigInt,
  hexToBigInt,
  setLengthLeft,
  toBytes,
} from '@ethereumjs/util';

import { EVMResult, InterpreterStep } from '@ethereumjs/evm';
import {
  Placements,
  type ReservedVariable,
  SynthesizerInterface,
  SynthesizerOpts,
  SynthesizerStepLogEntry,
} from './types/index.ts';
import {
  ContextManager,
  createMemoryEntriesFromCopyResult,
  InstructionHandler,
  PlacementManager,
} from './runtime/index.ts';
import type { ResolvedSubcircuitLibrary } from '../subcircuit/libraryTypes.ts';
import { TypedTransaction } from '@ethereumjs/tx';

/**
 * The Synthesizer class manages data related to subcircuits.
 * It acts as a facade, delegating tasks to various handler classes.
 */
export class Synthesizer implements SynthesizerInterface
{
  private _contextManager: ContextManager
  private _placementManager: PlacementManager
  protected _instructionHandlers: InstructionHandler
  private readonly _cachedOpts: SynthesizerOpts
  public readonly subcircuitLibrary: ResolvedSubcircuitLibrary
  private _eventHandlerError: unknown
  private _hasEventHandlerError: boolean
  private _stepLogs: SynthesizerStepLogEntry[]

  constructor(opts: SynthesizerOpts, subcircuitLibrary: ResolvedSubcircuitLibrary) {
    this._cachedOpts = opts
    this.subcircuitLibrary = subcircuitLibrary
    this._placementManager = new PlacementManager(
      this.subcircuitLibrary,
      this._resolveReservedInputValues(),
    )
    this._contextManager = new ContextManager(this._placementManager)
    this._instructionHandlers = new InstructionHandler(
      this._contextManager,
      this._placementManager,
      this.subcircuitLibrary,
      this._cachedOpts,
    )
    this._eventHandlerError = undefined
    this._hasEventHandlerError = false
    this._stepLogs = []
  }

  private _resolveReservedInputValues(): ReadonlyMap<ReservedVariable, bigint> {
    const values = new Map<ReservedVariable, bigint>()
    const { blockInfo, signedTransaction } = this._cachedOpts
    const senderPublicKey = signedTransaction.getUnsafeEddsaPubKey().toAffine()
    const randomizer = signedTransaction.r === undefined
      ? undefined
      : signedTransaction.getUnsafeEddsaRandomizer()?.toAffine()

    values.set('EDDSA_PUBLIC_KEY_X', senderPublicKey.x)
    values.set('EDDSA_PUBLIC_KEY_Y', senderPublicKey.y)
    values.set('EDDSA_RANDOMIZER_X', randomizer?.x ?? 0n)
    values.set('EDDSA_RANDOMIZER_Y', randomizer?.y ?? 0n)
    values.set('EDDSA_SIGNATURE', signedTransaction.s ?? 0n)
    values.set('CONTRACT_ADDRESS', bytesToBigInt(toBytes(signedTransaction.to)))
    values.set('FUNCTION_SELECTOR', bytesToBigInt(signedTransaction.getFunctionSelector()))
    values.set('CHANNEL_TX_INDEX', signedTransaction.channelTransactionIndex)
    for (const [inputIndex, variable] of this.subcircuitLibrary.transactionInputVariables.entries()) {
      values.set(variable, bytesToBigInt(signedTransaction.getFunctionInput(inputIndex)))
    }

    values.set('COINBASE', hexToBigInt(blockInfo.coinBase))
    values.set('TIMESTAMP', hexToBigInt(blockInfo.timeStamp))
    values.set('NUMBER', hexToBigInt(blockInfo.blockNumber))
    values.set('PREVRANDAO', hexToBigInt(blockInfo.prevRanDao))
    values.set('GASLIMIT', hexToBigInt(blockInfo.gasLimit))
    values.set('CHAINID', hexToBigInt(blockInfo.chainId))
    values.set('SELFBALANCE', hexToBigInt(blockInfo.selfBalance))
    values.set('BASEFEE', hexToBigInt(blockInfo.baseFee))
    for (let i = 1; i <= this.subcircuitLibrary.numberOfPrevBlockHashes; i++) {
      values.set(
        `BLOCKHASH_${i}` as ReservedVariable,
        hexToBigInt(blockInfo.prevBlockHashes[i - 1]),
      )
    }
    return values
  }

  private _recordEventHandlerError(handlerName: string, err: unknown): void {
    if (!this._hasEventHandlerError) {
      this._eventHandlerError = err
      this._hasEventHandlerError = true
    }
    console.error(`Synthesizer: ${handlerName} error:`, err)
  }

  private _executeVMEvent(
    handlerName: string,
    resolve: ((result?: any) => void) | undefined,
    execute: () => Promise<void> | void,
  ): void {
    let result: Promise<void> | void
    try {
      result = this._hasEventHandlerError ? undefined : execute()
    } catch (err) {
      this._recordEventHandlerError(handlerName, err)
      resolve?.()
      return
    }

    if (result === undefined) {
      resolve?.()
      return
    }
    void result
      .catch((err) => this._recordEventHandlerError(handlerName, err))
      .finally(() => resolve?.())
  }

  private _attachSynthesizerToVM(vm: VM): void {
    if (vm.evm.events === undefined ) {
      throw new Error("EVM event emitter is turned off.")
    }
    vm.events.on('beforeTx', (_data: TypedTransaction, resolve?: (result?: any) => void) => {
      this._executeVMEvent('beforeTx', resolve, async () => {
        await this._prepareSynthesizeTransaction()
        // TODO: BLOCKHASH preparation in state manager for EIP-7709
      })
    });
    vm.evm.events.on('beforeMessage', (data, resolve?: (result?: any) => void) => {
      this._executeVMEvent('beforeMessage', resolve, () => {
        if (data.depth === 0) {
          this._contextManager.initializeMessageContext(data)
          return
        }
        const memoryCopyPlan = this._contextManager.prepareChildCallData(data)
        const callDataPts = this._placementManager.placeComposition(
          'MemoryView',
          memoryCopyPlan.memoryViewOperands,
        )
        this._contextManager.initializeMessageContext(
          data,
          createMemoryEntriesFromCopyResult(memoryCopyPlan, callDataPts),
        )
      })
    });
    vm.evm.events!.on('step', (data: InterpreterStep, resolve?: (result?: any) => void) => {
      this._executeVMEvent('step', resolve, () => this._applySynthesizerHandler(data))
    })
    vm.evm.events.on('afterMessage', (data: EVMResult, resolve?: (result?: any) => void) => {
      this._executeVMEvent('afterMessage', resolve, async () => {
          const _runState = data.execResult.runState
          if (_runState === undefined) {
            throw new Error('Failed to capture the final state')
          }
          const _interpreter = _runState.interpreter
          const opcodeInfo = _interpreter.lookupOpInfo(_runState.opCode).opcodeInfo
          const memorySize = 8192n
          let error = undefined
          if (opcodeInfo.code === 0xfd) {
            error = data.execResult.returnValue
          }
          const stepData: InterpreterStep = {
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
            stack: _runState.stack.getStack().slice(),
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
          await this._applySynthesizerHandler(stepData);
          this._contextManager.returnMessageCall(stepData.depth);
          this._contextManager.completeFrame(
            stepData.depth,
            data.execResult.exceptionError === undefined,
          )
      })
    })

  }

  private async _prepareSynthesizeTransaction(): Promise<void> {
    this._contextManager.resetTransactionTracking()
    const transactionInputPts = this.subcircuitLibrary.transactionInputVariables.map((variable) =>
      this._placementManager.getReservedInputBufferDataPt(variable),
    )
    const operands = [
      this._placementManager.getReservedInputBufferDataPt('EDDSA_RANDOMIZER_X'),
      this._placementManager.getReservedInputBufferDataPt('EDDSA_RANDOMIZER_Y'),
      this._placementManager.getReservedInputBufferDataPt('EDDSA_PUBLIC_KEY_X'),
      this._placementManager.getReservedInputBufferDataPt('EDDSA_PUBLIC_KEY_Y'),
      this._placementManager.getReservedInputBufferDataPt('CHANNEL_TX_INDEX'),
      ...transactionInputPts,
      this._placementManager.getReservedInputBufferDataPt('CONTRACT_ADDRESS'),
      this._placementManager.getReservedInputBufferDataPt('FUNCTION_SELECTOR'),
      this._placementManager.getReservedInputBufferDataPt('EDDSA_SIGNATURE'),
      this._placementManager.getReservedInputBufferDataPt('JUBJUB_POI_X'),
      this._placementManager.getReservedInputBufferDataPt('JUBJUB_POI_Y'),
    ]
    const verifiedTransactionPts = this._placementManager.placeComposition(
      'TransactionSignatureVerify',
      operands,
    )
    const verifiedContractAddressPt = verifiedTransactionPts[0]
    const verifiedFunctionSelectorPt = verifiedTransactionPts[1]
    const verifiedOriginPt = verifiedTransactionPts[2]
    if (
      verifiedContractAddressPt === undefined
      || verifiedFunctionSelectorPt === undefined
      || verifiedOriginPt === undefined
    ) {
      throw new Error('Synthesizer: TransactionSignatureVerify returned incomplete results')
    }

    const zeroFrPt = this._placementManager.getReservedInputBufferDataPt('CIRCOM_CONST_ZERO')
    const convertedTransactionInputPts = []
    for (let inputIndex = 0; inputIndex < transactionInputPts.length; inputIndex += 2) {
      const convertedPair = this._placementManager.placeComposition(
        'FrToLimbsPair',
        [transactionInputPts[inputIndex]!, transactionInputPts[inputIndex + 1] ?? zeroFrPt],
      )
      convertedTransactionInputPts.push(convertedPair[0]!)
      if (inputIndex + 1 < transactionInputPts.length) {
        convertedTransactionInputPts.push(convertedPair[1]!)
      }
    }
    this._contextManager.setVerifiedTransactionData(
      verifiedContractAddressPt,
      verifiedFunctionSelectorPt,
      verifiedOriginPt,
      convertedTransactionInputPts,
    )
  }

  public async synthesizeTX(): Promise<RunTxResult> {
    const common = this._cachedOpts.stateManager.common;
    this._eventHandlerError = undefined
    this._hasEventHandlerError = false
    this._stepLogs = []

    const headerData: HeaderData = {
      parentHash: setLengthLeft(
        bigIntToBytes(this._placementManager.getReservedInputBufferDataPt('BLOCKHASH_1').value),
        32,
      ),
      coinbase: createAddressFromBigInt(this._placementManager.getReservedInputBufferDataPt('COINBASE').value),
      // difficulty = 0 for PoS blocks
      difficulty: 0n,
      number: this._placementManager.getReservedInputBufferDataPt('NUMBER').value,
      gasLimit: this._placementManager.getReservedInputBufferDataPt('GASLIMIT').value,
      timestamp: this._placementManager.getReservedInputBufferDataPt('TIMESTAMP').value,

      baseFeePerGas: undefined,
    };
    
    const vmOpts: VMOpts = {
      common,
      stateManager: this._cachedOpts.stateManager,
      profilerOpts: {reportAfterTx: true},
    };
    const vm = await createVM(vmOpts);
    this._attachSynthesizerToVM(vm);

    const blockData: BlockData = {
      header: headerData,
    };
    const blockOpts: BlockOptions = {
      common,
      skipConsensusFormatValidation: true,
    };
    const block = createBlock(blockData, blockOpts);
    const runTxOpts: RunTxOpts = {
      block,
      tx: this._cachedOpts.signedTransaction,
      skipBalance: true,
      skipNonce: true,
      skipBlockGasLimitValidation: true,
      skipHardForkValidation: true,
      reportPreimages: true,
    };
    let result: RunTxResult
    try {
      result = await runTx(vm, runTxOpts)
    } catch (err) {
      if (this._hasEventHandlerError) {
        throw this._eventHandlerError
      }
      throw err
    }
    if (this._hasEventHandlerError) {
      throw this._eventHandlerError
    }
    if (result.execResult.exceptionError !== undefined) {
      throw result.execResult.exceptionError
    }
    this._contextManager.finalizeStorageStores()
    return result
  }

  private _applySynthesizerHandler = async (data: InterpreterStep): Promise<void> => {
    const stepResult: InterpreterStep = {
      ...data,
      stack: data.stack.slice().reverse(),
    }
    const thisContext = this._contextManager.contextByDepth[stepResult.depth];
    if (thisContext === undefined ) {
      throw new Error('Debug: The current context is not initialized')
    }
    const prevStepResult = thisContext.prevInterpreterStep;
    if ( prevStepResult !== null) {
      const opcode = prevStepResult.opcode
      const opHandler = this._instructionHandlers.opcodeHandlers.get(opcode.code)
      if (opHandler === undefined) {
        throw new Error(`Undefined synthesizer handler for opcode ${opcode.name}`)
      }

      const stepLog: SynthesizerStepLogEntry = {
        stack: prevStepResult.stack.map(x => bigIntToHex(x)),
        pc: prevStepResult.pc,
        opcode: opcode.name,
      }
      if (opcode.name === 'KECCAK256') {
        const offset = prevStepResult.stack[0]
        const size = prevStepResult.stack[1]
        if (offset !== undefined && size !== undefined) {
          const start = Number(offset)
          const end = start + Number(size)
          const inputBytes = prevStepResult.memory.subarray(start, end)
          const chunks: string[] = []
          for (let i = 0; i < inputBytes.length; i += 32) {
            chunks.push(bytesToHex(inputBytes.subarray(i, i + 32)))
          }
          stepLog.keccak256Input = chunks
        }
      }
      this._stepLogs.push(stepLog)

      await opHandler.apply(null, [thisContext, stepResult])
    }
    thisContext.prevInterpreterStep = {
      ...stepResult,
      stack: stepResult.stack.slice(),
    }
  }

  public get stepLogs(): SynthesizerStepLogEntry[] {
    return this._stepLogs
  }

  public get messageCodeAddresses(): readonly string[] {
    return this._contextManager.messageCodeAddresses
  }

  public get placements(): Placements {
    return this._placementManager.placements
  }

}
