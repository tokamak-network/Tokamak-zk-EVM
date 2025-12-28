import { createVM, runTx, RunTxOpts, RunTxResult, VM, VMOpts } from '@ethereumjs/vm';

import { BlockData, BlockOptions, createBlock, HeaderData } from '@ethereumjs/block';
import { bigIntToHex, bytesToBigInt, bytesToHex, createAddressFromBigInt } from '@ethereumjs/util';

import { createEVM, EVM, EVMOpts, EVMResult, InterpreterStep, Message } from '@ethereumjs/evm';
import { DataAliasInfos, DataPt, MemoryPts, Placements, ReservedVariable, SynthesizerInterface, SynthesizerOpts, SynthesizerSupportedOpcodes } from './types/index.ts';
import { ArithmeticManager, BufferManager, InstructionHandler, MemoryManager, StateManager, SynthesizerOpHandler } from './handlers/index.ts';
import { ArithmeticOperator, SubcircuitNames, TX_MESSAGE_TO_HASH } from '../interface/qapCompiler/configuredTypes.ts';
import { poseidon } from '../TokamakL2JS/index.ts';
import { MAX_MT_LEAVES, MT_DEPTH, POSEIDON_INPUTS } from '../interface/qapCompiler/importedConstants.ts';
import { DataPtFactory } from './dataStructure/dataPt.ts';

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
  protected _prevInterpreterStep: InterpreterStep | null = null

  // @deprecated
  constructor(opts: SynthesizerOpts) {
    this.cachedOpts = opts
    this._state = new StateManager(this)
    this._bufferManager = new BufferManager(this)
    this._arithmeticManager = new ArithmeticManager(this)
    this._memoryManager = new MemoryManager(this)
    this._instructionHandlers =  new InstructionHandler(this)
  }

  private _attachSynthesizerToEVM(evm: EVM): void {
    evm.events.on('beforeMessage', (data: Message, resolve?: (result?: any) => void) => {
      try { 
        this._prepareSynthesizeTransaction()
      } catch (err) {
        console.error('Synthesizer: beforeMessage error:', err)
      } finally {
        this._prevInterpreterStep = null
        resolve?.()
      }
    })
    evm.events.on('step', (data: InterpreterStep, resolve?: (result?: any) => void) => {
      ; (async () => {
        try {
          const currentInterpreterStep: InterpreterStep = {
            ...data,
            stack: data.stack.slice().reverse(),
          }
          // const currentInterpreterStep = {...data}
          
          if (this._prevInterpreterStep !== null) {
            // console.log(`stack: ${this._prevInterpreterStep.stack.map(x => bigIntToHex(x))}`)
            // console.log(`pc: ${this._prevInterpreterStep.pc}, opcode: ${this._prevInterpreterStep.opcode.name}`)
            await this._applySynthesizerHandler(this._prevInterpreterStep, currentInterpreterStep)
          }

        } catch (err) {
          console.error('Synthesizer: step error:', err)
        } finally {
          this._prevInterpreterStep = {
            ...data,
            stack: data.stack.slice().reverse(),
          }
          // this._prevInterpreterStep = {...data}
          resolve?.()
        }
      }) () 
    })
    evm.events.on('afterMessage', (data: EVMResult, resolve?: (result?: any) => void) => {
      ; (async () => {
        try {
          const _runState = data.execResult.runState
          if (_runState === undefined) {
            throw new Error('Failed to capture the final state')
          }
          const _interpreter = _runState.interpreter
          const opcodeInfo = _interpreter.lookupOpInfo(_runState.opCode).opcodeInfo
          const memorySize = 8192n
          const stack = _runState.stack.getStack().slice().reverse()
          let error = undefined
          if (opcodeInfo.code === 0xfd) {
            // If opcode is REVERT, read error data and return in trace
            const [offset, length] = [stack[0], stack[1]]
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
            stack,
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
          if (!this._prevInterpreterStep) {
            throw new Error('Data loading failure when finalizing Synthesizer')
          }
          await this._applySynthesizerHandler(this._prevInterpreterStep, currentInterpreterStep)
          console.log(`stack: ${currentInterpreterStep.stack.map(x => bigIntToHex(x))}`)
          console.log(`pc: ${currentInterpreterStep.pc}, opcode: ${currentInterpreterStep.opcode.name}`)
          await this._finalizeStorage()
          // this._computeTxHash()
        } catch (err) {
          console.error('Synthesizer: afterMessage error:', err)
        } finally {
          // console.log(`code = ${bytesToHex(data.execResult.runState!.code)}`)
          resolve?.()
        }
      })()
    })
  }

  // Placements for the transaction signature verification and the sender address recovery. Then update sender address cache and calldata cache.
  private _prepareSynthesizeTransaction(): void {
    this.state.callMemoryPtsStack = []
    const selectorPt = this.getReservedVariableFromBuffer('FUNCTION_SELECTOR')
    const inPts: DataPt[] = Array.from({ length: 9 }, (_, i) =>
      this.getReservedVariableFromBuffer(`TRANSACTION_INPUT${i}` as ReservedVariable)
    )
    this.state.callMemoryPtsStack[0] = [
      { memByteOffset: 0, containerByteSize: 4, dataPt: selectorPt },
      ...inPts.map((dataPt, i) => ({
        memByteOffset: 4 + 32 * i,
        containerByteSize: 32,
        dataPt,
      })),
    ]
    if (this.state.cachedOrigin !== undefined) {
      throw new Error(`Cached sender address must be clear`)
    } else {
      this.state.cachedOrigin = this._instructionHandlers.getOriginAddressPt()
      this.state.cachedCallers[0] = DataPtFactory.deepCopy(this.state.cachedOrigin)
      this.state.cachedToAddress = this.getReservedVariableFromBuffer('CONTRACT_ADDRESS')
    }
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

  // private _computeTxHash(): void {
  //   const hashPt = this.placePoseidon([
  //     this.getReservedVariableFromBuffer('TRANSACTION_NONCE'),
  //     this.getReservedVariableFromBuffer('EDDSA_SIGNATURE'),
  //     this.getReservedVariableFromBuffer('EDDSA_RANDOMIZER_X'),
  //     this.getReservedVariableFromBuffer('EDDSA_RANDOMIZER_Y'),
  //   ])
  //   this.state.transactionHashes.push(DataPtFactory.deepCopy(hashPt))

  //   // This will be moving to the end of block process
  //   this.addReservedVariableToBufferOut('TX_BATCH_HASH', hashPt, true)
  // }

  public async synthesizeTX(): Promise<RunTxResult> {
    const common = this.cachedOpts.signedTransaction.common

    const headerData: HeaderData = {
      parentHash: this.getReservedVariableFromBuffer('BLOCKHASH_1').value,
      coinbase: createAddressFromBigInt(this.getReservedVariableFromBuffer('COINBASE').value),
      difficulty: this.getReservedVariableFromBuffer('PREVRANDAO').value,
      number: this.getReservedVariableFromBuffer('NUMBER').value,
      gasLimit: this.getReservedVariableFromBuffer('GASLIMIT').value,
      timestamp: this.getReservedVariableFromBuffer('TIMESTAMP').value,

      // To avoid checking EIPs
      // baseFeePerGas: this.getReservedVariableFromBuffer('BASEFEE').value,
      baseFeePerGas: undefined,
    }
    const blockData: BlockData = {
      header: headerData,
    }
    const blockOpts: BlockOptions = {
      common,
      skipConsensusFormatValidation: true,
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
      profilerOpts: {reportAfterTx: true},
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

  private _applySynthesizerHandler = async (prevInterpreterStep: InterpreterStep, currentInterpreterStep: InterpreterStep): Promise<void> => {
    const opcode = prevInterpreterStep?.opcode
    const opHandler = this.synthesizerHandlers.get(opcode.code)
    if (opHandler === undefined) {
      throw new Error(`Undefined synthesizer handler for opcode ${opcode.name}`)
    }
    await opHandler.apply(null, [prevInterpreterStep, currentInterpreterStep])

    // This function works if the input opcode is one of the follows: CALL, CALLCODE, DELEGATECALL, STATICCALL
    this._preTasksForCalls(
      currentInterpreterStep.opcode.name as SynthesizerSupportedOpcodes,
      currentInterpreterStep
    )
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
