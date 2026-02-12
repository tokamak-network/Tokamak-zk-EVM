
import { ISynthesizerProvider, MemoryPts, synthesizerOpcodeByName, SynthesizerOpts, SynthesizerSupportedArithOpcodes, SynthesizerSupportedBlkInfOpcodes, SynthesizerSupportedEnvInfOpcodes, SynthesizerSupportedSysFlowOpcodes, VARIABLE_DESCRIPTION, type DataPt, type ReservedVariable, type SynthesizerSupportedOpcodes } from '../types/index.ts';

import {
  Address,
  BIGINT_0,
  bytesToBigInt,
  setLengthRight,
  createAddressFromBigInt,
  bigIntToHex,
  setLengthLeft,
  bigIntToBytes,
  createAddressFromString,
} from '@ethereumjs/util'
import { InterpreterStep } from '@ethereumjs/evm'
import { DEFAULT_SOURCE_BIT_SIZE } from '../../synthesizer/params/index.ts';
import { DataPtFactory, MemoryPt, StackPt } from '../dataStructure/index.ts';
import { ArithmeticOperator, TX_MESSAGE_TO_HASH } from '../../interface/qapCompiler/configuredTypes.ts';
import { CachedStorageEntry, ContextManager } from './stateManager.ts';

export interface HandlerOpts {
  op: SynthesizerSupportedOpcodes,
  pc: bigint,
  thisAddress: Address,
  codeAddress: Address,
  originAddress: Address,
  callerAddress: Address,
  callDepth: number,
  thisContext: ContextManager,
  prevStepResult: InterpreterStep,
  stackPt: StackPt,
  memoryPt: MemoryPt,
  memOut?: Uint8Array,
}

export interface SynthesizerOpHandler {
  (context: ContextManager, stepResult: InterpreterStep): void | Promise<void>
}

const checkRequiredInput = (...input: unknown[]): void => {
  if (input.some(v => v === undefined)) throw new Error('Required inputs are missing')
}

export class InstructionHandler {
  public synthesizerHandlers!: Map<number, SynthesizerOpHandler>
  private cachedOpts: SynthesizerOpts
  constructor(
    private parent: ISynthesizerProvider,
  ) {
    this.cachedOpts = parent.cachedOpts
    this._createSynthesizerHandlers()
  }

  private _createHandlerOpts(opName: SynthesizerSupportedOpcodes, context: ContextManager): HandlerOpts {
    const prevStepResult = context.prevInterpreterStep;
    if (prevStepResult === null) {
      throw new Error('Debug: previous interpreter step is not set')
    }
    const depth = prevStepResult.depth;
    const callerAddr = context.callerPt.value;
    const originAddr = this.parent.state.cachedOrigin?.value
    if (originAddr === undefined) {
      throw new Error('Debug: Origin address is not verified')
    }
    return {
      op: opName,
      pc: BigInt(prevStepResult.pc - 1),
      codeAddress: prevStepResult.codeAddress ?? prevStepResult.address,
      thisAddress: prevStepResult.address,
      originAddress: createAddressFromBigInt(originAddr),
      callerAddress: createAddressFromBigInt(callerAddr),
      callDepth: depth,
      prevStepResult,
      thisContext: context,
      stackPt: context.stackPt,
      memoryPt: context.memoryPt,
    }
  }

