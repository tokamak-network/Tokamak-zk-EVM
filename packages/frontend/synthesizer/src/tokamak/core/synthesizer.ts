import {
  BIGINT_0,
  BIGINT_1,
  bigIntToBytes,
  bytesToBigInt,
  bytesToHex,
  setLengthLeft,
} from '@ethereumjs/util'
import { keccak256 } from 'ethereum-cryptography/keccak.js'

import { EOFBYTES, isEOF } from '../../eof/util.js'
import { createAddressFromStackBigInt, getDataSlice } from '../../opcodes/util.js'
import {
  DEFAULT_SOURCE_SIZE,
  INITIAL_PLACEMENT_INDEX,
  KECCAK_IN_PLACEMENT,
  KECCAK_IN_PLACEMENT_INDEX,
  KECCAK_OUT_PLACEMENT,
  KECCAK_OUT_PLACEMENT_INDEX,
  LOAD_PLACEMENT,
  LOAD_PLACEMENT_INDEX,
  RETURN_PLACEMENT,
  RETURN_PLACEMENT_INDEX,
} from '../constant/index.js'
import { subcircuits } from '../resources/index.js'
import { OPERATION_MAPPING } from '../operations/index.js'
import { DataPointFactory, simulateMemoryPt } from '../pointers/index.js'
import { addPlacement } from '../utils/utils.js'
import {
  InvalidInputCountError,
  SynthesizerError,
  SynthesizerValidator,
} from '../validation/index.js'

import type { RunState } from '../../interpreter.js'
import type { DataAliasInfoEntry, DataAliasInfos, MemoryPts } from '../pointers/index.js'
import type {
  ArithmeticOperator,
  Auxin,
  CreateDataPointParams,
  DataPt,
  Placements,
  SubcircuitInfoByName,
  SubcircuitInfoByNameEntry,
} from '../types/index.js'

export const synthesizerArith = (
  op: ArithmeticOperator,
  ins: bigint[],
  out: bigint,
  runState: RunState,
): void => {
  const inPts = runState.stackPt.popN(ins.length)

  for (let i = 0; i < ins.length; i++) {
    if (inPts[i].value !== ins[i]) {
      const stackValue = BigInt(inPts[i].value)
      const inputValue = BigInt(ins[i])
      console.log(`Value mismatch at index ${i}:`)
      console.log(`Stack value: ${stackValue}`)
      console.log(`Input value: ${inputValue}`)
      throw new Error(`Synthesizer: ${op}: Input data mismatch`)
    }
  }
  let outPts: DataPt[]
  switch (op) {
    case 'DecToBit':
      throw new Error(`Synthesizer: ${op}: Cannot be called by "synthesizerArith"`)
    case 'EXP':
      outPts = [runState.synthesizer.placeEXP(inPts)]
      break
    default:
      outPts = runState.synthesizer.placeArith(op, inPts)
      break
  }
  if (outPts.length !== 1 || outPts[0].value !== out) {
    throw new Error(`Synthesizer: ${op}: Output data mismatch`)
  }
  runState.stackPt.push(outPts[0])
}

export const synthesizerBlkInf = (op: string, runState: RunState, target?: bigint): void => {
  let dataPt: DataPt
  switch (op) {
    case 'BLOCKHASH':
    case 'BLOBHASH':
      // These opcodes have one input and one output
      if (target === undefined) {
        throw new Error(`Synthesizer: ${op}: Must have an input block number`)
      }
      if (target !== runState.stackPt.pop().value) {
        throw new Error(`Synthesizer: ${op}: Input data mismatch`)
      }
      dataPt = runState.synthesizer.loadBlkInf(target, op, runState.stack.peek(1)[0])
      break
    case 'COINBASE':
    case 'TIMESTAMP':
    case 'NUMBER':
    case 'DIFFICULTY':
    case 'GASLIMIT':
    case 'CHAINID':
    case 'SELFBALANCE':
    case 'BASEFEE':
    case 'BLOBBASEFEE':
      // These opcodes have no input and one output
      dataPt = runState.synthesizer.loadBlkInf(
        runState.env.block.header.number,
        op,
        runState.stack.peek(1)[0],
      )
      break
    default:
      throw new Error(`Synthesizer: Dealing with invalid block information instruction`)
  }
  runState.stackPt.push(dataPt)
  if (runState.stackPt.peek(1)[0].value !== runState.stack.peek(1)[0]) {
    throw new Error(`Synthesizer: ${op}: Output data mismatch`)
  }
}

export async function prepareEXTCodePt(
  runState: RunState,
  target: bigint,
  _offset?: bigint,
  _size?: bigint,
): Promise<DataPt> {
  const address = createAddressFromStackBigInt(target)
  let code = await runState.stateManager.getCode(address)
  let codeType = 'EXTCode'
  if (isEOF(code)) {
    // In legacy code, the target code is treated as to be "EOFBYTES" code
    code = EOFBYTES
    codeType = 'EXTCode(EOF)'
  }
  const codeOffset = _offset ?? 0n
  const dataLength = _size ?? BigInt(code.byteLength)
  const data = getDataSlice(code, codeOffset, dataLength)
  const dataBigint = bytesToBigInt(data)
  const codeOffsetNum = Number(codeOffset)
  const dataPt = runState.synthesizer.loadEnvInf(
    address.toString(),
    codeType,
    dataBigint,
    codeOffsetNum,
    Number(dataLength),
  )
  return dataPt
}

