import { BIGINT_0, bigIntToBytes, 
// bytesToHex,
setLengthLeft,
// setLengthRight,
 } from "@ethereumjs/util/index.js";
import { Memory } from '../../memory.js';
/**
 * Creates a set of consecutive numbers from a to b.
 * Commonly used for:
 * - Representing memory address ranges occupied by specific data (e.g., data from offset 2 to 5)
 * - Tracking valid memory ranges (e.g., valid memory regions before and after overwriting)
 * @param a - Start number
 * @param b - End number
 * @returns Set containing consecutive numbers from a to b
 */
const createRangeSet = (a, b) => {
    // the resulting increasing set from 'a' to 'b'
    return new Set(Array.from({ length: b - a + 1 }, (_, i) => a + i));
};
/**
 * A minus B
 * @param A - First set
 * @param B - Second set
 * @returns A minus B
 */
const setMinus = (A, B) => {
    const result = new Set();
    for (const element of A) {
        if (!B.has(element)) {
            result.add(element);
        }
    }
    return result;
};
export const simulateMemoryPt = (memoryPts) => {
    const simMemPt = new MemoryPt();
    for (let k = 0; k < memoryPts.length; k++) {
        // the lower index, the older data
        simMemPt.write(memoryPts[k].memOffset, memoryPts[k].containerSize, memoryPts[k].dataPt);
    }
    return simMemPt;
};
export const copyMemoryRegion = (runState, srcOffset, length, fromMemoryPts, dstOffset) => {
    const srcOffsetNum = Number(srcOffset);
    const dstOffsetNum = Number(dstOffset ?? 0);
    const lengthNum = Number(length);
    let toMemoryPts;
    if (fromMemoryPts === undefined) {
        toMemoryPts = runState.memoryPt.read(srcOffsetNum, lengthNum);
    }
    else {
        const simFromMemoryPt = simulateMemoryPt(fromMemoryPts);
        toMemoryPts = simFromMemoryPt.read(srcOffsetNum, lengthNum);
    }
    const zeroMemoryPtEntry = {
        memOffset: dstOffsetNum,
        containerSize: lengthNum,
        dataPt: runState.synthesizer.loadAuxin(BIGINT_0),
    };
    if (toMemoryPts.length > 0) {
        const simToMemoryPt = simulateMemoryPt(toMemoryPts);
        const dataAliasInfos = simToMemoryPt.getDataAlias(srcOffsetNum, lengthNum);
        if (dataAliasInfos.length > 0) {
            const resolvedDataPts = runState.synthesizer.placeMemoryToMemory(dataAliasInfos);
            runState.synthesizer.adjustMemoryPts(resolvedDataPts, toMemoryPts, srcOffsetNum, dstOffsetNum, lengthNum);
        }
        else {
            toMemoryPts.push(zeroMemoryPtEntry);
        }
    }
    else {
        toMemoryPts.push(zeroMemoryPtEntry);
    }
    return toMemoryPts;
};
/*eslint-disable */
const CONTAINER_SIZE = 8192;
/**
 * Memory implements a simple memory model
 * for the ethereum virtual machine.
 */
