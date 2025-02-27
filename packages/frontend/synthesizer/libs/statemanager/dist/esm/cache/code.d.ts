<<<<<<< HEAD
import { OrderedMap } from '@js-sdsl/ordered-map';
import { LRUCache } from 'lru-cache';
import { Cache } from './cache.js';
import type { CacheOpts } from './types.js';
import type { Address } from '@ethereumjs/util';
/**
 * Represents a cached code element.
 */
type CodeCacheElement = {
    code: Uint8Array | undefined;
};
export declare class CodeCache extends Cache {
    _lruCache: LRUCache<string, CodeCacheElement> | undefined;
    _orderedMapCache: OrderedMap<string, CodeCacheElement> | undefined;
    /**
     * Diff cache collecting the state of the cache
     * at the beginning of checkpoint height
     * (respectively: before a first modification)
     *
     * If the whole cache element is undefined (in contrast
     * to the code), the element didn't exist in the cache
     * before.
     */
    _diffCache: Map<string, CodeCacheElement | undefined>[];
    constructor(opts: CacheOpts);
    /**
     * Saves the state of the code cache before making changes to it.
     *
     * @param cacheKeyHex Account key for which code is being modified.
     */
    _saveCachePreState(cacheKeyHex: string): void;
    /**
     * Puts code into the cache under its hash.
     *
     * @param address - Address of account code is being modified for.
     * @param code - Bytecode or undefined if code doesn't exist.
     */
    put(address: Address, code: Uint8Array | undefined): void;
    /**
     * Returns the queried code or undefined if it doesn't exist.
     *
     * @param address - Account address for which code is being fetched.
     */
    get(address: Address): CodeCacheElement | undefined;
    /**
     * Marks code as deleted in the cache.
     *
     * @param address - Account address for which code is being fetched.
     */
    del(address: Address): void;
    /**
     * Flushes the cache by returning codes that have been modified
     * or deleted and resetting the diff cache (at checkpoint height).
     */
    flush(): [string, CodeCacheElement][];
    /**
     * Revert changes to the cache to the last checkpoint (no effect on trie).
     */
    revert(): void;
    /**
     * Commits the current state of the cache (no effect on trie).
     */
    commit(): void;
    /**
     * Marks the current state of the cache as a checkpoint, which can
     * later be reverted or committed.
     */
    checkpoint(): void;
    /**
     * Returns the size of the cache
     * @returns
     */
    size(): number;
    /**
     * Returns a dictionary with cache statistics.
     *
     * @param reset - Whether to reset statistics after retrieval.
     * @returns A dictionary with cache statistics.
     */
    stats(reset?: boolean): any;
    /**
     * Clears the cache.
     */
    clear(): void;
}
export {};
=======
import { OrderedMap } from '@js-sdsl/ordered-map';
import { LRUCache } from 'lru-cache';
import { Cache } from './cache.js';
import type { CacheOpts } from './types.js';
import type { Address } from '@synthesizer-libs/util';
/**
 * Represents a cached code element.
 */
type CodeCacheElement = {
    code: Uint8Array | undefined;
};
export declare class CodeCache extends Cache {
    _lruCache: LRUCache<string, CodeCacheElement> | undefined;
    _orderedMapCache: OrderedMap<string, CodeCacheElement> | undefined;
    /**
     * Diff cache collecting the state of the cache
     * at the beginning of checkpoint height
     * (respectively: before a first modification)
     *
     * If the whole cache element is undefined (in contrast
     * to the code), the element didn't exist in the cache
     * before.
     */
    _diffCache: Map<string, CodeCacheElement | undefined>[];
    constructor(opts: CacheOpts);
    /**
     * Saves the state of the code cache before making changes to it.
     *
     * @param cacheKeyHex Account key for which code is being modified.
     */
    _saveCachePreState(cacheKeyHex: string): void;
    /**
     * Puts code into the cache under its hash.
     *
     * @param address - Address of account code is being modified for.
     * @param code - Bytecode or undefined if code doesn't exist.
     */
    put(address: Address, code: Uint8Array | undefined): void;
    /**
     * Returns the queried code or undefined if it doesn't exist.
     *
     * @param address - Account address for which code is being fetched.
     */
    get(address: Address): CodeCacheElement | undefined;
    /**
     * Marks code as deleted in the cache.
     *
     * @param address - Account address for which code is being fetched.
     */
    del(address: Address): void;
    /**
     * Flushes the cache by returning codes that have been modified
     * or deleted and resetting the diff cache (at checkpoint height).
     */
    flush(): [string, CodeCacheElement][];
    /**
     * Revert changes to the cache to the last checkpoint (no effect on trie).
     */
    revert(): void;
    /**
     * Commits the current state of the cache (no effect on trie).
     */
    commit(): void;
    /**
     * Marks the current state of the cache as a checkpoint, which can
     * later be reverted or committed.
     */
    checkpoint(): void;
    /**
     * Returns the size of the cache
     * @returns
     */
    size(): number;
    /**
     * Returns a dictionary with cache statistics.
     *
     * @param reset - Whether to reset statistics after retrieval.
     * @returns A dictionary with cache statistics.
     */
    stats(reset?: boolean): any;
    /**
     * Clears the cache.
     */
    clear(): void;
}
export {};
>>>>>>> 603bf51d9e02a58183fabb7f7fd08e9580ceef44
//# sourceMappingURL=code.d.ts.map