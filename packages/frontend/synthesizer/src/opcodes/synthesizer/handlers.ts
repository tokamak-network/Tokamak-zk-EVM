<<<<<<< HEAD
import { TWO_POW256, bytesToBigInt, equalsBytes } from "@ethereumjs/util/index.js"
import { mod, fromTwos, toTwos } from "../util.js"
import { 
  synthesizerArith, 
  synthesizerEnvInf, 
  synthesizerBlkInf,
  prepareEXTCodePt
} from "../../tokamak/core/synthesizer.js"
import { copyMemoryRegion, simulateMemoryPt } from "../../tokamak/pointers/index.js"
import { BIGINT_0, BIGINT_1 } from "@ethereumjs/util/index.js"
import { SynthesizerHandler } from "./types.js"

export const synthesizerHandlers: Map<number, SynthesizerHandler> = new Map([
  // 0x01: ADD
  [0x01, async function (runState) {
    console.log('synthesizer add go')
    const [a, b] = runState.stackPt.popN(2)
    const r = mod(a.value + b.value, TWO_POW256)
    synthesizerArith('ADD', [a.value, b.value], r, runState)
  }],
  
  // 0x02: MUL
  [0x02, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    const r = mod(a.value * b.value, TWO_POW256)
    synthesizerArith('MUL', [a.value, b.value], r, runState)
  }],

  // 0x03: SUB
  [0x03, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    const r = mod(a.value - b.value, TWO_POW256)
    synthesizerArith('SUB', [a.value, b.value], r, runState)
  }],

  // 0x04: DIV
  [0x04, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    let r
    if (b.value === BIGINT_0) {
      r = BIGINT_0
    } else {
      r = mod(a.value / b.value, TWO_POW256)
    }
    synthesizerArith('DIV', [a.value, b.value], r, runState)
  }],

  // 0x05: SDIV
  [0x05, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    let r
    if (b.value === BIGINT_0) {
      r = BIGINT_0
    } else {
      r = toTwos(fromTwos(a.value) / fromTwos(b.value))
    }
     synthesizerArith('SDIV', [a.value, b.value], r, runState)
  }],

  // 0x06: MOD
  [0x06, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    let r
    if (b.value === BIGINT_0) {
      r = b.value
    } else {
      r = mod(a.value, b.value)
    }
   synthesizerArith('MOD', [a.value, b.value], r, runState)
  }],

  // 0x07: SMOD
  [0x07, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    let r
    if (b.value === BIGINT_0) {
      r = b.value
    } else {
      r = fromTwos(a.value) % fromTwos(b.value)
    }
      // Convert SMOD operation result to two's complement representation for EVM's 256-bit unsigned integer
      // Required to properly handle negative results since EVM processes all values as unsigned 256-bit integers
      // Using toTwos(r) to convert negative results to two's complement ensures SMOD operation works as expected
     synthesizerArith('SMOD', [a.value, b.value], toTwos(r), runState)
  }],

  // 0x08: ADDMOD
  [0x08, async function (runState) {
    const [a, b, c] = runState.stackPt.popN(3)
    let r
    if (c.value === BIGINT_0) {
      r = BIGINT_0
    } else {
      r = mod(a.value + b.value, c.value)
    }
    synthesizerArith('ADDMOD', [a.value, b.value, c.value], r, runState)
  }],

  // 0x09: MULMOD
  [0x09, async function (runState) {
    const [a, b, c] = runState.stackPt.popN(3)
    let r
    if (c.value === BIGINT_0) {
      r = BIGINT_0
    } else {
      r = mod(a.value * b.value, c.value)
    }
    synthesizerArith('MULMOD', [a.value, b.value, c.value], r, runState)
  }],

  // 0x0a: EXP
  [0x0a, async function (runState) {
    const [base, exponent] = runState.stackPt.popN(2)
    let r
    if (exponent.value === BIGINT_0) {
      r = BIGINT_1
    } else if (base.value === BIGINT_0) {
      r = base.value
    } else {
      r = base.value ** exponent.value % TWO_POW256
    }
    synthesizerArith('EXP', [base.value, exponent.value], r, runState)
  }],

  // 0x0b: SIGNEXTEND
  [0x0b, async function (runState) {
    const [k, val] = runState.stackPt.popN(2)
    synthesizerArith('SIGNEXTEND', [k.value, val.value], val.value, runState)
  }],

  // 0x10: LT
  [0x10, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    const r = a.value < b.value ? BIGINT_1 : BIGINT_0
    synthesizerArith('LT', [a.value, b.value], r, runState)
  }],

  // 0x11: GT
  [0x11, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    const r = a.value > b.value ? BIGINT_1 : BIGINT_0
    synthesizerArith('GT', [a.value, b.value], r, runState)
  }],

  // 0x12: SLT
  [0x12, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    const r = fromTwos(a.value) < fromTwos(b.value) ? BIGINT_1 : BIGINT_0
    await synthesizerArith('SLT', [a.value, b.value], r, runState)
  }],

  // 0x13: SGT
  [0x13, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    const r = fromTwos(a.value) > fromTwos(b.value) ? BIGINT_1 : BIGINT_0
    await synthesizerArith('SGT', [a.value, b.value], r, runState)
  }],

  // 0x14: EQ
  [0x14, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    const r = a.value === b.value ? BIGINT_1 : BIGINT_0
    await synthesizerArith('EQ', [a.value, b.value], r, runState)
  }],

  // 0x15: ISZERO
  [0x15, async function (runState) {
    const a = runState.stackPt.pop()
    const r = a.value === BIGINT_0 ? BIGINT_1 : BIGINT_0
    await synthesizerArith('ISZERO', [a.value], r, runState)
  }],

  // 0x16: AND
  [0x16, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    const r = a.value & b.value
    await synthesizerArith('AND', [a.value, b.value], r, runState)
  }],

  // 0x17: OR
  [0x17, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    const r = a.value | b.value
    await synthesizerArith('OR', [a.value, b.value], r, runState)
  }],

  // 0x18: XOR
  [0x18, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    const r = a.value ^ b.value
    await synthesizerArith('XOR', [a.value, b.value], r, runState)
  }],

  // 0x19: NOT
  [0x19, async function (runState) {
    const a = runState.stackPt.pop()
    const r = BigInt.asUintN(256, ~a.value)
    await synthesizerArith('NOT', [a.value], r, runState)
  }],

  // 0x1a: BYTE
  [0x1a, async function (runState) {
    const [pos, word] = runState.stackPt.popN(2)
    const r = (word.value >> ((BigInt(31) - pos.value) * BigInt(8))) & BigInt(255)
    await synthesizerArith('BYTE', [pos.value, word.value], r, runState)
  }],

  // 0x1b: SHL
  [0x1b, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    const r = (b.value << a.value) & ((BigInt(1) << BigInt(256)) - BigInt(1))
    await synthesizerArith('SHL', [a.value, b.value], r, runState)
  }],

  // 0x1c: SHR
  [0x1c, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    const r = b.value >> a.value
    await synthesizerArith('SHR', [a.value, b.value], r, runState)
  }],

  // 0x1d: SAR
  [0x1d, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    let r
    const isSigned = BigInt.asIntN(256, b.value) < 0
    if (a.value > 256) {
      r = isSigned ? ((BigInt(1) << BigInt(256)) - BigInt(1)) : BIGINT_0
    } else {
      const c = b.value >> a.value
      if (isSigned) {
        const shiftedOutWidth = BigInt(255) - a.value
        const mask = ((TWO_POW256 - BigInt(1)) >> shiftedOutWidth) << shiftedOutWidth
        r = c | mask
      } else {
        r = c
      }
    }
    await synthesizerArith('SAR', [a.value, b.value], r, runState)
  }],

  // 0x20: KECCAK256
  [0x20, async function (runState) {
    const [offsetPt, lengthPt] = runState.stackPt.popN(2)
    const offset = offsetPt.value
    const length = lengthPt.value
    
    if (length !== BIGINT_0) {
      const offsetNum = Number(offset)
      const lengthNum = Number(length)
      let nChunks = 1
      if (lengthNum > 32) {
        nChunks = Math.ceil(lengthNum / 32)
      }
      const chunkDataPts = []
      let dataRecovered = BIGINT_0
      let lengthLeft = lengthNum
      for (let i = 0; i < nChunks; i++) {
        const _offset = offsetNum + 32 * i
        const _length = lengthLeft > 32 ? 32 : lengthLeft
        lengthLeft -= _length
        const dataAliasInfos = runState.memoryPt.getDataAlias(_offset, _length)
        if (dataAliasInfos.length > 0) {
          chunkDataPts[i] = runState.synthesizer.placeMemoryToStack(dataAliasInfos)
        } else {
          chunkDataPts[i] = runState.synthesizer.loadAuxin(BIGINT_0)
        }
        dataRecovered += chunkDataPts[i].value << BigInt((nChunks - i - 1) * 32 * 8)
      }
      
      const data = runState.memory.read(Number(offset), Number(length))
      if (bytesToBigInt(data) !== dataRecovered) {
        throw new Error(`Synthesizer: KECCAK256: Data loaded to be hashed mismatch`)
      }
      
      const r = runState.stack.peek(1)[0]
      runState.stackPt.push(runState.synthesizer.loadKeccak(chunkDataPts, r, length))
      
      if (runState.stack.peek(1)[0] !== runState.stackPt.peek(1)[0].value) {
        throw new Error(`Synthesizer: KECCAK256: Output data mismatch`)
      }
    }
  }],

  // 0x30: ADDRESS
  [0x30, async function (runState) {
    await synthesizerEnvInf('ADDRESS', runState)
  }],

  // 0x31: BALANCE
  [0x31, async function (runState) {
    const addressBigInt = runState.stackPt.pop().value
    await synthesizerEnvInf('BALANCE', runState, addressBigInt)
  }],

  // 0x32: ORIGIN
  [0x32, async function (runState) {
    await synthesizerEnvInf('ORIGIN', runState)
  }],

  // 0x33: CALLER
  [0x33, async function (runState) {
    await synthesizerEnvInf('CALLER', runState)
  }],

  // 0x34: CALLVALUE
  [0x34, async function (runState) {
    await synthesizerEnvInf('CALLVALUE', runState)
  }],

  // 0x35: CALLDATALOAD
  [0x35, async function (runState) {
    const pos = runState.stackPt.pop().value
    await synthesizerEnvInf('CALLDATALOAD', runState, undefined, pos)
  }],

  // 0x36: CALLDATASIZE
  [0x36, async function (runState) {
    await synthesizerEnvInf('CALLDATASIZE', runState)
  }],

  // 0x37: CALLDATACOPY
  [0x37, async function (runState) {
    const [memOffset, dataOffset, dataLength] = runState.stackPt.popN(3)
    
    if (dataLength.value !== BIGINT_0) {
      const calldataMemoryPts = runState.interpreter._env.callMemoryPts
      let memoryPtsToCopy = []
      
      if (calldataMemoryPts.length > 0) {
        memoryPtsToCopy = copyMemoryRegion(
          runState,
          dataOffset.value,
          dataLength.value,
          calldataMemoryPts,
          memOffset.value
        )
      } else {
        const data = runState.interpreter.getCallData().subarray(
          Number(dataOffset.value),
          Number(dataOffset.value + dataLength.value)
        )
        const entryToCopy = {
          memOffset: Number(memOffset.value),
          containerSize: Number(dataLength.value),
          dataPt: runState.synthesizer.loadEnvInf(
            runState.env.address.toString(),
            'Calldata',
            bytesToBigInt(data),
            Number(dataOffset.value),
            Number(dataLength.value)
          )
        }
        memoryPtsToCopy.push(entryToCopy)
      }

      for (const entry of memoryPtsToCopy) {
        runState.memoryPt.write(entry.memOffset, entry.containerSize, entry.dataPt)
      }
      
      const _outData = runState.memoryPt.viewMemory(
        Number(memOffset.value),
        Number(dataLength.value)
      )
      const outData = runState.memory.read(
        Number(memOffset.value),
        Number(dataLength.value)
      )
      
      if (!equalsBytes(_outData, outData)) {
        throw new Error(`Synthesizer: CALLDATACOPY: Output data mismatch`)
      }
    }
  }],

  // 0x38: CODESIZE
  [0x38, async function (runState) {
    await synthesizerEnvInf('CODESIZE', runState)
  }],

  // 0x39: CODECOPY
  [0x39, async function (runState) {
    const [memOffset, codeOffset, dataLength] = runState.stackPt.popN(3)
    
    if (dataLength.value !== BIGINT_0) {
      const data = runState.interpreter.getCode().subarray(
        Number(codeOffset.value),
        Number(codeOffset.value + dataLength.value)
      )
      
      const dataBigint = bytesToBigInt(data)
      const dataPt = runState.synthesizer.loadEnvInf(
        runState.env.address.toString(),
        'Code',
        dataBigint,
        Number(codeOffset.value),
        Number(dataLength.value)
      )
      
      runState.memoryPt.write(
        Number(memOffset.value),
        Number(dataLength.value),
        dataPt
      )
      
      const _outData = runState.memoryPt.viewMemory(
        Number(memOffset.value),
        Number(dataLength.value)
      )
      const outData = runState.memory.read(
        Number(memOffset.value),
        Number(dataLength.value)
      )
      
      if (!equalsBytes(_outData, outData)) {
        throw new Error(`Synthesizer: CODECOPY: Output data mismatch`)
      }
    }
  }],

  // 0x3b: EXTCODESIZE
  [0x3b, async function (runState) {
    const addressBigInt = runState.stackPt.pop().value
    await synthesizerEnvInf('EXTCODESIZE', runState, addressBigInt)
  }],

  // 0x3c: EXTCODECOPY
  [0x3c, async function (runState) {
    const [addressPt, memOffsetPt, codeOffsetPt, dataLengthPt] = runState.stackPt.popN(4)
    
    if (dataLengthPt.value !== BIGINT_0) {
      const dataPt = await prepareEXTCodePt(
        runState,
        addressPt.value,
        codeOffsetPt.value,
        dataLengthPt.value
      )
      
      runState.memoryPt.write(
        Number(memOffsetPt.value),
        Number(dataLengthPt.value),
        dataPt
      )
      
      const _outData = runState.memoryPt.viewMemory(
        Number(memOffsetPt.value),
        Number(dataLengthPt.value)
      )
      const outData = runState.memory.read(
        Number(memOffsetPt.value),
        Number(dataLengthPt.value)
      )
      
      if (!equalsBytes(_outData, outData)) {
        throw new Error(`Synthesizer: EXTCODECOPY: Output data mismatch`)
      }
    }
  }],

  // 0x3f: EXTCODEHASH
  [0x3f, async function (runState) {
    const addressBigInt = runState.stackPt.pop().value
    await synthesizerEnvInf('EXTCODEHASH', runState, addressBigInt)
  }],

  // 0x3d: RETURNDATASIZE
  [0x3d, async function (runState) {
    await synthesizerEnvInf('RETURNDATASIZE', runState)
  }],

  // 0x3e: RETURNDATACOPY
  [0x3e, async function (runState) {
    const [memOffset, returnDataOffset, dataLength] = runState.stackPt.popN(3)
    
    if (dataLength.value !== BIGINT_0) {
      const copiedMemoryPts = copyMemoryRegion(
        runState,
        returnDataOffset.value,
        dataLength.value,
        runState.returnMemoryPts,
        memOffset.value
      )
      
      for (const entry of copiedMemoryPts) {
        runState.memoryPt.write(entry.memOffset, entry.containerSize, entry.dataPt)
      }
      
      const _outData = runState.memoryPt.viewMemory(
        Number(memOffset.value),
        Number(dataLength.value)
      )
      const outData = runState.memory.read(
        Number(memOffset.value),
        Number(dataLength.value)
      )
      
      if (!equalsBytes(_outData, outData)) {
        throw new Error(`Synthesizer: RETURNDATACOPY: Output data mismatch`)
      }
    }
  }],

  // 0x3a: GASPRICE
  [0x3a, async function (runState) {
    await synthesizerEnvInf('GASPRICE', runState)
  }],

  // 0x40: BLOCKHASH
  [0x40, async function (runState) {
    const number = runState.stackPt.pop().value
    await synthesizerBlkInf('BLOCKHASH', runState, number)
  }],

  // 0x41: COINBASE
  [0x41, async function (runState) {
    await synthesizerBlkInf('COINBASE', runState)
  }],

  // 0x42: TIMESTAMP
  [0x42, async function (runState) {
    await synthesizerBlkInf('TIMESTAMP', runState)
  }],

  // 0x43: NUMBER
  [0x43, async function (runState) {
    await synthesizerBlkInf('NUMBER', runState)
  }],

  // 0x44: DIFFICULTY (PREVRANDAO)
  [0x44, async function (runState) {
    await synthesizerBlkInf('DIFFICULTY', runState)
  }],

  // 0x45: GASLIMIT
  [0x45, async function (runState) {
    await synthesizerBlkInf('GASLIMIT', runState)
  }],

  // 0x46: CHAINID
  [0x46, async function (runState) {
    await synthesizerBlkInf('CHAINID', runState)
  }],

  // 0x47: SELFBALANCE
  [0x47, async function (runState) {
    await synthesizerBlkInf('SELFBALANCE', runState)
  }],

  // 0x48: BASEFEE
  [0x48, async function (runState) {
    await synthesizerBlkInf('BASEFEE', runState)
  }],

  // 0x5e: MCOPY
  [0x5e, async function (runState) {
    const [dst, src, length] = runState.stackPt.popN(3)
    const copiedMemoryPts = copyMemoryRegion(
      runState,
      src.value,
      length.value,
      undefined,
      dst.value
    )
    
    for (const entry of copiedMemoryPts) {
      runState.memoryPt.write(entry.memOffset, entry.containerSize, entry.dataPt)
    }
    
    const _outData = runState.memoryPt.viewMemory(
      Number(dst.value),
      Number(length.value)
    )
    const outData = runState.memory.read(
      Number(dst.value),
      Number(length.value)
    )
    
    if (!equalsBytes(_outData, outData)) {
      throw new Error(`Synthesizer: MCOPY: Output data mismatch`)
    }
  }],

  // 0x5f: PUSH0
  [0x5f, async function (runState) {
    const dataPt = runState.synthesizer.loadPUSH(
      runState.env.address.toString(),
      runState.programCounterPrev,
      BIGINT_0,
      1
    )
    runState.stackPt.push(dataPt)
    
    if (runState.stackPt.peek(1)[0].value !== runState.stack.peek(1)[0]) {
      throw new Error(`Synthesizer: PUSH0: Output data mismatch`)
    }
  }],

  // 0x60: PUSH
  [0x60, async function (runState) {
    const value = runState.stack.peek(1)[0]
    const numToPush = runState.opCode - 0x5f
    const dataPt = runState.synthesizer.loadPUSH(
      runState.env.address.toString(),
      runState.programCounterPrev,
      value,
      numToPush
    )
    runState.stackPt.push(dataPt)
    
    if (runState.stackPt.peek(1)[0].value !== runState.stack.peek(1)[0]) {
      throw new Error(`Synthesizer: PUSH${numToPush}: Output data mismatch`)
    }
  }],

  // 0x80: DUP
  [0x80, async function (runState) {
    const stackPos = runState.opCode - 0x7f
    runState.stackPt.dup(stackPos)
  }],

  // 0x90: SWAP
  [0x90, async function (runState) {
    const stackPos = runState.opCode - 0x8f
    runState.stackPt.swap(stackPos)
  }],

  // 0xa0: LOG
  [0xa0, async function (runState) {
    const [memOffsetPt, memLengthPt] = runState.stackPt.popN(2)
    const topicsCount = runState.opCode - 0xa0
    const topicPts = runState.stackPt.popN(topicsCount)
    
    const dataAlias = runState.memoryPt.getDataAlias(
      Number(memOffsetPt.value),
      Number(memLengthPt.value)
    )
    const dataPt = runState.synthesizer.placeMemoryToStack(dataAlias)
    runState.synthesizer.storeLog(dataPt, topicPts)
  }],

  // 0xf3: RETURN
  [0xf3, async function (runState) {
    const [offset, length] = runState.stackPt.popN(2)
    const returnMemoryPts = copyMemoryRegion(
      runState,
      offset.value,
      length.value
    )
    runState.interpreter.finishPt(returnMemoryPts)
    
    const simMemoryPt = simulateMemoryPt(returnMemoryPts)
    const _returnData = simMemoryPt.viewMemory(0, Number(length.value))
    const returnData = runState.memory.read(Number(offset.value), Number(length.value))
    
    if (!equalsBytes(_returnData, returnData)) {
      throw new Error(`Synthesizer: RETURN: Output data mismatch`)
    }
  }],