export async function synthesizerEnvInf(
  op: string,
  runState: RunState,
  target?: bigint,
  offset?: bigint,
): Promise<void> {
  // Environment information을 Stack에 load하는 경우만 다룹니다. 그 외의 경우 (~COPY)는 functionst.ts에서 직접 처리 합니다.
  let dataPt: DataPt
  switch (op) {
    case 'CALLDATALOAD': {
      // These opcodes have one input and one output
      if (offset === undefined) {
        throw new Error(`Synthesizer: ${op}: Must have an input offset`)
      }
      if (offset !== runState.stackPt.pop().value) {
        throw new Error(`Synthesizer: ${op}: Input data mismatch`)
      }
      const i = Number(offset)
      const calldataMemoryPts = runState.interpreter._env.callMemoryPts
      if (calldataMemoryPts.length > 0) {
        // Case: The calldata is originated from the parent context
        // Simulate a MemoryPt for the calldata
        const calldataMemoryPt = simulateMemoryPt(calldataMemoryPts)
        // View the memory and get the alias info
        const dataAliasInfos = calldataMemoryPt.getDataAlias(i, 32)
        if (dataAliasInfos.length > 0) {
          // Case: Data exists in the scope of view
          dataPt = runState.synthesizer.placeMemoryToStack(dataAliasInfos)
        } else {
          // Case: Data does not exist in the scope of view => 0 is loaded
          dataPt = runState.synthesizer.loadEnvInf(
            runState.env.address.toString(),
            'Calldata(Empty)',
            runState.stack.peek(1)[0],
            i,
          )
        }
      } else {
        // Case: The calldata is originated from the user (transciton) input
        dataPt = runState.synthesizer.loadEnvInf(
          runState.env.address.toString(),
          'Calldata(User)',
          runState.stack.peek(1)[0],
          i,
        )
      }
      break
    }
    case 'BALANCE':
    case 'EXTCODESIZE': {
      // These opcodes have one input and one output
      if (target === undefined) {
        throw new Error(`Synthesizer: ${op}: Must have an input address`)
      }
      if (target !== runState.stackPt.pop().value) {
        throw new Error(`Synthesizer: ${op}: Input data mismatch`)
      }
      dataPt = runState.synthesizer.loadEnvInf(target.toString(16), op, runState.stack.peek(1)[0])
      break
    }
    case 'EXTCODEHASH': {
      // These opcode has one input and one output
      if (target === undefined) {
        throw new Error(`Synthesizer: ${op}: Must have an input address`)
      }
      if (target !== runState.stackPt.pop().value) {
        throw new Error(`Synthesizer: ${op}: Input data mismatch`)
      }
      const codePt = await prepareEXTCodePt(runState, target)
      if (codePt.value === BIGINT_0) {
        dataPt = runState.synthesizer.loadAuxin(BIGINT_0)
      } else {
        dataPt = runState.synthesizer.loadKeccak([codePt], runState.stack.peek(1)[0])
      }
      break
    }
    case 'ADDRESS':
    case 'ORIGIN':
    case 'CALLER':
    case 'CALLVALUE':
    case 'CALLDATASIZE':
    case 'CODESIZE':
    case 'GASPRICE':
    case 'RETURNDATASIZE':
      // These opcodes have no input and one output
      dataPt = runState.synthesizer.loadEnvInf(
        runState.env.address.toString(),
        op,
        runState.stack.peek(1)[0],
      )
      break
    default:
      throw new Error(`Synthesizer: Dealing with invalid environment information instruction`)
  }
  runState.stackPt.push(dataPt)
  if (runState.stackPt.peek(1)[0].value !== runState.stack.peek(1)[0]) {
    throw new Error(`Synthesizer: ${op}: Output data mismatch`)
  }
}

/**
 * Synthesizer 클래스는 서브서킷과 관련된 데이터를 관리합니다.
 *
 * @property {Placements} placements - 서브서킷의 배치 정보를 저장하는 맵.
 * @property {bigint[]} auxin - 보조 입력 데이터를 저장하는 배열.
 * @property {number} placementIndex - 현재 배치 인덱스.
 * @property {string[]} subcircuitNames - 서브서킷 이름을 저장하는 배열.
 */
export class Synthesizer {
  public placements: Placements
  public auxin: Auxin
  public envInf: Map<string, { value: bigint; wireIndex: number }>
  public blkInf: Map<string, { value: bigint; wireIndex: number }>
  public storagePt: Map<string, DataPt>
  public logPt: { topicPts: DataPt[]; valPt: DataPt }[]
  public TStoragePt: Map<string, Map<bigint, DataPt>>
  protected placementIndex: number
  private subcircuitNames
  readonly subcircuitInfoByName: SubcircuitInfoByName