  private _createSynthesizerHandlers(): void {
    this.synthesizerHandlers = new Map<number, SynthesizerOpHandler>()
    const __createArithHandler = (opName: SynthesizerSupportedArithOpcodes): void => {
      const op: number = synthesizerOpcodeByName[opName]
      this.synthesizerHandlers.set(
        op,
        (context, stepResult) => {
          const out: bigint | null = stepResult.stack[0] ?? null
          const opts = this._createHandlerOpts(opName, context)
          let nIns: number
          // based on https://www.evm.codes/
          switch(opName){
            case 'ISZERO':
            case 'NOT':
              nIns = 1
              break
            case 'ADDMOD':
            case 'MULMOD':
              nIns = 3
              break
            case 'KECCAK256': 
              nIns = 2
              {
                const ins = opts.prevStepResult.stack.slice(0, nIns)
                const memOffset = ins[0]
                const dataLength = ins[1]
                opts.memOut = opts.prevStepResult.memory.subarray(Number(memOffset), Number(memOffset) + Number(dataLength))
              }
              break
            default:
              nIns = 2
              break            
          }
          const ins = opts.prevStepResult.stack.slice(0, nIns)
          
          this.handleArith(ins, out, opts)
        },
      )
    }
    const __createEnvInfHandler = (opName: SynthesizerSupportedEnvInfOpcodes): void => {
      const op: number = synthesizerOpcodeByName[opName]
      this.synthesizerHandlers.set(
        op,
        (context, stepResult) => {
          const out: bigint | null = stepResult.stack[0] ?? null
          const opts = this._createHandlerOpts(opName, context);
          // based on https://www.evm.codes/
          let nIns: number
          switch(opName) {
            case 'BALANCE':
            case 'CALLDATALOAD':
            case 'EXTCODESIZE':
            case 'EXTCODEHASH':
              nIns = 1
              break
            case 'CALLDATACOPY':
            case 'CODECOPY':
            case 'RETURNDATACOPY':
              nIns = 3
              {
                const ins = opts.prevStepResult.stack.slice(0, nIns)
                const memOffset = ins[1]
                const dataLength = ins[2]
                opts.memOut = stepResult.memory.subarray(Number(memOffset), Number(memOffset) + Number(dataLength))
              }
              break
            case 'EXTCODECOPY': 
              nIns = 4
              {
                const ins = opts.prevStepResult.stack.slice(0, nIns)
                const memOffset = ins[2]
                const dataLength = ins[3]
                opts.memOut = stepResult.memory.subarray(Number(memOffset), Number(memOffset) + Number(dataLength))
              }
              break
            default:
              nIns = 0
              break
          }
          const ins = opts.prevStepResult.stack.slice(0, nIns)
          this.handleEnvInf(ins, out, opts)
        },
      )
    }
    const __createBlkInfHandler = (opName: SynthesizerSupportedBlkInfOpcodes): void => {
      const op: number = synthesizerOpcodeByName[opName]
      this.synthesizerHandlers.set(
        op,
        (context, stepResult) => {
          const opts = this._createHandlerOpts(opName, context);
          const inVal = opName === 'BLOCKHASH' ? opts.prevStepResult.stack[0] : undefined
          const outVal: bigint | null = stepResult.stack[0] ?? null
          this.handleBlkInf(opName, inVal, outVal, opts)
        },
      )
    }
    const __createSysFlowHandlers = (opName: SynthesizerSupportedSysFlowOpcodes): void => {
      const op: number = synthesizerOpcodeByName[opName]
      this.synthesizerHandlers.set(
        op,
        async (context, stepResult) => {
          const out: bigint | null = stepResult.stack[0] ?? null
          const opts = this._createHandlerOpts(opName, context)
          // based on https://www.evm.codes/
          let nIns: number
          switch(opName) {
            case 'POP':
            case 'MLOAD':
            case 'SLOAD':
            case 'JUMP':
              nIns = 1
              break
            case 'MSTORE':
            case 'MSTORE8':
              nIns = 2
              {
                const ins = opts.prevStepResult.stack.slice(0, nIns)
                const memOffset = ins[0]
                const dataLength = opName === 'MSTORE' ? 32 : 1
                opts.memOut = stepResult.memory.subarray(Number(memOffset), Number(memOffset) + dataLength)
              }
              break
            case 'SSTORE':
            case 'JUMPI':
              nIns = 2
              break
            case 'RETURN':
            case 'REVERT':
              nIns = 2
              {
                const ins = opts.prevStepResult.stack.slice(0, nIns)
                const memOffset = ins[0]
                const dataLength = ins[1]
                opts.memOut = stepResult.memory.subarray(Number(memOffset), Number(memOffset) + Number(dataLength))
              }
              break
            case 'MCOPY':
              nIns = 3
              {
                const ins = opts.prevStepResult.stack.slice(0, nIns)
                const memOffset = ins[1]
                const dataLength = ins[2]
                opts.memOut = stepResult.memory.subarray(Number(memOffset), Number(memOffset) + Number(dataLength))
              }
              break
            case 'CALL':
            case 'CALLCODE':
              nIns = 7
              {
                const ins = opts.prevStepResult.stack.slice(0, nIns)
                const memOffset = ins[5]
                const dataLength = ins[6]
                opts.memOut = stepResult.memory.subarray(Number(memOffset), Number(memOffset) + Number(dataLength))
              }
              break
            case 'DELEGATECALL':
            case 'STATICCALL':
              nIns = 6
              {
                const ins = opts.prevStepResult.stack.slice(0, nIns)
                const memOffset = ins[4]
                const dataLength = ins[5]
                opts.memOut = stepResult.memory.subarray(Number(memOffset), Number(memOffset) + Number(dataLength))
              }
              break
            default:
              nIns = 0
              break
          }
          const ins = opts.prevStepResult.stack.slice(0, nIns)
          await this.handleSysFlow(ins, out, opts)
        },
      )
    }

    // Start creating handlers
    this.synthesizerHandlers.set(synthesizerOpcodeByName['STOP'], function(){})
    ;([
      'ADD',
      'MUL',
      'SUB',
      'DIV',
      'SDIV',
      'MOD',
      'SMOD',
      'ADDMOD',
      'MULMOD',
      'EXP',
      'SIGNEXTEND',
      'LT',
      'GT',
      'SLT',
      'SGT',
      'EQ',
      'ISZERO',
      'AND',
      'OR',
      'XOR',
      'NOT',
      'BYTE',
      'SHL',
      'SHR',
      'SAR',
      'KECCAK256',
    ] satisfies SynthesizerSupportedOpcodes[]).forEach(__createArithHandler)
    ;([
      'ADDRESS',
      'BALANCE',
      'ORIGIN',
      'CALLER',
      'CALLVALUE',
      'CALLDATALOAD',
      'CALLDATASIZE',
      'CALLDATACOPY',
      'CODESIZE',
      'CODECOPY',
      'GASPRICE',
      'EXTCODESIZE',
      'EXTCODECOPY',
      'RETURNDATASIZE',
      'RETURNDATACOPY',
      'EXTCODEHASH',
    ] satisfies SynthesizerSupportedOpcodes[]).forEach(__createEnvInfHandler)
    ;([
      'BLOCKHASH',
      'COINBASE',
      'TIMESTAMP',
      'NUMBER',
      'PREVRANDAO',
      'GASLIMIT',
      'CHAINID',
      'SELFBALANCE',
      'BASEFEE',
      //'BLOBHASH',
      //'BLOBBASEFEE',
    ] satisfies SynthesizerSupportedOpcodes[]).forEach(__createBlkInfHandler)
    ;(['POP'
      ,'MLOAD'
      , 'MSTORE'
      , 'MSTORE8'
      , 'SLOAD'
      , 'SSTORE'
      , 'JUMP'
      , 'JUMPI'
      , 'PC'
      , 'MSIZE'
      , 'GAS'
      , 'JUMPDEST'
      // , 'TLOAD'
      // , 'TSTORE'
      , 'MCOPY'
      , 'PUSH0'
      // , 'CREATE'
      , 'CALL'
      , 'CALLCODE'
      , 'RETURN'
      , 'DELEGATECALL'
      // , 'CREATE2'
      , 'STATICCALL'
      , 'REVERT'
      // , 'INVALID'
      // , 'SELFDESTRUCT'
    ] satisfies SynthesizerSupportedOpcodes[]).forEach(__createSysFlowHandlers)

    // PUSHs
    this.synthesizerHandlers.set(
      synthesizerOpcodeByName['PUSH1'],
      (context, stepResult) => {
        const opts = this._createHandlerOpts('PUSH1', context);
        const out: bigint = stepResult.stack[0]
        const numToPush = opts.prevStepResult.opcode.code - 0x5f
        const staticInDesc = `Static input for PUSH${numToPush} instruction at PC ${opts.pc} of code address ${opts.thisAddress} (depth: ${opts.callDepth})`
        opts.stackPt.push(this.parent.loadArbitraryStatic(
          out,
          DEFAULT_SOURCE_BIT_SIZE,
          staticInDesc,
        ))
        if (opts.stackPt.peek(1)[0].value !== out) {
          throw new Error(`Synthesizer: PUSH${numToPush}: Output data mismatch`)
        }
      },
    )
    const pushFn = this.synthesizerHandlers.get(synthesizerOpcodeByName['PUSH1'])!
    for (let i = 0x61; i <= 0x7f; i++) {
      this.synthesizerHandlers.set(i, pushFn);
    }
    // DUPs
    this.synthesizerHandlers.set(
      synthesizerOpcodeByName['DUP1'],
      (context, stepResult) => {
        const opts = this._createHandlerOpts('DUP1', context);
        const stackPos = opts.prevStepResult.opcode.code - 0x7f
        opts.stackPt.dup(stackPos)
        if (opts.stackPt.peek(1)[0].value !== stepResult.stack[0]) {
          throw new Error(`Synthesizer: DUP${stackPos}: Output data mismatch`)
        }
      },
    )
    const dupFn = this.synthesizerHandlers.get(synthesizerOpcodeByName['DUP1'])!
    for (let i = 0x81; i <= 0x8f; i++) {
      this.synthesizerHandlers.set(i, dupFn)
    }
    // SWAPs
    this.synthesizerHandlers.set(
      synthesizerOpcodeByName['SWAP1'],
      (context, stepResult) => {
        const opts = this._createHandlerOpts('SWAP1', context);
        const stackPos = opts.prevStepResult.opcode.code - 0x8f
        opts.stackPt.swap(stackPos)
        if (opts.stackPt.peek(1)[0].value !== stepResult.stack[0]) {
          throw new Error(`Synthesizer: SWAP${stackPos}: Output data mismatch`)
        }
      },
    )
    const swapFn = this.synthesizerHandlers.get(synthesizerOpcodeByName['SWAP1'])!
    for (let i = 0x91; i <= 0x9f; i++) {
      this.synthesizerHandlers.set(i, swapFn)
    }

    // LOGs
    this.synthesizerHandlers.set(
      synthesizerOpcodeByName['LOG0'],
      (context, stepResult) => {
        const opts = this._createHandlerOpts('LOG0', context);
        const nIns = opts.prevStepResult.opcode.code - 0x9f + 1
        opts.stackPt.popN(nIns)
        if (opts.stackPt.peek(1)[0].value !== stepResult.stack[0]) {
          throw new Error(`Synthesizer: LOG${nIns - 2}: Output data mismatch`)
        }
      },
    )
    const logFn = this.synthesizerHandlers.get(synthesizerOpcodeByName['LOG0'])!
    for (let i = 0xa1; i <= 0xa4; i++) {
      this.synthesizerHandlers.set(i, logFn)
    }
  }

