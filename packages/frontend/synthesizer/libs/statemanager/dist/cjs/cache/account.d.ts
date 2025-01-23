import { OrderedMap } from '@js-sdsl/ordered-map';
import { LRUCache } from 'lru-cache';
import { Cache } from './cache.js';
import type { CacheOpts } from './types.js';
import type { Account, Address } from '@ethereumjs/util';
/**
 * account: undefined
 *
 * Account is known to not exist in the trie
 */
type AccountCacheElement = {
    accountRLP: Uint8Array | undefined;
};
export declare class AccountCache extends Cache {
    _lruCache: LRUCache<string, AccountCacheElement> | undefined;
    _orderedMapCache: OrderedMap<string, AccountCacheElement> | undefined;
    /**
     * Diff cache collecting the state of the cache
     * at the beginning of checkpoint height
     * (respectively: before a first modification)
     *
     * If the whole cache element is undefined (in contrast
     * to the account), the element didn't exist in the cache
     * before.
     */
    _diffCache: Map<string, AccountCacheElement | undefined>[];
    constructor(opts: CacheOpts);
    _saveCachePreState(cacheKeyHex: string): void;
    /**
     * Puts account to cache under its address.
     * @param address - Address of account
     * @param account - Account or undefined if account doesn't exist in the trie
     */
    put(address: Address, account: Account | undefined, couldBePartialAccount?: boolean): void;
    /**
     * Returns the queried account or undefined if account doesn't exist
     * @param address - Address of account
     */
    get(address: Address): AccountCacheElement | undefined;
    /**
     * Marks address as deleted in cache.
     * @param address - Address
     */
    del(address: Address): void;
    /**
     * Flushes cache by returning accounts that have been modified
     * or deleted and resetting the diff cache (at checkpoint height).
     */
    flush(): [string, AccountCacheElement][];
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
}
export {};
//# sourceMappingURL=account.d.ts.map