  constructor() {
    this.placements = new Map()
    if (
      subcircuits[1].name === LOAD_PLACEMENT.name &&
      subcircuits[subcircuits.length - 2].name === RETURN_PLACEMENT.name
    ) {
      this.placements.set(LOAD_PLACEMENT_INDEX, LOAD_PLACEMENT)
      this.placements.set(RETURN_PLACEMENT_INDEX, RETURN_PLACEMENT)
    } else {
      throw new Error(`Synthesizer: Placement: Initialization faield.`)
    }
    if (subcircuits[subcircuits.length - 1].name === KECCAK_IN_PLACEMENT.name) {
      this.placements.set(KECCAK_IN_PLACEMENT_INDEX, KECCAK_IN_PLACEMENT)
    } else {
      throw new Error(`Synthesizer: Placement: Initialization faield.`)
    }
    if (subcircuits[0].name === KECCAK_OUT_PLACEMENT.name) {
      this.placements.set(KECCAK_OUT_PLACEMENT_INDEX, KECCAK_OUT_PLACEMENT)
    } else {
      throw new Error(`Synthesizer: Placement: Initialization faield.`)
    }

    this.auxin = new Map()
    this.envInf = new Map()
    this.blkInf = new Map()
    this.storagePt = new Map()
    this.logPt = []
    this.TStoragePt = new Map()
    this.placementIndex = INITIAL_PLACEMENT_INDEX
    this.subcircuitNames = subcircuits.map((circuit) => circuit.name)
    this.subcircuitInfoByName = new Map()
    for (const subcircuit of subcircuits) {
      const entryObject: SubcircuitInfoByNameEntry = {
        id: subcircuit.id,
        NWires: subcircuit.Nwires,
        NInWires: subcircuit.In_idx[1],
        NOutWires: subcircuit.Out_idx[1],
        inWireIndex: subcircuit.In_idx[0],
        outWireIndex: subcircuit.Out_idx[0],
      }
      this.subcircuitInfoByName.set(subcircuit.name, entryObject)
    }
  }

  /**
   * LOAD 서브서킷에 새���운 입출력 쌍을 추가합니다.
   * @param pointerIn - 입력 데이터 포인트
   * @returns 생성된 출력 데이터 포인트
   * @private
   */
  private _addWireToLoadPlacement(pointerIn: DataPt): DataPt {
    // 기존 output list의 길이를 새로운 출력의 인덱스로 사용
    if (
      this.placements.get(LOAD_PLACEMENT_INDEX)!.inPts.length !==
      this.placements.get(LOAD_PLACEMENT_INDEX)!.outPts.length
    ) {
      throw new Error(`Mismatches in the Load wires`)
    }
    const outWireIndex = this.placements.get(LOAD_PLACEMENT_INDEX)!.outPts.length

    // 출력 데이터 포인트 생성
    const outPtRaw: CreateDataPointParams = {
      source: 0,
      wireIndex: outWireIndex,
      value: pointerIn.value,
      sourceSize: DEFAULT_SOURCE_SIZE,
    }
    const pointerOut = DataPointFactory.create(outPtRaw)

    // LOAD 서브서킷에 입출력 추가
    this.placements.get(LOAD_PLACEMENT_INDEX)!.inPts.push(pointerIn)
    this.placements.get(LOAD_PLACEMENT_INDEX)!.outPts.push(pointerOut)

    return this.placements.get(LOAD_PLACEMENT_INDEX)!.outPts[outWireIndex]
  }

  /**
   * PUSH 명령어에 의한 새로운 LOAD 배치의 입출력 쌍을 추가합니다.
   *
   * @param {string} codeAddress - PUSH가 실행 된 코드의 address.
   * @param {number} programCounter - PUSH 입력 인자의 program counter.
   * @param {bigint} value - PUSH 입력 인자의 값.
   * @returns {void}
   */
  public loadPUSH(
    codeAddress: string,
    programCounter: number,
    value: bigint,
    size: number,
  ): DataPt {
    const inPtRaw: CreateDataPointParams = {
      source: `code: ${codeAddress}`,
      type: 'hardcoded',
      offset: programCounter + 1,
      value,
      sourceSize: size,
    }
    const pointerIn: DataPt = DataPointFactory.create(inPtRaw)

    return this._addWireToLoadPlacement(pointerIn)
  }

  public loadAuxin(value: bigint): DataPt {
    if (this.auxin.has(value)) {
      return this.placements.get(LOAD_PLACEMENT_INDEX)!.outPts[this.auxin.get(value)!]
    }
    const inPtRaw: CreateDataPointParams = {
      source: 'auxin',
      value,
      sourceSize: DEFAULT_SOURCE_SIZE,
    }
    const pointerIn = DataPointFactory.create(inPtRaw)
    const outPt = this._addWireToLoadPlacement(pointerIn)
    this.auxin.set(value, outPt.wireIndex!)
    return outPt
  }