export class MemoryPt {
    constructor() {
        this._storePt = new Map();
        this._timeStamp = 0;
    }
    /**
     * If the newly written data completely overlaps existing data,
     * delete the existing key-value pair.
     */
    _memPtCleanUp(newOffset, newSize) {
        for (const [key, { memOffset: _offset, containerSize: _size }] of this._storePt) {
            //새 데이터가 기존 데이터를 완전히 오버랩 하는 조건
            const _endOffset = _offset + _size - 1;
            const newEndOffset = newOffset + newSize - 1;
            if (_endOffset <= newEndOffset && _offset >= newOffset) {
                this._storePt.delete(key);
            }
        }
    }
    /**
     * Writes a byte array with length `size` to memory, starting from `offset`.
     * @param offset - Starting memory position
     * @param containerSize - How many bytes to write
     * @param dataPt - Data pointer
     */
    write(offset, size, dataPt) {
        if (size === 0) {
            return;
        }
        // if setLengthLeft(bigIntToBytes(dataPt.value), 32).length !== size) throw new Error('Invalid value size')
        // if (offset + size > this._storePt.length) throw new Error('Value exceeds memory capacity')
        this._memPtCleanUp(offset, size);
        this._storePt.set(this._timeStamp++, {
            memOffset: offset,
            containerSize: size,
            dataPt,
        });
    }
    /**
     * Returns values of _storePt elements (excluding keys) that affect a specific memory range. Used when moving data from Memory to Memory.
     * @param offset - Starting memory position to read
     * @param length - Number of bytes to read
     * @returns {returnMemroyPts}
     */
    read(offset, length, avoidCopy) {
        const dataFragments = this._viewMemoryConflict(offset, length);
        const returnMemoryPts = [];
        if (dataFragments.size > 0) {
            const sortedKeys = Array.from(dataFragments.keys()).sort((a, b) => a - b);
            sortedKeys.forEach((key) => {
                if (avoidCopy === true) {
                    returnMemoryPts.push(this._storePt.get(key));
                }
                else {
                    const target = this._storePt.get(key);
                    const copy = {
                        memOffset: target.memOffset,
                        containerSize: target.containerSize,
                        dataPt: target.dataPt,
                    };
                    returnMemoryPts.push(copy);
                }
            });
        }
        return returnMemoryPts;
    }
    /**
       * read is not used for MemoryPt manipulation. Instead, "getDataAlias" is used.
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
     * Returns data transformation information for a specific memory range. Used when moving data from Memory to Stack.
     * @param offset - Starting memory position to read
     * @param size - Number of bytes to read
     * @returns {DataAliasInfos}
     */
    getDataAlias(offset, size) {
        // if (size > 32) {
        //   throw new Error(`The range of memory view exceeds 32 bytes. Try to chunk it in the Handlers.`)
        // }
        const dataAliasInfos = [];
        const dataFragments = this._viewMemoryConflict(offset, size);
        const sortedTimeStamps = Array.from(dataFragments.keys()).sort((a, b) => a - b);
        for (const timeStamp of sortedTimeStamps) {
            const _value = dataFragments.get(timeStamp);
            const dataEndOffset = this._storePt.get(timeStamp).memOffset + this._storePt.get(timeStamp).containerSize - 1;
            const viewEndOffset = offset + size - 1;
            dataAliasInfos.push({
                dataPt: this._storePt.get(timeStamp).dataPt,
                // shift가 양의 값이면 SHL, 음의 값이면 SHR
                shift: (viewEndOffset - dataEndOffset) * 8,
                masker: this._generateMasker(offset, size, _value.validRange),
            });
        }
        return dataAliasInfos;
    }
    viewMemory(offset, length) {
        const BIAS = 0x100000; // Any large number
        const memoryPts = this.read(offset, length);
        const simMem = new Memory();
        for (const memoryPtEntry of memoryPts) {
            const containerOffset = memoryPtEntry.memOffset;
            const containerSize = memoryPtEntry.containerSize;
            const buf = setLengthLeft(bigIntToBytes(memoryPtEntry.dataPt.value), containerSize);
            simMem.write(containerOffset + BIAS, containerSize, buf);
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
        return simMem.read(offset + BIAS, length);
    }
    /**
     * Finds conflicting data fragments in the memory region.
     * @param offset - Starting memory position to read
     * @param size - Number of bytes to read
     * @returns {DataFragments}
     */
    _viewMemoryConflict(offset, size) {
        const dataFragments = new Map();
        const endOffset = offset + size - 1;
        const sortedTimeStamps = Array.from(this._storePt.keys()).sort((a, b) => a - b);
        let i = 0;
        for (const timeStamp of sortedTimeStamps) {
            const containerOffset = this._storePt.get(timeStamp).memOffset;
            const containerEndOffset = containerOffset + this._storePt.get(timeStamp).containerSize - 1;
            // Find the offset where nonzero value starts
            const sortedTimeStamps_firsts = sortedTimeStamps.slice(0, i);
            // If data is in the range
            if (containerEndOffset >= offset && containerOffset <= endOffset) {
                const overlapStart = Math.max(offset, containerOffset);
                const overlapEnd = Math.min(endOffset, containerEndOffset);
                const thisDataOriginalRange = createRangeSet(containerOffset, containerEndOffset);
                const thisDataValidRange = createRangeSet(overlapStart, overlapEnd);
                dataFragments.set(timeStamp, {
                    originalRange: thisDataOriginalRange,
                    validRange: thisDataValidRange,
                });
                // Update previous data overlap ranges
                for (const _timeStamp of sortedTimeStamps_firsts) {
                    if (dataFragments.has(_timeStamp)) {
                        const overwrittenRange = setMinus(dataFragments.get(_timeStamp).validRange, dataFragments.get(timeStamp).validRange);
                        if (overwrittenRange.size <= 0) {
                            dataFragments.delete(_timeStamp);
                        }
                        else {
                            dataFragments.set(_timeStamp, {
                                originalRange: dataFragments.get(_timeStamp).originalRange,
                                validRange: overwrittenRange,
                            });
                        }
                    }
                }
            }
            i++;
        }
        return dataFragments;
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
    _generateMasker(offset, size, validRange) {
        const targetRange = createRangeSet(offset, offset + size - 1);
        for (const element of validRange) {
            if (!targetRange.has(element)) {
                throw new Error('Error: arg2 is not a subset of arg1');
            }
        }
        let maskerString = '0x';
        for (const element of targetRange) {
            if (validRange.has(element)) {
                maskerString += 'FF';
            }
            else {
                maskerString += '00';
            }
        }
        return maskerString;
    }
}
//# sourceMappingURL=memoryPt.js.map