  getOriginAddressPt(): DataPt {
    const messagePts: DataPt[] = TX_MESSAGE_TO_HASH.map(msg => this.parent.getReservedVariableFromBuffer(msg))

    if ( messagePts.length !== 12) throw new Error('Invalid data pointer to the transaction message to be signed')
    
    const publicKeyPt: [DataPt, DataPt] = [
      this.parent.getReservedVariableFromBuffer('EDDSA_PUBLIC_KEY_X'),
      this.parent.getReservedVariableFromBuffer('EDDSA_PUBLIC_KEY_Y')
    ]
    const randomizerPt: DataPt[] = [
      this.parent.getReservedVariableFromBuffer('EDDSA_RANDOMIZER_X'),
      this.parent.getReservedVariableFromBuffer('EDDSA_RANDOMIZER_Y')
    ]
    const signaturePt: DataPt = this.parent.getReservedVariableFromBuffer('EDDSA_SIGNATURE')
    const poseidonIn: DataPt[] = [...randomizerPt, ...publicKeyPt, ...messagePts]
    const poseidonOut: DataPt = this.parent.placePoseidon(poseidonIn)
    // const bitsOut: DataPt[] = this.parent.placeArith('PrepareEdDsaScalars', [signaturePt, poseidonOut])
    // if (bitsOut.length !== 504) {
    //   throw new Error(`PrepareEdDsaScalar was expected to output 504 bits, got ${bitsOut.length}`);
    // }
    // const signBits: DataPt[] = bitsOut.slice(0, 252)
    // const challengeBits: DataPt[] = bitsOut.slice(252, )

    const signBits = this.parent.placeArith('DecToBit', [signaturePt])
    const challengeBits = this.parent.placeArith('DecToBit', [poseidonOut])
    const jubjubBasePt: DataPt[] = [
      this.parent.getReservedVariableFromBuffer('JUBJUB_BASE_X'),
      this.parent.getReservedVariableFromBuffer('JUBJUB_BASE_Y')
    ]
    const jubjubPoIPt: DataPt[] = [
      this.parent.getReservedVariableFromBuffer('JUBJUB_POI_X'),
      this.parent.getReservedVariableFromBuffer('JUBJUB_POI_Y')
    ]

    const sG: DataPt[] = this.parent.placeJubjubExp(
      [...jubjubBasePt, ...signBits],
      jubjubPoIPt,
      signaturePt.value
    )

    const eA: DataPt[] = this.parent.placeJubjubExp(
      [...publicKeyPt, ...challengeBits],
      jubjubPoIPt,
      poseidonOut.value
    )

    this.parent.placeArith('EdDsaVerify', [...sG, ...randomizerPt, ...eA])
    
    const hashPt: DataPt = this.parent.placePoseidon(publicKeyPt)
    const addrMaskPt: DataPt = this.parent.getReservedVariableFromBuffer('ADDRESS_MASK')
    this.parent.state.cachedOrigin = this.parent.placeArith('AND', [hashPt, addrMaskPt])[0]
    return DataPtFactory.deepCopy(this.parent.state.cachedOrigin!)
  }