  public loadEnvInf(
    codeAddress: string,
    type: string,
    value: bigint,
    _offset?: number,
    size?: number,
  ): DataPt {
    const offset = _offset ?? 0
    const whereItFrom = {
      source: `code: ${codeAddress}`,
      type,
      offset,
      length: size,
    }
    const key = JSON.stringify(whereItFrom)
    // if (this.envInf.has(key)) {
    //   return this.placements.get(LOAD_PLACEMENT_INDEX)!.outPts[this.envInf.get(key)!.wireIndex]
    // }
    const sourceSize = size ?? DEFAULT_SOURCE_SIZE
    const inPtRaw: CreateDataPointParams = {
      ...whereItFrom,
      value,
      sourceSize,
    }
    const pointerIn = DataPointFactory.create(inPtRaw)
    const outPt = this._addWireToLoadPlacement(pointerIn)
    const envInfEntry = {
      value,
      wireIndex: outPt.wireIndex!,
    }
    this.envInf.set(key, envInfEntry)
    return outPt
  }

  public loadStorage(codeAddress: string, key: bigint, value: bigint): DataPt {
    const keyString = JSON.stringify({ address: codeAddress, key: Number(key) })
    let outPt: DataPt
    if (this.storagePt.has(keyString)) {
      outPt = this.storagePt.get(keyString)!
    } else {
      const inPtRaw: CreateDataPointParams = {
        source: `storage: ${codeAddress}`,
        key,
        value,
        sourceSize: DEFAULT_SOURCE_SIZE,
      }
      const inPt = DataPointFactory.create(inPtRaw)
      this.storagePt.set(keyString, inPt)
      outPt = this._addWireToLoadPlacement(inPt)
    }
    return outPt
  }

  public storeStorage(codeAddress: string, key: bigint, inPt: DataPt): void {
    const keyString = JSON.stringify({ address: codeAddress, key: Number(key) })
    this.storagePt.set(keyString, inPt)
    const outWireIndex = this.placements.get(RETURN_PLACEMENT_INDEX)!.outPts.length
    // 출력 데이터 포인트 생성
    const outPtRaw: CreateDataPointParams = {
      dest: `storage: ${codeAddress}`,
      key,
      value: inPt.value,
      sourceSize: DEFAULT_SOURCE_SIZE,
    }
    const outPt = DataPointFactory.create(outPtRaw)
    // 입출력 데이터 포인터 쌍을 ReturnBuffer의 새로운 입출력 와이어 쌍으로 추가
    this.placements.get(RETURN_PLACEMENT_INDEX)!.inPts.push(inPt)
    this.placements.get(RETURN_PLACEMENT_INDEX)!.outPts.push(outPt)
  }

  public storeLog(valPt: DataPt, topicPts: DataPt[]): void {
    this.logPt.push({ valPt, topicPts })
    let outWireIndex = this.placements.get(RETURN_PLACEMENT_INDEX)!.outPts.length
    const inWireIndex = this.placements.get(RETURN_PLACEMENT_INDEX)!.inPts.length
    // 값 출력 데이터 포인트 생성
    const outPtRaw: CreateDataPointParams = {
      dest: 'LOG',
      pairedInputWireIndices: [inWireIndex],
      wireIndex: outWireIndex++,
      value: valPt.value,
      sourceSize: DEFAULT_SOURCE_SIZE,
    }
    const valOutPt = DataPointFactory.create(outPtRaw)
    // 입출력 데이터 포인터 쌍을 ReturnBuffer의 새로운 입출력 와이어 쌍으로 추가
    this.placements.get(RETURN_PLACEMENT_INDEX)!.inPts.push(valPt)
    this.placements.get(RETURN_PLACEMENT_INDEX)!.outPts.push(valOutPt)

    // Topic 출력 데이터 포인트 생성
    for (const topicPt of topicPts) {
      const outPtRaw: CreateDataPointParams = {
        dest: 'LOG',
        pairedInputWireIndices: [inWireIndex],
        wireIndex: outWireIndex++,
        value: topicPt.value,
        sourceSize: DEFAULT_SOURCE_SIZE,
      }
      const topicOutPt = DataPointFactory.create(outPtRaw)
      this.placements.get(RETURN_PLACEMENT_INDEX)!.inPts.push(topicPt)
      this.placements.get(RETURN_PLACEMENT_INDEX)!.outPts.push(topicOutPt)
    }
  }

  public loadBlkInf(blkNumber: bigint, type: string, value: bigint): DataPt {
    const whereItFrom = {
      source: `block number: ${Number(blkNumber)}`,
      type,
    }
    const key = JSON.stringify(whereItFrom)
    if (this.blkInf.has(key)) {
      return this.placements.get(LOAD_PLACEMENT_INDEX)!.outPts[this.blkInf.get(key)!.wireIndex]
    }
    const inPtRaw: CreateDataPointParams = {
      ...whereItFrom,
      value,
      sourceSize: DEFAULT_SOURCE_SIZE,
    }
    const pointerIn = DataPointFactory.create(inPtRaw)
    const outPt = this._addWireToLoadPlacement(pointerIn)
    const blkInfEntry = {
      value,
      wireIndex: outPt.wireIndex!,
    }
    this.blkInf.set(key, blkInfEntry)
    return outPt
  }

