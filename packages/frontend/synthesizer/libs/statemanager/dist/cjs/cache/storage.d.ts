<<<<<<< HEAD
import { OrderedMap } from '@js-sdsl/ordered-map';
import { LRUCache } from 'lru-cache';
import { Cache } from './cache.js';
import type { CacheOpts } from './types.js';
import type { Address } from '@ethereumjs/util';
/**
 * key -> storage mapping
 *
 * undefined: storage value is known not to exist in the cache
 */
type DiffStorageCacheMap = Map<string, Uint8Array | undefined>;
type StorageCacheMap = Map<string, Uint8Array>;
export declare class StorageCache extends Cache {
    _lruCache: LRUCache<string, StorageCacheMap> | undefined;
    _orderedMapCache: OrderedMap<string, StorageCacheMap> | undefined;
    /**
     * Diff cache collecting the state of the cache
     * at the beginning of checkpoint height
     * (respectively: before a first modification)
     *
     * If the whole cache element is undefined (in contrast
     * to the account), the element didn't exist in the cache
     * before.
     */
    _diffCache: Map<string, DiffStorageCacheMap>[];
    constructor(opts: CacheOpts);
    _saveCachePreState(addressHex: string, keyHex: string): void;
    /**
     * Puts storage value to cache under address_key cache key.
     * @param address - Account address
     * @param key - Storage key
     * @param val - RLP-encoded storage value
     */
    put(address: Address, key: Uint8Array, value: Uint8Array): void;
    /**
     * Returns the queried slot as the RLP encoded storage value
     * hexToBytes('0x80'): slot is known to be empty
     * undefined: slot is not in cache
     * @param address - Address of account
     * @param key - Storage key
     * @returns Storage value or undefined
     */
    get(address: Address, key: Uint8Array): Uint8Array | undefined;
    /**
     * Marks storage key for address as deleted in cache.
     * @param address - Address
     * @param key - Storage key
     */
    del(address: Address, key: Uint8Array): void;
    /**
     * Deletes all storage slots for address from the cache
     * @param address
     */
    clearStorage(address: Address): void;
    /**
     * Flushes cache by returning storage slots that have been modified
     * or deleted and resetting the diff cache (at checkpoint height).
     */
    flush(): [string, string, Uint8Array | undefined][];
    /**
     * Revert changes to cache last checkpoint (no effect on trie).
     */
    revert(): void;
    /**
     * Commits to current state of cache (no effect on trie).
     */
    commit(): void;
    /**
     * Marks current state of cache as checkpoint, which can
     * later on be reverted or committed.
     */
    checkpoint(): void;
    /**
     * Returns the size of the cache
     * @returns
     */
    size(): number;
    /**
     * Returns a dict with cache stats
     * @param reset
     */
    stats(reset?: boolean): {
        size: number;
        reads: number;
        hits: number;
        writes: number;
        deletions: number;
    };
    /**
     * Clears cache.
     */
    clear(): void;
    /**
     * Dumps the RLP-encoded storage values for an `account` specified by `address`.
     * @param address - The address of the `account` to return storage for
     * @returns {StorageCacheMap | undefined} - The storage values for the `account` or undefined if the `account` is not in the cache
     */
    dump(address: Address): StorageCacheMap | undefined;
}
export {};
=======
import { OrderedMap } from '@js-sdsl/ordered-map';
import { LRUCache } from 'lru-cache';
import { Cache } from './cache.js';
import type { CacheOpts } from './types.js';
import type { Address } from '@synthesizer-libs/util';
/**
 * key -> storage mapping
 *
 * undefined: storage value is known not to exist in the cache
 */
type DiffStorageCacheMap = Map<string, Uint8Array | undefined>;
type StorageCacheMap = Map<string, Uint8Array>;
export declare class StorageCache extends Cache {
    _lruCache: LRUCache<string, StorageCacheMap> | undefined;
    _orderedMapCache: OrderedMap<string, StorageCacheMap> | undefined;
    /**
     * Diff cache collecting the state of the cache
     * at the beginning of checkpoint height
     * (respectively: before a first modification)
     *
     * If the whole cache element is undefined (in contrast
     * to the account), the element didn't exist in the cache
     * before.
     */
    _diffCache: Map<string, DiffStorageCacheMap>[];
    constructor(opts: CacheOpts);
    _saveCachePreState(addressHex: string, keyHex: string): void;
    /**
     * Puts storage value to cache under address_key cache key.
     * @param address - Account address
     * @param key - Storage key
     * @param val - RLP-encoded storage value
     */
    put(address: Address, key: Uint8Array, value: Uint8Array): void;
    /**
     * Returns the queried slot as the RLP encoded storage value
     * hexToBytes('0x80'): slot is known to be empty
     * undefined: slot is not in cache
     * @param address - Address of account
     * @param key - Storage key
     * @returns Storage value or undefined
     */
    get(address: Address, key: Uint8Array): Uint8Array | undefined;
    /**
     * Marks storage key for address as deleted in cache.
     * @param address - Address
     * @param key - Storage key
     */
    del(address: Address, key: Uint8Array): void;
    /**
     * Deletes all storage slots for address from the cache
     * @param address
     */
    clearStorage(address: Address): void;
    /**
     * Flushes cache by returning storage slots that have been modified
     * or deleted and resetting the diff cache (at checkpoint height).
     */
    flush(): [string, string, Uint8Array | undefined][];
    /**
     * Revert changes to cache last checkpoint (no effect on trie).
     */
    revert(): void;
    /**
     * Commits to current state of cache (no effect on trie).
     */
    commit(): void;
    /**
     * Marks current state of cache as checkpoint, which can
     * later on be reverted or committed.
     */
    checkpoint(): void;
    /**
     * Returns the size of the cache
     * @returns
     */
    size(): number;
    /**
     * Returns a dict with cache stats
     * @param reset
     */
    stats(reset?: boolean): {
        size: number;
        reads: number;
        hits: number;
        writes: number;
        deletions: number;
    };
    /**
     * Clears cache.
     */
    clear(): void;
    /**
     * Dumps the RLP-encoded storage values for an `account` specified by `address`.
     * @param address - The address of the `account` to return storage for
     * @returns {StorageCacheMap | undefined} - The storage values for the `account` or undefined if the `account` is not in the cache
     */
    dump(address: Address): StorageCacheMap | undefined;
}
export {};
>>>>>>> 603bf51d9e02a58183fabb7f7fd08e9580ceef44
//# sourceMappingURL=storage.d.ts.map