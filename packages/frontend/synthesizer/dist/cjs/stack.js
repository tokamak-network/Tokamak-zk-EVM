"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Stack = void 0;
const exceptions_js_1 = require("./exceptions.js");
/**
 * Implementation of the stack used in evm.
 */
class Stack {
    constructor(maxHeight) {
        this._len = 0;
        // It is possible to initialize the array with `maxHeight` items. However,
        // this makes the constructor 10x slower and there do not seem to be any observable performance gains
        this._store = [];
        this._maxHeight = maxHeight ?? 1024;
    }
    get length() {
        return this._len;
    }
    push(value) {
        if (this._len >= this._maxHeight) {
            throw new exceptions_js_1.EvmError(exceptions_js_1.ERROR.STACK_OVERFLOW);
        }
        // Read current length, set `_store` to value, and then increase the length
        this._store[this._len++] = value;
    }
    pop() {
        if (this._len < 1) {
            throw new exceptions_js_1.EvmError(exceptions_js_1.ERROR.STACK_UNDERFLOW);
        }
        // Length is checked above, so pop shouldn't return undefined
        // First decrease current length, then read the item and return it
        // Note: this does thus not delete the item from the internal array
        // However, the length is decreased, so it is not accessible to external observers
        return this._store[--this._len];
    }
    /**
     * Pop multiple items from stack. Top of stack is first item
     * in returned array.
     * @param num - Number of items to pop
     */
    popN(num = 1) {
        if (this._len < num) {
            throw new exceptions_js_1.EvmError(exceptions_js_1.ERROR.STACK_UNDERFLOW);
        }
        if (num === 0) {
            return [];
        }
        const arr = Array(num);
        const cache = this._store;
        for (let pop = 0; pop < num; pop++) {
            // Note: this thus also (correctly) reduces the length of the internal array (without deleting items)
            arr[pop] = cache[--this._len];
        }
        return arr;
    }
    /**
     * Return items from the stack
     * @param num Number of items to return
     * @throws {@link ERROR.STACK_UNDERFLOW}
     */
    peek(num = 1) {
        const peekArray = Array(num);
        let start = this._len;
        for (let peek = 0; peek < num; peek++) {
            const index = --start;
            if (index < 0) {
                throw new exceptions_js_1.EvmError(exceptions_js_1.ERROR.STACK_UNDERFLOW);
            }
            peekArray[peek] = this._store[index];
        }
        return peekArray;
    }
    /**
     * Swap top of stack with an item in the stack.
     * @param position - Index of item from top of the stack (0-indexed)
     */
    swap(position) {
        if (this._len <= position) {
            throw new exceptions_js_1.EvmError(exceptions_js_1.ERROR.STACK_UNDERFLOW);
        }
        const head = this._len - 1;
        const i = head - position;
        const storageCached = this._store;
        const tmp = storageCached[head];
        storageCached[head] = storageCached[i];
        storageCached[i] = tmp;
    }
    /**
     * Pushes a copy of an item in the stack.
     * @param position - Index of item to be copied (1-indexed)
     */
    // I would say that we do not need this method any more
    // since you can't copy a primitive data type
    // Nevertheless not sure if we "loose" something here?
    // Will keep commented out for now
    dup(position) {
        const len = this._len;
        if (len < position) {
            throw new exceptions_js_1.EvmError(exceptions_js_1.ERROR.STACK_UNDERFLOW);
        }
        // Note: this code is borrowed from `push()` (avoids a call)
        if (len >= this._maxHeight) {
            throw new exceptions_js_1.EvmError(exceptions_js_1.ERROR.STACK_OVERFLOW);
        }
        const i = len - position;
        this._store[this._len++] = this._store[i];
    }
    /**
     * Swap number 1 with number 2 on the stack
     * @param swap1
     * @param swap2
     */
    exchange(swap1, swap2) {
        const headIndex = this._len - 1;
        const exchangeIndex1 = headIndex - swap1;
        const exchangeIndex2 = headIndex - swap2;
        // Stack underflow is not possible in EOF
        if (exchangeIndex1 < 0 || exchangeIndex2 < 0) {
            throw new exceptions_js_1.EvmError(exceptions_js_1.ERROR.STACK_UNDERFLOW);
        }
        const cache = this._store[exchangeIndex2];
        this._store[exchangeIndex2] = this._store[exchangeIndex1];
        this._store[exchangeIndex1] = cache;
    }
    /**
     * Returns a copy of the current stack. This represents the actual state of the stack
     * (not the internal state of the stack, which might have unreachable elements in it)
     */
    getStack() {
        return this._store.slice(0, this._len);
    }
}
exports.Stack = Stack;
//# sourceMappingURL=stack.js.map