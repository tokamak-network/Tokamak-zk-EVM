import { AfterTxEvent, createVM, runTx, RunTxOpts, RunTxResult, VM, VMOpts } from '@ethereumjs/vm';

import { BlockData, BlockOptions, createBlock, HeaderData } from '@ethereumjs/block';
import { bigIntToHex, bytesToBigInt, bytesToHex, createAddressFromBigInt } from '@ethereumjs/util';

import { createEVM, EVM, EVMOpts, EVMResult, InterpreterStep, Message } from '@ethereumjs/evm';
import { DataAliasInfos, DataPt, MemoryPts, Placements, ReservedVariable, SynthesizerInterface, SynthesizerOpts, SynthesizerSupportedOpcodes } from './types/index.ts';
import { ArithmeticManager, BufferManager, ContextConstructionData, ContextManager, InstructionHandler, MemoryManager, StateManager, SynthesizerOpHandler } from './handlers/index.ts';
import { ArithmeticOperator, SubcircuitNames } from '../interface/qapCompiler/configuredTypes.ts';
import { MAX_MT_LEAVES } from '../interface/qapCompiler/importedConstants.ts';
import { DataPtFactory } from './dataStructure/dataPt.ts';
import { TypedTransaction } from '@ethereumjs/tx';
import { StackPt } from './dataStructure/stackPt.ts';
import { MemoryPt } from './dataStructure/memoryPt.ts';

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
  private readonly _stepLogger: boolean

  // @deprecated
  constructor(opts: SynthesizerOpts) {
    this.cachedOpts = opts
    this._state = new StateManager(this)
    this._bufferManager = new BufferManager(this)
    this._arithmeticManager = new ArithmeticManager(this)
    this._memoryManager = new MemoryManager(this)
    this._instructionHandlers =  new InstructionHandler(this)
    this._stepLogger = opts.stepLogger ?? false
  }

  private _attachSynthesizerToVM(vm: VM): void {
    if (vm.evm.events === undefined ) {
      throw new Error("EVM event emitter is turned off.")
    }
    vm.events.on('beforeTx', (data: TypedTransaction, resolve?: (result?: any) => void) => {
      try { 
        this._prepareSynthesizeTransaction()
        // TODO: BLOCKHASH preparation in state manager for EIP-7709
      } catch (err) {
        console.error('Synthesizer: beforeTx error:', err)
      } finally {
        resolve?.()
      }
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
            // If opcode is REVERT, read error data and return in trace
            const [offset, length] = _runState.stack.peek(2);
            error = new Uint8Array(0)
            if (length !== 0n) {
              error = _runState.memory.read(Number(offset), Number(length))
            }
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
          if (this._stepLogger) {
            console.log(`stack: ${stepData.stack.slice().reverse().map(x => bigIntToHex(x))}`)
            console.log(`pc: ${stepData.pc}, opcode: ${stepData.opcode.name}`)
          }
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

  private _prepareSynthesizeTransaction(): void {
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
      const inPts: DataPt[] = Array.from({ length: 9 }, (_, i) =>
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
      const actualCallData = callingStep.memory.subarray(Number(inOffset), Number(inLength))
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
    await this._updateMerkleTree()
    this._unregisteredContractStorageWritings()
  }

  private async _updateMerkleTree(): Promise<void> {    
    const treeEntriesPt: DataPt[][] = [];

    for (const key of this.cachedOpts.stateManager.registeredKeys!) {
      const keyBigInt = bytesToBigInt(key)
      const cached = this._state.cachedStorage.get(keyBigInt);
      if (cached !== undefined && cached.length === 0 ) {
        throw new Error(`A storage was cached without no history`)
      }
      const keyPt = cached === undefined ?
        this.addReservedVariableToBufferIn('MERKLE_PROOF', keyBigInt, true) :
        cached[cached.length-1].keyPt;
      // Make sure every registered storage verified
      const valuePt = await this._instructionHandlers.loadStorage(keyPt);
      treeEntriesPt.push([
        keyPt, 
        valuePt,
      ]);
    }
    const numActualKeys = this.cachedOpts.stateManager.registeredKeys!.length;
    if (this._state.verifiedStorageMTIndices.length !== numActualKeys) {
      throw new Error(`Mismatch between verified keys and registered keys`)
    }

    const permutation = [...this._state.verifiedStorageMTIndices];
    // permutation[newIdx] = oldIdx

    // Make every padded keys warm
    for ( var MTIndex = numActualKeys; MTIndex < MAX_MT_LEAVES; MTIndex++ ) {
      const keyPt = this.addReservedVariableToBufferIn('MERKLE_PROOF', 0n, true);
      const indexPt = this.addReservedVariableToBufferIn('MERKLE_PROOF', BigInt(MTIndex), true);
      const valuePt = await this._instructionHandlers.verifyStorage(keyPt, indexPt, 0n);
      treeEntriesPt.push([
        keyPt,
        valuePt,
      ])
    }

    const finalMerkleRootRef = await this.cachedOpts.stateManager.getUpdatedMerkleTreeRoot(permutation);
    
    if (treeEntriesPt.length !== MAX_MT_LEAVES ) {
      throw new Error(`Expected ${MAX_MT_LEAVES} leaves for updated tree root computation, but got ${treeEntriesPt.length} leaves.`)
    }
    // Permute MT leaves
    const permutedTreeEntriesPt: DataPt[][] = [...treeEntriesPt];
    for (const [newIdx, oldIdx] of permutation.entries()) {
      permutedTreeEntriesPt[newIdx] = DataPtFactory.deepCopy(treeEntriesPt[oldIdx]);
    }
    const finalMerkleRootPt = this.placePoseidon(permutedTreeEntriesPt.flat());
    if (finalMerkleRootRef !== finalMerkleRootPt.value) {
      throw new Error(`Updated Merkle tree root is different from the reference.`);
    }
    this.addReservedVariableToBufferOut(
      'RES_MERKLE_ROOT',
      finalMerkleRootPt,
      true,
    );
  }

  private _unregisteredContractStorageWritings(): void {
    for (const [key, cache] of this.state.cachedStorage.entries()) {
      if (this.cachedOpts.stateManager.getMTIndex(key) < 0){
        // Filtering the latest unregistered storage writings
        const lastWritingIndex = cache.findIndex(entry => entry.access === "Write")
        if (lastWritingIndex >= 0) {
          this.addReservedVariableToBufferOut(
            'UNREGISTERED_CONTRACT_STORAGE_OUT',
            cache[lastWritingIndex].valuePt,
            true,
            ` at MPT key ${bigIntToHex(key)}`,
          );
        }
      }
    }
  }

  public async synthesizeTX(): Promise<RunTxResult> {
    const common = this.cachedOpts.stateManager.common;

    const headerData: HeaderData = {
      parentHash: this.getReservedVariableFromBuffer('BLOCKHASH_1').value,
      coinbase: createAddressFromBigInt(this.getReservedVariableFromBuffer('COINBASE').value),
      // difficulty = 0 for PoS blocks
      difficulty: 0n,
      number: this.getReservedVariableFromBuffer('NUMBER').value,
      gasLimit: this.getReservedVariableFromBuffer('GASLIMIT').value,
      timestamp: this.getReservedVariableFromBuffer('TIMESTAMP').value,

      // To bypass checking EIPs
      // baseFeePerGas: this.getReservedVariableFromBuffer('BASEFEE').value,
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

      await opHandler.apply(null, [thisContext, stepResult])

      if (this._stepLogger) {
        console.log(`stack: ${prevStepResult.stack.map(x => bigIntToHex(x))}`)
        console.log(`pc: ${prevStepResult.pc}, opcode: ${opcode.name}`)
        if (prevStepResult.opcode.name === 'DELEGATECALL') {
          console.log('HERE')
        }
      }
    }
    thisContext.prevInterpreterStep = {
      ...stepResult,
      stack: stepResult.stack.slice(),
    }
  }

  public get state(): StateManager {
    return this._state;
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
  placeMerkleProofVerification(indexPt: DataPt, leafPt: DataPt, siblings: bigint[][], rootPt: DataPt): void {
    return this._arithmeticManager.placeMerkleProofVerification(indexPt, leafPt, siblings, rootPt)
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
