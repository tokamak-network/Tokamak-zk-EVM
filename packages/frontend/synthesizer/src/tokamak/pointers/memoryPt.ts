import {
  BIGINT_0,
  bigIntToBytes,
  // bytesToHex,
  setLengthLeft,
  // setLengthRight,
} from '@ethereumjs/util'

import { Memory } from '../../memory.js'

import type { RunState } from '../../interpreter.js'
import type { DataPt } from '../types/index.js'

/**
 * Memory vs MemoryPt 클래스의 주요 차이점
 *
 * 1. 데이터 구조
 *    - Memory: Uint8Array (연속된 바이트 배열)
 *    - MemoryPt: Map<number, { memOffset, containerSize, dataPt }> (메모리 포인터 맵)
 *
 * 2. 저장 방식
 *    - Memory: 실제 바이트 값을 연속된 메모리에 직접 저장
 *    - MemoryPt: 데이터의 위치와 크기 정보를 포인터로 관리
 *
 * 3. 읽기/쓰기 동작
 *    - Memory: 실제 메모리에 직접 읽기/쓰기
 *    - MemoryPt:
 *      - 쓰기: 새로운 데이터 포인터 생성 및 오버랩되는 영역 관리
 *      - 읽기: getDataAlias를 통해 데이터 별칭 정보 반환
 *
 * 4. 용도
 *    - Memory: 실제 EVM 실행 시 메모리 조작
 *    - MemoryPt: 심볼릭 실행을 위한 메모리 추적 및 분석
 *
 * 5. 특징
 *    - Memory: 연속된 메모리 공간, 단순한 바이트 조작
 *    - MemoryPt:
 *      - 타임스탬프 기반 데이터 관리
 *      - 메모리 영역 충돌 감지
 *      - 데이터 별칭 정보 생성
 */

/**
 * 데이터 별칭 정보를 나타내는 구조체입니다.
 * @property {DataPt} dataPt - 원본 데이터 포인터
 * @property {number} shift - 비트 이동 수 (양수는 SHL, 음수는 SHR)
 * @property {string} masker - 유효한 바이트를 나타내는 16진수 문자열 (FF) 또는 유효하지 않은 바이트를 나타내는 00
 */
export type DataAliasInfoEntry = { dataPt: DataPt; shift: number; masker: string }
export type DataAliasInfos = DataAliasInfoEntry[]

/**
 * 메모리 정보를 나타내는 구조체입니다.
 * @property {number} memOffset - 메모리 오프셋
 * @property {number} containerSize - 컨테이너 크기
 * @property {DataPt} dataPt - 데이터 포인터
 */
export type MemoryPtEntry = { memOffset: number; containerSize: number; dataPt: DataPt }

/**
 * 메모리 정보의 배열입니다. 인덱스가 낮을수록 오래된 메모리 정보입니다.
 */
export type MemoryPts = MemoryPtEntry[]

/**
 * 메모리 정보의 맵입니다.
 */
type TMemoryPt = Map<number, MemoryPtEntry>

/**
 * 데이터 조각 정보를 나타내는 맵입니다.
 * @property { number } key - 데이터가 메모리에 저장된 타임스탬프
 * @property {Set<number>} originalRange - 원본 데이터 범위
 * @property {Set<number>} validRange - 유효한 데이터 범위
 */
type _DataFragments = Map<number, { originalRange: Set<number>; validRange: Set<number> }>

/**
 * a부터 b까지의 연속된 숫자 집합을 생성합니다.
 * 주로 다음과 같은 용도로 사용됩니다:
 * - 특정 데이터가 차지하는 메모리 주소 범위를 나타낼 때 (예: 오프셋 2부터 5까지의 데이터)
 * - 유효한 메모리 범위를 추적할 때 (예: 덮어쓰기 전후의 유효한 메모리 영역)
 * @param a - 시작 숫자
 * @param b - 끝 숫자
 * @returns a부터 b까지의 연속된 숫자들을 포함하는 Set
 */
const createRangeSet = (a: number, b: number): Set<number> => {
  // the resulting increasing set from 'a' to 'b'
  return new Set(Array.from({ length: b - a + 1 }, (_, i) => a + i))
}

/**
 * A에서 B를 뺀 집합을 반환합니다.
 * @param A - 첫 번째 집합
 * @param B - 두 번째 집합
 * @returns A에서 B를 뺀 집합
 */
const setMinus = (A: Set<number>, B: Set<number>): Set<number> => {
  const result = new Set<number>()
  for (const element of A) {
    if (!B.has(element)) {
      result.add(element)
    }
  }
  return result
}