  public async verifyStorage(keyPt: DataPt, value: bigint, treeIndex: [number, number], address: Address): Promise<{indexPt: DataPt, valuePt: DataPt}> {
    if (!this.parent.cachedOpts.stateManager.initialMerkleTrees.addresses[treeIndex[0]].equals(address)) {
      throw new Error(`Need to debug: Merkle tree index mismatches with given address`)
    }
    const merkleProof = await this.cachedOpts.stateManager.getMerkleProof(treeIndex);
    const indexPt = this.parent.addReservedVariableToBufferIn('MERKLE_PROOF', BigInt(treeIndex[1]), true);
    const valuePt = this.parent.addReservedVariableToBufferIn('IN_VALUE', value, true, ` at MT index: ${treeIndex[1]} of address: ${address}`);
    const childPt = this.parent.placePoseidon([
      keyPt, 
      valuePt,
    ])
    if (merkleProof.leaf !== childPt.value) {
      throw new Error(`Trying to access a cold storage but derived a leaf different from the initial Merkle Tree`)
    }

    const refInitRootPt = this.parent.state.cachedInitRoots === undefined ? undefined : this.parent.state.cachedInitRoots[treeIndex[0]];
    if (refInitRootPt === undefined) {
      throw new Error('Initial Merkle tree root for a specific address was not initialized in Synthesizer')
    }

    this.parent.placeMerkleProofVerification(
      indexPt,
      childPt,
      merkleProof.siblings,
      refInitRootPt,
    )

    if (this.parent.state.verifiedStorageMTIndices.findIndex(val => val[0] === treeIndex[0] && val[1] === treeIndex[1]) >= 0) {
      throw new Error(`A storage entry is verified twice.`)
    }
    this.parent.state.verifiedStorageMTIndices.push(treeIndex);
    return {indexPt, valuePt}
  }

  public async loadStorage(keyPt: DataPt, valueGiven?: bigint, _address?: Address): Promise<DataPt> {
    const address = _address ?? createAddressFromBigInt(this.parent.state.contextByDepth[this.parent.state.currentDepth].toAddressPt.value);
    const addressKey = address.toString();
    const key = keyPt.value;
    const valueStored = bytesToBigInt(
      await this.cachedOpts.stateManager.getStorage(
        address,
        setLengthLeft(bigIntToBytes(keyPt.value), 32),
      ),
    );

    if (valueGiven !== undefined) {
      if (valueGiven !== valueStored ) {
        throw new Error('Mismatch in storage values');
      }
    }
    const value = valueStored;

    const MTIndex = this.cachedOpts.stateManager.getMerkleTreeLeafIndex(address, key);
    const isRegisteredKey = MTIndex[0] >= 0 && MTIndex[1] >= 0 ? true : false;
    const cached = this.parent.state.cachedStorage.get(addressKey)?.get(key);
    const isColdAccess = cached === undefined ? true : false;

    let accessHistory: CachedStorageEntry;
    let indexPt, valuePt: DataPt;
    if (isColdAccess) {
      if (isRegisteredKey ) {
        ({ indexPt, valuePt } = await this.verifyStorage(keyPt, value, MTIndex, address));
        accessHistory = {
          addressIndex: MTIndex[0],
          indexPt,
          keyPt,
          valuePt,
          access: "Read",
        };
      } else {
        valuePt = this.parent.addReservedVariableToBufferIn(
          'UNREGISTERED_CONTRACT_STORAGE_IN',
          value,
          true,
          ` at MPT key ${bigIntToHex(key)} of address ${address.toString()}`,
        );
        accessHistory = {
          addressIndex: MTIndex[0],
          indexPt: null,
          keyPt,
          valuePt,
          access: "Read",
        };
      }
      this.parent.state.cachedStorage.get(addressKey)?.set(key, [accessHistory]) ?? this.parent.state.cachedStorage.set(addressKey, new Map([[key, [accessHistory]]]));
    } else {
      if ( cached === undefined || cached!.length === 0 ) {
        throw new Error('A cached storage is present, but no history.')
      }
      valuePt = cached[cached.length - 1].valuePt;
      if (valuePt.value !== value) {
        throw new Error('Discrepancy between cached and actual storage values')
      }
      if (cached[cached.length - 1].keyPt.value !== key) {
        throw new Error('Discrepancy between cached and actual key values')
      }
      const addressIndex = isRegisteredKey ? cached[cached.length - 1].addressIndex : null;
      if (addressIndex !== null && addressIndex !== MTIndex[0]) {
        throw new Error('Discrepancy between cached and actual MT address indices')
      }
      const indexPt = isRegisteredKey ? cached[cached.length - 1].indexPt : null;
      if (indexPt !== null && Number(indexPt.value) !== MTIndex[1]) {
        throw new Error('Discrepancy between cached and actual MT indices')
      }
      accessHistory = {
        addressIndex: MTIndex[0],
        indexPt,
        keyPt,
        valuePt,
        access: "Read",
      };
      cached.push(accessHistory);
    }
    return DataPtFactory.deepCopy(valuePt);
  }

