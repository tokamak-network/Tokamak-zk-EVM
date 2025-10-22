
import { Common } from '@ethereumjs/common';
import { DataPtDescription, synthesizerOpcodeByName, synthesizerOpcodeList, SynthesizerSupportedArithOpcodes, SynthesizerSupportedBlkInfOpcodes, SynthesizerSupportedEnvInfOpcodes, SynthesizerSupportedSysFlowOpcodes, VARIABLE_DESCRIPTION, type ArithmeticOperator, type DataPt, type ReservedVariable, type SynthesizerSupportedOpcodes } from '../../../types/index.ts';

import {
  Address,
  BIGINT_0,
  BIGINT_1,
  BIGINT_2,
  BIGINT_2EXP96,
  BIGINT_2EXP160,
  BIGINT_2EXP224,
  BIGINT_7,
  BIGINT_8,
  BIGINT_31,
  BIGINT_32,
  BIGINT_96,
  BIGINT_160,
  BIGINT_224,
  BIGINT_255,
  BIGINT_256,
  MAX_INTEGER_BIGINT,
  TWO_POW256,
  bigIntToAddressBytes,
  bigIntToBytes,
  bytesToBigInt,
  bytesToHex,
  bytesToInt,
  concatBytes,
  setLengthLeft,
  setLengthRight,
  createAddressFromBigInt,
  createAddressFromString,
  hexToBigInt,
  equalsBytes,
  AddressLike,
  bigIntToHex,
} from '@ethereumjs/util'
import { keccak256 } from 'ethereum-cryptography/keccak.js'
import { ExecResult, InterpreterStep } from '@ethereumjs/evm'
import { ISynthesizerProvider } from './index.ts'
import { RunState } from 'src/interpreter.ts';
import { MemoryPt, MemoryPts } from 'src/tokamak/pointers/memoryPt.ts';
import { DEFAULT_SOURCE_BIT_SIZE } from 'src/tokamak/constant/constants.ts';

export interface HandlerOpts {
    op: SynthesizerSupportedOpcodes,
    pc?: bigint,
    thisAddress?: Address,
    callerAddress?: Address,
    originAddress?: Address,
    memOut?: Uint8Array,
    callDepth?: number,
}

export interface SynthesizerOpHandler {
  (prevStepResult: InterpreterStep, afterStepResult: InterpreterStep): void
}

const checkRequiredInput = (...input: unknown[]): void => {
  if (input.some(v => v === undefined)) throw new Error('Required inputs are missing')
}

export class InstructionHandlers {
  public synthesizerHandlers!: Map<number, SynthesizerOpHandler>
  constructor(
    private parent: ISynthesizerProvider,
  ) {
    this._createSynthesizerHandlers()
  }