  public loadKeccak(inPts: DataPt[], outValue: bigint, length?: bigint): DataPt {
    // 연산 실행
    const nChunks = inPts.length
    let value = BIGINT_0
    for (let i = 0; i < nChunks; i++) {
      value += inPts[i].value << BigInt((nChunks - i - 1) * 32 * 8)
    }
    const valueInBytes = bigIntToBytes(value)
    const data = setLengthLeft(valueInBytes, Number(length) ?? valueInBytes.length)
    const _outValue = BigInt(bytesToHex(keccak256(data)))
    if (_outValue !== outValue) {
      throw new Error(`Synthesizer: loadKeccak: The Keccak hash may be customized`)
    }
    const inWireIndex = this.placements.get(KECCAK_IN_PLACEMENT_INDEX)!.inPts.length
    const pairedInputWireIndices = Array.from({ length: nChunks }, (_, i) => inWireIndex + i)
    const outWireIndex = this.placements.get(KECCAK_OUT_PLACEMENT_INDEX)!.outPts.length
    // 출력 데이터 포인트 생성
    const outPtRaw: CreateDataPointParams = {
      source: KECCAK_OUT_PLACEMENT_INDEX,
      wireIndex: outWireIndex,
      pairedInputWireIndices,
      value: outValue,
      sourceSize: DEFAULT_SOURCE_SIZE,
    }
    const outPt = DataPointFactory.create(outPtRaw)

    // keccakBuffer 서브서킷에 입출력 추가
    for (let i = 0; i < nChunks; i++) {
      this.placements.get(KECCAK_IN_PLACEMENT_INDEX)!.inPts[pairedInputWireIndices[i]] = inPts[i]
      this.placements.get(KECCAK_IN_PLACEMENT_INDEX)!.outPts[pairedInputWireIndices[i]] = inPts[i]
    }
    this.placements.get(KECCAK_OUT_PLACEMENT_INDEX)!.inPts.push(outPt)
    this.placements.get(KECCAK_OUT_PLACEMENT_INDEX)!.outPts.push(outPt)

    return this.placements.get(KECCAK_OUT_PLACEMENT_INDEX)!.outPts[outWireIndex]
  }

  /**
   * 새���운 MSTORE 배치를 추가합니다.
   * MSTORE는 Ethereum Virtual Machine(EVM)에서 사용되는 오퍼코드(opcode) 중 하나로, 메모리에 데이터를 저장하는 명령어입니다. MSTORE 지정된 메모리 위치에 32바이트(256비트) 크기의 데이터를 저장합니다.
   EVM 오퍼코드 설명
   MSTORE:
   기능: 메모리의 특정 위치에 32바이트 크기의 데이터를 저장합니다.
   스택 동작: 스택에서 두 개의 값을 팝(pop)합니다. 첫 번째 값은 메모리 주소이고, 두 번째 값은 저장할 데이터입니다.
   예: MSTORE는 메모리 주소와 데이터를 스택에서 꺼내어 해당 주소에 데이터를 저장합니다.
   *
   * @param {DataPt} inPt - 입력 데이터 포인트.
   * @param {DataPt} outPt - 출력 데이터 포인트.
   * @returns {void}
   * 이 메서드는 MSTORE 오퍼코드를 시뮬레이션하여 새로운 배치를 추가합니다. truncSize가 dataPt.actualSize보다 작으면, 데이터의 하위 바이트만 저장하고 상위 바이트는 버립니다. 변형된 데이터 포인트를 반환합니다.
   */
  public placeMSTORE(dataPt: DataPt, truncSize: number): DataPt {
    // MSTORE8은 trucSize=1로써, data의 최하위 1바이트만을 저장하고 상위 바이트는 버림.
    if (truncSize < dataPt.sourceSize) {
      // 원본 데이터에 변형이 있으므로, 이를 추적하는 가상의 연산를 만들고 이를 Placements에 반영합니다.
      // MSTORE8의 데이터 변형은 AND 연산으로 표현 가능 (= AND(data, 0xff))
      const maskerString = '0x' + 'FF'.repeat(truncSize)

      const outValue = dataPt.value & BigInt(maskerString)
      if (dataPt.value !== outValue) {
        const subcircuitName = 'AND'
        const inPts: DataPt[] = [this.loadAuxin(BigInt(maskerString)), dataPt]
        const rawOutPt: CreateDataPointParams = {
          source: this.placementIndex,
          wireIndex: 0,
          value: outValue,
          sourceSize: truncSize,
        }
        const outPts: DataPt[] = [DataPointFactory.create(rawOutPt)]
        this._place(subcircuitName, inPts, outPts)

        return outPts[0]
      }
    }
    const outPt = dataPt
    outPt.sourceSize = truncSize
    return outPt
  }