=======
import { TWO_POW256, bytesToBigInt, equalsBytes } from "@synthesizer-libs/util"  
import { mod, fromTwos, toTwos } from "../util.js"
import { 
  synthesizerArith, 
  synthesizerEnvInf, 
  synthesizerBlkInf,
  prepareEXTCodePt
} from "../../tokamak/core/synthesizer.js"
import { copyMemoryRegion, simulateMemoryPt } from "../../tokamak/pointers/index.js"
import { BIGINT_0, BIGINT_1 } from "@synthesizer-libs/util"
import { SynthesizerHandler } from "./types.js"

export const synthesizerHandlers: Map<number, SynthesizerHandler> = new Map([
  // 0x01: ADD
  [0x01, async function (runState) {
    console.log('synthesizer add go')
    const [a, b] = runState.stackPt.popN(2)
    const r = mod(a.value + b.value, TWO_POW256)
    synthesizerArith('ADD', [a.value, b.value], r, runState)
  }],
  
  // 0x02: MUL
  [0x02, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    const r = mod(a.value * b.value, TWO_POW256)
    synthesizerArith('MUL', [a.value, b.value], r, runState)
  }],

  // 0x03: SUB
  [0x03, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    const r = mod(a.value - b.value, TWO_POW256)
    synthesizerArith('SUB', [a.value, b.value], r, runState)
  }],

  // 0x04: DIV
  [0x04, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    let r
    if (b.value === BIGINT_0) {
      r = BIGINT_0
    } else {
      r = mod(a.value / b.value, TWO_POW256)
    }
    synthesizerArith('DIV', [a.value, b.value], r, runState)
  }],

  // 0x05: SDIV
  [0x05, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    let r
    if (b.value === BIGINT_0) {
      r = BIGINT_0
    } else {
      r = toTwos(fromTwos(a.value) / fromTwos(b.value))
    }
     synthesizerArith('SDIV', [a.value, b.value], r, runState)
  }],

  // 0x06: MOD
  [0x06, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    let r
    if (b.value === BIGINT_0) {
      r = b.value
    } else {
      r = mod(a.value, b.value)
    }
   synthesizerArith('MOD', [a.value, b.value], r, runState)
  }],

  // 0x07: SMOD
  [0x07, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    let r
    if (b.value === BIGINT_0) {
      r = b.value
    } else {
      r = fromTwos(a.value) % fromTwos(b.value)
    }
      // Convert SMOD operation result to two's complement representation for EVM's 256-bit unsigned integer
      // Required to properly handle negative results since EVM processes all values as unsigned 256-bit integers
      // Using toTwos(r) to convert negative results to two's complement ensures SMOD operation works as expected
     synthesizerArith('SMOD', [a.value, b.value], toTwos(r), runState)
  }],

  // 0x08: ADDMOD
  [0x08, async function (runState) {
    const [a, b, c] = runState.stackPt.popN(3)
    let r
    if (c.value === BIGINT_0) {
      r = BIGINT_0
    } else {
      r = mod(a.value + b.value, c.value)
    }
    synthesizerArith('ADDMOD', [a.value, b.value, c.value], r, runState)
  }],

  // 0x09: MULMOD
  [0x09, async function (runState) {
    const [a, b, c] = runState.stackPt.popN(3)
    let r
    if (c.value === BIGINT_0) {
      r = BIGINT_0
    } else {
      r = mod(a.value * b.value, c.value)
    }
    synthesizerArith('MULMOD', [a.value, b.value, c.value], r, runState)
  }],

  // 0x0a: EXP
  [0x0a, async function (runState) {
    const [base, exponent] = runState.stackPt.popN(2)
    let r
    if (exponent.value === BIGINT_0) {
      r = BIGINT_1
    } else if (base.value === BIGINT_0) {
      r = base.value
    } else {
      r = base.value ** exponent.value % TWO_POW256
    }
    synthesizerArith('EXP', [base.value, exponent.value], r, runState)
  }],

  // 0x0b: SIGNEXTEND
  [0x0b, async function (runState) {
    const [k, val] = runState.stackPt.popN(2)
    synthesizerArith('SIGNEXTEND', [k.value, val.value], val.value, runState)
  }],

  // 0x10: LT
  [0x10, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    const r = a.value < b.value ? BIGINT_1 : BIGINT_0
    synthesizerArith('LT', [a.value, b.value], r, runState)
  }],

  // 0x11: GT
  [0x11, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    const r = a.value > b.value ? BIGINT_1 : BIGINT_0
    synthesizerArith('GT', [a.value, b.value], r, runState)
  }],

  // 0x12: SLT
  [0x12, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    const r = fromTwos(a.value) < fromTwos(b.value) ? BIGINT_1 : BIGINT_0
    await synthesizerArith('SLT', [a.value, b.value], r, runState)
  }],

  // 0x13: SGT
  [0x13, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    const r = fromTwos(a.value) > fromTwos(b.value) ? BIGINT_1 : BIGINT_0
    await synthesizerArith('SGT', [a.value, b.value], r, runState)
  }],

  // 0x14: EQ
  [0x14, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    const r = a.value === b.value ? BIGINT_1 : BIGINT_0
    await synthesizerArith('EQ', [a.value, b.value], r, runState)
  }],

  // 0x15: ISZERO
  [0x15, async function (runState) {
    const a = runState.stackPt.pop()
    const r = a.value === BIGINT_0 ? BIGINT_1 : BIGINT_0
    await synthesizerArith('ISZERO', [a.value], r, runState)
  }],

  // 0x16: AND
  [0x16, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    const r = a.value & b.value
    await synthesizerArith('AND', [a.value, b.value], r, runState)
  }],

  // 0x17: OR
  [0x17, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    const r = a.value | b.value
    await synthesizerArith('OR', [a.value, b.value], r, runState)
  }],

  // 0x18: XOR
  [0x18, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    const r = a.value ^ b.value
    await synthesizerArith('XOR', [a.value, b.value], r, runState)
  }],

  // 0x19: NOT
  [0x19, async function (runState) {
    const a = runState.stackPt.pop()
    const r = BigInt.asUintN(256, ~a.value)
    await synthesizerArith('NOT', [a.value], r, runState)
  }],

  // 0x1a: BYTE
  [0x1a, async function (runState) {
    const [pos, word] = runState.stackPt.popN(2)
    const r = (word.value >> ((BigInt(31) - pos.value) * BigInt(8))) & BigInt(255)
    await synthesizerArith('BYTE', [pos.value, word.value], r, runState)
  }],

  // 0x1b: SHL
  [0x1b, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    const r = (b.value << a.value) & ((BigInt(1) << BigInt(256)) - BigInt(1))
    await synthesizerArith('SHL', [a.value, b.value], r, runState)
  }],

  // 0x1c: SHR
  [0x1c, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    const r = b.value >> a.value
    await synthesizerArith('SHR', [a.value, b.value], r, runState)
  }],

  // 0x1d: SAR
  [0x1d, async function (runState) {
    const [a, b] = runState.stackPt.popN(2)
    let r
    const isSigned = BigInt.asIntN(256, b.value) < 0
    if (a.value > 256) {
      r = isSigned ? ((BigInt(1) << BigInt(256)) - BigInt(1)) : BIGINT_0
    } else {
      const c = b.value >> a.value
      if (isSigned) {
        const shiftedOutWidth = BigInt(255) - a.value
        const mask = ((TWO_POW256 - BigInt(1)) >> shiftedOutWidth) << shiftedOutWidth
        r = c | mask
      } else {
        r = c
      }
    }
    await synthesizerArith('SAR', [a.value, b.value], r, runState)
  }],

  // 0x20: KECCAK256
  [0x20, async function (runState) {
    const [offsetPt, lengthPt] = runState.stackPt.popN(2)
    const offset = offsetPt.value
    const length = lengthPt.value
    
    if (length !== BIGINT_0) {
      const offsetNum = Number(offset)
      const lengthNum = Number(length)
      let nChunks = 1
      if (lengthNum > 32) {
        nChunks = Math.ceil(lengthNum / 32)
      }
      const chunkDataPts = []
      let dataRecovered = BIGINT_0
      let lengthLeft = lengthNum
      for (let i = 0; i < nChunks; i++) {
        const _offset = offsetNum + 32 * i
        const _length = lengthLeft > 32 ? 32 : lengthLeft
        lengthLeft -= _length
        const dataAliasInfos = runState.memoryPt.getDataAlias(_offset, _length)
        if (dataAliasInfos.length > 0) {
          chunkDataPts[i] = runState.synthesizer.placeMemoryToStack(dataAliasInfos)
        } else {
          chunkDataPts[i] = runState.synthesizer.loadAuxin(BIGINT_0)
        }
        dataRecovered += chunkDataPts[i].value << BigInt((nChunks - i - 1) * 32 * 8)
      }
      
      const data = runState.memory.read(Number(offset), Number(length))
      if (bytesToBigInt(data) !== dataRecovered) {
        throw new Error(`Synthesizer: KECCAK256: Data loaded to be hashed mismatch`)
      }
      
      const r = runState.stack.peek(1)[0]
      runState.stackPt.push(runState.synthesizer.loadKeccak(chunkDataPts, r, length))
      
      if (runState.stack.peek(1)[0] !== runState.stackPt.peek(1)[0].value) {
        throw new Error(`Synthesizer: KECCAK256: Output data mismatch`)
      }
    }
  }],

  // 0x30: ADDRESS
  [0x30, async function (runState) {
    await synthesizerEnvInf('ADDRESS', runState)
  }],

  // 0x31: BALANCE
  [0x31, async function (runState) {
    const addressBigInt = runState.stackPt.pop().value
    await synthesizerEnvInf('BALANCE', runState, addressBigInt)
  }],

  // 0x32: ORIGIN
  [0x32, async function (runState) {
    await synthesizerEnvInf('ORIGIN', runState)
  }],

  // 0x33: CALLER
  [0x33, async function (runState) {
    await synthesizerEnvInf('CALLER', runState)
  }],

  // 0x34: CALLVALUE
  [0x34, async function (runState) {
    await synthesizerEnvInf('CALLVALUE', runState)
  }],

  // 0x35: CALLDATALOAD
  [0x35, async function (runState) {
    const pos = runState.stackPt.pop().value
    await synthesizerEnvInf('CALLDATALOAD', runState, undefined, pos)
  }],

  // 0x36: CALLDATASIZE
  [0x36, async function (runState) {
    await synthesizerEnvInf('CALLDATASIZE', runState)
  }],

  // 0x37: CALLDATACOPY
  [0x37, async function (runState) {
    const [memOffset, dataOffset, dataLength] = runState.stackPt.popN(3)
    
    if (dataLength.value !== BIGINT_0) {
      const calldataMemoryPts = runState.interpreter._env.callMemoryPts
      let memoryPtsToCopy = []
      
      if (calldataMemoryPts.length > 0) {
        memoryPtsToCopy = copyMemoryRegion(
          runState,
          dataOffset.value,
          dataLength.value,
          calldataMemoryPts,
          memOffset.value
        )
      } else {
        const data = runState.interpreter.getCallData().subarray(
          Number(dataOffset.value),
          Number(dataOffset.value + dataLength.value)
        )
        const entryToCopy = {
          memOffset: Number(memOffset.value),
          containerSize: Number(dataLength.value),
          dataPt: runState.synthesizer.loadEnvInf(
            runState.env.address.toString(),
            'Calldata',
            bytesToBigInt(data),
            Number(dataOffset.value),
            Number(dataLength.value)
          )
        }
        memoryPtsToCopy.push(entryToCopy)
      }

      for (const entry of memoryPtsToCopy) {
        runState.memoryPt.write(entry.memOffset, entry.containerSize, entry.dataPt)
      }
      
      const _outData = runState.memoryPt.viewMemory(
        Number(memOffset.value),
        Number(dataLength.value)
      )
      const outData = runState.memory.read(
        Number(memOffset.value),
        Number(dataLength.value)
      )
      
      if (!equalsBytes(_outData, outData)) {
        throw new Error(`Synthesizer: CALLDATACOPY: Output data mismatch`)
      }
    }
  }],

  // 0x38: CODESIZE
  [0x38, async function (runState) {
    await synthesizerEnvInf('CODESIZE', runState)
  }],

  // 0x39: CODECOPY
  [0x39, async function (runState) {
    const [memOffset, codeOffset, dataLength] = runState.stackPt.popN(3)
    
    if (dataLength.value !== BIGINT_0) {
      const data = runState.interpreter.getCode().subarray(
        Number(codeOffset.value),
        Number(codeOffset.value + dataLength.value)
      )
      
      const dataBigint = bytesToBigInt(data)
      const dataPt = runState.synthesizer.loadEnvInf(
        runState.env.address.toString(),
        'Code',
        dataBigint,
        Number(codeOffset.value),
        Number(dataLength.value)
      )
      
      runState.memoryPt.write(
        Number(memOffset.value),
        Number(dataLength.value),
        dataPt
      )
      
      const _outData = runState.memoryPt.viewMemory(
        Number(memOffset.value),
        Number(dataLength.value)
      )
      const outData = runState.memory.read(
        Number(memOffset.value),
        Number(dataLength.value)
      )
      
      if (!equalsBytes(_outData, outData)) {
        throw new Error(`Synthesizer: CODECOPY: Output data mismatch`)
      }
    }
  }],

  // 0x3b: EXTCODESIZE
  [0x3b, async function (runState) {
    const addressBigInt = runState.stackPt.pop().value
    await synthesizerEnvInf('EXTCODESIZE', runState, addressBigInt)
  }],

  // 0x3c: EXTCODECOPY
  [0x3c, async function (runState) {
    const [addressPt, memOffsetPt, codeOffsetPt, dataLengthPt] = runState.stackPt.popN(4)
    
    if (dataLengthPt.value !== BIGINT_0) {
      const dataPt = await prepareEXTCodePt(
        runState,
        addressPt.value,
        codeOffsetPt.value,
        dataLengthPt.value
      )
      
      runState.memoryPt.write(
        Number(memOffsetPt.value),
        Number(dataLengthPt.value),
        dataPt
      )
      
      const _outData = runState.memoryPt.viewMemory(
        Number(memOffsetPt.value),
        Number(dataLengthPt.value)
      )
      const outData = runState.memory.read(
        Number(memOffsetPt.value),
        Number(dataLengthPt.value)
      )
      
      if (!equalsBytes(_outData, outData)) {
        throw new Error(`Synthesizer: EXTCODECOPY: Output data mismatch`)
      }
    }
  }],

  // 0x3f: EXTCODEHASH
  [0x3f, async function (runState) {
    const addressBigInt = runState.stackPt.pop().value
    await synthesizerEnvInf('EXTCODEHASH', runState, addressBigInt)
  }],

  // 0x3d: RETURNDATASIZE
  [0x3d, async function (runState) {
    await synthesizerEnvInf('RETURNDATASIZE', runState)
  }],

  // 0x3e: RETURNDATACOPY
  [0x3e, async function (runState) {
    const [memOffset, returnDataOffset, dataLength] = runState.stackPt.popN(3)
    
    if (dataLength.value !== BIGINT_0) {
      const copiedMemoryPts = copyMemoryRegion(
        runState,
        returnDataOffset.value,
        dataLength.value,
        runState.returnMemoryPts,
        memOffset.value
      )
      
      for (const entry of copiedMemoryPts) {
        runState.memoryPt.write(entry.memOffset, entry.containerSize, entry.dataPt)
      }
      
      const _outData = runState.memoryPt.viewMemory(
        Number(memOffset.value),
        Number(dataLength.value)
      )
      const outData = runState.memory.read(
        Number(memOffset.value),
        Number(dataLength.value)
      )
      
      if (!equalsBytes(_outData, outData)) {
        throw new Error(`Synthesizer: RETURNDATACOPY: Output data mismatch`)
      }
    }
  }],

  // 0x3a: GASPRICE
  [0x3a, async function (runState) {
    await synthesizerEnvInf('GASPRICE', runState)
  }],

  // 0x40: BLOCKHASH
  [0x40, async function (runState) {
    const number = runState.stackPt.pop().value
    await synthesizerBlkInf('BLOCKHASH', runState, number)
  }],

  // 0x41: COINBASE
  [0x41, async function (runState) {
    await synthesizerBlkInf('COINBASE', runState)
  }],

  // 0x42: TIMESTAMP
  [0x42, async function (runState) {
    await synthesizerBlkInf('TIMESTAMP', runState)
  }],

  // 0x43: NUMBER
  [0x43, async function (runState) {
    await synthesizerBlkInf('NUMBER', runState)
  }],

  // 0x44: DIFFICULTY (PREVRANDAO)
  [0x44, async function (runState) {
    await synthesizerBlkInf('DIFFICULTY', runState)
  }],

  // 0x45: GASLIMIT
  [0x45, async function (runState) {
    await synthesizerBlkInf('GASLIMIT', runState)
  }],

  // 0x46: CHAINID
  [0x46, async function (runState) {
    await synthesizerBlkInf('CHAINID', runState)
  }],

  // 0x47: SELFBALANCE
  [0x47, async function (runState) {
    await synthesizerBlkInf('SELFBALANCE', runState)
  }],

  // 0x48: BASEFEE
  [0x48, async function (runState) {
    await synthesizerBlkInf('BASEFEE', runState)
  }],

  // 0x5e: MCOPY
  [0x5e, async function (runState) {
    const [dst, src, length] = runState.stackPt.popN(3)
    const copiedMemoryPts = copyMemoryRegion(
      runState,
      src.value,
      length.value,
      undefined,
      dst.value
    )
    
    for (const entry of copiedMemoryPts) {
      runState.memoryPt.write(entry.memOffset, entry.containerSize, entry.dataPt)
    }
    
    const _outData = runState.memoryPt.viewMemory(
      Number(dst.value),
      Number(length.value)
    )
    const outData = runState.memory.read(
      Number(dst.value),
      Number(length.value)
    )
    
    if (!equalsBytes(_outData, outData)) {
      throw new Error(`Synthesizer: MCOPY: Output data mismatch`)
    }
  }],

  // 0x5f: PUSH0
  [0x5f, async function (runState) {
    const dataPt = runState.synthesizer.loadPUSH(
      runState.env.address.toString(),
      runState.programCounterPrev,
      BIGINT_0,
      1
    )
    runState.stackPt.push(dataPt)
    
    if (runState.stackPt.peek(1)[0].value !== runState.stack.peek(1)[0]) {
      throw new Error(`Synthesizer: PUSH0: Output data mismatch`)
    }
  }],

  // 0x60: PUSH
  [0x60, async function (runState) {
    const value = runState.stack.peek(1)[0]
    const numToPush = runState.opCode - 0x5f
    const dataPt = runState.synthesizer.loadPUSH(
      runState.env.address.toString(),
      runState.programCounterPrev,
      value,
      numToPush
    )
    runState.stackPt.push(dataPt)
    
    if (runState.stackPt.peek(1)[0].value !== runState.stack.peek(1)[0]) {
      throw new Error(`Synthesizer: PUSH${numToPush}: Output data mismatch`)
    }
  }],

  // 0x80: DUP
  [0x80, async function (runState) {
    const stackPos = runState.opCode - 0x7f
    runState.stackPt.dup(stackPos)
  }],

  // 0x90: SWAP
  [0x90, async function (runState) {
    const stackPos = runState.opCode - 0x8f
    runState.stackPt.swap(stackPos)
  }],

  // 0xa0: LOG
  [0xa0, async function (runState) {
    const [memOffsetPt, memLengthPt] = runState.stackPt.popN(2)
    const topicsCount = runState.opCode - 0xa0
    const topicPts = runState.stackPt.popN(topicsCount)
    
    const dataAlias = runState.memoryPt.getDataAlias(
      Number(memOffsetPt.value),
      Number(memLengthPt.value)
    )
    const dataPt = runState.synthesizer.placeMemoryToStack(dataAlias)
    runState.synthesizer.storeLog(dataPt, topicPts)
  }],

  // 0xf3: RETURN
  [0xf3, async function (runState) {
    const [offset, length] = runState.stackPt.popN(2)
    const returnMemoryPts = copyMemoryRegion(
      runState,
      offset.value,
      length.value
    )
    runState.interpreter.finishPt(returnMemoryPts)
    
    const simMemoryPt = simulateMemoryPt(returnMemoryPts)
    const _returnData = simMemoryPt.viewMemory(0, Number(length.value))
    const returnData = runState.memory.read(Number(offset.value), Number(length.value))
    
    if (!equalsBytes(_returnData, returnData)) {
      throw new Error(`Synthesizer: RETURN: Output data mismatch`)
    }
  }],
>>>>>>> 603bf51d9e02a58183fabb7f7fd08e9580ceef44
])