export const simulateMemoryPt = (memoryPts: MemoryPts): MemoryPt => {
  const simMemPt = new MemoryPt()
  for (let k = 0; k < memoryPts.length; k++) {
    // the lower index, the older data
    simMemPt.write(memoryPts[k].memOffset, memoryPts[k].containerSize, memoryPts[k].dataPt)
  }
  return simMemPt
}

export const copyMemoryRegion = (
  runState: RunState,
  srcOffset: bigint,
  length: bigint,
  fromMemoryPts?: MemoryPts,
  dstOffset?: bigint,
): MemoryPts => {
  const srcOffsetNum = Number(srcOffset)
  const dstOffsetNum = Number(dstOffset ?? 0)
  const lengthNum = Number(length)
  let toMemoryPts: MemoryPts
  if (fromMemoryPts === undefined) {
    toMemoryPts = runState.memoryPt.read(srcOffsetNum, lengthNum)
  } else {
    const simFromMemoryPt = simulateMemoryPt(fromMemoryPts)
    toMemoryPts = simFromMemoryPt.read(srcOffsetNum, lengthNum)
  }
  const zeroMemoryPtEntry: MemoryPtEntry = {
    memOffset: dstOffsetNum,
    containerSize: lengthNum,
    dataPt: runState.synthesizer.loadAuxin(BIGINT_0),
  }
  if (toMemoryPts.length > 0) {
    const simToMemoryPt = simulateMemoryPt(toMemoryPts)
    const dataAliasInfos = simToMemoryPt.getDataAlias(srcOffsetNum, lengthNum)
    if (dataAliasInfos.length > 0) {
      const resolvedDataPts = runState.synthesizer.placeMemoryToMemory(dataAliasInfos)
      runState.synthesizer.adjustMemoryPts(
        resolvedDataPts,
        toMemoryPts,
        srcOffsetNum,
        dstOffsetNum,
        lengthNum,
      )
    } else {
      toMemoryPts.push(zeroMemoryPtEntry)
    }
  } else {
    toMemoryPts.push(zeroMemoryPtEntry)
  }

  return toMemoryPts
}

/*eslint-disable */
const CONTAINER_SIZE = 8192

/**
 * Memory implements a simple memory model
 * for the ethereum virtual machine.
 */
export class MemoryPt {
  _storePt: TMemoryPt
  private _timeStamp: number

  constructor() {
    this._storePt = new Map()
    this._timeStamp = 0
  }

  /**
   * 만약 새롭게 쓰이는 데이터가 기존의 데이터를 완전히 오버랩 한다면,
   * 기존의 key-value 쌍을 삭제합니다.
   */
  private _memPtCleanUp(newOffset: number, newSize: number) {
    for (const [key, { memOffset: _offset, containerSize: _size }] of this._storePt) {
      //새 데이터가 기존 데이터를 완전히 오버랩 하는 조건
      const _endOffset = _offset + _size - 1
      const newEndOffset = newOffset + newSize - 1
      if (_endOffset <= newEndOffset && _offset >= newOffset) {
        this._storePt.delete(key)
      }
    }
  }

  /**
   * Writes a byte array with length `size` to memory, starting from `offset`.
   * @param offset - Starting memory position
   * @param containerSize - How many bytes to write
   * @param dataPt - Data pointer
   */
  write(offset: number, size: number, dataPt: DataPt) {
    if (size === 0) {
      return
    }

    // if setLengthLeft(bigIntToBytes(dataPt.value), 32).length !== size) throw new Error('Invalid value size')
    // if (offset + size > this._storePt.length) throw new Error('Value exceeds memory capacity')

    this._memPtCleanUp(offset, size)
    this._storePt.set(this._timeStamp++, {
      memOffset: offset,
      containerSize: size,
      dataPt,
    })
  }

  /**
   * 특정 메모리 범위에 영향을 주는 _storePt 요소들의 값을 반환합니다 (key 제외). Memory -> Memory으로의 데이터 이동시 사용됨.
   * @param offset - 읽기 시작할 메모리 위치
   * @param length - 읽을 바이트 수
   * @returns {returnMemroyPts}
   */
  read(offset: number, length: number, avoidCopy?: boolean): MemoryPts {
    const dataFragments = this._viewMemoryConflict(offset, length)
    const returnMemoryPts: MemoryPts = []
    if (dataFragments.size > 0) {
      const sortedKeys = Array.from(dataFragments.keys()).sort((a, b) => a - b)
      sortedKeys.forEach((key) => {
        if (avoidCopy === true) {
          returnMemoryPts.push(this._storePt.get(key)!)
        } else {
          const target = this._storePt.get(key)!
          const copy: MemoryPtEntry = {
            memOffset: target.memOffset,
            containerSize: target.containerSize,
            dataPt: target.dataPt,
          }
          returnMemoryPts.push(copy)
        }
      })
    }
    return returnMemoryPts
  }

