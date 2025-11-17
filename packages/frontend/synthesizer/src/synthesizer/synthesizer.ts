import { createVM, runTx, RunTxOpts, RunTxResult, VM, VMOpts } from '@ethereumjs/vm';

import { BlockData, BlockOptions, createBlock, HeaderData } from '@ethereumjs/block';
import { bigIntToHex, bytesToBigInt, bytesToHex, createAddressFromBigInt } from '@ethereumjs/util';

import { createEVM, EVM, EVMOpts, EVMResult, InterpreterStep, Message } from '@ethereumjs/evm';
import { DataAliasInfos, DataPt, MemoryPts, Placements, ReservedVariable, SynthesizerInterface, SynthesizerOpts, SynthesizerSupportedOpcodes } from './types/index.ts';
import { ArithmeticManager, BufferManager, InstructionHandler, MemoryManager, StateManager, SynthesizerOpHandler } from './handlers/index.ts';
import { ArithmeticOperator, SubcircuitNames, TX_MESSAGE_TO_HASH } from 'src/interface/qapCompiler/configuredTypes.ts';
import { poseidon } from 'src/TokamakL2JS/index.ts';
import { poseidon_raw } from './params/index.ts';
import { MAX_MT_LEAVES, MT_DEPTH, POSEIDON_INPUTS } from 'src/interface/qapCompiler/importedConstants.ts';
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
            console.log(`stack: ${this._prevInterpreterStep.stack.map(x => bigIntToHex(x))}`)
            console.log(`pc: ${this._prevInterpreterStep.pc}, opcode: ${this._prevInterpreterStep.opcode.name}`)
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
          this._computeTxHash()
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

  // // Old version: Reconstructing the initial and final Merkle roots, rather than verifying Merkle proofs
  // private async _finalizeStorage(): Promise<void> {
  //   const computeParentsNodePts = (childrenPts: DataPt[], nullVal: bigint, level: number): DataPt[] => {
  //     const numChunks = Math.ceil(childrenPts.length / POSEIDON_INPUTS) * POSEIDON_INPUTS;
  //     const parentPts: DataPt[] = []
  //     for (let i = 0; i < numChunks; i += POSEIDON_INPUTS) {
  //         const chunk = Array.from({ length: POSEIDON_INPUTS }, (_, k) => childrenPts[i + k] ?? this.loadArbitraryStatic(0n, 1));
  //         // if (chunk.every(pt => pt.value === nullVal)) {
  //         //   parentPts.push(this.getReservedVariableFromBuffer(`NULL_POSEIDON_LEVEL${level}` as ReservedVariable))
  //         // } else {
  //           parentPts.push(this.placeArith('Poseidon', chunk)[0]);
           
  //         // }
  //     }
  //     return parentPts
  //   }

  //   const padLeaves = (leavesPts: DataPt[], length: number = MAX_MT_LEAVES): void => {
  //     if (leavesPts.length > length) {
  //       throw new Error('Excessive leaves')
  //     }
  //     while (leavesPts.length < length) {
  //       leavesPts.push(this.loadArbitraryStatic(0n, 1))
  //     }      
  //   }
  //   // Fill cached storage and add unused user storage values into the buffer
  //   for (const key of this.cachedOpts.stateManager.registeredKeys!) {
  //     const keyBigInt = bytesToBigInt(key)
  //     const cached = this.state.cachedStorage.get(keyBigInt)!
  //     if (cached.length === 0) {
  //     //   const storedValue = bytesToBigInt(await this.cachedOpts.stateManager.getStorage(this.cachedOpts.signedTransaction.to, key))
  //     //   if (storedValue !== cached[0].valuePt.value) {
  //     //     throw new Error('Mismatch between state manager and cached storage')
  //     //   }
  //     // } else {
  //       // Make it warm and verified
  //       await this.loadStorage(keyBigInt, undefined)
  //     }
  //   }
  //   // Preparing initial Merkle tree leaves
  //   const initialLeavesRaw: {indexPt: DataPt, keyPt: DataPt, valuePt: DataPt}[] = this.cachedOpts.stateManager.registeredKeys!.map(key => {
  //     const indexPt = this.state.cachedStorage.get(bytesToBigInt(key))![0].indexPt
  //     const keyPt = this.state.cachedStorage.get(bytesToBigInt(key))![0].keyPt
  //     const valuePt = this.state.cachedStorage.get(bytesToBigInt(key))![0].valuePt
  //     if (indexPt === null || keyPt === null) {
  //       throw new Error('Something wrong in the load/store storage. Need to be debugged.')
  //     }
  //     return {indexPt, keyPt, valuePt}
  //   })
  //   const initialLeavesPts: DataPt[] = initialLeavesRaw.map(leafRaw => this.placeArith('Poseidon', [leafRaw.indexPt, leafRaw.keyPt, leafRaw.valuePt, this.loadArbitraryStatic(0n, 1)])[0])
  //   padLeaves(initialLeavesPts)
  //   let childrenPts: DataPt[]
  //   let nullVal
  //   // Constructing initial Merkle root
  //   childrenPts = initialLeavesPts
  //   nullVal = 0n
  //   for (var level = 0; level < MT_DEPTH - 1; level++) {
  //     childrenPts = computeParentsNodePts(childrenPts, nullVal, level)
  //     nullVal = poseidon_raw(Array(POSEIDON_INPUTS).fill(nullVal))
  //   }
  //   padLeaves(childrenPts, 4)
  //   this.placeArith('VerifyMerkleProof', [
  //     ...childrenPts, 
  //     this.getReservedVariableFromBuffer('INI_MERKLE_ROOT')
  //   ])

  //   // Preparing last Merkle tree leaves
  //   const lastLeavesRaw: {indexPt: DataPt, keyPt: DataPt, valuePt: DataPt}[] = this.cachedOpts.stateManager.registeredKeys!.map(key => {
  //     const indexPt = this.state.cachedStorage.get(bytesToBigInt(key))!.at(-1)!.indexPt
  //     const keyPt = this.state.cachedStorage.get(bytesToBigInt(key))!.at(-1)!.keyPt
  //     const valuePt = this.state.cachedStorage.get(bytesToBigInt(key))!.at(-1)!.valuePt
  //     if (indexPt === null || keyPt === null) {
  //       throw new Error('Something wrong in the load/store storage. Need to be debugged.')
  //     }
  //     return {indexPt, keyPt, valuePt}
  //   })
  //   const lastLeavesPts: DataPt[] = lastLeavesRaw.map(leafRaw => this.placeArith('Poseidon', [leafRaw.indexPt, leafRaw.keyPt, leafRaw.valuePt, this.loadArbitraryStatic(0n, 1)])[0])
  //   padLeaves(lastLeavesPts)

  //   // Constructing last Merkle root
  //   childrenPts = lastLeavesPts
  //   nullVal = 0n
  //   for (var level = 0 ; level < MT_DEPTH; level++) {
  //     childrenPts = computeParentsNodePts(childrenPts, nullVal, level)
  //     nullVal = poseidon_raw(Array(POSEIDON_INPUTS).fill(nullVal))
  //   }
  //   if (childrenPts.length !== 1) {
  //     throw new Error('Excessive number of leaves')
  //   }
  //   this.addReservedVariableToBufferOut('RES_MERKLE_ROOT', childrenPts[0], true)

  //   this._registerOtherContractStrageWriting()
  // }

  private async _finalizeStorage(): Promise<void> {    
    const computeParentsNodePts = (childIndexPt: DataPt, childPt: DataPt, siblingPts: DataPt[]): {parentIndexPt: DataPt, parentPt: DataPt} => {
      if (siblingPts.length !== POSEIDON_INPUTS - 1) {
        throw new Error(`Siblings of each level for a Merkle proof should be ${POSEIDON_INPUTS - 1}, but got ${siblingPts.length}.`)
      }
      const childIndex = Number(childIndexPt.value)
      const childHomeIndex = childIndex % POSEIDON_INPUTS
      const parentIndex = Math.floor( childIndex / POSEIDON_INPUTS)
      
      const childrenPts = [
        ...siblingPts.slice(0, childHomeIndex),
        childPt,
        ...siblingPts.slice(childHomeIndex, )
      ]

      return{
        parentIndexPt: this.addReservedVariableToBufferIn('MERKLE_PROOF', BigInt(parentIndex), true),
        parentPt: this.placePoseidon(childrenPts),  
      }
    }

    const placeMerkleProofVerification = (indexPt: DataPt, leafPt: DataPt, siblings: bigint[][], rootPt: DataPt): void => {
      let childPt: DataPt = leafPt
      let childIndexPt: DataPt = indexPt
      for (var level = 0; level < MT_DEPTH; level++) {
        const thisSiblings = siblings[level]
        const siblingPts: DataPt[] = thisSiblings.map(value => this.addReservedVariableToBufferIn('MERKLE_PROOF', value, true))
        const {parentIndexPt, parentPt} = computeParentsNodePts(childIndexPt, childPt, siblingPts)

        if (level < MT_DEPTH - 1) {
          this.placeArith('VerifyMerkleProof', [childIndexPt, childPt, ...siblingPts, parentIndexPt, parentPt])
        } else {
          this.placeArith('VerifyMerkleProof', [childIndexPt, childPt, ...siblingPts, parentIndexPt, rootPt])
        }

        childPt = parentPt
        childIndexPt = parentIndexPt
      }
    }

    // Integrity check of initial storage reads
    for (const [key, accessList] of this.state.cachedStorage.entries()) {
      if (accessList.length === 0 || accessList[0]?.access !== 'Read') {
        continue;
      }
      const mtIndex = this.cachedOpts.stateManager.getMTIndex(key)
      if (mtIndex < 0) {
        continue;
      }
      const keyPt = accessList[0].keyPt!
      if (key !== keyPt.value) {
        throw new Error('Something wrong with cachedStorage. Need to be debugged.')
      }
      const merkleProof = this.cachedOpts.stateManager.initialMerkleTree.createProof(mtIndex)
      const indexPt = this.addReservedVariableToBufferIn('MERKLE_PROOF', BigInt(mtIndex), true)
      const valuePt = accessList[0].valuePt

      const childPt = this.placeArith('Poseidon', [indexPt, keyPt, valuePt, this.loadArbitraryStatic(0n, 1)])[0]

      placeMerkleProofVerification(
        indexPt,
        childPt,
        merkleProof.siblings,
        this.getReservedVariableFromBuffer('INI_MERKLE_ROOT'),
      )
    }

    // Integrity check of final storage writes
    const finalMTRootPt = this.addReservedVariableToBufferIn('RES_MERKLE_ROOT', await this.cachedOpts.stateManager.getUpdatedMerkleTreeRoot(), true)
    for (const [key, accessList] of this.state.cachedStorage.entries()) {
      if (accessList.length === 0) {
        continue;
      }

      const mtIndex = this.cachedOpts.stateManager.getMTIndex(key)
      if (mtIndex < 0) {
        continue;
      }

      let lastWriteIndex = -1
      for (let i = accessList.length - 1; i >= 0; i--) {
        if (accessList[i].access === 'Write') {
          lastWriteIndex = i
          break;
        }
      }
      if (lastWriteIndex === -1){
        continue;
      }

      const cache = accessList[lastWriteIndex]!
      const keyPt = cache.keyPt!
      if (key !== keyPt.value) {
        throw new Error('Something wrong with cachedStorage. Need to be debugged.')
      }
      const merkleProof = await this.cachedOpts.stateManager.getMerkleProof(mtIndex)

      const indexPt = this.addReservedVariableToBufferIn('MERKLE_PROOF', BigInt(mtIndex), true)
      const valuePt = cache.valuePt
      const childPt = this.placeArith('Poseidon', [indexPt, keyPt, valuePt, this.loadArbitraryStatic(0n, 1)])[0]

      placeMerkleProofVerification(
        indexPt,
        childPt,
        merkleProof.siblings,
        finalMTRootPt,
      )
    }
    this._registerOtherContractStrageWriting()
  }

  private _registerOtherContractStrageWriting(): void {
    // Register other contract storage writings
    for (const [key, cache] of this.state.cachedStorage.entries()) {
      if (this.cachedOpts.stateManager.getMTIndex(key) < 0){
        // Other contract storage access
        let lastWriteIndex = cache.length - 1
        while(lastWriteIndex >= 0) {
          if (cache[lastWriteIndex].access !== 'Write') {
            break
          }
          lastWriteIndex--
        }
        if (lastWriteIndex >= 0) {
          this.addReservedVariableToBufferOut(
            'OTHER_CONTRACT_STORAGE_OUT',
            cache[lastWriteIndex].valuePt,
            true,
            `at MPT key ${bigIntToHex(key)}`,
          );
        }
      }
    }
  }

  private _computeTxHash(): void {
    const hashPt = this.placePoseidon([
      this.getReservedVariableFromBuffer('TRANSACTION_NONCE'),
      this.getReservedVariableFromBuffer('EDDSA_SIGNATURE'),
      this.getReservedVariableFromBuffer('EDDSA_RANDOMIZER_X'),
      this.getReservedVariableFromBuffer('EDDSA_RANDOMIZER_Y'),
    ])
    this.state.transactionHashes.push(DataPtFactory.deepCopy(hashPt))

    // This will be moving to the end of block process
    this.addReservedVariableToBufferOut('TX_BATCH_HASH', hashPt, true)
  }

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