  public async storeStorage(keyPt: DataPt, symbolDataPt: DataPt): Promise<void> {
    const address = createAddressFromBigInt(this.parent.state.contextByDepth[this.parent.state.currentDepth].toAddressPt.value);
    const addressKey = address.toString();
    const key = keyPt.value
    const cached = this.parent.state.cachedStorage.get(addressKey)?.get(key);
    const MTIndex = this.cachedOpts.stateManager.getMerkleTreeLeafIndex(address, key);
    const isRegisteredKey = MTIndex[0] >= 0 && MTIndex[1] >= 0 ? true : false;
    const isColdAccess = cached === undefined ? true : false;

    let accessHistory: CachedStorageEntry;
    if (isColdAccess) {
      if (isRegisteredKey) {
         throw new Error('Storage writing at a registered key is expected to be warm access');
        // Storage at a registered key must be warm (already loaded via loadStorage)
        // For odd cases, you could warm it first then retry:
        // await this.loadStorage(key, undefined, false);
        // return this.storeStorage(key, symbolDataPt);
      } else {
        accessHistory = {
          addressIndex: MTIndex[0],
          indexPt: null,
          keyPt: keyPt, 
          valuePt: symbolDataPt, 
          access: 'Write'
        };
        
      }
      this.parent.state.cachedStorage.get(addressKey)?.set(key, [accessHistory]) ?? this.parent.state.cachedStorage.set(addressKey, new Map([[key, [accessHistory]]]));
    } else {
      if ( cached === undefined || cached!.length === 0 ) {
        throw new Error('A cached storage is present, but no history.')
      }
      if (cached[cached.length - 1].keyPt.value !== key) {
        throw new Error('Discrepancy between cached and actual key values')
      }
      const addressIndex = isRegisteredKey ? cached[cached.length - 1].addressIndex : null;
      if (addressIndex !== null && addressIndex !== MTIndex[0]) {
        throw new Error('Discrepancy between cached and actual MT address indices')
      }
      const indexPt = isRegisteredKey ? cached[cached.length - 1].indexPt : null;
      if (indexPt !== null && Number(indexPt.value) !== MTIndex[1]) {
        throw new Error('Discrepancy between cached and actual MT indices')
      }
      accessHistory = { 
        addressIndex: MTIndex[0],
        indexPt,
        keyPt, 
        valuePt: symbolDataPt, 
        access: 'Write' 
      };
      cached.push(accessHistory);      
    }
  }

  public handleArith = (
    ins: bigint[],
    out: bigint,
    opts: HandlerOpts,
  ): void => {
    const inPts = this._popStackPtAndCheckInputConsistency(opts.stackPt, ins)
    let outPts: DataPt[];
    const op = opts.op as SynthesizerSupportedArithOpcodes
    switch (op) {
      case 'EXP':
        const basePt = inPts[0]
        const exponentPt = inPts[1]
        const exponentBits = this.parent.placeArith('DecToBit', [exponentPt])
        outPts = [this.parent.placeExp([basePt, ...exponentBits], exponentPt.value)];
        break;
      case 'KECCAK256': {
          checkRequiredInput(opts.memOut)
          const memOffset = ins[0]
          const dataLength = ins[1]
          const { chunkDataPts, dataRecovered } = this._chunkMemory(
            opts.memoryPt,
            memOffset,
            dataLength,
          )
          if (bytesToBigInt(opts.memOut!) !== dataRecovered) {
            throw new Error(`Synthesizer: ${op}: Memory data to load mismatch`)
          }
          outPts = [this.parent.placePoseidon(chunkDataPts)]
        }
        break
      default:
        outPts = this.parent.placeArith(op as ArithmeticOperator, inPts);
        break;
    }
    if (outPts.length !== 1 || outPts[0].value !== out) {
      throw new Error(`Synthesizer: ${op}: Output data mismatch`);
    }
    opts.stackPt.push(outPts[0]);
  }

  public handleBlkInf = (
    op: SynthesizerSupportedBlkInfOpcodes,
    inVal: bigint | undefined,
    out: bigint,
    opts: HandlerOpts,
  ): void => {
    const stackPt = opts.stackPt
    let dataPt: DataPt;
    switch (op) {
      case 'COINBASE':
      case 'TIMESTAMP':
      case 'NUMBER':
      case 'GASLIMIT':
      case 'CHAINID':
      case 'SELFBALANCE':
      case 'BASEFEE': {
        dataPt = this.parent.getReservedVariableFromBuffer(op)
        break
      }
      case 'BLOCKHASH': {
        const blockNumber = inVal;
        if (blockNumber === undefined) {
          throw new Error('Debug: BLOCKHASH requires an input block number')
        }
        this._popStackPtAndCheckInputConsistency(opts.stackPt, [blockNumber]);
        const blockNumberDiff = this.parent.getReservedVariableFromBuffer('NUMBER').value - blockNumber;
        dataPt =  blockNumberDiff <= 0n && blockNumberDiff > 256n ? 
          this.parent.loadArbitraryStatic(0n) : 
          this.parent.getReservedVariableFromBuffer(`BLOCKHASH_${blockNumberDiff}` as ReservedVariable)
      }
      default:
        throw new Error(
          `Synthesizer: ${op} is unimplemented.`,
        );
    }
    stackPt.push(dataPt);
    if (stackPt.peek(1)[0].value !== out) {
      throw new Error(`Synthesizer: ${op}: Output data mismatch`);
    }
  }