  public placeEXP(inPts: DataPt[]): DataPt {
    SynthesizerValidator.validateSubcircuitName('EXP', this.subcircuitNames)
    // a^b
    const aPt = inPts[0]
    const bPt = inPts[1]
    const bNum = Number(bPt.value)
    const k = Math.floor(Math.log2(bNum)) + 1 //bit length of b

    const bitifyOutPts = this.placeArith('DecToBit', [bPt]).reverse()
    // LSB at index 0

    const chPts: DataPt[] = []
    const ahPts: DataPt[] = []
    chPts.push(this.loadAuxin(BIGINT_1))
    ahPts.push(aPt)

    for (let i = 1; i <= k; i++) {
      const _inPts = [chPts[i - 1], ahPts[i - 1], bitifyOutPts[i - 1]]
      const _outPts = this.placeArith('SubEXP', _inPts)
      chPts.push(_outPts[0])
      ahPts.push(_outPts[1])
    }

    return chPts[chPts.length - 1]
  }

  /**
   * 새로운 MLOAD 배치를 추가합니다.
   *
   * MLOAD는 Ethereum Virtual Machine(EVM)에서 사용되는 오퍼코드(opcode) 중 하나로, 메모리에서 32바이트(256비트) 크기의 데이터를 읽어옵니다.
   * @param {DataAliasInfos} dataAliasInfos - 데이터 출처와 변형 정보를 포함하는 배열.
   * @returns {DataPt} 생성된 데이터 포인트.
   */
  public placeMemoryToStack(dataAliasInfos: DataAliasInfos): DataPt {
    if (dataAliasInfos.length === 0) {
      throw new Error(`Synthesizer: placeMemoryToStack: Noting tho load`)
    }
    return this._resolveDataAlias(dataAliasInfos)
  }

  public placeMemoryToMemory(dataAliasInfos: DataAliasInfos): DataPt[] {
    if (dataAliasInfos.length === 0) {
      throw new Error(`Synthesizer: placeMemoryToMemory: Nothing to load`)
    }
    const copiedDataPts: DataPt[] = []
    for (const info of dataAliasInfos) {
      // the lower index, the older data
      copiedDataPts.push(this._applyMask(info, true))
    }
    return copiedDataPts
  }

  /**
   * RETURN은 더이상 배치를 사용하지 않습니다.
   *
   * RETURN은 Ethereum Virtual Machine(EVM)에서 사용되는 오퍼코드(opcode) 중 하나로, 지정된 메모리 위치에서 데이터를 반환합니다.
   *
   * @param {string} name - 배치의 이름.
   * @param {DataAliasInfos} dataAliasInfos - 데이터 출처와 변형 정보를 포함하는 배열.
   * @returns {DataPt} 생성된 데이터 포인트.
   */
  // public newPlacementRETURNs(name: string, dataAliasInfos: DataAliasInfos): DataPt {
  //   const inPt: DataPt = this._resolveDataAlias(dataAliasInfos)
  //   const outPt: DataPt = inPt
  //   outPt.sourceIndex = 0
  //   outPt.source = this.placementIndex

  //   switch (name) {
  //     case 'RETURN': {
  //       const aliasResolvedDataPt = this.placeMemoryToMemory(dataAliasInfos)

  //       let dataCopy = aliasResolvedDataPt.value
  //       const uint8Array = new Uint8Array(32)
  //       for (let i = 31; i >= 0; i--) {
  //         uint8Array[i] = Number(dataCopy & 0xffn)
  //         dataCopy >>= 8n
  //       }

  //       /**
  //        * @example Big Endian
  //        *
  //        * 주소:  0x00  0x01  0x02  0x03
  //        * 값:   0x12  0x34  0x56  0x78
  //        */
  //       const outValues = Array.from(uint8Array, (byte) => BigInt(byte))
  //       const sourceOffset = this.auxin.length
  //       this._addAuxin(outValues)

  //       const inPt = aliasResolvedDataPt
  //       const outPts: DataPt[] = outValues
  //         .slice(0, 32)
  //         .map((value, index) => DataPointFactory.create('auxin', sourceOffset + index, value, 32))
  //       this._place('RETURN', [inPt], outPts)
  //       break
  //     }
  //     default:
  //       throw new Error(`LOAD subcircuit can only be manipulated by PUSH or RETURNs.`)
  //   }

  //   /**
  //    * @todo
  //    *
  //    * outPt 리턴을 여기서 해야될 필요?
  //    * switch statement 안에서 해야될 것처럼 보임
  //    */
  //   return outPt
  // }

  //# TODO: newDataPt size 변수 검증 필요
  private static readonly REQUIRED_INPUTS: Partial<Record<string, number>> = {
    ADDMOD: 3,
    MULMOD: 3,
    ISZERO: 1,
    NOT: 1,
    DecToBit: 1,
    SubEXP: 3,
  } as const
  private validateOperation(name: ArithmeticOperator, inPts: DataPt[]): void {
    // 기본값은 2, 예외적인 경우만 REQUIRED_INPUTS에서 확인
    const requiredInputs = Synthesizer.REQUIRED_INPUTS[name] ?? 2
    SynthesizerValidator.validateInputCount(name, inPts.length, requiredInputs)
    SynthesizerValidator.validateInputs(inPts)
  }

  private executeOperation(name: ArithmeticOperator, values: bigint[]): bigint | bigint[] {
    const operation = OPERATION_MAPPING[name]
    return operation(...values)
  }

