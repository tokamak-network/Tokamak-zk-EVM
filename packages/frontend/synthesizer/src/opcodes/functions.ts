import {
  Address,
  BIGINT_0,
  BIGINT_1,
  BIGINT_160,
  BIGINT_2,
  BIGINT_224,
  BIGINT_255,
  BIGINT_256,
  BIGINT_2EXP160,
  BIGINT_2EXP224,
  BIGINT_2EXP96,
  BIGINT_31,
  BIGINT_32,
  BIGINT_7,
  BIGINT_8,
  BIGINT_96,
  MAX_INTEGER_BIGINT,
  TWO_POW256,
  bigIntToAddressBytes,
  bigIntToBytes,
  bytesToBigInt,
  bytesToHex,
  bytesToInt,
  concatBytes,
  equalsBytes,
  getVerkleTreeIndicesForStorageSlot,
  setLengthLeft,
} from '@ethereumjs/util'
import { keccak256 } from 'ethereum-cryptography/keccak.js'

import { EOFContainer, EOFContainerMode } from '../eof/container.js'
import { EOFError } from '../eof/errors.js'
import { EOFBYTES, EOFHASH, isEOF } from '../eof/util.js'
import { ERROR } from '../exceptions.js'
import {
  prepareEXTCodePt,
  synthesizerArith,
  synthesizerBlkInf,
  synthesizerEnvInf,
} from '../tokamak/core/synthesizer.js'
import { copyMemoryRegion, simulateMemoryPt } from '../tokamak/pointers/index.js'
import { DELEGATION_7702_FLAG } from '../types.js'

import {
  createAddressFromStackBigInt,
  describeLocation,
  exponentiation,
  fromTwos,
  getDataSlice,
  jumpIsValid,
  mod,
  toTwos,
  trap,
  writeCallOutput,
} from './util.js'

import type { RunState } from '../interpreter.js'
import type { MemoryPtEntry, MemoryPts } from '../tokamak/pointers/index.js'
import type { Common } from '@ethereumjs/common'

export interface SyncOpHandler {
  (runState: RunState, common: Common): void
}

export interface AsyncOpHandler {
  (runState: RunState, common: Common): Promise<void>
}

export type OpHandler = SyncOpHandler | AsyncOpHandler

function getEIP7702DelegatedAddress(code: Uint8Array) {
  if (equalsBytes(code.slice(0, 3), DELEGATION_7702_FLAG)) {
    return new Address(code.slice(3, 24))
  }
}

async function eip7702CodeCheck(runState: RunState, code: Uint8Array) {
  const address = getEIP7702DelegatedAddress(code)
  if (address !== undefined) {
    return runState.stateManager.getCode(address)
  }

  return code
}

