import type { DataPt } from '../types/index.js';
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
export type TStackPt = DataPt[];
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
export declare class StackPt {
    private _storePt;
    private _maxHeight;
    private _len;
    constructor(maxHeight?: number);
    get length(): number;
    push(pt: DataPt): void;
    pop(): DataPt;
    /**
     * Pop multiple items from stack. Top of stack is first item
     * in returned array.
     * @param num - Number of items to pop
     */
    popN(num?: number): DataPt[];
    /**
     * Return items from the stack
     * @param num Number of items to return
     * @throws {@link ERROR.STACK_UNDERFLOW}
     */
    peek(num?: number): DataPt[];
    /**
     * Swap top of stack with an item in the stack.
     * @param position - Index of item from top of the stack (0-indexed)
     */
    swap(position: number): void;
    /**
     * Pushes a copy of an item in the stack.
     * @param position - Index of item to be copied (1-indexed)
     */
    dup(position: number): void;
    /**
     * Swap number 1 with number 2 on the stack
     * @param swap1
     * @param swap2
     */
    exchange(swap1: number, swap2: number): void;
    /**
     * Returns a copy of the current stack. This represents the actual state of the stack
     * (not the internal state of the stack, which might have unreachable elements in it)
     */
    getStack(): DataPt[];
}
//# sourceMappingURL=stackPt.d.ts.map