  private _getStaticInDataPt = (output: bigint, opts: HandlerOpts, targetAddress?: bigint): DataPt => {
    const value = output
    // const cachedDataPt = this.parent.state.cachedEVMIn.get(value)
    const staticInDesc = `Static input for ${opts.op} instruction at PC ${opts.pc} of code address ${opts.codeAddress} (depth : ${opts.callDepth})`
    let targetDesc = targetAddress === undefined ? `` : `(target: ${createAddressFromBigInt(targetAddress).toString()})`
    // return cachedDataPt ?? this.parent.loadArbitraryStatic(
    return this.parent.loadArbitraryStatic(
      value,
      DEFAULT_SOURCE_BIT_SIZE,
      staticInDesc + targetDesc,
    )
  }

  private _popStackPtAndCheckInputConsistency = (stackPt: StackPt, ins: bigint[]): DataPt[] => {
    const nIns = ins.length  
    const dataPts = stackPt.popN(nIns)
      for (var i = 0; i < nIns; i++) {
        if (ins[i] !== dataPts[i].value){
          throw new Error(`Synthesizer: Handler: The ${i}-th input data mismatch`)
        }
      }
      return dataPts
    }

  public handleEnvInf(
    ins: bigint[],
    out: bigint | null,
    opts: HandlerOpts,
  ): void {
    const _retrieveOriginAddressPt = (): DataPt => {
      checkRequiredInput(opts.originAddress)
      let dataPt: DataPt
      if (this.parent.state.cachedOrigin === undefined) {
        dataPt = this.getOriginAddressPt()
      } else {
        dataPt = this.parent.state.cachedOrigin
      }
      if (dataPt.value !== bytesToBigInt(opts.originAddress!.bytes)) {
        throw new Error("Mismatch of the origin between EVM and Synthesizer")
      }
      return dataPt
    }
    
    const stackPt = opts.stackPt;
    const memoryPt = opts.memoryPt;
    this._popStackPtAndCheckInputConsistency(opts.stackPt, ins)
    const op = opts.op as SynthesizerSupportedEnvInfOpcodes
    switch (op) {
      case 'ADDRESS': 
        {
          const cache = opts.thisContext.toAddressPt;
          if (cache === undefined) {
            throw new Error(`No cache for To Address`)
          }
          stackPt.push(DataPtFactory.deepCopy(cache))
          // checkRequiredInput(opts.originAddress)
          // const origin = opts.originAddress!
          // const thisAddress = opts.thisAddress ?? this.cachedOpts.signedTransaction.to
          // if (origin === thisAddress) {
          //   stackPt.push(_retrieveOriginAddressPt())
          // } else {
          //   stackPt.push(this._getStaticInDataPt(out!, opts))
          // }
        }
        break
      case 'BALANCE': 
        {
          const targetAddress = ins[0]
          stackPt.push(this._getStaticInDataPt(out!, opts, targetAddress))
        }
        break
      case 'ORIGIN': 
        stackPt.push(_retrieveOriginAddressPt())
        break
      case 'CALLER': 
        {
          const cache = opts.thisContext.callerPt;
          if (cache === undefined) {
            throw new Error(`No cache for caller address`)
          }
          stackPt.push(DataPtFactory.deepCopy(cache))
          // if (opts.callDepth === 0) {
            // stackPt.push(_retrieveOriginAddressPt())
          // } else {
          //   stackPt.push(this._getStaticInDataPt(out!, opts))
          // }  
        }
        break
      case 'CALLVALUE': 
        stackPt.push(this._getStaticInDataPt(out!, opts))
        break
      case 'CALLDATALOAD': 
        {
          const srcOffset = ins[0]
          const i = Number(srcOffset);
          const calldataMemoryPts = opts.thisContext.callDataMemoryPts;
          if (calldataMemoryPts.length > 0) {
            const calldataMemoryPt = MemoryPt.simulateMemoryPt(calldataMemoryPts);
            const dataAliasInfos = calldataMemoryPt.getDataAlias(i, 32);
            if (dataAliasInfos.length > 0) {
              stackPt.push(this.parent.placeMemoryToStack(dataAliasInfos))
            } else {
              stackPt.push(this.parent.loadArbitraryStatic(0n))
            }
          } else {
            stackPt.push(this.parent.loadArbitraryStatic(0n))
          }   
        }
        break
      case 'CALLDATASIZE':
        stackPt.push(this._getStaticInDataPt(out!, opts))
        break
      case 'CALLDATACOPY':
        {
          const memOffset = ins[0]
          const dataOffset = ins[1]
          const dataLength = ins[2]
          checkRequiredInput(opts.memOut)
          if (dataLength !== BIGINT_0) {
            const calldataMemoryPts = opts.thisContext.callDataMemoryPts;
            const memPts: MemoryPts = this.parent.copyMemoryPts(
              calldataMemoryPts,
              dataOffset,
              dataLength,
              memOffset,
            )
            memoryPt.writeBatch(memPts)
          }
          const _outData = memoryPt.viewMemory(
            Number(memOffset),
            Number(dataLength),
          )
          if (bytesToBigInt(_outData) !== bytesToBigInt(opts.memOut!)) {
            throw new Error(`Synthesizer: ${op}: Output memory data mismatch`)
          }
        }
        break
      case 'CODESIZE':
        stackPt.push(this._getStaticInDataPt(out!, opts))
        break
      case 'CODECOPY':
        {
          const memOffset = ins[0]
          const codeOffset = ins[1]
          const dataLength = ins[2]
          checkRequiredInput(opts.memOut)
          const thisAddress = opts.thisAddress ?? this.cachedOpts.signedTransaction.to
          if (dataLength !== BIGINT_0) {
            const memPts: MemoryPts = this._prepareCodeMemoryPts(
              opts.memOut!,
              bytesToBigInt(thisAddress.toBytes()),
              codeOffset,
              dataLength,
            )
            memoryPt.writeBatch(memPts)
          }

          const _outData = memoryPt.viewMemory(
            Number(memOffset),
            Number(dataLength),
          )
          if (bytesToBigInt(_outData) !== bytesToBigInt(opts.memOut!)) {
            throw new Error(`Synthesizer: ${op}: Output memory data mismatch`)
          }
        }
        break
      case 'GASPRICE': 
        stackPt.push(this._getStaticInDataPt(out!, opts))
        break
      case 'EXTCODESIZE': 
        {
          const targetAdderss = ins[0]
          stackPt.push(this._getStaticInDataPt(out!, opts, targetAdderss))  
        }
        break
      case 'EXTCODECOPY':
        {
          const addressBigInt = ins[0]
          const memOffset = ins[1]
          const codeOffset = ins[2]
          const dataLength = ins[3]
          checkRequiredInput(opts.memOut)
          if (dataLength !== BIGINT_0) {
            const memPts: MemoryPts = this._prepareCodeMemoryPts(
              opts.memOut!,
              addressBigInt,
              codeOffset,
              dataLength,
            )
            memoryPt.writeBatch(memPts)
          }
          const _outData = memoryPt.viewMemory(
            Number(memOffset),
            Number(dataLength),
          )
          
          if (bytesToBigInt(_outData) !== bytesToBigInt(opts.memOut!)) {
            throw new Error(`Synthesizer: ${op}: Output memory data mismatch`)
          }
        }
        break
      case 'RETURNDATASIZE': 
        stackPt.push(this._getStaticInDataPt(out!, opts))
        break
      case 'RETURNDATACOPY':
        {
          const memOffset = ins[0]
          const returnDataOffset = ins[1]
          const dataLength = ins[2]
          checkRequiredInput(opts.memOut)
          if (dataLength !== BIGINT_0) {
            const copiedMemoryPts = this.parent.copyMemoryPts(
              opts.thisContext.returnDataMemoryPts,
              returnDataOffset,
              dataLength,
              memOffset,
            )
            memoryPt.writeBatch(copiedMemoryPts)
          }
          const _outData = memoryPt.viewMemory(
            Number(memOffset),
            Number(dataLength),
          );
          if (bytesToBigInt(_outData) !== bytesToBigInt(opts.memOut!)) {
            throw new Error(`Synthesizer: ${op}: Output memory data mismatch`)
          }
        }
        break
      case 'EXTCODEHASH': 
        {
          const targetAdderss = ins[0]
          stackPt.push(this._getStaticInDataPt(out!, opts, targetAdderss))
        }
        break
      default:
        throw new Error(
          `Synthesizer: ${op} is not implemented.`,
        )
    }
    if (out === null) {
      if (stackPt.length !== 0) {
        throw new Error(`Synthesizer: ${op}: Output data mismatch`);
      }
    } else {
      if (stackPt.peek(1)[0].value !== out) {
        throw new Error(`Synthesizer: ${op}: Output data mismatch`);
      }
    }
  }

