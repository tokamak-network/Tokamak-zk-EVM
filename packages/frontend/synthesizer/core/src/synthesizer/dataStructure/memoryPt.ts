import { bigIntToBytes, setLengthLeft } from '@ethereumjs/util'
import type { DataAliasGeometries, DataAliasGeometryEntry, DataPt, MemoryPtEntry, MemoryPts } from '../types/index.ts'

export class MemoryPt {
  private _storePt: MemoryEntriesByTimestamp
  private _timeStamp: number
  private _byteLength: number

  constructor() {
    this._storePt = new Map()
    this._timeStamp = 0
    this._byteLength = 0
  }

  private _observeMemoryRange(offset: number, byteSize: number): void {
    if (byteSize === 0) {
      return
    }
    const endOffsetExclusive = offset + byteSize
    if (endOffsetExclusive > this._byteLength) {
      this._byteLength = endOffsetExclusive
    }
  }

  static simulateMemoryPt (memoryPts: MemoryPts): MemoryPt {
    const simMemPt = new MemoryPt()
    for (let k = 0; k < memoryPts.length; k++) {
      // the lower index, the older data
      simMemPt.write(memoryPts[k].memByteOffset, memoryPts[k].containerByteSize, memoryPts[k].dataPt)
    }
    return simMemPt
  }
  /**
   * Cleans up memory pointers when new data is written.
   * If the newly written data completely overlaps existing data,
   * delete the existing key-value pair.
   */
  private _memPtCleanUp(newOffset: number, newSize: number) {
    for (const [key, { memByteOffset: _offset, containerByteSize: _size }] of this._storePt) {
      // Condition where new data completely overlaps existing data
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
  write(offset: number, byteSize: number, dataPt: DataPt): Uint8Array {
    if (byteSize === 0) {
      return this.viewMemory(offset, byteSize)
    }

    this._observeMemoryRange(offset, byteSize)

    this._memPtCleanUp(offset, byteSize)
    this._storePt.set(this._timeStamp++, {
      memByteOffset: offset,
      containerByteSize: byteSize,
      dataPt,
    })
    return this.viewMemory(offset, byteSize)
  }

  writeBatch(memoryPts: MemoryPts): Uint8Array {
    let minOffset: number | undefined
    let maxEndOffsetExclusive: number | undefined
    for (const entry of memoryPts) {
      // the lower index, the older data
      this.write(
        entry.memByteOffset,
        entry.containerByteSize,
        entry.dataPt,
      )
      if (entry.containerByteSize === 0) {
        continue
      }

      const entryStartOffset = entry.memByteOffset
      const entryEndOffsetExclusive = entry.memByteOffset + entry.containerByteSize
      minOffset = minOffset === undefined ? entryStartOffset : Math.min(minOffset, entryStartOffset)
      maxEndOffsetExclusive =
        maxEndOffsetExclusive === undefined
          ? entryEndOffsetExclusive
          : Math.max(maxEndOffsetExclusive, entryEndOffsetExclusive)
    }
    if (minOffset === undefined || maxEndOffsetExclusive === undefined) {
      return new Uint8Array(0)
    }
    return this.viewMemory(minOffset, maxEndOffsetExclusive - minOffset)
  }

  /**
   * Returns values of _storePt elements (excluding keys) that affect a specific memory range. Used when moving data from Memory to Memory.
   * @param offset - Starting memory position to read
   * @param length - Number of bytes to read
   * @returns {returnMemroyPts}
   */
  read(offset: number, length: number): MemoryPts {
    this._observeMemoryRange(offset, length)
    const dataFragments = this._viewMemoryConflict(offset, length)
    const returnMemoryPts: MemoryPts = []
    if (dataFragments.size > 0) {
      const sortedKeys = Array.from(dataFragments.keys()).sort((a, b) => a - b)
      sortedKeys.forEach((key) => {
        const target = this._storePt.get(key)!
        const copy: MemoryPtEntry = {
          memByteOffset: target.memByteOffset,
          containerByteSize: target.containerByteSize,
          dataPt: target.dataPt,
        }
        returnMemoryPts.push(copy)
      })
    }
    return returnMemoryPts
  }

  /**
   * Returns fully derived alias geometry for a specific memory range.
   * The context layer materializes the returned geometry into composition operands.
   * @param offset - Starting memory position to read
   * @param size - Number of bytes to read
   * @returns Byte geometry used to materialize MemoryViewStep inputs.
   */
  getDataAlias(offset: number, size: number): DataAliasGeometries {
    this._observeMemoryRange(offset, size)
    const dataAliasInfos: DataAliasGeometryEntry[] = []
    const dataFragments = this._viewMemoryConflict(offset, size)

    const sortedTimeStamps = Array.from(dataFragments.keys()).sort((a, b) => a - b)
    for (const timeStamp of sortedTimeStamps) {
      const _value = dataFragments.get(timeStamp)!
      const dataEndOffset =
        this._storePt.get(timeStamp)!.memByteOffset + this._storePt.get(timeStamp)!.containerByteSize - 1
      const viewEndOffset = offset + size - 1
      const dataPt = this._storePt.get(timeStamp)!.dataPt
      const shift = (viewEndOffset - dataEndOffset) * 8
      if (!Number.isInteger(shift) || shift % 8 !== 0 || Math.abs(shift) > 31 * 8) {
        throw new Error('MemoryPt: memory-view shift must be a byte-aligned value from -248 to 248.')
      }
      const masker = this._generateMasker(offset, size, _value.validRange)
      const ownershipMask = this._createOwnershipMask(masker)
      dataAliasInfos.push({
        dataPt,
        shiftMagnitude: Math.abs(shift) / 8,
        direction: shift < 0 ? 1 : 0,
        ownershipMask,
      })
    }
    return dataAliasInfos
  }

  viewMemory(offset: number, length: number): Uint8Array {
    const memoryPts = this.read(offset, length)
    const view = new Uint8Array(length)
    for (const memoryPtEntry of memoryPts) {
      const containerOffset = memoryPtEntry.memByteOffset
      const containerSize = memoryPtEntry.containerByteSize
      const buf = setLengthLeft(
        bigIntToBytes(memoryPtEntry.dataPt.value),
        containerSize,
        { allowTruncate: true },
      )
      const startOffset = Math.max(offset, containerOffset)
      const endOffset = Math.min(offset + length, containerOffset + containerSize)
      if (startOffset < endOffset) {
        view.set(
          buf.subarray(startOffset - containerOffset, endOffset - containerOffset),
          startOffset - offset,
        )
      }
    }
    return view
  }

  /**
   * Finds conflicting data fragments in the memory region.
   * @param offset - Starting memory position to read
   * @param size - Number of bytes to read
   * @returns {DataFragments}
   */
  private _viewMemoryConflict(offset: number, size: number): MemoryRangeFragments {
    const dataFragments: MemoryRangeFragments = new Map()
    const endOffset = offset + size - 1
    if (!(endOffset >= offset)) {
      return dataFragments
    }

    const sortedTimeStamps = Array.from(this._storePt.keys()).sort((a, b) => a - b)

    let i = 0
    for (const timeStamp of sortedTimeStamps) {
      const containerOffset = this._storePt.get(timeStamp)!.memByteOffset
      const containerEndOffset = containerOffset + this._storePt.get(timeStamp)!.containerByteSize - 1
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

  private _generateMasker(offset: number, size: number, validRange: Set<number>): string {
    const targetRange = createRangeSet(offset, offset + size - 1)
    for (const element of validRange) {
      if (!targetRange.has(element)) {
        throw new Error('MemoryPt: target data range is not a subset of the view range.')
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

  private _createOwnershipMask(masker: string): bigint {
    if (!masker.startsWith('0x') || (masker.length - 2) % 2 !== 0) {
      throw new Error('MemoryPt: memory ownership mask must contain whole bytes.')
    }
    let ownershipMask = 0n
    const byteLength = (masker.length - 2) / 2
    for (let byteIndex = 0; byteIndex < byteLength; byteIndex++) {
      const byte = masker.slice(2 + byteIndex * 2, 4 + byteIndex * 2)
      if (byte === 'FF') {
        ownershipMask |= 1n << BigInt(byteLength - byteIndex - 1)
      } else if (byte !== '00') {
        throw new Error('MemoryPt: memory ownership mask must contain only FF or 00 bytes.')
      }
    }
    return ownershipMask
  }

}

/**
 * Map of memory information.
 */
type MemoryEntriesByTimestamp = Map<number, MemoryPtEntry>

/**
 * Map representing data fragment information.
 * @property {number} key - Timestamp when data was stored in memory
 * @property {Set<number>} originalRange - Original data range
 * @property {Set<number>} validRange - Valid data range
 */
type MemoryRangeFragments = Map<number, { originalRange: Set<number>; validRange: Set<number> }>


/**
 * Creates a set of consecutive numbers from a to b.
 * Commonly used for:
 * - Representing memory address ranges occupied by specific data (e.g., data from offset 2 to 5)
 * - Tracking valid memory ranges (e.g., valid memory regions before and after overwriting)
 * @param a - Start number
 * @param b - End number
 * @returns Set containing consecutive numbers from a to b
 */
const createRangeSet = (a: number, b: number): Set<number> => {
  // the resulting increasing set from 'a' to 'b'
  return new Set(Array.from({ length: b - a + 1 }, (_, i) => a + i))
}

/**
 * A minus B
 * @param A - First set
 * @param B - Second set
 * @returns A minus B
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
