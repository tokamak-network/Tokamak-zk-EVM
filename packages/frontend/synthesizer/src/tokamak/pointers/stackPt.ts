import { ERROR, EvmError } from '../../exceptions.js'

import type { DataPt } from '../types/index.js'

/**
 * Key differences between Stack and StackPt classes
 *
 * 1. Data Type
 *    - Stack: bigint[] (stores actual values)
 *    - StackPt: DataPt[] (stores data pointers)
 *
 * 2. Purpose
 *    - Stack: Used in actual EVM execution
 *    - StackPt: Used for symbolic execution
 *
 * 3. Operation Handling
 *    - Stack: Performs operations on actual values (e.g., actual addition)
 *    - StackPt: Manages pointers for data flow tracking
 *
 * 4. Usage
 *    - Stack: Actual transaction processing, contract execution
 *    - StackPt: Program analysis, optimization, bug detection
 *
 * Both classes provide the same interface (push, pop, swap, etc.),
 * but operate internally for different purposes.
 */

export type TStackPt = DataPt[]

/**
 * Stack implementation for EVM symbolic execution
 *
 * Key Features:
 * 1. Purpose
 *    - Stack used in EVM symbolic execution
 *    - Manages DataPt type data pointers
 *
 * 2. Memory Management
 *    - Once allocated, array size never decreases
 *    - During pop operations, _len is decreased instead of actually deleting items
 *    - This is an optimization strategy to reduce memory reallocation costs
 *
 * 3. Key Constraints
 *    - Maximum stack height (_maxHeight) limit
 *    - Stack overflow/underflow checks
 *
 * 4. Main Operations
 *    - push: Add new data pointer
 *    - pop: Remove top data pointer
 *    - peek: View stack contents
 *    - swap: Exchange positions of stack items
 *    - dup: Duplicate stack items
 *
 * This class provides the same interface as the actual EVM stack,
 * but is characterized by handling data pointers (DataPt) instead of actual values (bigint).
 */
export class StackPt {
  // This array is initialized as an empty array. Once values are pushed, the array size will never decrease.
  // Internal array storing actual data. Size doesn't decrease after push 
  private _storePt: TStackPt
  // Maximum allowed stack height (default: 1024)
  private _maxHeight: number
  // Actual number of items currently in use in the stack
  private _len: number = 0

  constructor(maxHeight?: number) {
    // It is possible to initialize the array with `maxHeight` items. However,
    // this makes the constructor 10x slower and there do not seem to be any observable performance gains
    this._storePt = []
    this._maxHeight = maxHeight ?? 1024
  }

  get length() {
    return this._len
  }

  push(pt: DataPt) {
    if (this._len >= this._maxHeight) {
      throw new EvmError(ERROR.STACK_OVERFLOW)
    }
    if (typeof pt.source !== 'number') {
      throw new Error(
        `Synthesizer: Push to StackPt: Every item on the StackPt must indicate an output wire of a subcirciut placement.`,
      )
    }

    // Read current length, set `_storePt` to value, and then increase the length
    this._storePt[this._len++] = pt
  }

  pop(): DataPt {
    if (this._len < 1) {
      throw new EvmError(ERROR.STACK_UNDERFLOW)
    }

    // Length is checked above, so pop shouldn't return undefined
    // First decrease current length, then read the item and return it
    // Note: this does thus not delete the item from the internal array
    // However, the length is decreased, so it is not accessible to external observers
    return this._storePt[--this._len]
  }

  /**
   * Pop multiple items from stack. Top of stack is first item
   * in returned array.
   * @param num - Number of items to pop
   */
  popN(num: number = 1): DataPt[] {
    if (this._len < num) {
      throw new EvmError(ERROR.STACK_UNDERFLOW)
    }

    if (num === 0) {
      return []
    }

    const arr = Array(num)
    const cache = this._storePt

    for (let pop = 0; pop < num; pop++) {
      // Note: this thus also (correctly) reduces the length of the internal array (without deleting items)
      arr[pop] = cache[--this._len]
    }

    return arr
  }

  /**
   * Return items from the stack
   * @param num Number of items to return
   * @throws {@link ERROR.STACK_UNDERFLOW}
   */
  peek(num: number = 1): DataPt[] {
    const peekArray: DataPt[] = Array(num)
    let start = this._len

    for (let peek = 0; peek < num; peek++) {
      const index = --start
      if (index < 0) {
        throw new EvmError(ERROR.STACK_UNDERFLOW)
      }
      peekArray[peek] = this._storePt[index]
    }
    return peekArray
  }

  /**
   * Swap top of stack with an item in the stack.
   * @param position - Index of item from top of the stack (0-indexed)
   */
  swap(position: number) {
    if (this._len <= position) {
      throw new EvmError(ERROR.STACK_UNDERFLOW)
    }

    const head = this._len - 1
    const i = head - position
    const storageCached = this._storePt

    const tmp = storageCached[head]
    storageCached[head] = storageCached[i]
    storageCached[i] = tmp
  }

  /**
   * Pushes a copy of an item in the stack.
   * @param position - Index of item to be copied (1-indexed)
   */
  // I would say that we do not need this method any more
  // since you can't copy a primitive data type
  // Nevertheless not sure if we "loose" something here?
  // Will keep commented out for now
  dup(position: number) {
    const len = this._len
    if (len < position) {
      throw new EvmError(ERROR.STACK_UNDERFLOW)
    }

    // Note: this code is borrowed from `push()` (avoids a call)
    if (len >= this._maxHeight) {
      throw new EvmError(ERROR.STACK_OVERFLOW)
    }

    const i = len - position
    this._storePt[this._len++] = this._storePt[i]
  }

  /**
   * Swap number 1 with number 2 on the stack
   * @param swap1
   * @param swap2
   */
  exchange(swap1: number, swap2: number) {
    const headIndex = this._len - 1
    const exchangeIndex1 = headIndex - swap1
    const exchangeIndex2 = headIndex - swap2

    // Stack underflow is not possible in EOF
    if (exchangeIndex1 < 0 || exchangeIndex2 < 0) {
      throw new EvmError(ERROR.STACK_UNDERFLOW)
    }

    const cache = this._storePt[exchangeIndex2]
    this._storePt[exchangeIndex2] = this._storePt[exchangeIndex1]
    this._storePt[exchangeIndex1] = cache
  }

  /**
   * Returns a copy of the current stack. This represents the actual state of the stack
   * (not the internal state of the stack, which might have unreachable elements in it)
   */
  getStack() {
    return this._storePt.slice(0, this._len)
  }
}