  /**
     * read 는 MemoryPt조작에는 사용되지 않습니다. 대신 "getDataAlias"를 사용합니다.
     * Reads a slice of memory from `offset` till `offset + size` as a `Uint8Array`.
     * It fills up the difference between memory's length and `offset + size` with zeros.
     * @param offset - Starting memory position
     * @param size - How many bytes to read
     * @param avoidCopy - Avoid memory copy if possible for performance reasons (optional)
    
    read(offset: number, size: number): Uint8Array {
        const loaded = this._storePt.subarray(offset, offset + size)
        if (avoidCopy === true) {
        return loaded
        }
        const returnBytes = new Uint8Array(size)
        // Copy the stored "buffer" from memory into the return Uint8Array
        returnBytes.set(loaded)

        return returnBytes
    }
    */

  /**
   * 특정 메모리 범위에 대한 데이터 변형 정보를 반환합니다. Memory -> Stack으로의 데이터 이동시 사용됨
   * @param offset - 읽기 시작할 메모리 위치
   * @param size - 읽을 바이트 수
   * @returns {DataAliasInfos}
   */
  getDataAlias(offset: number, size: number): DataAliasInfos {
    // if (size > 32) {
    //   throw new Error(`The range of memory view exceeds 32 bytes. Try to chunk it in the Handlers.`)
    // }
    const dataAliasInfos: DataAliasInfos = []
    const dataFragments = this._viewMemoryConflict(offset, size)

    const sortedTimeStamps = Array.from(dataFragments.keys()).sort((a, b) => a - b)
    for (const timeStamp of sortedTimeStamps) {
      const _value = dataFragments.get(timeStamp)!
      const dataEndOffset =
        this._storePt.get(timeStamp)!.memOffset + this._storePt.get(timeStamp)!.containerSize - 1
      const viewEndOffset = offset + size - 1
      dataAliasInfos.push({
        dataPt: this._storePt.get(timeStamp)!.dataPt,
        // shift가 양의 값이면 SHL, 음의 값이면 SHR
        shift: (viewEndOffset - dataEndOffset) * 8,
        masker: this._generateMasker(offset, size, _value.validRange),
      })
    }
    return dataAliasInfos
  }

  viewMemory(offset: number, length: number): Uint8Array {
    const BIAS = 0x100000 // Any large number
    const memoryPts = this.read(offset, length)
    const simMem = new Memory()
    for (const memoryPtEntry of memoryPts) {
      const containerOffset = memoryPtEntry.memOffset
      const containerSize = memoryPtEntry.containerSize
      const buf = setLengthLeft(bigIntToBytes(memoryPtEntry.dataPt.value), containerSize)
      simMem.write(containerOffset + BIAS, containerSize, buf)

      // // Find the offset where nonzero value starts
      // const storedOffset = storedEndOffset - this._storePt.get(timeStamp)!.dataPt.sourceSize + 1
      // // If data is in the range
      // if (storedEndOffset >= offset && storedOffset <= endOffset) {
      //   const _offset = this._storePt.get(timeStamp)!.memOffset // This data offset can be negative.
      //   const _containerSize = this._storePt.get(timeStamp)!.containerSize
      //   const _actualSize = this._storePt.get(timeStamp)!.dataPt.sourceSize
      //   const value = this._storePt.get(timeStamp)!.dataPt.value
      //   let valuePadded = setLengthLeft(bigIntToBytes(value), _actualSize)
      //   if (_containerSize < _actualSize){
      //     valuePadded = valuePadded.slice(0, _containerSize)
      //   }
      //   console.log(bytesToHex(valuePadded))
      //   simMem.write(_offset + BIAS, Math.min(_containerSize, _actualSize), valuePadded)
      // }
    }

    return simMem.read(offset + BIAS, length)
  }