  private _createSynthesizerHandlers(): void {
    this.synthesizerHandlers = new Map<number, SynthesizerOpHandler>()
    const __createArithHandler = (opName: SynthesizerSupportedArithOpcodes): void => {
      const op: number = synthesizerOpcodeByName[opName]
      this.synthesizerHandlers.set(
        op,
        (prevStepResult, afterStepResult) => {
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
            default:
              nIns = 2
              break            
          }
          const ins = prevStepResult.stack.slice(0, nIns)
          const out = afterStepResult.stack[0]
          this.handleArith(opName, ins, out)
        },
      )
    }
    const __createEnvInfHandler = (opName: SynthesizerSupportedEnvInfOpcodes): void => {
      const op: number = synthesizerOpcodeByName[opName]
      this.synthesizerHandlers.set(
        op,
        (prevStepResult, afterStepResult) => {
          const out: bigint = afterStepResult.stack[0]
          const opts: HandlerOpts = {
            op: opName,
            pc: BigInt(prevStepResult.pc - 1),
            thisAddress: prevStepResult.codeAddress,
            callerAddress: prevStepResult.address,
            originAddress: createAddressFromBigInt(this.parent.state.cachedOrigin?.value ?? 0n),
            callDepth: prevStepResult.depth,
          }
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
                const ins = prevStepResult.stack.slice(0, nIns)
                const memOffset = ins[1]
                const dataLength = ins[2]
                opts.memOut = afterStepResult.memory.slice(Number(memOffset), Number(dataLength))
              }
              break
            case 'EXTCODECOPY': 
              nIns = 4
              {
                const ins = prevStepResult.stack.slice(0, nIns)
                const memOffset = ins[2]
                const dataLength = ins[3]
                opts.memOut = afterStepResult.memory.slice(Number(memOffset), Number(dataLength))
              }
              break
            default:
              nIns = 0
              break
          }
          const ins = prevStepResult.stack.slice(0, nIns)
          this.handleEnvInf(ins, out, opts)
        },
      )
    }
    const __createBlkInfHandler = (opName: SynthesizerSupportedBlkInfOpcodes): void => {
      const op: number = synthesizerOpcodeByName[opName]
      this.synthesizerHandlers.set(
        op,
        (prevStepResult, afterStepResult) => {
          const blockNumber = opName === 'BLOCKHASH' ? prevStepResult.stack[0] : undefined
          const outVal = afterStepResult.stack[0]
          this.handleBlkInf(opName, outVal, blockNumber)
        },
      )
    }
    const __createSysFlowHandlers = (opName: SynthesizerSupportedSysFlowOpcodes): void => {
      const op: number = synthesizerOpcodeByName[opName]
      this.synthesizerHandlers.set(
        op,
        (prevStepResult, afterStepResult) => {
          const out: bigint = afterStepResult.stack[0]
          const opts: HandlerOpts = {
            op: opName,
            pc: BigInt(prevStepResult.pc - 1),
            thisAddress: prevStepResult.codeAddress,
            callerAddress: prevStepResult.address,
            originAddress: createAddressFromBigInt(this.parent.state.cachedOrigin?.value ?? 0n),
            callDepth: prevStepResult.depth,
          }
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
                const ins = prevStepResult.stack.slice(0, nIns)
                const memOffset = ins[0]
                const dataLength = opName === 'MSTORE' ? 32 : 1
                opts.memOut = afterStepResult.memory.slice(Number(memOffset), dataLength)
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
                const ins = prevStepResult.stack.slice(0, nIns)
                const memOffset = ins[0]
                const dataLength = ins[1]
                opts.memOut = afterStepResult.memory.slice(Number(memOffset), Number(dataLength))
              }
              break
            case 'MCOPY':
              nIns = 3
              {
                const ins = prevStepResult.stack.slice(0, nIns)
                const memOffset = ins[1]
                const dataLength = ins[2]
                opts.memOut = afterStepResult.memory.slice(Number(memOffset), Number(dataLength))
              }
              break
            case 'CALL':
            case 'CALLCODE':
              nIns = 7
              {
                const ins = prevStepResult.stack.slice(0, nIns)
                const memOffset = ins[5]
                const dataLength = ins[6]
                opts.memOut = afterStepResult.memory.slice(Number(memOffset), Number(dataLength))
              }
              break
            case 'DELEGATECALL':
            case 'STATICCALL':
              nIns = 6
              {
                const ins = prevStepResult.stack.slice(0, nIns)
                const memOffset = ins[4]
                const dataLength = ins[5]
                opts.memOut = afterStepResult.memory.slice(Number(memOffset), Number(dataLength))
              }
              break
            default:
              nIns = 0
              break
          }
          const ins = prevStepResult.stack.slice(0, nIns)
          this.handleSysFlow(ins, out, opts)
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
      //'KECCAK256',
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
      (prevStepResult, afterStepResult) => {
        const out: bigint = afterStepResult.stack[0]
        const numToPush = prevStepResult.opcode.code - 0x5f
        const pc = prevStepResult.pc - 1
        const thisAddress = prevStepResult.codeAddress.toString()
        const callerAdderss = prevStepResult.address.toString()
        const staticInDesc = `Static input for PUSH${numToPush} instruction at PC ${pc} of code address ${thisAddress} called by ${callerAdderss}`
        this.parent.state.stackPt.push(this.parent.loadArbitraryStatic(
          out,
          numToPush * 8,
          staticInDesc,
        ))
        if (this.parent.state.stackPt.peek(1)[0].value !== out) {
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
      (prevStepResult, afterStepResult) => {
        const stackPos = prevStepResult.opcode.code - 0x7f
        this.parent.state.stackPt.dup(stackPos)
        if (this.parent.state.stackPt.peek(1)[0].value !== afterStepResult.stack[0]) {
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
      (prevStepResult, afterStepResult) => {
        const stackPos = prevStepResult.opcode.code - 0x8f
        this.parent.state.stackPt.swap(stackPos)
        if (this.parent.state.stackPt.peek(1)[0].value !== afterStepResult.stack[0]) {
          throw new Error(`Synthesizer: SWAP${stackPos}: Output data mismatch`)
        }
      },
    )
    const swapFn = this.synthesizerHandlers.get(synthesizerOpcodeByName['SWAP1'])!
    for (let i = 0x91; i <= 0x9f; i++) {
      this.synthesizerHandlers.set(i, swapFn)
    }
  }

  getOriginAddressPt(): DataPt {
    const txNonce = this.parent.state.txNonce
    if (txNonce < 0) {
      throw new Error('Negative txNonce')
    }

    const messageContent: ReservedVariable[][] = [
      ['TRANSACTION_NONCE', 'CONTRACT_ADDRESS', 'FUNCTION_SELECTOR', 'TRANSACTION_INPUT0'],
      ['TRANSACTION_INPUT1', 'TRANSACTION_INPUT2', 'TRANSACTION_INPUT3', 'TRANSACTION_INPUT4'],
      ['TRANSACTION_INPUT5', 'TRANSACTION_INPUT6', 'TRANSACTION_INPUT7', 'TRANSACTION_INPUT8'],
    ];

    const read = (n: ReservedVariable) =>
      this.parent.loadReservedVariableFromBuffer(n, txNonce)

    const messagePts: DataPt[][] = messageContent.map(row => row.map(read))

    if (messagePts.length !== 3 || messagePts.flat().length > 12) throw new Error('Excessive transaction messages')
    
    const publicKeyPt: DataPt[] = [
      this.parent.loadReservedVariableFromBuffer('EDDSA_PUBLIC_KEY_X'),
      this.parent.loadReservedVariableFromBuffer('EDDSA_PUBLIC_KEY_Y')
    ]
    const randomizerPt: DataPt[] = [
      this.parent.loadReservedVariableFromBuffer('EDDSA_RANDOMIZER_X', txNonce),
      this.parent.loadReservedVariableFromBuffer('EDDSA_RANDOMIZER_Y', txNonce)
    ]
    const signaturePt: DataPt = this.parent.loadReservedVariableFromBuffer('EDDSA_SIGNATURE', txNonce)
    const firstPoseidonInput: DataPt[] = [...randomizerPt, ...publicKeyPt]
    const poseidonInter: DataPt[] = []
    poseidonInter.push(...this.parent.placeArith('Poseidon4', firstPoseidonInput))
    poseidonInter.push(...this.parent.placeArith('Poseidon4', messagePts[0]))
    poseidonInter.push(...this.parent.placeArith('Poseidon4', messagePts[1]))
    poseidonInter.push(...this.parent.placeArith('Poseidon4', messagePts[2]))
    const poseidonOut: DataPt = this.parent.placeArith('Poseidon4', poseidonInter)[0]
    const bitsOut: DataPt[] = this.parent.placeArith('PrepareEdDsaScalars', [signaturePt, poseidonOut])
    if (bitsOut.length !== 504) {
      throw new Error('PrepareEdDsaScalar was expected to output 504 bits');
    }
    const signBits: DataPt[] = bitsOut.slice(0, 252)
    const challengeBits: DataPt[] = bitsOut.slice(252, -1)

    const jubjubBasePt: DataPt[] = [
      this.parent.loadReservedVariableFromBuffer('JUBJUB_BASE_X'),
      this.parent.loadReservedVariableFromBuffer('JUBJUB_BASE_Y')
    ]
    const jubjubPoIPt: DataPt[] = [
      this.parent.loadReservedVariableFromBuffer('JUBJUB_POI_X'),
      this.parent.loadReservedVariableFromBuffer('JUBJUB_POI_Y')
    ]

    const sG: DataPt[] = this.parent.placeJubjubExp(
      [...jubjubBasePt, ...signBits],
      jubjubPoIPt,
    )

    const eA: DataPt[] = this.parent.placeJubjubExp(
      [...publicKeyPt, ...challengeBits],
      jubjubPoIPt,
    )

    this.parent.placeArith('EdDsaVerify', [...sG, ...randomizerPt, ...eA])
    
    const zeroPt: DataPt = this.parent.loadArbitraryStatic(0n, 1)
    const hashPt: DataPt = this.parent.placeArith('Poseidon4', [...publicKeyPt, zeroPt, zeroPt])[0]
    const addrMaskPt: DataPt = this.parent.loadReservedVariableFromBuffer('ADDRESS_MASK')
    this.parent.state.cachedOrigin = this.parent.placeArith('AND', [hashPt, addrMaskPt])[0]
    return this.parent.state.cachedOrigin!
  }

  public handleArith = (
    op: SynthesizerSupportedArithOpcodes,
    ins: bigint[],
    out: bigint,
  ): void => {
    const inPts = this._popStackPtAndCheckInputConsistency(ins)
    let outPts: DataPt[];
    switch (op) {
      case 'EXP':
        outPts = [this.parent.placeExp(inPts)];
        break;
      default:
        outPts = this.parent.placeArith(op as ArithmeticOperator, inPts);
        break;
    }
    if (outPts.length !== 1 || outPts[0].value !== out) {
      throw new Error(`Synthesizer: ${op}: Output data mismatch`);
    }
    this.parent.state.stackPt.push(outPts[0]);
  }

  public handleBlkInf = (
    op: SynthesizerSupportedBlkInfOpcodes,
    out: bigint,
    blockNumber?: bigint,
  ): void => {
    const stackPt = this.parent.state.stackPt
    let dataPt: DataPt;
    switch (op) {
      case 'COINBASE':
      case 'TIMESTAMP':
      case 'NUMBER':
      case 'GASLIMIT':
      case 'CHAINID':
      case 'SELFBALANCE':
      case 'BASEFEE': {
        dataPt = this.parent.loadReservedVariableFromBuffer(op)
        break
      }
      case 'BLOCKHASH': {
        this._popStackPtAndCheckInputConsistency([blockNumber!])
        const blockNumberDiff = this.parent.loadReservedVariableFromBuffer('NUMBER').value - blockNumber!
        dataPt =  blockNumberDiff <= 0n && blockNumberDiff > 256n ? 
          this.parent.loadArbitraryStatic(0n, 1) : 
          this.parent.loadReservedVariableFromBuffer(`BLOCKHASH_${blockNumberDiff}` as ReservedVariable)
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
    checkRequiredInput(opts.pc, opts.thisAddress, opts.callerAddress)
    const value = output
    const cachedDataPt = this.parent.state.cachedStaticIn.get(value)
    const staticInDesc = `Static input for ${opts.op} instruction at PC ${opts.pc!} of code address ${opts.thisAddress!.toString()} called by ${opts.callerAddress!.toString()}`
    let targetDesc = targetAddress === undefined ? `` : `(target: ${createAddressFromBigInt(targetAddress).toString()})`
    return cachedDataPt ?? this.parent.loadArbitraryStatic(
      value,
      undefined,
      staticInDesc + targetDesc,
    )
  }

  private _popStackPtAndCheckInputConsistency = (ins: bigint[]): DataPt[] => {
    const nIns = ins.length  
    const dataPts = this.parent.state.stackPt.popN(nIns)
      for (var i = 0; i < nIns; i++) {
        if (ins[i] !== dataPts[i].value){
          throw new Error(`Synthesizer: Handler: The ${i}-th input data mismatch`)
        }
      }
      return dataPts
    }

  public handleEnvInf(
    ins: bigint[],
    out: bigint,
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
    
    const stackPt = this.parent.state.stackPt
    const memoryPt = this.parent.state.memoryPt
    this._popStackPtAndCheckInputConsistency(ins)
    const op = opts.op as SynthesizerSupportedEnvInfOpcodes
    switch (op) {
      case 'ADDRESS': 
        {
          checkRequiredInput(opts.originAddress, opts.thisAddress)
          const origin = opts.originAddress!
          const thisAddress = opts.thisAddress!
          if (origin === thisAddress) {
            stackPt.push(_retrieveOriginAddressPt())
          } else {
            stackPt.push(this._getStaticInDataPt(out, opts))
          }
        }
        break
      case 'BALANCE': 
        {
          const targetAddress = ins[0]
          stackPt.push(this._getStaticInDataPt(out, opts, targetAddress))
        }
        break
      case 'ORIGIN': 
        stackPt.push(_retrieveOriginAddressPt())
        break
      case 'CALLER': 
        {
          checkRequiredInput(opts.originAddress, opts.thisAddress)
          const origin = opts.originAddress!
          const caller = opts.callerAddress!
          if (origin === caller) {
            stackPt.push(_retrieveOriginAddressPt())
            
          } else {
            stackPt.push(this._getStaticInDataPt(out, opts))
          }  
        }
        break
      case 'CALLVALUE': 
        stackPt.push(this._getStaticInDataPt(out, opts))
        break
      case 'CALLDATALOAD': 
        {
          const srcOffset = ins[0]
          checkRequiredInput(opts.callDepth)
          const i = Number(srcOffset);
          const calldataMemoryPts = this.parent.state.callMemoryPtsStack[opts.callDepth!]
          if (calldataMemoryPts.length > 0) {
            const calldataMemoryPt = MemoryPt.simulateMemoryPt(calldataMemoryPts);
            const dataAliasInfos = calldataMemoryPt.getDataAlias(i, 32);
            if (dataAliasInfos.length > 0) {
              stackPt.push(this.parent.placeMemoryToStack(dataAliasInfos))
            } else {
              stackPt.push(this.parent.loadArbitraryStatic(0n, 1))
            }
          } else {
            stackPt.push(this.parent.loadArbitraryStatic(0n, 1))
          }   
        }
        break
      case 'CALLDATASIZE':
        stackPt.push(this._getStaticInDataPt(out, opts))
        break
      case 'CALLDATACOPY':
        {
          const memOffset = ins[0]
          const dataOffset = ins[1]
          const dataLength = ins[2]
          checkRequiredInput(opts.callDepth, opts.memOut)
          if (dataLength !== BIGINT_0) {
            const calldataMemoryPts = this.parent.state.callMemoryPtsStack[opts.callDepth!]
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
          if (!equalsBytes(_outData, opts.memOut!)) {
            throw new Error(`Synthesizer: ${op}: Output memory data mismatch`)
          }
        }
        break
      case 'CODESIZE':
        stackPt.push(this._getStaticInDataPt(out, opts))
        break
      case 'CODECOPY':
        {
          const memOffset = ins[0]
          const codeOffset = ins[1]
          const dataLength = ins[2]
          checkRequiredInput(opts.thisAddress, opts.memOut)
          if (dataLength !== BIGINT_0) {
            const memPts: MemoryPts = this._prepareCodeMemoryPts(
              opts.memOut!,
              bytesToBigInt(opts.thisAddress!.bytes),
              codeOffset,
              dataLength,
            )
            memoryPt.writeBatch(memPts)
          }

          const _outData = memoryPt.viewMemory(
            Number(memOffset),
            Number(dataLength),
          )
          if (!equalsBytes(_outData, opts.memOut!)) {
            throw new Error(`Synthesizer: ${op}: Output memory data mismatch`)
          }
        }
        break
      case 'GASPRICE': 
        stackPt.push(this._getStaticInDataPt(out, opts))
        break
      case 'EXTCODESIZE': 
        {
          const targetAdderss = ins[0]
          stackPt.push(this._getStaticInDataPt(out, opts, targetAdderss))  
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
          if (!equalsBytes(_outData, opts.memOut!)) {
            throw new Error(`Synthesizer: ${op}: Output memory data mismatch`)
          }
        }
        break
      case 'RETURNDATASIZE': 
        stackPt.push(this._getStaticInDataPt(out, opts))
        break
      case 'RETURNDATACOPY':
        {
          const memOffset = ins[0]
          const returnDataOffset = ins[1]
          const dataLength = ins[2]
          checkRequiredInput(opts.callDepth, opts.memOut)
          if (dataLength !== BIGINT_0) {
            const copiedMemoryPts = this.parent.copyMemoryPts(
              this.parent.state.cachedReturnMemoryPts,
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
          if (!equalsBytes(_outData, opts.memOut!)) {
            throw new Error(`Synthesizer: ${op}: Output memory data mismatch`)
          }
        }
        break
      case 'EXTCODEHASH': 
        {
          const targetAdderss = ins[0]
          stackPt.push(this._getStaticInDataPt(out, opts, targetAdderss))
        }
        break
      default:
        throw new Error(
          `Synthesizer: ${op} is not implemented.`,
        )
    }
    if (stackPt.peek(1)[0].value !== out) {
      throw new Error(`Synthesizer: ${op}: Output data mismatch`);
    }
  }

  public handleSysFlow(
    ins: bigint[],
    out: bigint,
    opts: HandlerOpts,
  ): void {
    const op = opts.op as SynthesizerSupportedSysFlowOpcodes
    const stackPt = this.parent.state.stackPt
    const memoryPt = this.parent.state.memoryPt
    const inPts = this._popStackPtAndCheckInputConsistency(ins)
    switch (op) {
      case 'POP': 
        break
      case 'MLOAD':
        {
          const pos = ins[0]
          const dataAliasInfos = memoryPt.getDataAlias(
            Number(pos),
            32,
          )
          const mutDataPt = dataAliasInfos.length === 0 ? this.parent.loadArbitraryStatic(0n, 1) : this.parent.placeMemoryToStack(dataAliasInfos)
          stackPt.push(mutDataPt)
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
          const _out = memoryPt.write(offsetNum, truncBitSize, newDataPt)
          if ( !equalsBytes(_out, opts.memOut!) ) {
            throw new Error(`Synthesizer: ${op}: Output memory data mismatch`)
          } 
        }
        break
      case 'SLOAD': 
        {
          const key = ins[0]
          stackPt.push(this.parent.loadStorage(key))
        }
        break
      case 'SSTORE': 
        {
          const key = ins[0]
          const dataPt = inPts[1]
          this.parent.storeStorage(key, dataPt)
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
          checkRequiredInput(opts.pc, opts.thisAddress, opts.callerAddress)
          const staticInDesc = `Static input for ${opts.op} instruction at PC ${opts.pc} of code address ${opts.thisAddress!} called by ${opts.callerAddress!}`
          stackPt.push(this.parent.loadArbitraryStatic(out, undefined, staticInDesc))
        }
        break
      case 'JUMPDEST': 
        break
      case 'MCOPY': 
        {
          const [dstOffset, srcOffset, length] = ins
          checkRequiredInput(opts.memOut)
          const _out = memoryPt.writeBatch(
            this.parent.copyMemoryPts(
              memoryPt.read(Number(srcOffset), Number(length)),
              srcOffset,
              length,
              dstOffset,
            )
          )
          if ( !equalsBytes(_out, opts.memOut!)) {
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
          checkRequiredInput(opts.callDepth, opts.memOut, opts.pc, opts.thisAddress, opts.callerAddress)
          const toAddr = ins[1]
          const outOffset = op === 'DELEGATECALL' || op === 'STATICCALL' ? ins[4] : ins[5]
          const outLength = op === 'DELEGATECALL' || op === 'STATICCALL' ? ins[5] : ins[6]
          if (toAddr >= 1n && toAddr <= 10n) {
            throw new Error(
              `Synthesizer: Precompiles are not implemented in Synthesizer.`,
            )
          }
          const _out = this.parent.state.memoryPt.writeBatch(
            this.parent.copyMemoryPts(
              this.parent.state.cachedReturnMemoryPts, 
              0n, 
              outLength, 
              outOffset
            )
          )
          if ( !equalsBytes(_out, opts.memOut!)) {
            throw new Error(
              `Synthesizer: ${op}: Return memory data mismatch`,
            )
          }
          this.parent.state.stackPt.push(this.parent.loadArbitraryStatic(
            out,
            undefined,
            `Call result of ${op} instruction at PC ${opts.pc!} of code address ${opts.thisAddress!.toString()} called by ${opts.callerAddress!.toString()}`,
          ))
        }
        break
      case 'RETURN':
      case 'REVERT':
        {
          checkRequiredInput(opts.memOut)
          const [offset, length] = ins
          this.parent.state.cachedReturnMemoryPts = this.parent.state.memoryPt.read(Number(offset), Number(length))
          
          const simMemoryPt = MemoryPt.simulateMemoryPt(this.parent.state.cachedReturnMemoryPts);
          const _out = simMemoryPt.viewMemory(0, Number(length));
          if (!equalsBytes(_out, opts.memOut!)) {
            throw new Error(`Synthesizer: ${op}: Output memory data mismatch`)
          }
        }
        break
      default:
        throw new Error(`Synthesizer: ${op} is not implemented.`)
    }
    if (stackPt.peek(1)[0].value !== out) {
      throw new Error(`Synthesizer: ${op}: Output data mismatch`)
    }
  }

  // Must run this function before EVM execute CALLs.
  public preTasksForCalls(op: SynthesizerSupportedOpcodes, prevStepResult: InterpreterStep): void {
    let toAddr: bigint
    let inOffset: bigint
    let inLength: bigint
    switch(op){
      case 'CALL':
      case 'CALLCODE': {
        const ins = prevStepResult.stack.slice(0, 7)
        toAddr = ins[1]
        inOffset = ins[3]
        inLength = ins[4]
      }
      break
      case 'DELEGATECALL':
      case 'STATICCALL': {
        const ins = prevStepResult.stack.slice(0, 6)
        toAddr = ins[1]
        inOffset = ins[2]
        inLength = ins[3]
      }
      break
      default: {
        return
      }
    }
    if (toAddr >= 1n && toAddr <= 10n) {
      throw new Error(
        `Synthesizer: Precompiles are not implemented in Synthesizer.`,
      )
    }
    const calldataMemoryPts = this.parent.copyMemoryPts(
      this.parent.state.memoryPt.read(Number(inOffset), Number(inLength)),
      inOffset,
      inLength,
    )
    const callDepth = prevStepResult.depth
    this.parent.state.callMemoryPtsStack[callDepth! + 1] = calldataMemoryPts

    const simCalldataMemoryPt = MemoryPt.simulateMemoryPt(calldataMemoryPts)
    const syntheCallData = simCalldataMemoryPt.viewMemory(0, Number(inLength))
    const actualCallData = prevStepResult.memory.subarray(Number(inOffset), Number(inLength))
    if (!equalsBytes(syntheCallData, actualCallData)) {
      throw new Error(`Synthesizer: ${op}: Calldata memory data mismatch`)
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
      const dataPt = this.parent.loadArbitraryStatic(dataSlice, undefined, desc)
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
}