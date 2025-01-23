import type { RunState } from '../../interpreter.js';
import type { DataPt } from '../types/index.js';
/**
 * Key differences between Memory and MemoryPt classes
 *
 * 1. Data Structure
 *    - Memory: Uint8Array (continuous byte array)
 *    - MemoryPt: Map<number, { memOffset, containerSize, dataPt }> (memory pointer map)
 *
 * 2. Storage Method
 *    - Memory: Directly stores actual byte values in continuous memory
 *    - MemoryPt: Manages data location and size information through pointers
 *
 * 3. Read/Write Operations
 *    - Memory: Direct read/write to actual memory
 *    - MemoryPt:
 *      - Write: Creates new data pointers and manages overlapping regions
 *      - Read: Returns data alias information through getDataAlias
 *
 * 4. Purpose
 *    - Memory: Memory manipulation during actual EVM execution
 *    - MemoryPt: Memory tracking and analysis for symbolic execution
 *
 * 5. Characteristics
 *    - Memory: Continuous memory space, simple byte manipulation
 *    - MemoryPt:
 *      - Timestamp-based data management
 *      - Memory region conflict detection
 *      - Data alias information generation
 */
/**
 * Structure representing data alias information.
 * @property {DataPt} dataPt - Original data pointer
 * @property {number} shift - Number of bit shifts (positive for SHL, negative for SHR)
 * @property {string} masker - Hexadecimal string representing valid bytes (FF) or invalid bytes (00)
 */
export type DataAliasInfoEntry = {
    dataPt: DataPt;
    shift: number;
    masker: string;
};
export type DataAliasInfos = DataAliasInfoEntry[];
/**
 * Structure representing memory information.
 * @property {number} memOffset - Memory offset
 * @property {number} containerSize - Container size
 * @property {DataPt} dataPt - Data pointer
 */
export type MemoryPtEntry = {
    memOffset: number;
    containerSize: number;
    dataPt: DataPt;
};
/**
 * Array of memory information. Lower indices represent older memory information.
 */
export type MemoryPts = MemoryPtEntry[];
/**
 * Map of memory information.
 */
type TMemoryPt = Map<number, MemoryPtEntry>;
export declare const simulateMemoryPt: (memoryPts: MemoryPts) => MemoryPt;
export declare const copyMemoryRegion: (runState: RunState, srcOffset: bigint, length: bigint, fromMemoryPts?: MemoryPts, dstOffset?: bigint) => MemoryPts;
/**
 * Memory implements a simple memory model
 * for the ethereum virtual machine.
 */
export declare class MemoryPt {
    _storePt: TMemoryPt;
    private _timeStamp;
    constructor();
    /**
     * If the newly written data completely overlaps existing data,
     * delete the existing key-value pair.
     */
    private _memPtCleanUp;
    /**
     * Writes a byte array with length `size` to memory, starting from `offset`.
     * @param offset - Starting memory position
     * @param containerSize - How many bytes to write
     * @param dataPt - Data pointer
     */
    write(offset: number, size: number, dataPt: DataPt): void;
    /**
     * Returns values of _storePt elements (excluding keys) that affect a specific memory range. Used when moving data from Memory to Memory.
     * @param offset - Starting memory position to read
     * @param length - Number of bytes to read
     * @returns {returnMemroyPts}
     */
    read(offset: number, length: number, avoidCopy?: boolean): MemoryPts;
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
    getDataAlias(offset: number, size: number): DataAliasInfos;
    viewMemory(offset: number, length: number): Uint8Array;
    /**
     * Finds conflicting data fragments in the memory region.
     * @param offset - Starting memory position to read
     * @param size - Number of bytes to read
     * @returns {DataFragments}
     */
    private _viewMemoryConflict;
    private _generateMasker;
}
export {};
//# sourceMappingURL=memoryPt.d.ts.map