  public async handleSysFlow(
    ins: bigint[],
    out: bigint | null,
    opts: HandlerOpts,
  ): Promise<void> {
    const op = opts.op as SynthesizerSupportedSysFlowOpcodes;
    const inPts = this._popStackPtAndCheckInputConsistency(opts.stackPt, ins);
    switch (op) {
      case 'POP': 
        break
      case 'MLOAD':
        {
          const pos = ins[0]
          const dataAliasInfos = opts.memoryPt.getDataAlias(
            Number(pos),
            32,
          )
          const mutDataPt = dataAliasInfos.length === 0 ? this.parent.loadArbitraryStatic(0n) : this.parent.placeMemoryToStack(dataAliasInfos)
          opts.stackPt.push(mutDataPt)
        }
        break
      case 'MSTORE': 
      case 'MSTORE8': 
        {
          checkRequiredInput(opts.memOut)
          const offsetNum = Number(ins[0])
          const originalDataPt = inPts[1]
          const truncBitSize = op === 'MSTORE' ? DEFAULT_SOURCE_BIT_SIZE : 8
          // Replace dataPt in StackPt with the tracked memPt
          const newDataPt = truncBitSize < originalDataPt.sourceBitSize ? this.parent.placeMSTORE(originalDataPt, truncBitSize) : originalDataPt
          const _out = opts.memoryPt.write(offsetNum, Math.ceil(truncBitSize / 8), newDataPt)
          if ( bytesToBigInt(_out) !== bytesToBigInt(opts.memOut!)) {
            throw new Error(`Synthesizer: ${op}: Output memory data mismatch`)
          } 
        }
        break
      case 'SLOAD': 
        {
          const keyPt = inPts[0]
          opts.stackPt.push(await this.loadStorage(keyPt, out!))
        }
        break
      case 'SSTORE': 
        {
          const keyPt = inPts[0]
          const dataPt = inPts[1]
          this.storeStorage(keyPt, dataPt)
          if ( dataPt.value !== ins[1] ) {
            throw new Error(`Synthesizer: ${op}: Output storage data mismatch`)
          } 
        }
        break
      case 'JUMP': 
      case 'JUMPI': 
        break
      case 'PC': 
      case 'MSIZE':
      case 'GAS':
        {
          const staticInDesc = `Static input for ${opts.op} instruction at PC ${opts.pc} of code address ${opts.codeAddress} (depth: ${opts.callDepth})`
          opts.stackPt.push(this.parent.loadArbitraryStatic(out!, DEFAULT_SOURCE_BIT_SIZE, staticInDesc))
        }
        break
      case 'JUMPDEST': 
        break
      case 'MCOPY': 
        {
          const [dstOffset, srcOffset, length] = ins
          checkRequiredInput(opts.memOut)
          const _out = opts.memoryPt.writeBatch(
            this.parent.copyMemoryPts(
              opts.memoryPt.read(Number(srcOffset), Number(length)),
              srcOffset,
              length,
              dstOffset,
            )
          )
          if (bytesToBigInt(_out) !== bytesToBigInt(opts.memOut!)) {
            throw new Error(`Synthesizer: ${op}: Output memory data mismatch`)
          }
        }
        break
      case 'CALL':
      case 'CALLCODE':
      case 'DELEGATECALL':
      case 'STATICCALL':
        // Only post-tasks after executing an interpreter call are listed here. See "preTasksForCalls" for the pre-tasks.
        {
          checkRequiredInput(opts.memOut)
          const toAddr = ins[1]
          const outOffset = op === 'DELEGATECALL' || op === 'STATICCALL' ? ins[4] : ins[5]
          const outLength = op === 'DELEGATECALL' || op === 'STATICCALL' ? ins[5] : ins[6]
          if (toAddr >= 1n && toAddr <= 10n) {
            throw new Error(
              `Synthesizer: Precompiles are not implemented in Synthesizer.`,
            )
          }
          const _out = opts.memoryPt.writeBatch(
            this.parent.copyMemoryPts(
              opts.thisContext.returnDataMemoryPts, 
              0n, 
              outLength, 
              outOffset
            )
          )
          if (bytesToBigInt(_out) !== bytesToBigInt(opts.memOut!)) {
            throw new Error(
              `Synthesizer: ${op}: Return memory data mismatch`,
            )
          }
          opts.stackPt.push(this.parent.loadArbitraryStatic(
            out!,
            DEFAULT_SOURCE_BIT_SIZE,
            `Call result of ${op} instruction at PC ${opts.pc} of code address ${opts.codeAddress} (depth: ${opts.callDepth})`,
          ))
        }
        break
      case 'RETURN':
      case 'REVERT':
        {
          checkRequiredInput(opts.memOut)
          const [offset, length] = ins;
          opts.thisContext.resultMemoryPts = this.parent.copyMemoryPts(
            opts.memoryPt.read(Number(offset), Number(length)),
            offset,
            length,
          )
          
          const simMemoryPt = MemoryPt.simulateMemoryPt(opts.thisContext.resultMemoryPts);
          const _out = simMemoryPt.viewMemory(0, Number(length));
          if (bytesToBigInt(_out) !== bytesToBigInt(opts.memOut!)) {
            throw new Error(`Synthesizer: ${op}: Output memory data mismatch`)
          }
        }
        break
      default:
        throw new Error(`Synthesizer: ${op} is not implemented.`)
    }
    if (out === null) {
      if (opts.stackPt.length !== 0) {
        throw new Error(`Synthesizer: ${op}: Output data mismatch`)
      }
    } else {
      if (opts.stackPt.peek(1)[0].value !== out) {
        throw new Error(`Synthesizer: ${op}: Output data mismatch`)
      }
    }
  }