  private createOutputPoint(value: bigint, _wireIndex?: number): DataPt {
    const wireIndex = _wireIndex ?? 0
    return DataPointFactory.create({
      source: this.placementIndex,
      wireIndex,
      value,
      sourceSize: DEFAULT_SOURCE_SIZE,
    })
  }

  private handleBinaryOp(name: ArithmeticOperator, inPts: DataPt[]): DataPt[] {
    try {
      // 1. 입력값 검증
      this.validateOperation(name, inPts)

      // 2. 연산 실행
      const values = inPts.map((pt) => pt.value)
      const outValue = this.executeOperation(name, values)

      // 3. 출력값 생성
      let wireIndex = 0
      const outPts = Array.isArray(outValue)
        ? outValue.map((value) => this.createOutputPoint(value, wireIndex++))
        : [this.createOutputPoint(outValue)]

      // 4. 배치 추가
      this._place(name, inPts, outPts)

      return outPts
    } catch (error) {
      if (error instanceof InvalidInputCountError) {
        /*eslint-disable*/
        console.error(`Invalid input count for ${name}: ${error.message}`)
      }
      if (error instanceof SynthesizerError) {
        /*eslint-disable*/
        console.error(`Synthesizer error in ${name}: ${error.message}`)
      }
      throw error
    }
  }

  /**
   * 새로운 산술 연산 배치를 추가합니다.
   *
   * @param {string} name - 배치의 이름. 예: 'ADD', 'SUB', 'MUL', 'DIV'.
   * @param {DataPt[]} inPts - 입력 데이터 포인트 배열.
   * @returns {DataPt[]} 생성된 출력 데이터 포인트 배열.
   * @throws {Error} 정의되지 않은 서브서킷 이름이 주어진 경우.
   */
  public placeArith(name: ArithmeticOperator, inPts: DataPt[]): DataPt[] {
    SynthesizerValidator.validateSubcircuitName(name, this.subcircuitNames)
    SynthesizerValidator.validateImplementedOpcode(name)
    return this.handleBinaryOp(name, inPts)
  }

  public adjustMemoryPts = (
    dataPts: DataPt[],
    memoryPts: MemoryPts,
    srcOffset: number,
    dstOffset: number,
    viewLength: number,
  ): void => {
    for (const [index, memoryPt] of memoryPts.entries()) {
      const containerOffset = memoryPt.memOffset
      const containerSize = memoryPt.containerSize
      const containerEndPos = containerOffset + containerSize
      const actualOffset = Math.max(srcOffset, containerOffset)
      const actualEndPos = Math.min(srcOffset + viewLength, containerEndPos)
      const actualContainerSize = actualEndPos - actualOffset
      const adjustedOffset = actualOffset - srcOffset + dstOffset
      memoryPt.memOffset = adjustedOffset
      memoryPt.containerSize = actualContainerSize

      const endingGap = containerEndPos - actualEndPos
      let outPts = [dataPts[index]]
      if (endingGap > 0) {
        // SHR data
        outPts = this.placeArith('SHR', [this.loadAuxin(BigInt(endingGap * 8)), dataPts[index]])
      }
      memoryPt.dataPt = outPts[0]
    }
  }

  /**
   * MLOAD는 고정적으로 32바이트를 읽지만, offset이 1바이트 단위이기 때문에 데이터 변형이 발생할 수 있습니다.
   * 데이터 변형을 추적하기 위해 데이터 변형 여부를 확인하는 함수를 구현합니다.
   * getDataAlias(offset, size) 함수는 Memory에서 offset 부터 offset + size -1 까지의 주소의 데이터의 출처를 추적합니다.
   * 결과물은 여러 데이터가 잘려지거나 concatenated 되는 방식으로 변형 되었을 가능성이 있습니다.
   * getDataAlias의 출력물의 타입은 다음과 같습니다.
   * type DataAliasInfos = {dataPt: DataPt, shift: number, masker: string}[]
   * 예를 들어, dataAliasInfos 의 배열 길이가 3일 경우, Memory의 해당 주소에서 가져온 변형 데이터는 3개의 원본 데이터가 조합된 결과물입니다.
   * 3개 원본 데이터의 출처는 각각 dataPt에 저장되어 있으며,
   * 3개의 원본 데이터를 각각 "shift"만큼 bit shift 한 뒤 (음의 값이라면 왼쪽으로, 양의 값이라면 오른쪽으로),
   * 그 결과를 각각 "masker"와 AND 해주고,
   *  결과를 모두 OR 해주면, 그 결과는 변형 데이터와 같습니다.
   **/

