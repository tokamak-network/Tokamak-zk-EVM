import { AfterTxEvent, createVM, runTx, RunTxOpts, RunTxResult, VM, VMOpts } from '@ethereumjs/vm';

import { BlockData, BlockOptions, createBlock, HeaderData } from '@ethereumjs/block';
import { Address, bigIntToBytes, bigIntToHex, bytesToBigInt, bytesToHex, createAddressFromBigInt, hexToBigInt, setLengthLeft } from '@ethereumjs/util';

import { EVMResult, InterpreterStep, Message } from '@ethereumjs/evm';
import { DataAliasInfos, DataPt, MemoryPts, Placements, ReservedVariable, SynthesizerInterface, SynthesizerOpts, SynthesizerStepLogEntry, SynthesizerSupportedOpcodes } from './types/index.ts';
import { ArithmeticManager, BufferManager, ContextConstructionData, ContextManager, InstructionHandler, MemoryManager, StateManager, SynthesizerOpHandler } from './handlers/index.ts';
import { ArithmeticOperator, SubcircuitNames } from '../interface/qapCompiler/configuredTypes.ts';
import { DataPtFactory } from './dataStructure/dataPt.ts';
import { TypedTransaction } from '@ethereumjs/tx';
import { MemoryPt } from './dataStructure/memoryPt.ts';
import { FUNCTION_INPUT_LENGTH, NULL_STORAGE_KEY, poseidon_raw } from 'tokamak-l2js';

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
  protected _instructionHandlers: InstructionHandler
  public readonly cachedOpts: SynthesizerOpts
  private _stepLogs: SynthesizerStepLogEntry[]
  private _messageCodeAddresses: Set<`0x${string}`>

  // @deprecated
  constructor(opts: SynthesizerOpts) {
    this.cachedOpts = opts
    this._state = new StateManager(this)
    this._bufferManager = new BufferManager(this)
    this._arithmeticManager = new ArithmeticManager(this)
    this._memoryManager = new MemoryManager(this)
    this._instructionHandlers =  new InstructionHandler(this)
    this._stepLogs = []
    this._messageCodeAddresses = new Set()
  }

  private _attachSynthesizerToVM(vm: VM): void {
    if (vm.evm.events === undefined ) {
      throw new Error("EVM event emitter is turned off.")
    }
    vm.events.on('beforeTx', (data: TypedTransaction, resolve?: (result?: any) => void) => {
      ; (async () => {
        try {
          await this._prepareSynthesizeTransaction()
          // TODO: BLOCKHASH preparation in state manager for EIP-7709
        } catch (err) {
          console.error('Synthesizer: beforeTx error:', err)
        } finally {
          resolve?.()
        }
      })()
    });
    vm.evm.events.on('beforeMessage', (data: Message, resolve?: (result?: any) => void) => {
      try { 
        this._prepareMessageCall(data);
      } catch (err) {
        console.error('Synthesizer: beforeMessage error:', err)
      } finally {
        resolve?.()
      }
    });
    vm.evm.events!.on('step', (data: InterpreterStep, resolve?: (result?: any) => void) => {
      ; (async () => {
        try {
          await this._applySynthesizerHandler(data);
          if (data.opcode.name === 'SSTORE') {
            await this._updateStoragePreStep(data);
          }
        } catch (err) {
          console.error('Synthesizer: step error:', err)
        } finally {
          resolve?.()
        }
      }) () 
    })
    vm.evm.events.on('afterMessage', (data: EVMResult, resolve?: (result?: any) => void) => {
      ; (async () => {
        try {
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
          this._returnMessageCall(stepData.depth);
        } catch (err) {
          console.error('Synthesizer: afterMessage error:', err)
        } finally {
          // console.log(`code = ${bytesToHex(data.execResult.runState!.code)}`)
          resolve?.()
        }
      })()
    })

    vm.events.on('afterTx', (data: AfterTxEvent, resolve?: (result?: any) => void) => {
      ; (async () => {
        try {
          await this._finalizeStorage()
        } catch (err) {
          console.error('Synthesizer: afterTx error:', err)
        } finally {
          // console.log(`code = ${bytesToHex(data.execResult.runState!.code)}`)
          resolve?.()
        }
      })()
    })
  }

  private async _prepareSynthesizeTransaction(): Promise<void> {
    this.state.cachedRoots = new Map()
    const storageAddresses = this.cachedOpts.stateManager.storageAddresses;
    const roots = this.cachedOpts.stateManager.merkleTrees.getRoots(storageAddresses);
    if (roots.length !== storageAddresses.length) {
      throw new Error('Mismatch between Merkle root count and storage address count')
    }
    for (const [idx, address] of storageAddresses.entries()) {
      const addressBigInt = bytesToBigInt(address.bytes);
      const addressString = address.toString();
      this.state.cachedRoots.set(
        addressBigInt,
        [this.addReservedVariableToBufferIn('INI_MERKLE_ROOT', roots[idx], true, ` of ${addressString}`)],
      );
    }
    this.state.cachedOrigin = this._instructionHandlers.getOriginAddressPt();
  }

  private _returnMessageCall(depth: number):void {
    if (depth > 0){
      this.state.contextByDepth[depth - 1].returnDataMemoryPts = this.state.contextByDepth[depth].resultMemoryPts.map(entry => {
        return {
          ...entry,
          dataPt: DataPtFactory.deepCopy(entry.dataPt),
        }
      });
    }
  }

  // Must run this function before everytime EVM executes CALLs.
  private _prepareMessageCall(message: Message): void {
    this._messageCodeAddresses.add(message.codeAddress.toString())
    if (message.isCreate) {
      throw new Error ("CREATE is not supported.")
    }
    if (message.isCompiled) {
      throw new Error ("Precompiled functions are not supported.")
    }
    const depth = message.depth;
    let callDataMemoryPts: MemoryPts;
    let callerPt: DataPt;
    let toAddressPt: DataPt;
    if (depth == 0) {
      const selectorPt = this.getReservedVariableFromBuffer('FUNCTION_SELECTOR')
      const inPts: DataPt[] = Array.from({ length: FUNCTION_INPUT_LENGTH }, (_, i) =>
        this.getReservedVariableFromBuffer(`TRANSACTION_INPUT${i}` as ReservedVariable)
      )
      callDataMemoryPts = [
        { memByteOffset: 0, containerByteSize: 4, dataPt: selectorPt },
        ...inPts.map((dataPt, i) => ({
          memByteOffset: 4 + 32 * i,
          containerByteSize: 32,
          dataPt,
        })),
      ]
      if (this.state.cachedOrigin === undefined) {
        throw new Error(`Sender address must be verified first`)
      }
      callerPt = DataPtFactory.deepCopy(this.state.cachedOrigin);
      toAddressPt = this.getReservedVariableFromBuffer('CONTRACT_ADDRESS');
    } else if (depth > 0) {
      const parentContext = this.state.contextByDepth[depth - 1];
      if (parentContext === undefined) {
        throw new Error('Debug: No parent context')
      }
      const callingStep = parentContext.prevInterpreterStep;
      if (callingStep === null) {
        throw new Error('Debug: A child context is called but no relevant interpreter step in the parent context')
      }
      let toAddress: bigint
      let inOffset: bigint
      let inLength: bigint
      if (message.isStatic || message.delegatecall) {
        const ins = callingStep.stack.slice(0, 6);
        toAddress = ins[1]
        toAddressPt = DataPtFactory.deepCopy(parentContext.stackPt.peek(6)[1]);
        inOffset = ins[2]
        inLength = ins[3]
      } else {
        const ins = callingStep.stack.slice(0, 7);
        toAddress = ins[1]
        toAddressPt = DataPtFactory.deepCopy(parentContext.stackPt.peek(7)[1]);
        inOffset = ins[3]
        inLength = ins[4]
      }

      if (toAddress >= 1n && toAddress <= 10n) {
        throw new Error(
          `Precompiles are not implemented in Synthesizer.`,
        )
      }
      if (toAddress !== toAddressPt.value) {
        throw new Error(`Debug: Address to call mismatch between EVM and Synthesizer`)
      }
      callerPt = DataPtFactory.deepCopy(
        message.delegatecall === true ? 
        this.state.contextByDepth[depth - 1].callerPt : 
        this.state.contextByDepth[depth - 1].toAddressPt
      );

      callDataMemoryPts = this.copyMemoryPts(
        parentContext.memoryPt.read(Number(inOffset), Number(inLength)),
        inOffset,
        inLength,
      );
      const simCalldataMemoryPt = MemoryPt.simulateMemoryPt(callDataMemoryPts);
      const syntheCallData = simCalldataMemoryPt.viewMemory(0, Number(inLength));
      const actualCallData = callingStep.memory.subarray(Number(inOffset), Number(inOffset) + Number(inLength))
      if (bytesToBigInt(syntheCallData) !== bytesToBigInt(actualCallData)) {
        throw new Error(`Debug: Mismatch between calldata memory and memoryPt of the parent context`)
      }
    } else {
      throw new Error(`Debug: Invalid call depth: ${depth}`)
    }
    const contextData: ContextConstructionData = {
      callDataMemoryPts,
      callerPt,
      toAddressPt,
    };
    this.state.contextByDepth[depth] = new ContextManager(contextData);
  }

  private async _finalizeStorage(): Promise<void> {    
    const storageAddresses = this.cachedOpts.stateManager.storageAddresses;
    const roots = this.cachedOpts.stateManager.merkleTrees.getRoots(storageAddresses);
    if (roots.length !== storageAddresses.length) {
      throw new Error('Mismatch between Merkle root count and storage address count')
    }
    for (const [addressIdx, address] of storageAddresses.entries()) {
      const addressBigInt = bytesToBigInt(address.bytes);
      const addressString = address.toString();
      const cachedRoots = this.state.cachedRoots.get(addressBigInt);
      if (cachedRoots === undefined || cachedRoots.length === 0) {
        throw new Error(`Cached Merkle roots are missing for address ${addressString}`)
      }
      const finalRootPt = cachedRoots[cachedRoots.length - 1];
      if (finalRootPt.value !== roots[addressIdx]) {
        throw new Error(`Final Merkle root mismatch for address ${addressString}`)
      }
      this.addReservedVariableToBufferOut('RES_MERKLE_ROOT', finalRootPt, true, ` of ${addressString}`)
    }
  }

  public async synthesizeTX(): Promise<RunTxResult> {
    const common = this.cachedOpts.stateManager.common;
    this._stepLogs = []

    const headerData: HeaderData = {
      parentHash: setLengthLeft(
        bigIntToBytes(this.getReservedVariableFromBuffer('BLOCKHASH_1').value),
        32,
      ),
      coinbase: createAddressFromBigInt(this.getReservedVariableFromBuffer('COINBASE').value),
      // difficulty = 0 for PoS blocks
      difficulty: 0n,
      number: this.getReservedVariableFromBuffer('NUMBER').value,
      gasLimit: this.getReservedVariableFromBuffer('GASLIMIT').value,
      timestamp: this.getReservedVariableFromBuffer('TIMESTAMP').value,

      // To bypass checking EIPs
      // baseFeePerGas: this.getReservedVariableFromBuffer('BASEFEE').valuef,
      baseFeePerGas: undefined,
    };
    
    const vmOpts: VMOpts = {
      common,
      stateManager: this.cachedOpts.stateManager,
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
      tx: this.cachedOpts.signedTransaction,
      skipBalance: true,
      skipBlockGasLimitValidation: true,
      skipHardForkValidation: true,
      reportPreimages: true,
    };
    return await runTx(vm, runTxOpts)
  }

  private _applySynthesizerHandler = async (data: InterpreterStep): Promise<void> => {
    const stepResult: InterpreterStep = {
      ...data,
      stack: data.stack.slice().reverse(),
    }
    const thisContext = this.state.contextByDepth[stepResult.depth];
    if (thisContext === undefined ) {
      throw new Error('Debug: The current context is not initialized')
    }
    const prevStepResult = thisContext.prevInterpreterStep;
    if ( prevStepResult !== null) {
      const opcode = prevStepResult.opcode
      const opHandler = this.synthesizerHandlers.get(opcode.code)
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

  private async _updateStoragePreStep(data: InterpreterStep): Promise<void> {
    const stepResult: InterpreterStep = {
      ...data,
      stack: data.stack.slice().reverse(),
    }
    const context = this.state.contextByDepth[stepResult.depth];
    if (context === undefined) {
      throw new Error('Debug: The current context is not initialized')
    }

    const [keyPt, valuePt] = context.stackPt.peek(2);
    const key = stepResult.stack[0];
    const value = stepResult.stack[1];
    if (key === undefined || value === undefined) {
      throw new Error('Synthesizer: SSTORE pre-step requires key and value on stack')
    }
    if (keyPt.value !== key || valuePt.value !== value) {
      throw new Error('Synthesizer: SSTORE pre-step stack mismatch')
    }
    const { merkleProof, indexPt, siblingPts } =
      await this._instructionHandlers.buildStorageProof(stepResult.address, keyPt);

    const valueStored = bytesToBigInt(
      await this.cachedOpts.stateManager.getStorage(
        stepResult.address,
        setLengthLeft(bigIntToBytes(keyPt.value), 32),
      ),
    );
    if (merkleProof.leaf !== valueStored) {
      throw new Error('Mismatch in storage values between MPT and EVM stack');
    }
    const valueStoredPt = this.addReservedVariableToBufferIn(
      'STORAGE_READ',
      valueStored,
      true,
      ` at MT index: ${Number(indexPt.value)} of address: ${stepResult.address.toString()}`,
    );

    this.placeMerkleProofVerification(
      indexPt,
      valueStoredPt,
      siblingPts,
      this._instructionHandlers.getLatestCachedRootPt(bytesToBigInt(stepResult.address.bytes)),
    )
    if (this.state.cachedMerkleProof !== null) {
      throw new Error('Debug: cachedMerkleProof must be empty before SSTORE pre-step caching')
    }
    this.state.cachedMerkleProof = {
      indexPt: DataPtFactory.deepCopy(indexPt),
      siblingPts: siblingPts.map((pts) => pts.map((pt) => DataPtFactory.deepCopy(pt))),
    };
  }

  public get state(): StateManager {
    return this._state;
  }

  public get stepLogs(): SynthesizerStepLogEntry[] {
    return this._stepLogs
  }

  public get messageCodeAddresses(): Set<`0x${string}`> {
    return this._messageCodeAddresses
  }

  public get placements(): Placements {
    return this._state.placements
  }

  public get synthesizerHandlers(): Map<number, SynthesizerOpHandler> {
      return this._instructionHandlers.synthesizerHandlers
    }

  place(name: SubcircuitNames, inPts: DataPt[], outPts: DataPt[], usage: string): void {
    this._state.place(name, inPts, outPts, usage)
  }

  getReservedVariableFromBuffer(
    varName: ReservedVariable
  ): DataPt {
    return this._bufferManager.getReservedVariableFromBuffer(varName)
  }

  addWirePairToBufferIn(inPt: DataPt, outPt: DataPt, dynamic: boolean): DataPt {
    return this._state.addWirePairToBufferIn(inPt, outPt, dynamic)
  }

  addReservedVariableToBufferIn(varName: ReservedVariable, value?: bigint, dynamic?: boolean, message?: string): DataPt {
    return this._bufferManager.addReservedVariableToBufferIn(varName, value, dynamic, message)
  }
  addReservedVariableToBufferOut(varName: ReservedVariable, symbolDataPt: DataPt, dynamic?: boolean, message?: string): DataPt {
    return this._bufferManager.addReservedVariableToBufferOut(varName, symbolDataPt, dynamic, message)
  }

  loadArbitraryStatic(
    value: bigint,
    bitSize?: number,
    desc?: string,
  ): DataPt {
    return this._bufferManager.loadArbitraryStatic(value, bitSize, desc)
  }

  placeArith(name: ArithmeticOperator, inPts: DataPt[]): DataPt[] {
    return this._arithmeticManager.placeArith(name, inPts);
  }

  placeExp(inPts: DataPt[], reference?: bigint): DataPt {
    return this._arithmeticManager.placeExp(inPts, reference)
  }
  placeJubjubExp(inPts: DataPt[], PoI: DataPt[], reference?: bigint): DataPt[] {
    return this._arithmeticManager.placeJubjubExp(inPts, PoI, reference)
  }
  placePoseidon(inPts: DataPt[]): DataPt {
    return this._arithmeticManager.placePoseidon(inPts)
  }
  placeMerkleProofVerification(indexPt: DataPt, leafPt: DataPt, siblingPts: DataPt[][], rootPt: DataPt): void {
    return this._arithmeticManager.placeMerkleProofVerification(indexPt, leafPt, siblingPts, rootPt)
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
}