  private _prepareCodeMemoryPts(
    code: Uint8Array<ArrayBufferLike>,
    targetAddress: bigint,
    memOffset: bigint,
    codeOffset: bigint = 0n,
    dataLength: bigint = BigInt(code.byteLength),
  ): MemoryPts {
    // Copied from @ethereumjs/evm/src/opcdes/util.ts
    const getDataSlice = (data: Uint8Array, offset: bigint, length: bigint): Uint8Array => {
      const len = BigInt(data.length)
      if (offset > len) {
        offset = len
      }
      let end = offset + length
      if (end > len) {
        end = len
      }
      data = data.subarray(Number(offset), Number(end))
      // Right-pad with zeros to fill dataLength bytes
      data = setLengthRight(data, Number(length))
      return data
    }

    let memPts: MemoryPts = []
    const nChunks = Math.ceil(Number(dataLength) / 32)
    let accOffsetShift = 0n
    let lengthLeft = Number(dataLength)
    for (let i = 0; i < nChunks; i++){
      const sliceLength = Math.min(32, lengthLeft)
      const dataSlice = bytesToBigInt(getDataSlice(code, codeOffset + accOffsetShift, BigInt(sliceLength)))
      const desc = `Code of address: ${bigIntToHex(targetAddress)}, offset: ${Number(codeOffset)}, length: ${Number(dataLength)} bytes, chunk: ${i+1} out of ${nChunks}.`
      const dataPt = this.parent.loadArbitraryStatic(dataSlice, DEFAULT_SOURCE_BIT_SIZE, desc)
      memPts.push({
        memByteOffset: Number(memOffset + accOffsetShift),
        containerByteSize: sliceLength,
        dataPt
      })
      lengthLeft -= sliceLength
      accOffsetShift += BigInt(sliceLength)
    }
    
    return memPts
  }

  private _chunkMemory(
    memoryPt: MemoryPt,
    offset: bigint,
    length: bigint,
  ): { chunkDataPts: DataPt[]; dataRecovered: bigint } {
    const offsetNum = Number(offset);
    const lengthNum = Number(length);
    let nChunks = lengthNum > 32 ? Math.ceil(lengthNum / 32) : 1;
  
    const chunkDataPts: DataPt[] = [];
    let dataRecovered = 0n;
    let lengthLeft = lengthNum;
  
    for (let i = 0; i < nChunks; i++) {
      const _offset = offsetNum + 32 * i;
      const _length = lengthLeft > 32 ? 32 : lengthLeft;
      lengthLeft -= _length;
  
      const dataAliasInfos = memoryPt.getDataAlias(_offset, _length);
      if (dataAliasInfos.length > 0) {
        chunkDataPts[i] = this.parent.placeMemoryToStack(dataAliasInfos);
      } else {
        chunkDataPts[i] = this.parent.loadArbitraryStatic(0n);
      }
  
      dataRecovered += chunkDataPts[i].value << BigInt(lengthLeft * 8);
    }
  
    return { chunkDataPts, dataRecovered };
  }
}