  /**
   * 데이터 출처와 변형 정보를 포함하는 배열을 받아서 데이터 포인트를 생성합니다.
   *
   * @param {DataAliasInfos} dataAliasInfos - 데이터 출처와 변형 정보를 포함하는 배열.
   * @returns {DataPt} 생성된 데이터 포인트.
   */
  private _resolveDataAlias(dataAliasInfos: DataAliasInfos): DataPt {
    const ADDTargets: { subcircuitID: number; wireID: number }[] = []
    // 먼저 각각을 shift 후 mask와 AND 해줌
    const initPlacementIndex = this.placementIndex
    for (const info of dataAliasInfos) {
      let prevPlacementIndex = this.placementIndex
      // this method may increases the placementIndex
      this._applyShiftAndMask(info)
      if (prevPlacementIndex !== this.placementIndex) {
        ADDTargets.push({ subcircuitID: this.placementIndex - 1, wireID: 0 })
      } else {
        ADDTargets.push({
          subcircuitID: Number(info.dataPt.source),
          wireID: info.dataPt.wireIndex!,
        })
      }
    }

    const nDataAlias = ADDTargets.length

    if (nDataAlias > 1) {
      this._addAndPlace(ADDTargets)
    }

    if (initPlacementIndex === this.placementIndex) {
      // there was no alias or shift
      return dataAliasInfos[0].dataPt
    }
    return this.placements.get(this.placementIndex - 1)!.outPts[0]
  }

  /**
   * @deprecated Auxin에는 한 번에 하나씩 원소가 추가되어야 하며, 하나가 추가 될 때 마다 LOAD 서브서킷에 등록하도록 변경됨
   * auxin 배열에 값을 추가합니다.
   *
   * @param {bigint} value - 추가할 값.
   */
  // private _addAuxin(value: bigint | bigint[]): void {
  //   if (Array.isArray(value)) {
  //     this.auxin.push(...value)
  //   } else {
  //     this.auxin.push(value)
  //   }
  // }

  private _applyShiftAndMask(info: DataAliasInfoEntry): DataPt {
    let shiftOutPt = info.dataPt
    shiftOutPt = this._applyShift(info)
    const modInfo: DataAliasInfoEntry = {
      dataPt: shiftOutPt,
      masker: info.masker,
      shift: info.shift,
    }
    let maskOutPt = modInfo.dataPt
    maskOutPt = this._applyMask(modInfo)
    return maskOutPt
  }

  /**
   * shift 연산을 적용합니다.
   *
   * @param {bigint} shift - 적용할 shift 값.
   * @param {DataPt} dataPt - 데이터 포인트.
   * @returns {bigint} shift 연산이 적용된 값.
   */
  private _applyShift(info: DataAliasInfoEntry): DataPt {
    const { shift, dataPt } = info
    let outPts = [dataPt]
    if (Math.abs(shift) > 0) {
      // shift 값과 shift 방향과의 관계는 MemoryPt에서 정의하였음
      const subcircuitName: ArithmeticOperator = shift > 0 ? 'SHL' : 'SHR'
      const absShift = Math.abs(shift)
      const inPts: DataPt[] = [this.loadAuxin(BigInt(absShift)), dataPt]
      outPts = this.placeArith(subcircuitName, inPts)
    }
    return outPts[0]
  }

  /**
   * mask 연산을 적용합니다.
   *
   * @param {string} masker - 적용할 mask 값.
   * @param {bigint} dataPt - 적용 대상의 포인터.
   */
  private _applyMask(info: DataAliasInfoEntry, unshift?: boolean): DataPt {
    let masker = info.masker
    const { shift, dataPt } = info
    if (unshift === true) {
      const maskerBigint = BigInt(masker)
      const unshiftMaskerBigint =
        shift > 0
          ? maskerBigint >> BigInt(Math.abs(shift))
          : maskerBigint << BigInt(Math.abs(shift))
      masker = '0x' + unshiftMaskerBigint.toString(16)
    }
    const maskOutValue = dataPt.value & BigInt(masker)
    let outPts = [dataPt]
    if (maskOutValue !== dataPt.value) {
      const inPts: DataPt[] = [this.loadAuxin(BigInt(masker)), dataPt]
      outPts = this.placeArith('AND', inPts)
    }
    return outPts[0]
  }

  /**
   * AND 결과물들을 모두 ADD 해줍니다.
   *
   * @param {{subcircuitID: number, wireID: number}[]} addTargets - OR 연산 대상 인덱스 배열.
   */
  private _addAndPlace(addTargets: { subcircuitID: number; wireID: number }[]): void {
    let inPts: DataPt[] = [
      this.placements.get(addTargets[0].subcircuitID)!.outPts[addTargets[0].wireID],
      this.placements.get(addTargets[1].subcircuitID)!.outPts[addTargets[1].wireID],
    ]
    this.placeArith('ADD', inPts)

    for (let i = 2; i < addTargets.length; i++) {
      inPts = [
        this.placements.get(this.placementIndex - 1)!.outPts[0],
        this.placements.get(addTargets[i].subcircuitID)!.outPts[addTargets[i].wireID],
      ]
      this.placeArith('ADD', inPts)
    }
  }

  private _place(name: string, inPts: DataPt[], outPts: DataPt[]) {
    if (!this.subcircuitNames.includes(name)) {
      throw new Error(`Subcircuit name ${name} is not defined`)
    }
    for (const inPt of inPts) {
      if (typeof inPt.source !== 'number') {
        throw new Error(
          `Synthesizer: Placing a subcircuit: Input wires to a new placement must be connected to the output wires of other placements.`,
        )
      }
    }
    addPlacement(this.placements, {
      name,
      inPts,
      outPts,
    })
    this.placementIndex++
  }
}