// the opcode functions
export const handlers: Map<number, OpHandler> = new Map([
  // 0x00: STOP
  [
    0x00,
    function () {
      trap(ERROR.STOP)
    },
  ],
  // 0x01: ADD
  [
    0x01,
    function (runState) {
      const [a, b] = runState.stack.popN(2)
      const r = mod(a + b, TWO_POW256)
      runState.stack.push(r)

      // For Synthesizer //
      synthesizerArith('ADD', [a, b], r, runState)
    },
  ],
  // 0x02: MUL
  [
    0x02,
    function (runState) {
      const [a, b] = runState.stack.popN(2)
      const r = mod(a * b, TWO_POW256)
      runState.stack.push(r)

      // For Synthesizer //
      synthesizerArith('MUL', [a, b], r, runState)
    },
  ],
  // 0x03: SUB
  [
    0x03,
    function (runState) {
      const [a, b] = runState.stack.popN(2)
      const r = mod(a - b, TWO_POW256)
      runState.stack.push(r)

      // For Synthesizer //
      synthesizerArith('SUB', [a, b], r, runState)
    },
  ],
  // 0x04: DIV
  [
    0x04,
    function (runState) {
      const [a, b] = runState.stack.popN(2)
      let r
      if (b === BIGINT_0) {
        r = BIGINT_0
      } else {
        r = mod(a / b, TWO_POW256)
      }
      runState.stack.push(r)

      // For Synthesizer //
      synthesizerArith('DIV', [a, b], r, runState)
    },
  ],
  // 0x05: SDIV
  [
    0x05,
    function (runState) {
      const [a, b] = runState.stack.popN(2)
      let r
      if (b === BIGINT_0) {
        r = BIGINT_0
      } else {
        r = toTwos(fromTwos(a) / fromTwos(b))
      }
      runState.stack.push(r)

      // For Synthesizer //
      synthesizerArith('SDIV', [a, b], r, runState)
    },
  ],
  // 0x06: MOD
  [
    0x06,
    function (runState) {
      const [a, b] = runState.stack.popN(2)
      let r
      if (b === BIGINT_0) {
        r = b
      } else {
        r = mod(a, b)
      }
      runState.stack.push(r)

      // For Synthesizer //
      synthesizerArith('MOD', [a, b], r, runState)
    },
  ],
  // 0x07: SMOD
  [
    0x07,
    function (runState) {
      const [a, b] = runState.stack.popN(2)
      let r
      if (b === BIGINT_0) {
        r = b
      } else {
        r = fromTwos(a) % fromTwos(b)
      }
      runState.stack.push(toTwos(r))

      // For Synthesizer //
      synthesizerArith(
        'SMOD',
        [a, b],
        // SMOD 연산의 결과를 2의 보수 표현으로 변환하여 EVM의 256비트 부호 없는 정수로 처리
        // EVM은 모든 값을 부호 없는 256비트 정수로 처리하므로, 음수 결과를 올바르게 변환하기 위해 필요
        // toTwos(r)를 사용하여 음수 결과를 2의 보수로 변환함으로써, SMOD 연산이 예상대로 작동하도록 보장
        toTwos(r),
        runState,
      )
    },
  ],
  // 0x08: ADDMOD
  [
    0x08,
    function (runState) {
      const [a, b, c] = runState.stack.popN(3)
      let r
      if (c === BIGINT_0) {
        r = BIGINT_0
      } else {
        r = mod(a + b, c)
      }
      runState.stack.push(r)

      // For Synthesizer //
      synthesizerArith('ADDMOD', [a, b, c], r, runState)
    },
  ],
  // 0x09: MULMOD
  [
    0x09,
    function (runState) {
      const [a, b, c] = runState.stack.popN(3)
      let r
      if (c === BIGINT_0) {
        r = BIGINT_0
      } else {
        r = mod(a * b, c)
      }
      runState.stack.push(r)

      // For Synthesizer //
      synthesizerArith('MULMOD', [a, b, c], r, runState)
    },
  ],
  // 0x0a: EXP
  [
    0x0a,
    function (runState) {
      const [base, exponent] = runState.stack.popN(2)
      if (base === BIGINT_2) {
        switch (exponent) {
          case BIGINT_96:
            runState.stack.push(BIGINT_2EXP96)
            return
          case BIGINT_160:
            runState.stack.push(BIGINT_2EXP160)
            return
          case BIGINT_224:
            runState.stack.push(BIGINT_2EXP224)
            return
        }
      }
      if (exponent === BIGINT_0) {
        runState.stack.push(BIGINT_1)
        return
      }

      if (base === BIGINT_0) {
        runState.stack.push(base)
        return
      }
      const r = exponentiation(base, exponent)
      runState.stack.push(r)

      // For Synthesizer //
      synthesizerArith('EXP', [base, exponent], r, runState)
    },
  ],
  // 0x0b: SIGNEXTEND
  [
    0x0b,
    function (runState) {
      /* eslint-disable-next-line prefer-const */
      const [k, _val] = runState.stack.popN(2)
      let val = _val

      if (k < BIGINT_31) {
        const signBit = k * BIGINT_8 + BIGINT_7
        const mask = (BIGINT_1 << signBit) - BIGINT_1
        if ((_val >> signBit) & BIGINT_1) {
          val = _val | BigInt.asUintN(256, ~mask)
        } else {
          val = _val & mask
        }
      }
      runState.stack.push(val)

      // For Synthesizer //
      synthesizerArith('SIGNEXTEND', [k, _val], val, runState)
    },
  ],
  // 0x10 range - bit ops
  // 0x10: LT
  [
    0x10,
    function (runState) {
      const [a, b] = runState.stack.popN(2)
      const r = a < b ? BIGINT_1 : BIGINT_0
      runState.stack.push(r)

      // For Synthesizer //
      synthesizerArith('LT', [a, b], r, runState)
    },
  ],
  // 0x11: GT
  [
    0x11,
    function (runState) {
      const [a, b] = runState.stack.popN(2)
      const r = a > b ? BIGINT_1 : BIGINT_0
      runState.stack.push(r)

      // For Synthesizer //
      synthesizerArith('GT', [a, b], r, runState)
    },
  ],
  // 0x12: SLT
  [
    0x12,
    function (runState) {
      const [a, b] = runState.stack.popN(2)
      const r = fromTwos(a) < fromTwos(b) ? BIGINT_1 : BIGINT_0
      runState.stack.push(r)

      // For Synthesizer //
      synthesizerArith('SLT', [a, b], r, runState)
    },
  ],
  // 0x13: SGT
  [
    0x13,
    function (runState) {
      const [a, b] = runState.stack.popN(2)
      const r = fromTwos(a) > fromTwos(b) ? BIGINT_1 : BIGINT_0
      runState.stack.push(r)

      // For Synthesizer //
      synthesizerArith('SGT', [a, b], r, runState)
    },
  ],
  // 0x14: EQ
  [
    0x14,
    function (runState) {
      const [a, b] = runState.stack.popN(2)
      const r = a === b ? BIGINT_1 : BIGINT_0
      runState.stack.push(r)

      // For Synthesizer //
      synthesizerArith('EQ', [a, b], r, runState)
    },
  ],
  // 0x15: ISZERO
  [
    0x15,
    function (runState) {
      const a = runState.stack.pop()
      const r = a === BIGINT_0 ? BIGINT_1 : BIGINT_0
      runState.stack.push(r)

      // For Synthesizer //
      synthesizerArith('ISZERO', [a], r, runState)
    },
  ],
  // 0x16: AND
  [
    0x16,
    function (runState) {
      const [a, b] = runState.stack.popN(2)
      const r = a & b
      runState.stack.push(r)

      // For Synthesizer //
      synthesizerArith('AND', [a, b], r, runState)
    },
  ],
  // 0x17: OR
  [
    0x17,
    function (runState) {
      const [a, b] = runState.stack.popN(2)
      const r = a | b
      runState.stack.push(r)

      // For Synthesizer //
      synthesizerArith('OR', [a, b], r, runState)
    },
  ],
  // 0x18: XOR
  [
    0x18,
    function (runState) {
      const [a, b] = runState.stack.popN(2)
      const r = a ^ b
      runState.stack.push(r)

      // For Synthesizer //
      synthesizerArith('XOR', [a, b], r, runState)
    },
  ],
  // 0x19: NOT
  [
    0x19,
    function (runState) {
      const a = runState.stack.pop()
      const r = BigInt.asUintN(256, ~a)
      runState.stack.push(r)

      // For Synthesizer //
      synthesizerArith('NOT', [a], r, runState)
    },
  ],
  // 0x1a: BYTE
  [
    0x1a,
    function (runState) {
      const [pos, word] = runState.stack.popN(2)
      if (pos > BIGINT_32) {
        runState.stack.push(BIGINT_0)
        return
      }

      const r = (word >> ((BIGINT_31 - pos) * BIGINT_8)) & BIGINT_255
      runState.stack.push(r)

      // For Synthesizer //
      synthesizerArith('BYTE', [pos, word], r, runState)
    },
  ],
  // 0x1b: SHL
  [
    0x1b,
    function (runState) {
      const [a, b] = runState.stack.popN(2)
      if (a > BIGINT_256) {
        runState.stack.push(BIGINT_0)
        return
      }

      const r = (b << a) & MAX_INTEGER_BIGINT
      runState.stack.push(r)

      // For Synthesizer //
      synthesizerArith('SHL', [a, b], r, runState)
    },
  ],
  // 0x1c: SHR
  [
    0x1c,
    function (runState) {
      const [a, b] = runState.stack.popN(2)
      if (a > 256) {
        runState.stack.push(BIGINT_0)
        // For Synthesizer //
        synthesizerArith('SHR', [a, b], BIGINT_0, runState)
        return
      }

      const r = b >> a
      runState.stack.push(r)

      // For Synthesizer //
      synthesizerArith('SHR', [a, b], r, runState)
    },
  ],
  // 0x1d: SAR
  [
    0x1d,
    function (runState) {
      const [a, b] = runState.stack.popN(2)

      let r
      const bComp = BigInt.asIntN(256, b)
      const isSigned = bComp < 0
      if (a > 256) {
        if (isSigned) {
          r = MAX_INTEGER_BIGINT
        } else {
          r = BIGINT_0
        }
        runState.stack.push(r)
        return
      }

      const c = b >> a
      if (isSigned) {
        const shiftedOutWidth = BIGINT_255 - a
        const mask = (MAX_INTEGER_BIGINT >> shiftedOutWidth) << shiftedOutWidth
        r = c | mask
      } else {
        r = c
      }
      runState.stack.push(r)

      // For Synthesizer //
      synthesizerArith('SAR', [a, b], r, runState)
    },
  ],
  // 0x20 range - crypto
  // 0x20: KECCAK256
  [
    0x20,
    function (runState, common) {
      const [offset, length] = runState.stack.popN(2)
      let data = new Uint8Array(0)
      if (length !== BIGINT_0) {
        data = runState.memory.read(Number(offset), Number(length))
      }
      const r = BigInt(bytesToHex((common.customCrypto.keccak256 ?? keccak256)(data)))
      runState.stack.push(r)

      // For synthesizer //
      const [offsetPt, lengthPt] = runState.stackPt.popN(2)
      if (offsetPt.value !== offset || lengthPt.value !== length) {
        throw new Error(`Synthesizer: KECCAK256: Input data mismatch`)
      }
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
      if (bytesToBigInt(data) !== dataRecovered) {
        throw new Error(`Synthesizer: KECCAK256: Data loaded to be hashed mismatch`)
      }
      runState.stackPt.push(runState.synthesizer.loadKeccak(chunkDataPts, r, length))
      if (runState.stack.peek(1)[0] !== runState.stackPt.peek(1)[0].value) {
        throw new Error(`Synthesizer: KECCAK256: Output data mismatch`)
      }
    },
  ],
  // 0x30 range - closure state
  // 0x30: ADDRESS
  [
    0x30,
    async function (runState) {
      const address = bytesToBigInt(runState.interpreter.getAddress().bytes)
      runState.stack.push(address)

      // For Synthesizer //
      await synthesizerEnvInf('ADDRESS', runState)
    },
  ],
  // 0x31: BALANCE
  [
    0x31,
    async function (runState) {
      const addressBigInt = runState.stack.pop()
      const address = createAddressFromStackBigInt(addressBigInt)
      const balance = await runState.interpreter.getExternalBalance(address)
      runState.stack.push(balance)

      // For Synthesizer //
      await synthesizerEnvInf('BALANCE', runState, addressBigInt)
    },
  ],
  // 0x32: ORIGIN
  [
    0x32,
    async function (runState) {
      runState.stack.push(runState.interpreter.getTxOrigin())

      // For Synthesizer //
      await synthesizerEnvInf('ORIGIN', runState)
    },
  ],
  // 0x33: CALLER
  [
    0x33,
    async function (runState) {
      runState.stack.push(runState.interpreter.getCaller())

      // For Synthesizer //
      await synthesizerEnvInf('ADDRESS', runState)
    },
  ],
  // 0x34: CALLVALUE
  [
    0x34,
    async function (runState) {
      runState.stack.push(runState.interpreter.getCallValue())

      // For Synthesizer //
      await synthesizerEnvInf('CALLVALUE', runState)
    },
  ],
  // 0x35: CALLDATALOAD
  [
    0x35,
    async function (runState) {
      const pos = runState.stack.pop()
      if (pos > runState.interpreter.getCallDataSize()) {
        runState.stack.push(BIGINT_0)

        // For synthesizer //
        await synthesizerEnvInf('CALLDATALOAD', runState, undefined, pos)
        return
      }

      const i = Number(pos)
      let loaded = runState.interpreter.getCallData().subarray(i, i + 32)
      loaded = loaded.length ? loaded : Uint8Array.from([0])
      let r = bytesToBigInt(loaded)
      if (loaded.length < 32) {
        r = r << (BIGINT_8 * BigInt(32 - loaded.length))
      }
      runState.stack.push(r)

      // For synthesizer //
      await synthesizerEnvInf('CALLDATALOAD', runState, undefined, pos)
    },
  ],
  // 0x36: CALLDATASIZE
  [
    0x36,
    async function (runState) {
      runState.stack.push(runState.interpreter.getCallDataSize())

      // For Synthesizer //
      await synthesizerEnvInf('CALLDATASIZE', runState)
    },
  ],
  // 0x37: CALLDATACOPY
  [
    0x37,
    function (runState) {
      const [memOffset, dataOffset, dataLength] = runState.stack.popN(3)
      if (dataLength !== BIGINT_0) {
        const data = getDataSlice(runState.interpreter.getCallData(), dataOffset, dataLength)
        const memOffsetNum = Number(memOffset)
        const dataLengthNum = Number(dataLength)
        runState.memory.write(memOffsetNum, dataLengthNum, data)
      }

      // For synthesizer
      const [_memOffset, _dataOffset, _dataLength] = runState.stackPt.popN(3)
      if (
        _memOffset.value !== memOffset ||
        _dataOffset.value !== dataOffset ||
        _dataLength.value !== dataLength
      ) {
        throw new Error(`Synthesizer: CALLDATACOPY: Input data mismatch`)
      }
      if (dataLength !== BIGINT_0) {
        const dataOffsetNum = Number(dataOffset)
        const calldataMemoryPts = runState.interpreter._env.callMemoryPts
        let memoryPtsToCopy: MemoryPts = []
        if (calldataMemoryPts.length > 0) {
          // Case: The calldata is originated from the parent context
          memoryPtsToCopy = copyMemoryRegion(
            runState,
            dataOffset,
            dataLength,
            calldataMemoryPts,
            memOffset,
          )
        } else {
          // Case: The calldata is originated from Environmental Information
          const data = getDataSlice(runState.interpreter.getCallData(), dataOffset, dataLength)
          const entryToCopy: MemoryPtEntry = {
            memOffset: Number(memOffset),
            containerSize: Number(dataLength),
            dataPt: runState.synthesizer.loadEnvInf(
              runState.env.address.toString(),
              'Calldata',
              bytesToBigInt(data),
              dataOffsetNum,
              Number(dataLength),
            ),
          }
          memoryPtsToCopy.push(entryToCopy)
        }

        for (const entry of memoryPtsToCopy) {
          // the lower index, the older data
          runState.memoryPt.write(entry.memOffset, entry.containerSize, entry.dataPt)
        }
      }
      const _outData = runState.memoryPt.viewMemory(Number(memOffset), Number(dataLength))
      const outData = runState.memory.read(Number(memOffset), Number(dataLength))
      if (!equalsBytes(_outData, outData)) {
        throw new Error(`Synthesizer: CALLDATACOPY: Output data mismatch`)
      }
    },
  ],
  // 0x38: CODESIZE
  [
    0x38,
    async function (runState) {
      runState.stack.push(runState.interpreter.getCodeSize())

      // For Synthesizer //
      await synthesizerEnvInf('CODESIZE', runState)
    },
  ],
  // 0x39: CODECOPY
  [
    0x39,
    function (runState) {
      const [memOffset, codeOffset, dataLength] = runState.stack.popN(3)

      if (dataLength !== BIGINT_0) {
        const data = getDataSlice(runState.interpreter.getCode(), codeOffset, dataLength)
        const memOffsetNum = Number(memOffset)
        const lengthNum = Number(dataLength)
        runState.memory.write(memOffsetNum, lengthNum, data)
      }

      // For Synthesizer //
      const [memOffsetPt, codeOffsetPt, dataLengthPt] = runState.stackPt.popN(3)
      if (
        memOffsetPt.value !== memOffset ||
        codeOffsetPt.value !== codeOffset ||
        dataLengthPt.value !== dataLength
      ) {
        throw new Error(`Synthesizer: CODECOPY: Input data mismatch`)
      }

      if (dataLength !== BIGINT_0) {
        const data = getDataSlice(runState.interpreter.getCode(), codeOffset, dataLength)
        const dataBigint = bytesToBigInt(data)
        const codeOffsetNum = Number(codeOffset)
        const dataPt = runState.synthesizer.loadEnvInf(
          runState.env.address.toString(),
          'Code',
          dataBigint,
          codeOffsetNum,
          Number(dataLength),
        )
        runState.memoryPt.write(Number(memOffset), Number(dataLength), dataPt)
      }
      const _outData = runState.memoryPt.viewMemory(Number(memOffset), Number(dataLength))
      const outData = runState.memory.read(Number(memOffset), Number(dataLength))
      if (!equalsBytes(_outData, outData)) {
        throw new Error(`Synthesizer: CODECOPY: Output data mismatch`)
      }
    },
  ],
  // 0x3b: EXTCODESIZE
  [
    0x3b,
    async function (runState, common) {
      const addressBigInt = runState.stack.pop()
      const address = createAddressFromStackBigInt(addressBigInt)
      // EOF check
      let code = await runState.stateManager.getCode(address)
      if (isEOF(code)) {
        // In legacy code, the target code is treated as to be "EOFBYTES" code
        runState.stack.push(BigInt(EOFBYTES.length))

        // For Synthesizer //
        await synthesizerEnvInf('EXTCODESIZE', runState, addressBigInt)
        return
      } else if (common.isActivatedEIP(7702)) {
        code = await eip7702CodeCheck(runState, code)
      }

      const size = BigInt(code.length)

      runState.stack.push(size)

      // For Synthesizer //
      await synthesizerEnvInf('EXTCODESIZE', runState, addressBigInt)
    },
  ],
  // 0x3c: EXTCODECOPY
  [
    0x3c,
    async function (runState, common) {
      const [addressBigInt, memOffset, codeOffset, dataLength] = runState.stack.popN(4)

      if (dataLength !== BIGINT_0) {
        const address = createAddressFromStackBigInt(addressBigInt)
        let code = await runState.stateManager.getCode(address)

        if (isEOF(code)) {
          // In legacy code, the target code is treated as to be "EOFBYTES" code
          code = EOFBYTES
        } else if (common.isActivatedEIP(7702)) {
          code = await eip7702CodeCheck(runState, code)
        }

        const data = getDataSlice(code, codeOffset, dataLength)
        const memOffsetNum = Number(memOffset)
        const lengthNum = Number(dataLength)
        runState.memory.write(memOffsetNum, lengthNum, data)
      }

      // For Synthesizer //
      const [addressPt, memOffsetPt, codeOffsetPt, dataLengthPt] = runState.stackPt.popN(4)
      if (
        addressPt.value !== addressBigInt ||
        memOffsetPt.value !== memOffset ||
        codeOffsetPt.value !== codeOffset ||
        dataLengthPt.value !== dataLength
      ) {
        throw new Error(`Synthesizer: EXTCODECOPY: Input data mismatch`)
      }
      if (dataLength !== BIGINT_0) {
        const dataPt = await prepareEXTCodePt(runState, addressBigInt, codeOffset, dataLength)
        runState.memoryPt.write(Number(memOffset), Number(dataLength), dataPt)
      }
      const _outData = runState.memoryPt.viewMemory(Number(memOffset), Number(dataLength))
      const outData = runState.memory.read(Number(memOffset), Number(dataLength))
      if (!equalsBytes(_outData, outData)) {
        throw new Error(`Synthesizer: EXTCODECOPY: Output data mismatch`)
      }
    },
  ],
  // 0x3f: EXTCODEHASH
  [
    0x3f,
    async function (runState, common) {
      const addressBigInt = runState.stack.pop()
      const address = createAddressFromStackBigInt(addressBigInt)

      // EOF check
      const code = await runState.stateManager.getCode(address)
      if (isEOF(code)) {
        // In legacy code, the target code is treated as to be "EOFBYTES" code
        // Therefore, push the hash of EOFBYTES to the stack
        runState.stack.push(bytesToBigInt(EOFHASH))

        // For Synthesizer //
        await synthesizerEnvInf('EXTCODEHASH', runState, addressBigInt)
        return
      } else if (common.isActivatedEIP(7702)) {
        const possibleDelegatedAddress = getEIP7702DelegatedAddress(code)
        if (possibleDelegatedAddress !== undefined) {
          const account = await runState.stateManager.getAccount(possibleDelegatedAddress)
          if (!account || account.isEmpty()) {
            runState.stack.push(BIGINT_0)

            // For Synthesizer //
            await synthesizerEnvInf('EXTCODEHASH', runState, addressBigInt)
            return
          }

          runState.stack.push(BigInt(bytesToHex(account.codeHash)))

          // For Synthesizer //
          await synthesizerEnvInf('EXTCODEHASH', runState, addressBigInt)
          return
        } else {
          runState.stack.push(bytesToBigInt(keccak256(code)))

          // For Synthesizer //
          await synthesizerEnvInf('EXTCODEHASH', runState, addressBigInt)
          return
        }
      }

      const account = await runState.stateManager.getAccount(address)
      if (!account || account.isEmpty()) {
        runState.stack.push(BIGINT_0)

        // For Synthesizer //
        await synthesizerEnvInf('EXTCODEHASH', runState, addressBigInt)
        return
      }

      runState.stack.push(BigInt(bytesToHex(account.codeHash)))

      // For Synthesizer //
      await synthesizerEnvInf('EXTCODEHASH', runState, addressBigInt)
    },
  ],
  // 0x3d: RETURNDATASIZE
  [
    0x3d,
    async function (runState) {
      runState.stack.push(runState.interpreter.getReturnDataSize())

      // For Synthesizer //
      await synthesizerEnvInf('RETURNDATASIZE', runState)
    },
  ],
  // 0x3e: RETURNDATACOPY
  [
    0x3e,
    function (runState) {
      const [memOffset, returnDataOffset, dataLength] = runState.stack.popN(3)

      if (dataLength !== BIGINT_0) {
        const data = getDataSlice(
          runState.interpreter.getReturnData(),
          returnDataOffset,
          dataLength,
        )
        const memOffsetNum = Number(memOffset)
        const lengthNum = Number(dataLength)
        runState.memory.write(memOffsetNum, lengthNum, data)
      }

      // For Synthesizer //
      const [memOffsetPt, returnDataOffsetPt, dataLengthPt] = runState.stackPt.popN(3)
      if (
        memOffset !== memOffsetPt.value ||
        returnDataOffset !== returnDataOffsetPt.value ||
        dataLength !== dataLengthPt.value
      ) {
        throw new Error(`Synthesizer: 'RETURNDATACOPY': Input data mismatch`)
      }
      if (dataLength !== BIGINT_0) {
        const copiedMemoryPts = copyMemoryRegion(
          runState,
          returnDataOffset,
          dataLength,
          runState.returnMemoryPts,
          memOffset,
        )
        for (const entry of copiedMemoryPts) {
          // the lower index, the older data
          runState.memoryPt.write(entry.memOffset, entry.containerSize, entry.dataPt)
        }
      }
      const _outData = runState.memoryPt.viewMemory(Number(memOffset), Number(dataLength))
      const outData = runState.memory.read(Number(memOffset), Number(dataLength))
      if (!equalsBytes(_outData, outData)) {
        throw new Error(`Synthesizer: RETURNDATACOPY: Output data mismatch`)
      }
    },
  ],
  // 0x3a: GASPRICE
  [
    0x3a,
    async function (runState) {
      runState.stack.push(runState.interpreter.getTxGasPrice())

      // For Synthesizer //
      await synthesizerEnvInf('GASPRICE', runState)
    },
  ],
  // '0x40' range - block operations
  // 0x40: BLOCKHASH
  [
    0x40,
    async function (runState, common) {
      const number = runState.stack.pop()

      if (common.isActivatedEIP(7709)) {
        if (number >= runState.interpreter.getBlockNumber()) {
          runState.stack.push(BIGINT_0)

          // For Synthesizer //
          synthesizerBlkInf('BLOCKHASH', runState, number)
          return
        }

        const diff = runState.interpreter.getBlockNumber() - number
        // block lookups must be within the original window even if historyStorageAddress's
        // historyServeWindow is much greater than 256
        if (diff > BIGINT_256 || diff <= BIGINT_0) {
          runState.stack.push(BIGINT_0)

          // For Synthesizer //
          synthesizerBlkInf('BLOCKHASH', runState, number)
          return
        }

        const historyAddress = new Address(
          bigIntToAddressBytes(common.param('historyStorageAddress')),
        )
        const historyServeWindow = common.param('historyServeWindow')
        const key = setLengthLeft(bigIntToBytes(number % historyServeWindow), 32)

        if (common.isActivatedEIP(6800)) {
          const { treeIndex, subIndex } = getVerkleTreeIndicesForStorageSlot(number)
          // create witnesses and charge gas
          const statelessGas = runState.env.accessWitness!.touchAddressOnReadAndComputeGas(
            historyAddress,
            treeIndex,
            subIndex,
          )
          runState.interpreter.useGas(statelessGas, `BLOCKHASH`)
        }
        const storage = await runState.stateManager.getStorage(historyAddress, key)

        runState.stack.push(bytesToBigInt(storage))
      } else {
        const diff = runState.interpreter.getBlockNumber() - number
        // block lookups must be within the past 256 blocks
        if (diff > BIGINT_256 || diff <= BIGINT_0) {
          runState.stack.push(BIGINT_0)

          // For Synthesizer //
          synthesizerBlkInf('BLOCKHASH', runState, number)
          return
        }

        const block = await runState.blockchain.getBlock(Number(number))

        runState.stack.push(bytesToBigInt(block.hash()))
      }
      // For Synthesizer //
      synthesizerBlkInf('BLOCKHASH', runState, number)
    },
  ],
  // 0x41: COINBASE
  [
    0x41,
    function (runState) {
      runState.stack.push(runState.interpreter.getBlockCoinbase())

      // For Synthesizer //
      synthesizerBlkInf('COINBASE', runState)
    },
  ],
  // 0x42: TIMESTAMP
  [
    0x42,
    function (runState) {
      runState.stack.push(runState.interpreter.getBlockTimestamp())

      // For Synthesizer //
      synthesizerBlkInf('TIMESTAMP', runState)
    },
  ],
  // 0x43: NUMBER
  [
    0x43,
    function (runState) {
      runState.stack.push(runState.interpreter.getBlockNumber())

      // For Synthesizer //
      synthesizerBlkInf('NUMBER', runState)
    },
  ],
  // 0x44: DIFFICULTY (EIP-4399: supplanted as PREVRANDAO)
  [
    0x44,
    function (runState, common) {
      if (common.isActivatedEIP(4399)) {
        runState.stack.push(runState.interpreter.getBlockPrevRandao())
      } else {
        runState.stack.push(runState.interpreter.getBlockDifficulty())
      }

      // For Synthesizer //
      synthesizerBlkInf('DIFFICULTY', runState)
    },
  ],
  // 0x45: GASLIMIT
  [
    0x45,
    function (runState) {
      runState.stack.push(runState.interpreter.getBlockGasLimit())

      // For Synthesizer //
      synthesizerBlkInf('GASLIMIT', runState)
    },
  ],
  // 0x46: CHAINID
  [
    0x46,
    function (runState) {
      runState.stack.push(runState.interpreter.getChainId())

      // For Synthesizer //
      synthesizerBlkInf('CHAINID', runState)
    },
  ],
  // 0x47: SELFBALANCE
  [
    0x47,
    function (runState) {
      runState.stack.push(runState.interpreter.getSelfBalance())

      // For Synthesizer //
      synthesizerBlkInf('SELFBALANCE', runState)
    },
  ],
  // 0x48: BASEFEE
  [
    0x48,
    function (runState) {
      runState.stack.push(runState.interpreter.getBlockBaseFee())

      // For Synthesizer //
      synthesizerBlkInf('BASEFEE', runState)
    },
  ],
  // 0x49: BLOBHASH
  [
    0x49,
    function (runState) {
      const index = runState.stack.pop()
      if (runState.env.blobVersionedHashes.length > Number(index)) {
        runState.stack.push(BigInt(runState.env.blobVersionedHashes[Number(index)]))
      } else {
        runState.stack.push(BIGINT_0)
      }

      // For Synthesizer //
      synthesizerBlkInf('BLOBHASH', runState, index)
    },
  ],
  // 0x4a: BLOBBASEFEE
  [
    0x4a,
    function (runState) {
      runState.stack.push(runState.interpreter.getBlobBaseFee())

      // For Synthesizer //
      synthesizerBlkInf('BLOBBASEFEE', runState)
    },
  ],
  // 0x50 range - 'storage' and execution
  // 0x50: POP
  [
    0x50,
    function (runState) {
      runState.stack.pop()
      // For Synthesizer //
      runState.stackPt.pop()
    },
  ],
  // 0x51: MLOAD
  [
    0x51,
    function (runState) {
      const pos = runState.stack.pop()
      const word = runState.memory.read(Number(pos), 32, true)
      runState.stack.push(bytesToBigInt(word))

      // For Synthesizer //
      const loadSize = 32
      const offsetPt = runState.stackPt.pop()
      if (pos !== offsetPt.value) {
        throw new Error(`Synthesizer: MLOAD: Input data mismatch`)
      }
      const offsetNum = Number(offsetPt.value)
      const dataAliasInfos = runState.memoryPt.getDataAlias(offsetNum, loadSize)
      const mutDataPt = runState.synthesizer.placeMemoryToStack(dataAliasInfos)

      /***
       * EVM 실행과 포인터 추적 시스템 간의 일관성 검증
       * 1. 메모리 오프셋 검증:
       *    - pos: 메인 스택에서 pop된 실제 메모리 오프셋
       *    - offsetNum: 포인터 스택(stackPt)에서 추적된 메모리 오프셋
       * 2. 로드된 값 검증:
       *    - stack.peek(1)[0]: 메모리 로드 후 스택에 push된 실제 값
       *    - mutDataPt.value: 포인터 추적 시스템이 계산한 예상 메모리 값
       * 이 값들이 일치하지 않으면 EVM 실행과 포인터 추적 사이에
       * 심각한 불일치가 있음을 의미하므로 즉시 에러 처리가 필요
       */
      if (Number(pos) !== offsetNum || runState.stack.peek(1)[0] !== mutDataPt.value) {
        console.log('******ERROR******')
        if (Number(pos) !== offsetNum) {
          console.group()
          console.log('***Number(pos) !== offsetNum)***')
          console.log(Number(pos), offsetNum)
          console.groupEnd()
        }
        if (runState.stack.peek(1)[0] !== mutDataPt.value) {
          console.group()
          console.log('***runState.stack.peek(1)[0] !== mutDataPt.value***')
          console.log(runState.stack.peek(1)[0], mutDataPt.value)
          console.groupEnd()
        }

        console.log('runState.stack : ', runState.stack)
        console.log('mutDataPt : ', mutDataPt)
        throw new Error(`Synthesizer: MLOAD: Output data mismatch`)
      }
      runState.stackPt.push(mutDataPt)
    },
  ],
  // 0x52: MSTORE
  [
    0x52,
    function (runState) {
      const [offset, word] = runState.stack.popN(2)
      const buf = setLengthLeft(bigIntToBytes(word), 32)
      const offsetNum = Number(offset)
      runState.memory.write(offsetNum, 32, buf)

      // For Synthesizer //
      const truncSize = 32
      const dataPt = runState.stackPt.peek(2)[1]
      const memPt = runState.synthesizer.placeMSTORE(dataPt, truncSize)
      if (truncSize < dataPt.sourceSize) {
        // StackPt에서 dataPt를 변형을 추적 memPt로 교체해 줍니다.
        runState.stackPt.swap(1)
        runState.stackPt.pop() // 기존 dataPt를 버립니다.
        runState.stackPt.push(memPt) // 변형된 dataPt를 넣습니다.
        runState.stackPt.swap(1)
      }
      const [offsetPt, newDataPt] = runState.stackPt.popN(2)
      const _offsetNum = Number(offsetPt.value)
      if (
        _offsetNum !== offsetNum ||
        BigInt.asIntN(256, newDataPt.value) !== BigInt.asIntN(256, word)
      ) {
        if (_offsetNum !== offsetNum) {
          console.log(`_offsetNum !== offsetNum`)
          console.log(_offsetNum, offsetNum)
        }
        if (newDataPt.value !== word) {
          console.log(`newDataPt.value !== word`)
          console.log(newDataPt.value, word)
          console.log('runState.stack : ', runState.stack)
          console.log('newDataPt : ', newDataPt)
          console.log('stack', runState.stack)
          console.log('stackPt : ', runState.stackPt)
        }
        throw new Error(`MSTORE: Data mismatch between stackPt and stack`)
      }
      runState.memoryPt.write(offsetNum, truncSize, newDataPt)
    },
  ],
  // 0x53: MSTORE8
  [
    0x53,
    function (runState) {
      const [offset, byte] = runState.stack.popN(2)

      const buf = bigIntToBytes(byte & BIGINT_255)
      const offsetNum = Number(offset)
      runState.memory.write(offsetNum, 1, buf)

      // For Synthesizer //
      const truncSize = 1 // MSTORE8은 최하위 1바이트만을 저장하고, 상위 바이트는 버림.
      const dataPt = runState.stackPt.peek(2)[1] // StackPt에서 최상위 두번째 포인터를 리턴 (stack.ts 참고)
      // 데이터의 변형을 추적하면서 동시에 Placements에도 반영 해 줍니다.
      const memPt = runState.synthesizer.placeMSTORE(dataPt, truncSize)
      if (truncSize < dataPt.sourceSize) {
        // StackPt에서 dataPt를 변형을 추적 memPt로 교체해 줍니다.
        runState.stackPt.swap(1)
        runState.stackPt.pop() // 기존 dataPt를 버립니다.
        runState.stackPt.push(memPt) // 변형된 dataPt를 넣습니다.
        runState.stackPt.swap(1)
      }
      // 이제 일반적인 MSTORE 연산을 수행합니다
      const [offsetPt, newDataPt] = runState.stackPt.popN(2)
      const _offsetNum = Number(offsetPt.value)
      if (_offsetNum !== offsetNum || newDataPt.value !== bytesToBigInt(buf)) {
        throw new Error(`MSTORE8: Data mismatch between stackPt and stack`)
      }
      runState.memoryPt.write(offsetNum, truncSize, newDataPt)
    },
  ],
  // 0x54: SLOAD
  [
    0x54,
    async function (runState) {
      const key = runState.stack.pop()
      const keyBuf = setLengthLeft(bigIntToBytes(key), 32)
      const value = await runState.interpreter.storageLoad(keyBuf)
      const valueBigInt = value.length ? bytesToBigInt(value) : BIGINT_0
      runState.stack.push(valueBigInt)

      // For Synthesizer //
      if (key !== runState.stackPt.pop().value) {
        throw new Error(`Synthesizer: 'SLOAD': Input data mismatch`)
      }
      runState.stackPt.push(
        runState.synthesizer.loadStorage(runState.env.address.toString(), key, valueBigInt),
      )
      if (runState.stackPt.peek(1)[0].value !== runState.stack.peek(1)[0]) {
        throw new Error(`Synthesizer: 'SLOAD': Output data mismatch`)
      }
    },
  ],
  // 0x55: SSTORE
  [
    0x55,
    async function (runState) {
      const [key, val] = runState.stack.popN(2)

      const keyBuf = setLengthLeft(bigIntToBytes(key), 32)
      // NOTE: this should be the shortest representation
      let value
      if (val === BIGINT_0) {
        value = Uint8Array.from([])
      } else {
        value = bigIntToBytes(val)
      }

      await runState.interpreter.storageStore(keyBuf, value)

      // For Synthesizer //
      const [keyPt, valPt] = runState.stackPt.popN(2)
      if (key !== keyPt.value || val !== valPt.value) {
        throw new Error(`Synthesizer: 'SSTORE': Input data mismatch`)
      }
      runState.synthesizer.storeStorage(runState.env.address.toString(), key, valPt)
    },
  ],
  // 0x56: JUMP
  [
    0x56,
    function (runState) {
      const dest = runState.stack.pop()
      if (dest > runState.interpreter.getCodeSize()) {
        trap(ERROR.INVALID_JUMP + ' at ' + describeLocation(runState))
      }

      const destNum = Number(dest)

      if (!jumpIsValid(runState, destNum)) {
        trap(ERROR.INVALID_JUMP + ' at ' + describeLocation(runState))
      }

      runState.programCounter = destNum

      // For Synthesizer //
      runState.stackPt.pop()
    },
  ],
  // 0x57: JUMPI
  [
    0x57,
    function (runState) {
      const [dest, cond] = runState.stack.popN(2)
      if (cond !== BIGINT_0) {
        if (dest > runState.interpreter.getCodeSize()) {
          trap(ERROR.INVALID_JUMP + ' at ' + describeLocation(runState))
        }

        const destNum = Number(dest)

        if (!jumpIsValid(runState, destNum)) {
          trap(ERROR.INVALID_JUMP + ' at ' + describeLocation(runState))
        }

        runState.programCounter = destNum
      }

      // For Synthesizer //
      runState.stackPt.popN(2) // stackPt도 동일하게 pop
    },
  ],
  // 0x58: PC
  [
    0x58,
    function (runState) {
      runState.stack.push(BigInt(runState.programCounter - 1))
    },
  ],
  // 0x59: MSIZE
  [
    0x59,
    function (runState) {
      runState.stack.push(runState.memoryWordCount * BIGINT_32)
    },
  ],
  // 0x5a: GAS
  [
    0x5a,
    function (runState) {
      runState.stack.push(runState.interpreter.getGasLeft())
    },
  ],
  // 0x5b: JUMPDEST
  [0x5b, function () {}],
  // 0x5c: TLOAD (EIP 1153)
  [
    0x5c,
    function (runState) {
      const key = runState.stack.pop()
      const keyBuf = setLengthLeft(bigIntToBytes(key), 32)
      const value = runState.interpreter.transientStorageLoad(keyBuf)
      const valueBN = value.length ? bytesToBigInt(value) : BIGINT_0
      runState.stack.push(valueBN)

      // For Synthesizer //
      if (key !== runState.stackPt.pop().value) {
        throw new Error(`Synthesizer: 'TLOAD': Input data mismatch`)
      }
      let dataPt = runState.synthesizer.TStoragePt.get(runState.env.address.toString())?.get(key)
      if (dataPt === undefined) {
        dataPt = runState.synthesizer.loadAuxin(BIGINT_0)
      }
      runState.stackPt.push(dataPt)
      if (runState.stackPt.peek(1)[0].value !== runState.stack.peek(1)[0]) {
        throw new Error(`Synthesizer: 'TLOAD': Output data mismatch`)
      }
    },
  ],
  // 0x5d: TSTORE (EIP 1153)
  [
    0x5d,
    function (runState) {
      // TSTORE
      if (runState.interpreter.isStatic()) {
        trap(ERROR.STATIC_STATE_CHANGE)
      }
      const [key, val] = runState.stack.popN(2)

      const keyBuf = setLengthLeft(bigIntToBytes(key), 32)
      // NOTE: this should be the shortest representation
      let value
      if (val === BIGINT_0) {
        value = Uint8Array.from([])
      } else {
        value = bigIntToBytes(val)
      }

      runState.interpreter.transientStorageStore(keyBuf, value)

      // For Synthesizer //
      const [keyPt, valPt] = runState.stackPt.popN(2)
      if (key !== keyPt.value || val !== valPt.value) {
        throw new Error(`Synthesizer: 'TSTORE': Input data mismatch`)
      }
      const TStoragePt = runState.synthesizer.TStoragePt
      const thisAddress = runState.env.address.toString()
      const entry = TStoragePt.get(thisAddress) ?? new Map()
      entry.set(key, valPt)
      TStoragePt.set(thisAddress, entry)
    },
  ],
  // 0x5e: MCOPY (5656)
  [
    0x5e,
    function (runState) {
      const [dst, src, length] = runState.stack.popN(3)
      const data = runState.memory.read(Number(src), Number(length), true)
      runState.memory.write(Number(dst), Number(length), data)

      // For Synthesizer //
      const [dstPt, srcPt, lengthPt] = runState.stackPt.popN(3)
      if (dst !== dstPt.value || src !== srcPt.value || length !== lengthPt.value) {
        throw new Error(`Synthesizer: 'MCOPY': Input data mismatch`)
      }
      const copiedMemoryPts = copyMemoryRegion(runState, src, length, undefined, dst)
      for (const entry of copiedMemoryPts) {
        // the lower index, the older data
        runState.memoryPt.write(entry.memOffset, entry.containerSize, entry.dataPt)
      }
      const _outData = runState.memoryPt.viewMemory(Number(dst), Number(length))
      const outData = runState.memory.read(Number(dst), Number(length))
      if (!equalsBytes(_outData, outData)) {
        throw new Error(`Synthesizer: MCOPY: Output data mismatch`)
      }
    },
  ],
  // 0x5f: PUSH0
  [
    0x5f,
    function (runState) {
      runState.stack.push(BIGINT_0)

      // For Synthesizer //
      const dataPt = runState.synthesizer.loadPUSH(
        runState.env.address.toString(),
        runState.programCounterPrev,
        BIGINT_0,
        1,
      )
      runState.stackPt.push(dataPt)

      if (runState.stackPt.peek(1)[0].value !== runState.stack.peek(1)[0]) {
        throw new Error(`Synthesizer: PUSH0: Output data mismatch`)
      }
    },
  ],
  // 0x60: PUSH
  [
    0x60,
    function (runState, common) {
      const numToPush = runState.opCode - 0x5f

      if (
        runState.programCounter + numToPush > runState.code.length &&
        common.isActivatedEIP(3540)
      ) {
        trap(ERROR.OUT_OF_RANGE)
      }

      if (common.isActivatedEIP(6800) && runState.env.chargeCodeAccesses === true) {
        const contract = runState.interpreter.getAddress()
        const startOffset = Math.min(runState.code.length, runState.programCounter + 1)
        const endOffset = Math.min(runState.code.length, startOffset + numToPush - 1)
        const statelessGas = runState.env.accessWitness!.touchCodeChunksRangeOnReadAndChargeGas(
          contract,
          startOffset,
          endOffset,
        )
        runState.interpreter.useGas(statelessGas, `PUSH`)
      }

      if (!runState.shouldDoJumpAnalysis) {
        runState.stack.push(runState.cachedPushes[runState.programCounter])
        runState.programCounter += numToPush
      } else {
        const loaded = bytesToBigInt(
          runState.code.subarray(runState.programCounter, runState.programCounter + numToPush),
        )
        runState.programCounter += numToPush
        runState.stack.push(loaded)
      }

      // For Synthesizer
      const value = runState.stack.peek(1)[0]
      const dataPt = runState.synthesizer.loadPUSH(
        runState.env.address.toString(),
        runState.programCounterPrev,
        value,
        numToPush,
      )
      runState.stackPt.push(dataPt)
      if (runState.stackPt.peek(1)[0].value !== runState.stack.peek(1)[0]) {
        throw new Error(`Synthesizer: PUSH${numToPush}: Output data mismatch`)
      }
    },
  ],
  // 0x80: DUP
  [
    0x80,
    function (runState) {
      const stackPos = runState.opCode - 0x7f
      runState.stack.dup(stackPos)

      // // For Synthesizer
      // const dataPt = runState.stackPt.peek(stackPos)[0]
      // console.log('stackPos', stackPos)
      // console.log('dataPt', dataPt)
      // const newDataPt = { ...dataPt } // 새로운 객체로 복사
      // runState.stackPt.push(newDataPt)
      runState.stackPt.dup(stackPos)
    },
  ],
  // 0x90: SWAP
  [
    0x90,
    function (runState) {
      const stackPos = runState.opCode - 0x8f
      runState.stack.swap(stackPos)

      // For Synthesizer //
      runState.stackPt.swap(stackPos)
    },
  ],
  // 0xa0: LOG
  [
    0xa0,
    function (runState) {
      const [memOffset, memLength] = runState.stack.popN(2)

      const topicsCount = runState.opCode - 0xa0

      const topics = runState.stack.popN(topicsCount)
      const topicsBuf = topics.map(function (a: bigint) {
        return setLengthLeft(bigIntToBytes(a), 32)
      })

      let mem = new Uint8Array(0)
      if (memLength !== BIGINT_0) {
        mem = runState.memory.read(Number(memOffset), Number(memLength))
      }

      runState.interpreter.log(mem, topicsCount, topicsBuf)

      // For Synthesizer //
      const [memOffsetPt, memLengthPt] = runState.stackPt.popN(2)
      const topicPts = runState.stackPt.popN(topicsCount)
      if (memOffsetPt.value !== memOffset || memLengthPt.value !== memLength) {
        throw new Error(`Synthesizer: 'LOG': Input data mismatch`)
      }
      for (let i = 0; i < topicsCount; i++) {
        if (topicPts[i].value !== topics[i]) {
          throw new Error(`Synthesizer: 'LOG': Input data mismatch`)
        }
      }
      const dataAlias = runState.memoryPt.getDataAlias(Number(memOffset), Number(memLength))
      const dataPt = runState.synthesizer.placeMemoryToStack(dataAlias)
      runState.synthesizer.storeLog(dataPt, topicPts)
    },
  ],
  // 0xd0: DATALOAD
  [
    0xd0,
    function (runState, _common) {
      if (runState.env.eof === undefined) {
        // Opcode not available in legacy contracts
        trap(ERROR.INVALID_OPCODE)
      }
      const pos = runState.stack.pop()
      if (pos > runState.env.eof!.container.body.dataSection.length) {
        runState.stack.push(BIGINT_0)
        return
      }

      const i = Number(pos)
      let loaded = runState.env.eof!.container.body.dataSection.subarray(i, i + 32)
      loaded = loaded.length ? loaded : Uint8Array.from([0])
      let r = bytesToBigInt(loaded)
      // Pad the loaded length with 0 bytes in case it is smaller than 32
      if (loaded.length < 32) {
        r = r << (BIGINT_8 * BigInt(32 - loaded.length))
      }
      runState.stack.push(r)
    },
  ],
  // 0xd1: DATALOADN
  [
    0xd1,
    function (runState, _common) {
      if (runState.env.eof === undefined) {
        // Opcode not available in legacy contracts
        trap(ERROR.INVALID_OPCODE)
      }
      const toLoad = Number(
        bytesToBigInt(runState.code.subarray(runState.programCounter, runState.programCounter + 2)),
      )
      const data = bytesToBigInt(
        runState.env.eof!.container.body.dataSection.subarray(toLoad, toLoad + 32),
      )
      runState.stack.push(data)
      runState.programCounter += 2
    },
  ],
  // 0xd2: DATASIZE
  [
    0xd2,
    function (runState, _common) {
      if (runState.env.eof === undefined) {
        // Opcode not available in legacy contracts
        trap(ERROR.INVALID_OPCODE)
      }
      runState.stack.push(BigInt(runState.env.eof!.container.body.dataSection.length))
    },
  ],
  // 0xd3: DATACOPY
  [
    0xd3,
    function (runState, _common) {
      if (runState.env.eof === undefined) {
        // Opcode not available in legacy contracts
        trap(ERROR.INVALID_OPCODE)
      }
      const [memOffset, offset, size] = runState.stack.popN(3)
      if (size !== BIGINT_0) {
        const data = getDataSlice(runState.env.eof!.container.body.dataSection, offset, size)
        const memOffsetNum = Number(memOffset)
        const dataLengthNum = Number(size)
        runState.memory.write(memOffsetNum, dataLengthNum, data)
      }
    },
  ],
  // 0xe0: RJUMP
  [
    0xe0,
    function (runState, _common) {
      if (runState.env.eof === undefined) {
        // Opcode not available in legacy contracts
        trap(ERROR.INVALID_OPCODE)
      } else {
        const code = runState.env.code
        const rjumpDest = new DataView(code.buffer).getInt16(runState.programCounter)
        runState.programCounter += 2 + rjumpDest
      }
    },
  ],
  // 0xe1: RJUMPI
  [
    0xe1,
    function (runState, _common) {
      if (runState.env.eof === undefined) {
        // Opcode not available in legacy contracts
        trap(ERROR.INVALID_OPCODE)
      } else {
        const cond = runState.stack.pop()
        // Move PC to the PC post instruction
        if (cond > 0) {
          const code = runState.env.code
          const rjumpDest = new DataView(code.buffer).getInt16(runState.programCounter)
          runState.programCounter += rjumpDest
        }
        // In all cases, increment PC with 2 (also in the case if `cond` is `0`)
        runState.programCounter += 2
      }
    },
  ],
  // 0xe2: RJUMPV
  [
    0xe2,
    function (runState, _common) {
      if (runState.env.eof === undefined) {
        // Opcode not available in legacy contracts
        trap(ERROR.INVALID_OPCODE)
      } else {
        const code = runState.env.code
        const jumptableEntries = code[runState.programCounter]
        // Note: if the size of the immediate is `0`, this thus means that the actual size is `2`
        // This allows for 256 entries in the table instead of 255
        const jumptableSize = (jumptableEntries + 1) * 2
        // Move PC to start of the jump table
        runState.programCounter += 1
        const jumptableCase = runState.stack.pop()
        if (jumptableCase <= jumptableEntries) {
          const rjumpDest = new DataView(code.buffer).getInt16(
            runState.programCounter + Number(jumptableCase) * 2,
          )
          runState.programCounter += jumptableSize + rjumpDest
        } else {
          runState.programCounter += jumptableSize
        }
      }
    },
  ],
  // 0xe3: CALLF
  [
    0xe3,
    function (runState, _common) {
      if (runState.env.eof === undefined) {
        // Opcode not available in legacy contracts
        trap(ERROR.INVALID_OPCODE)
      }
      const sectionTarget = bytesToInt(
        runState.code.slice(runState.programCounter, runState.programCounter + 2),
      )
      const stackItems = runState.stack.length
      const typeSection = runState.env.eof!.container.body.typeSections[sectionTarget]
      if (1024 < stackItems + typeSection?.inputs - typeSection?.maxStackHeight) {
        trap(EOFError.StackOverflow)
      }
      if (runState.env.eof!.eofRunState.returnStack.length >= 1024) {
        trap(EOFError.ReturnStackOverflow)
      }
      runState.env.eof?.eofRunState.returnStack.push(runState.programCounter + 2)

      // Find out the opcode we should jump into
      runState.programCounter = runState.env.eof!.container.header.getCodePosition(sectionTarget)
    },
  ],
  // 0xe4: RETF
  [
    0xe4,
    function (runState, _common) {
      if (runState.env.eof === undefined) {
        // Opcode not available in legacy contracts
        trap(ERROR.INVALID_OPCODE)
      }
      const newPc = runState.env.eof!.eofRunState.returnStack.pop()
      if (newPc === undefined) {
        // This should NEVER happen since it is validated that functions either terminate (the call frame) or return
        trap(EOFError.RetfNoReturn)
      }
      runState.programCounter = newPc!
    },
  ],
  // 0xe5: JUMPF
  [
    0xe5,
    function (runState, _common) {
      if (runState.env.eof === undefined) {
        // Opcode not available in legacy contracts
        trap(ERROR.INVALID_OPCODE)
      }
      // NOTE: (and also TODO) this code is exactly the same as CALLF, except pushing to the return stack is now skipped
      // (and also the return stack overflow check)
      // It is commented out here
      const sectionTarget = bytesToInt(
        runState.code.slice(runState.programCounter, runState.programCounter + 2),
      )
      const stackItems = runState.stack.length
      const typeSection = runState.env.eof!.container.body.typeSections[sectionTarget]
      if (1024 < stackItems + typeSection?.inputs - typeSection?.maxStackHeight) {
        trap(EOFError.StackOverflow)
      }
      /*if (runState.env.eof!.eofRunState.returnStack.length >= 1024) {
        trap(EOFError.ReturnStackOverflow)
      }
      runState.env.eof?.eofRunState.returnStack.push(runState.programCounter + 2)*/

      // Find out the opcode we should jump into
      runState.programCounter = runState.env.eof!.container.header.getCodePosition(sectionTarget)
    },
  ],
  // 0xe6: DUPN
  [
    0xe6,
    function (runState, _common) {
      if (runState.env.eof === undefined) {
        // Opcode not available in legacy contracts
        trap(ERROR.INVALID_OPCODE)
      }
      const toDup =
        Number(
          bytesToBigInt(
            runState.code.subarray(runState.programCounter, runState.programCounter + 1),
          ),
        ) + 1
      runState.stack.dup(toDup)
      runState.programCounter++
    },
  ],
  // 0xe7: SWAPN
  [
    0xe7,
    function (runState, _common) {
      if (runState.env.eof === undefined) {
        // Opcode not available in legacy contracts
        trap(ERROR.INVALID_OPCODE)
      }
      const toSwap =
        Number(
          bytesToBigInt(
            runState.code.subarray(runState.programCounter, runState.programCounter + 1),
          ),
        ) + 1
      runState.stack.swap(toSwap)
      runState.programCounter++
    },
  ],
  // 0xe8: EXCHANGE
  [
    0xe8,
    function (runState, _common) {
      if (runState.env.eof === undefined) {
        // Opcode not available in legacy contracts
        trap(ERROR.INVALID_OPCODE)
      }
      const toExchange = Number(
        bytesToBigInt(runState.code.subarray(runState.programCounter, runState.programCounter + 1)),
      )
      const n = (toExchange >> 4) + 1
      const m = (toExchange & 0x0f) + 1
      runState.stack.exchange(n, n + m)
      runState.programCounter++
    },
  ],
  // 0xec: EOFCREATE
  [
    0xec,
    async function (runState, _common) {
      if (runState.env.eof === undefined) {
        // Opcode not available in legacy contracts
        trap(ERROR.INVALID_OPCODE)
      } else {
        // Read container index
        const containerIndex = runState.env.code[runState.programCounter]
        const containerCode = runState.env.eof!.container.body.containerSections[containerIndex]

        // Pop stack values
        const [value, salt, inputOffset, inputSize] = runState.stack.popN(4)

        const gasLimit = runState.messageGasLimit!
        runState.messageGasLimit = undefined

        let data = new Uint8Array(0)
        if (inputSize !== BIGINT_0) {
          data = runState.memory.read(Number(inputOffset), Number(inputSize), true)
        }

        runState.programCounter++ // Jump over the immediate byte

        const ret = await runState.interpreter.eofcreate(
          gasLimit,
          value,
          containerCode,
          setLengthLeft(bigIntToBytes(salt), 32),
          data,
        )
        runState.stack.push(ret)
      }
    },
  ],
  // 0xee: RETURNCONTRACT
  [
    0xee,
    async function (runState, _common) {
      if (runState.env.eof === undefined) {
        // Opcode not available in legacy contracts
        trap(ERROR.INVALID_OPCODE)
      } else {
        // Read container index
        const containerIndex = runState.env.code[runState.programCounter]
        const containerCode = runState.env.eof!.container.body.containerSections[containerIndex]

        // Read deployContainer as EOFCreate (initcode) container
        const deployContainer = new EOFContainer(containerCode, EOFContainerMode.Initmode)

        // Pop stack values
        const [auxDataOffset, auxDataSize] = runState.stack.popN(2)

        let auxData = new Uint8Array(0)
        if (auxDataSize !== BIGINT_0) {
          auxData = runState.memory.read(Number(auxDataOffset), Number(auxDataSize))
        }

        const originalDataSize = deployContainer.header.dataSize
        const preDeployDataSectionSize = deployContainer.body.dataSection.length
        const actualSectionSize = preDeployDataSectionSize + Number(auxDataSize)

        if (actualSectionSize < originalDataSize) {
          trap(EOFError.InvalidReturnContractDataSize)
        }

        if (actualSectionSize > 0xffff) {
          // Data section size is now larger than the max data section size
          // Temp: trap OOG?
          trap(ERROR.OUT_OF_GAS)
        }

        const newSize = setLengthLeft(bigIntToBytes(BigInt(actualSectionSize)), 2)

        // Write the bytes to the containerCode
        const dataSizePtr = deployContainer.header.dataSizePtr
        containerCode[dataSizePtr] = newSize[0]
        containerCode[dataSizePtr + 1] = newSize[1]

        const returnContainer = concatBytes(containerCode, auxData)

        runState.interpreter.finish(returnContainer)
      }
    },
  ],
  // '0xf0' range - closures
  // 0xf0: CREATE
  [
    0xf0,
    async function (runState, common) {
      const [value, offset, length] = runState.stack.popN(3)

      if (
        common.isActivatedEIP(3860) &&
        length > Number(common.param('maxInitCodeSize')) &&
        !runState.interpreter._evm.allowUnlimitedInitCodeSize
      ) {
        trap(ERROR.INITCODE_SIZE_VIOLATION)
      }

      const gasLimit = runState.messageGasLimit!
      runState.messageGasLimit = undefined

      let data = new Uint8Array(0)
      if (length !== BIGINT_0) {
        data = runState.memory.read(Number(offset), Number(length), true)
      }

      if (isEOF(data)) {
        // Legacy cannot deploy EOF code
        runState.stack.push(BIGINT_0)
        return
      }

      const ret = await runState.interpreter.create(gasLimit, value, data)
      runState.stack.push(ret)
    },
  ],
  // 0xf5: CREATE2
  [
    0xf5,
    async function (runState, common) {
      if (runState.interpreter.isStatic()) {
        trap(ERROR.STATIC_STATE_CHANGE)
      }

      const [value, offset, length, salt] = runState.stack.popN(4)

      if (
        common.isActivatedEIP(3860) &&
        length > Number(common.param('maxInitCodeSize')) &&
        !runState.interpreter._evm.allowUnlimitedInitCodeSize
      ) {
        trap(ERROR.INITCODE_SIZE_VIOLATION)
      }

      const gasLimit = runState.messageGasLimit!
      runState.messageGasLimit = undefined

      let data = new Uint8Array(0)
      if (length !== BIGINT_0) {
        data = runState.memory.read(Number(offset), Number(length), true)
      }

      if (isEOF(data)) {
        // Legacy cannot deploy EOF code
        runState.stack.push(BIGINT_0)
        return
      }

      const ret = await runState.interpreter.create2(
        gasLimit,
        value,
        data,
        setLengthLeft(bigIntToBytes(salt), 32),
      )
      runState.stack.push(ret)
    },
  ],
  // 0xf1: CALL
  [
    0xf1,
    async function (runState: RunState, common: Common) {
      const [_currentGasLimit, toAddr, value, inOffset, inLength, outOffset, outLength] =
        runState.stack.popN(7)
      const toAddress = createAddressFromStackBigInt(toAddr)

      let data = new Uint8Array(0)
      if (inLength !== BIGINT_0) {
        data = runState.memory.read(Number(inOffset), Number(inLength), true)
      }

      let gasLimit = runState.messageGasLimit!
      if (value !== BIGINT_0) {
        const callStipend = common.param('callStipendGas')
        runState.interpreter.addStipend(callStipend)
        gasLimit += callStipend
      }

      runState.messageGasLimit = undefined

      // For synthesizer
      const [__currentGasLimit, _toAddr, _value, _inOffset, _inLength, _outOffset, _outLength] =
        runState.stackPt.popN(7)
      if (
        __currentGasLimit.value !== _currentGasLimit ||
        _toAddr.value !== toAddr ||
        _value.value !== value ||
        _inOffset.value !== inOffset ||
        _inLength.value !== inLength ||
        _outOffset.value !== outOffset ||
        _outLength.value !== outLength
      ) {
        throw new Error(`Synthesizer: CALL: Input data mismatch`)
      }
      const calldataMemoryPts = copyMemoryRegion(runState, inOffset, inLength)

      // for debugging
      const simCalldataMemoryPt = simulateMemoryPt(calldataMemoryPts)
      const _data = simCalldataMemoryPt.viewMemory(0, Number(inLength))
      if (!equalsBytes(_data, data)) {
        throw new Error(`Synthesizer: CALL: Output data mismatch`)
      }
      ////

      const ret = await runState.interpreter.call(
        gasLimit,
        toAddress,
        value,
        data,
        calldataMemoryPts,
      )

      // Synthesizer를 위해 writeCallOutput을 수정하였음 (Write the return data on the memory)
      writeCallOutput(runState, outOffset, outLength)
      runState.stack.push(ret)
    },
  ],
  // 0xf2: CALLCODE
  [
    0xf2,
    async function (runState: RunState, common: Common) {
      const [_currentGasLimit, toAddr, value, inOffset, inLength, outOffset, outLength] =
        runState.stack.popN(7)
      const toAddress = createAddressFromStackBigInt(toAddr)

      let gasLimit = runState.messageGasLimit!
      if (value !== BIGINT_0) {
        const callStipend = common.param('callStipendGas')
        runState.interpreter.addStipend(callStipend)
        gasLimit += callStipend
      }

      runState.messageGasLimit = undefined

      let data = new Uint8Array(0)
      if (inLength !== BIGINT_0) {
        data = runState.memory.read(Number(inOffset), Number(inLength), true)
      }

      // For synthesizer
      const [__currentGasLimit, _toAddr, _value, _inOffset, _inLength, _outOffset, _outLength] =
        runState.stackPt.popN(7)
      if (
        __currentGasLimit.value !== _currentGasLimit ||
        _toAddr.value !== toAddr ||
        _value.value !== value ||
        _inOffset.value !== inOffset ||
        _inLength.value !== inLength ||
        _outOffset.value !== outOffset ||
        _outLength.value !== outLength
      ) {
        throw new Error(`Synthesizer: CALLCODE: Input data mismatch`)
      }
      const calldataMemoryPts = copyMemoryRegion(runState, inOffset, inLength)

      // for debugging
      const simCalldataMemoryPt = simulateMemoryPt(calldataMemoryPts)
      const _data = simCalldataMemoryPt.viewMemory(0, Number(inLength))
      if (!equalsBytes(_data, data)) {
        throw new Error(`Synthesizer: CALLCODE: Output data mismatch`)
      }
      ////

      const ret = await runState.interpreter.callCode(
        gasLimit,
        toAddress,
        value,
        data,
        calldataMemoryPts,
      )

      // Synthesizer를 위해 writeCallOutput을 수정하였음 (Write the return data on the memory)
      writeCallOutput(runState, outOffset, outLength)
      runState.stack.push(ret)
    },
  ],
  // 0xf4: DELEGATECALL
  [
    0xf4,
    async function (runState) {
      const value = runState.interpreter.getCallValue()
      const [_currentGasLimit, toAddr, inOffset, inLength, outOffset, outLength] =
        runState.stack.popN(6)
      const toAddress = createAddressFromStackBigInt(toAddr)

      let data = new Uint8Array(0)
      if (inLength !== BIGINT_0) {
        data = runState.memory.read(Number(inOffset), Number(inLength), true)
      }

      const gasLimit = runState.messageGasLimit!
      runState.messageGasLimit = undefined

      // For synthesizer
      const [__currentGasLimit, _toAddr, _inOffset, _inLength, _outOffset, _outLength] =
        runState.stackPt.popN(6)
      if (
        __currentGasLimit.value !== _currentGasLimit ||
        _toAddr.value !== toAddr ||
        _inOffset.value !== inOffset ||
        _inLength.value !== inLength ||
        _outOffset.value !== outOffset ||
        _outLength.value !== outLength
      ) {
        throw new Error(`Synthesizer: DELEGATECALL: Input data mismatch`)
      }

      const calldataMemoryPts = copyMemoryRegion(runState, inOffset, inLength)

      // for debugging
      const simCalldataMemoryPt = simulateMemoryPt(calldataMemoryPts)
      const _data = simCalldataMemoryPt.viewMemory(0, Number(inLength))
      if (!equalsBytes(_data, data)) {
        throw new Error(`Synthesizer: DELEGATECALL: Output data mismatch`)
      }
      ////

      const ret = await runState.interpreter.callDelegate(
        gasLimit,
        toAddress,
        value,
        data,
        calldataMemoryPts,
      )

      // Synthesizer를 위해 writeCallOutput을 수정하였음 (Write the return data on the memory)
      writeCallOutput(runState, outOffset, outLength)
      runState.stack.push(ret)
    },
  ],
  // 0xf8: EXTCALL
  [
    0xf8,
    async function (runState, _common) {
      if (runState.env.eof === undefined) {
        // Opcode not available in legacy contracts
        trap(ERROR.INVALID_OPCODE)
      } else {
        const [toAddr, inOffset, inLength, value] = runState.stack.popN(4)

        const gasLimit = runState.messageGasLimit!
        runState.messageGasLimit = undefined

        if (gasLimit === -BIGINT_1) {
          // Special case, abort doing any logic (this logic is defined in `gas.ts`), and put `1` on stack per spec
          runState.stack.push(BIGINT_1)
          runState.returnBytes = new Uint8Array(0)
          return
        }

        const toAddress = createAddressFromStackBigInt(toAddr)

        let data = new Uint8Array(0)
        if (inLength !== BIGINT_0) {
          data = runState.memory.read(Number(inOffset), Number(inLength), true)
        }

        // dataPts for Synthesizer
        const dataPts = runState.memoryPt.read(Number(inOffset), Number(inLength))
        const ret = await runState.interpreter.call(gasLimit, toAddress, value, data, dataPts)
        // Write return data to memory

        runState.stack.push(ret)
      }
    },
  ],
  // 0xf9: EXTDELEGATECALL
  [
    0xf9,
    async function (runState, _common) {
      if (runState.env.eof === undefined) {
        // Opcode not available in legacy contracts
        trap(ERROR.INVALID_OPCODE)
      } else {
        const value = runState.interpreter.getCallValue()
        const [toAddr, inOffset, inLength] = runState.stack.popN(3)

        const gasLimit = runState.messageGasLimit!
        runState.messageGasLimit = undefined

        if (gasLimit === -BIGINT_1) {
          // Special case, abort doing any logic (this logic is defined in `gas.ts`), and put `1` on stack per spec
          runState.stack.push(BIGINT_1)
          runState.returnBytes = new Uint8Array(0)
          return
        }

        const toAddress = createAddressFromStackBigInt(toAddr)

        const code = await runState.stateManager.getCode(toAddress)

        if (!isEOF(code)) {
          // EXTDELEGATECALL cannot call legacy contracts
          runState.stack.push(BIGINT_1)
          return
        }

        let data = new Uint8Array(0)
        if (inLength !== BIGINT_0) {
          data = runState.memory.read(Number(inOffset), Number(inLength), true)
        }

        // dataPts for Synthesizer
        const dataPts = runState.memoryPt.read(Number(inOffset), Number(inLength))
        const ret = await runState.interpreter.callDelegate(
          gasLimit,
          toAddress,
          value,
          data,
          dataPts,
        )
        runState.stack.push(ret)
      }
    },
  ],
  // 0xfa: STATICCALL
  [
    0xfa,
    async function (runState) {
      const value = BIGINT_0
      const [_currentGasLimit, toAddr, inOffset, inLength, outOffset, outLength] =
        runState.stack.popN(6)
      const toAddress = createAddressFromStackBigInt(toAddr)

      const gasLimit = runState.messageGasLimit!
      runState.messageGasLimit = undefined

      let data = new Uint8Array(0)
      if (inLength !== BIGINT_0) {
        data = runState.memory.read(Number(inOffset), Number(inLength), true)
      }

      // For synthesizer
      const [__currentGasLimit, _toAddr, _inOffset, _inLength, _outOffset, _outLength] =
        runState.stackPt.popN(6)
      if (
        __currentGasLimit.value !== _currentGasLimit ||
        _toAddr.value !== toAddr ||
        _inOffset.value !== inOffset ||
        _inLength.value !== inLength ||
        _outOffset.value !== outOffset ||
        _outLength.value !== outLength
      ) {
        throw new Error(`Synthesizer: STATICCALL: Input data mismatch`)
      }
      const calldataMemoryPts = copyMemoryRegion(runState, inOffset, inLength)

      // for debugging
      const simCalldataMemoryPt = simulateMemoryPt(calldataMemoryPts)
      const _data = simCalldataMemoryPt.viewMemory(0, Number(inLength))
      if (!equalsBytes(_data, data)) {
        throw new Error(`Synthesizer: STATICCALL: Output data mismatch`)
      }
      ////

      const ret = await runState.interpreter.callStatic(
        gasLimit,
        toAddress,
        value,
        data,
        calldataMemoryPts,
      )

      // Synthesizer를 위해 writeCallOutput을 수정하였음 (Write the return data on the memory)
      writeCallOutput(runState, outOffset, outLength)
      runState.stack.push(ret)
    },
  ],
  // 0xfb: EXTSTATICCALL
  [
    0xfb,
    async function (runState, _common) {
      if (runState.env.eof === undefined) {
        // Opcode not available in legacy contracts
        trap(ERROR.INVALID_OPCODE)
      } else {
        const value = BIGINT_0
        const [toAddr, inOffset, inLength] = runState.stack.popN(3)

        const gasLimit = runState.messageGasLimit!
        runState.messageGasLimit = undefined

        if (gasLimit === -BIGINT_1) {
          // Special case, abort doing any logic (this logic is defined in `gas.ts`), and put `1` on stack per spec
          runState.stack.push(BIGINT_1)
          runState.returnBytes = new Uint8Array(0)
          return
        }

        const toAddress = createAddressFromStackBigInt(toAddr)

        let data = new Uint8Array(0)
        if (inLength !== BIGINT_0) {
          data = runState.memory.read(Number(inOffset), Number(inLength), true)
        }

        // dataPts for Synthesizer
        const dataPts = runState.memoryPt.read(Number(inOffset), Number(inLength))
        const ret = await runState.interpreter.callStatic(gasLimit, toAddress, value, data, dataPts)
        runState.stack.push(ret)
      }
    },
  ],
  // 0xf3: RETURN
  [
    0xf3,
    function (runState) {
      const [offset, length] = runState.stack.popN(2)
      let returnData = new Uint8Array(0)
      if (length !== BIGINT_0) {
        returnData = runState.memory.read(Number(offset), Number(length))
      }

      // For Synthesizer
      const [_offset, _length] = runState.stackPt.popN(2)
      if (_offset.value !== offset || _length.value !== length) {
        throw new Error(`Synthesizer: RETURN: Input data mismatch`)
      }
      const returnMemoryPts = copyMemoryRegion(runState, offset, length)
      runState.interpreter.finishPt(returnMemoryPts)

      // for debugging
      const simMemoryPt = simulateMemoryPt(returnMemoryPts)
      const _returnData = simMemoryPt.viewMemory(0, Number(length))
      if (!equalsBytes(_returnData, returnData)) {
        throw new Error(`Synthesizer: RETURN: Output data mismatch`)
      }
      // Halt the current code run
      runState.interpreter.finish(returnData)
    },
  ],
  // 0xfd: REVERT
  [
    0xfd,
    function (runState) {
      const [offset, length] = runState.stack.popN(2)
      let returnData = new Uint8Array(0)
      if (length !== BIGINT_0) {
        returnData = runState.memory.read(Number(offset), Number(length))
      }
      runState.interpreter.revert(returnData)
    },
  ],
  // '0x70', range - other
  // 0xff: SELFDESTRUCT
  [
    0xff,
    async function (runState) {
      const selfdestructToAddressBigInt = runState.stack.pop()
      const selfdestructToAddress = createAddressFromStackBigInt(selfdestructToAddressBigInt)
      return runState.interpreter.selfDestruct(selfdestructToAddress)
    },
  ],
])

// Fill in rest of PUSHn, DUPn, SWAPn, LOGn for handlers
const pushFn = handlers.get(0x60)!
for (let i = 0x61; i <= 0x7f; i++) {
  handlers.set(i, pushFn)
}
const dupFn = handlers.get(0x80)!
for (let i = 0x81; i <= 0x8f; i++) {
  handlers.set(i, dupFn)
}
const swapFn = handlers.get(0x90)!
for (let i = 0x91; i <= 0x9f; i++) {
  handlers.set(i, swapFn)
}
const logFn = handlers.get(0xa0)!
for (let i = 0xa1; i <= 0xa4; i++) {
  handlers.set(i, logFn)
}