  /**
   * 메모리 영역에서 충돌 데이터 조각을 찾습니다.
   * @param offset - 읽기 시작할 메모리 위치
   * @param size - 읽을 바이트 수
   * @returns {DataFragments}
   */
  private _viewMemoryConflict(offset: number, size: number): _DataFragments {
    const dataFragments: _DataFragments = new Map()
    const endOffset = offset + size - 1
    const sortedTimeStamps = Array.from(this._storePt.keys()).sort((a, b) => a - b)

    let i = 0
    for (const timeStamp of sortedTimeStamps) {
      const containerOffset = this._storePt.get(timeStamp)!.memOffset
      const containerEndOffset = containerOffset + this._storePt.get(timeStamp)!.containerSize - 1
      // Find the offset where nonzero value starts
      const sortedTimeStamps_firsts = sortedTimeStamps.slice(0, i)
      // If data is in the range
      if (containerEndOffset >= offset && containerOffset <= endOffset) {
        const overlapStart = Math.max(offset, containerOffset)
        const overlapEnd = Math.min(endOffset, containerEndOffset)
        const thisDataOriginalRange = createRangeSet(containerOffset, containerEndOffset)
        const thisDataValidRange = createRangeSet(overlapStart, overlapEnd)

        dataFragments.set(timeStamp, {
          originalRange: thisDataOriginalRange,
          validRange: thisDataValidRange,
        })
        // Update previous data overlap ranges
        for (const _timeStamp of sortedTimeStamps_firsts) {
          if (dataFragments.has(_timeStamp)) {
            const overwrittenRange = setMinus(
              dataFragments.get(_timeStamp)!.validRange,
              dataFragments.get(timeStamp)!.validRange,
            )
            if (overwrittenRange.size <= 0) {
              dataFragments.delete(_timeStamp)
            } else {
              dataFragments.set(_timeStamp, {
                originalRange: dataFragments.get(_timeStamp)!.originalRange,
                validRange: overwrittenRange,
              })
            }
          }
        }
      }
      i++
    }
    return dataFragments
  }

  // private _viewMemoryConflict(offset: number, size: number): _DataFragments {
  //   const dataFragments: _DataFragments = new Map()
  //   const endOffset = offset + size - 1
  //   const sortedTimeStamps = Array.from(this._storePt.keys()).sort((a, b) => a - b)

  //   let i = 0
  //   for (const timeStamp of sortedTimeStamps) {
  //     const containerOffset = this._storePt.get(timeStamp)!.memOffset
  //     const storedEndOffset = containerOffset + this._storePt.get(timeStamp)!.containerSize - 1
  //     // Find the offset where nonzero value starts
  //     const storedOffset = storedEndOffset - this._storePt.get(timeStamp)!.dataPt.sourceSize + 1
  //     const sortedTimeStamps_firsts = sortedTimeStamps.slice(0, i)
  //     // If data is in the range
  //     if (storedEndOffset >= offset && storedOffset <= endOffset) {
  //       const overlapStart = Math.max(offset, storedOffset)
  //       const overlapEnd = Math.min(endOffset, storedEndOffset)
  //       const thisDataOriginalRange = createRangeSet(storedOffset, storedEndOffset)
  //       const thisDataValidRange = createRangeSet(overlapStart, overlapEnd)

  //       dataFragments.set(timeStamp, {
  //         originalRange: thisDataOriginalRange,
  //         validRange: thisDataValidRange,
  //       })
  //       // Update previous data overlap ranges
  //       for (const _timeStamp of sortedTimeStamps_firsts) {
  //         if (dataFragments.has(_timeStamp)) {
  //           const overwrittenRange = setMinus(
  //             dataFragments.get(_timeStamp)!.validRange,
  //             dataFragments.get(timeStamp)!.validRange,
  //           )
  //           if (overwrittenRange.size <= 0) {
  //             dataFragments.delete(_timeStamp)
  //           } else {
  //             dataFragments.set(_timeStamp, {
  //               originalRange: dataFragments.get(_timeStamp)!.originalRange,
  //               validRange: overwrittenRange,
  //             })
  //           }
  //         }
  //       }
  //     }
  //     i++
  //   }
  //   return dataFragments
  // }

  private _generateMasker(offset: number, size: number, validRange: Set<number>): string {
    const targetRange = createRangeSet(offset, offset + size - 1)
    for (const element of validRange) {
      if (!targetRange.has(element)) {
        throw new Error('Error: arg2 is not a subset of arg1')
      }
    }

    let maskerString = '0x'
    for (const element of targetRange) {
      if (validRange.has(element)) {
        maskerString += 'FF'
      } else {
        maskerString += '00'
      }
    }

    return maskerString
  }
}
