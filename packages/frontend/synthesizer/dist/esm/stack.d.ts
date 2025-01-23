/**
 * Implementation of the stack used in evm.
 */
export declare class Stack {
    private _store;
    private _maxHeight;
    private _len;
    constructor(maxHeight?: number);
    get length(): number;
    push(value: bigint): void;
    pop(): bigint;
    /**
     * Pop multiple items from stack. Top of stack is first item
     * in returned array.
     * @param num - Number of items to pop
     */
    popN(num?: number): bigint[];
    /**
     * Return items from the stack
     * @param num Number of items to return
     * @throws {@link ERROR.STACK_UNDERFLOW}
     */
    peek(num?: number): bigint[];
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
    getStack(): bigint[];
}
//# sourceMappingURL=stack.d.ts.map