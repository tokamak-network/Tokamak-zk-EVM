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
import {  isEOF } from '../eof/util.js'
import { ERROR } from '../exceptions.js'
import { DELEGATION_7702_FLAG } from '../types.js'

import {
  createAddressFromStackBigInt,
  describeLocation,
  exponentiation,
  fromTwos,
  getDataSlice,
  mod,
  toTwos,
  trap,
  writeCallOutput,
} from './util.js'

import type { RunState } from '../interpreter.js'
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
    },
  ],
  // 0x02: MUL
  [
    0x02,
    function (runState) {
      const [a, b] = runState.stack.popN(2)
      const r = mod(a * b, TWO_POW256)
      runState.stack.push(r)
    },
  ],
  // 0x03: SUB
  [
    0x03,
    function (runState) {
      const [a, b] = runState.stack.popN(2)
      const r = mod(a - b, TWO_POW256)
      runState.stack.push(r)
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
    },
  ],
  // 0x0b: SIGNEXTEND
  [
    0x0b,
    function (runState) {
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
    },
  ],
  // 0x10: LT
  [
    0x10,
    function (runState) {
      const [a, b] = runState.stack.popN(2)
      const r = a < b ? BIGINT_1 : BIGINT_0
      runState.stack.push(r)
    },
  ],
  // 0x11: GT
  [
    0x11,
    function (runState) {
      const [a, b] = runState.stack.popN(2)
      const r = a > b ? BIGINT_1 : BIGINT_0
      runState.stack.push(r)
    },
  ],
  // 0x12: SLT
  [
    0x12,
    function (runState) {
      const [a, b] = runState.stack.popN(2)
      const r = fromTwos(a) < fromTwos(b) ? BIGINT_1 : BIGINT_0
      runState.stack.push(r)
    },
  ],
  // 0x13: SGT
  [
    0x13,
    function (runState) {
      const [a, b] = runState.stack.popN(2)
      const r = fromTwos(a) > fromTwos(b) ? BIGINT_1 : BIGINT_0
      runState.stack.push(r)
    },
  ],
  // 0x14: EQ
  [
    0x14,
    function (runState) {
      const [a, b] = runState.stack.popN(2)
      const r = a === b ? BIGINT_1 : BIGINT_0
      runState.stack.push(r)
    },
  ],
  // 0x15: ISZERO
  [
    0x15,
    function (runState) {
      const a = runState.stack.pop()
      const r = a === BIGINT_0 ? BIGINT_1 : BIGINT_0
      runState.stack.push(r)
    },
  ],
  // 0x16: AND
  [
    0x16,
    function (runState) {
      const [a, b] = runState.stack.popN(2)
      const r = a & b
      runState.stack.push(r)
    },
  ],
  // 0x17: OR
  [
    0x17,
    function (runState) {
      const [a, b] = runState.stack.popN(2)
      const r = a | b
      runState.stack.push(r)
    },
  ],
  // 0x18: XOR
  [
    0x18,
    function (runState) {
      const [a, b] = runState.stack.popN(2)
      const r = a ^ b
      runState.stack.push(r)
    },
  ],
  // 0x19: NOT
  [
    0x19,
    function (runState) {
      const a = runState.stack.pop()
      const r = BigInt.asUintN(256, ~a)
      runState.stack.push(r)
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
    },
  ],
  // 0x1c: SHR
  [
    0x1c,
    function (runState) {
      const [a, b] = runState.stack.popN(2)
      if (a > 256) {
        runState.stack.push(BIGINT_0)
        return
      }

      const r = b >> a
      runState.stack.push(r)
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
    },
  ],
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
    },
  ],
  // 0x30: ADDRESS
  [
    0x30,
    async function (runState) {
      const address = bytesToBigInt(runState.interpreter.getAddress().bytes)
      runState.stack.push(address)
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
    },
  ],
  // 0x32: ORIGIN
  [
    0x32,
    async function (runState) {
      runState.stack.push(runState.interpreter.getTxOrigin())
    },
  ],
  // 0x33: CALLER
  [
    0x33,
    async function (runState) {
      runState.stack.push(runState.interpreter.getCaller())
    },
  ],
  // 0x34: CALLVALUE
  [
    0x34,
    async function (runState) {
      runState.stack.push(runState.interpreter.getCallValue())
    },
  ],
  // 0x35: CALLDATALOAD
  [
    0x35,
    async function (runState) {
      const pos = runState.stack.pop()
      if (pos > runState.interpreter.getCallDataSize()) {
        runState.stack.push(BIGINT_0)
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
    },
  ],
  // 0x36: CALLDATASIZE
  [
    0x36,
    async function (runState) {
      runState.stack.push(runState.interpreter.getCallDataSize())
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
    },
  ],
  // 0xe4: RETF
  [
    0xe4,
    function (runState, _common) {
      if (runState.env.eof === undefined) {
        trap(ERROR.INVALID_OPCODE)
      }
      const newPc = runState.env.eof!.eofRunState.returnStack.pop()
      if (newPc === undefined) {
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
      runState.programCounter = runState.env.eof!.container.header.getCodePosition(sectionTarget)
    },
  ],
  // 0xe6: DUPN
  [
    0xe6,
    function (runState, _common) {
      if (runState.env.eof === undefined) {
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
        trap(ERROR.INVALID_OPCODE)
      } else {
        const containerIndex = runState.env.code[runState.programCounter]
        const containerCode = runState.env.eof!.container.body.containerSections[containerIndex]

        const [value, salt, inputOffset, inputSize] = runState.stack.popN(4)

        const gasLimit = runState.messageGasLimit!
        runState.messageGasLimit = undefined

        let data = new Uint8Array(0)
        if (inputSize !== BIGINT_0) {
          data = runState.memory.read(Number(inputOffset), Number(inputSize), true)
        }

        runState.programCounter++

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
        trap(ERROR.INVALID_OPCODE)
      } else {
        const containerIndex = runState.env.code[runState.programCounter]
        const containerCode = runState.env.eof!.container.body.containerSections[containerIndex]

        const deployContainer = new EOFContainer(containerCode, EOFContainerMode.Initmode)

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
          trap(ERROR.OUT_OF_GAS)
        }

        const newSize = setLengthLeft(bigIntToBytes(BigInt(actualSectionSize)), 2)

        const dataSizePtr = deployContainer.header.dataSizePtr
        containerCode[dataSizePtr] = newSize[0]
        containerCode[dataSizePtr + 1] = newSize[1]

        const returnContainer = concatBytes(containerCode, auxData)

        runState.interpreter.finish(returnContainer)
      }
    },
  ],
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

      const ret = await runState.interpreter.call(
        gasLimit,
        toAddress,
        value,
        data,
      )

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

      const ret = await runState.interpreter.callCode(
        gasLimit,
        toAddress,
        value,
        data,
      )

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

      const ret = await runState.interpreter.callDelegate(
        gasLimit,
        toAddress,
        value,
        data,
      )

      writeCallOutput(runState, outOffset, outLength)
      runState.stack.push(ret)
    },
  ],
  // 0xf8: EXTCALL
  [
    0xf8,
    async function (runState, _common) {
      if (runState.env.eof === undefined) {
        trap(ERROR.INVALID_OPCODE)
      } else {
        const [toAddr, inOffset, inLength, value] = runState.stack.popN(4)

        const gasLimit = runState.messageGasLimit!
        runState.messageGasLimit = undefined

        if (gasLimit === -BIGINT_1) {
          runState.stack.push(BIGINT_1)
          runState.returnBytes = new Uint8Array(0)
          return
        }

        const toAddress = createAddressFromStackBigInt(toAddr)

        let data = new Uint8Array(0)
        if (inLength !== BIGINT_0) {
          data = runState.memory.read(Number(inOffset), Number(inLength), true)
        }

        const ret = await runState.interpreter.call(gasLimit, toAddress, value, data)
        runState.stack.push(ret)
      }
    },
  ],
  // 0xf9: EXTDELEGATECALL
  [
    0xf9,
    async function (runState, _common) {
      if (runState.env.eof === undefined) {
        trap(ERROR.INVALID_OPCODE)
      } else {
        const value = runState.interpreter.getCallValue()
        const [toAddr, inOffset, inLength] = runState.stack.popN(3)

        const gasLimit = runState.messageGasLimit!
        runState.messageGasLimit = undefined

        if (gasLimit === -BIGINT_1) {
          runState.stack.push(BIGINT_1)
          runState.returnBytes = new Uint8Array(0)
          return
        }

        const toAddress = createAddressFromStackBigInt(toAddr)

        const code = await runState.stateManager.getCode(toAddress)

        if (!isEOF(code)) {
          runState.stack.push(BIGINT_1)
          return
        }

        let data = new Uint8Array(0)
        if (inLength !== BIGINT_0) {
          data = runState.memory.read(Number(inOffset), Number(inLength), true)
        }

        const ret = await runState.interpreter.callDelegate(
          gasLimit,
          toAddress,
          value,
          data,
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

      const ret = await runState.interpreter.callStatic(
        gasLimit,
        toAddress,
        value,
        data,
      )

      writeCallOutput(runState, outOffset, outLength)
      runState.stack.push(ret)
    },
  ],
  // 0xfb: EXTSTATICCALL
  [
    0xfb,
    async function (runState, _common) {
      if (runState.env.eof === undefined) {
        trap(ERROR.INVALID_OPCODE)
      } else {
        const value = BIGINT_0
        const [toAddr, inOffset, inLength] = runState.stack.popN(3)

        const gasLimit = runState.messageGasLimit!
        runState.messageGasLimit = undefined

        if (gasLimit === -BIGINT_1) {
          runState.stack.push(BIGINT_1)
          runState.returnBytes = new Uint8Array(0)
          return
        }

        const toAddress = createAddressFromStackBigInt(toAddr)

        let data = new Uint8Array(0)
        if (inLength !== BIGINT_0) {
          data = runState.memory.read(Number(inOffset), Number(inLength), true)
        }

        const ret = await runState.interpreter.callStatic(gasLimit, toAddress, value, data)
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
