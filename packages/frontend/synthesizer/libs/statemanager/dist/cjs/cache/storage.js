<<<<<<< HEAD
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageCache = void 0;
const util_1 = require("@ethereumjs/util");
const ordered_map_1 = require("@js-sdsl/ordered-map");
const debug_1 = require("debug");
const lru_cache_1 = require("lru-cache");
const cache_js_1 = require("./cache.js");
const types_js_1 = require("./types.js");
class StorageCache extends cache_js_1.Cache {
    constructor(opts) {
        super();
        /**
         * Diff cache collecting the state of the cache
         * at the beginning of checkpoint height
         * (respectively: before a first modification)
         *
         * If the whole cache element is undefined (in contrast
         * to the account), the element didn't exist in the cache
         * before.
         */
        this._diffCache = [];
        if (opts.type === types_js_1.CacheType.LRU) {
            this._lruCache = new lru_cache_1.LRUCache({
                max: opts.size,
                updateAgeOnGet: true,
            });
        }
        else {
            this._orderedMapCache = new ordered_map_1.OrderedMap();
        }
        this._diffCache.push(new Map());
        if (this.DEBUG) {
            this._debug = (0, debug_1.default)('statemanager:cache:storage');
        }
    }
    _saveCachePreState(addressHex, keyHex) {
        const addressStoragePreState = this._diffCache[this._checkpoints].get(addressHex);
        const diffStorageMap = addressStoragePreState ?? new Map();
        if (!diffStorageMap.has(keyHex)) {
            let oldStorageMap;
            let oldStorage = undefined;
            if (this._lruCache) {
                oldStorageMap = this._lruCache.get(addressHex);
                if (oldStorageMap) {
                    oldStorage = oldStorageMap.get(keyHex);
                }
            }
            else {
                oldStorageMap = this._orderedMapCache.getElementByKey(addressHex);
                if (oldStorageMap) {
                    oldStorage = oldStorageMap.get(keyHex);
                }
            }
            diffStorageMap.set(keyHex, oldStorage);
            this._diffCache[this._checkpoints].set(addressHex, diffStorageMap);
        }
    }
    /**
     * Puts storage value to cache under address_key cache key.
     * @param address - Account address
     * @param key - Storage key
     * @param val - RLP-encoded storage value
     */
    put(address, key, value) {
        const addressHex = (0, util_1.bytesToUnprefixedHex)(address.bytes);
        const keyHex = (0, util_1.bytesToUnprefixedHex)(key);
        this._saveCachePreState(addressHex, keyHex);
        if (this.DEBUG) {
            this._debug(`Put storage for ${addressHex}: ${keyHex} -> ${value !== undefined ? (0, util_1.bytesToUnprefixedHex)(value) : ''}`);
        }
        if (this._lruCache) {
            let storageMap = this._lruCache.get(addressHex);
            if (!storageMap) {
                storageMap = new Map();
            }
            storageMap.set(keyHex, value);
            this._lruCache.set(addressHex, storageMap);
        }
        else {
            let storageMap = this._orderedMapCache.getElementByKey(addressHex);
            if (!storageMap) {
                storageMap = new Map();
            }
            storageMap.set(keyHex, value);
            this._orderedMapCache.setElement(addressHex, storageMap);
        }
        this._stats.writes += 1;
    }
    /**
     * Returns the queried slot as the RLP encoded storage value
     * hexToBytes('0x80'): slot is known to be empty
     * undefined: slot is not in cache
     * @param address - Address of account
     * @param key - Storage key
     * @returns Storage value or undefined
     */
    get(address, key) {
        const addressHex = (0, util_1.bytesToUnprefixedHex)(address.bytes);
        const keyHex = (0, util_1.bytesToUnprefixedHex)(key);
        if (this.DEBUG) {
            this._debug(`Get storage for ${addressHex}`);
        }
        let storageMap;
        if (this._lruCache) {
            storageMap = this._lruCache.get(addressHex);
        }
        else {
            storageMap = this._orderedMapCache.getElementByKey(addressHex);
        }
        this._stats.reads += 1;
        if (storageMap) {
            this._stats.hits += 1;
            return storageMap.get(keyHex);
        }
    }
    /**
     * Marks storage key for address as deleted in cache.
     * @param address - Address
     * @param key - Storage key
     */
    del(address, key) {
        const addressHex = (0, util_1.bytesToUnprefixedHex)(address.bytes);
        const keyHex = (0, util_1.bytesToUnprefixedHex)(key);
        this._saveCachePreState(addressHex, keyHex);
        if (this.DEBUG) {
            this._debug(`Delete storage for ${addressHex}: ${keyHex}`);
        }
        if (this._lruCache) {
            let storageMap = this._lruCache.get(addressHex);
            if (!storageMap) {
                storageMap = new Map();
            }
            storageMap.set(keyHex, (0, util_1.hexToBytes)('0x80'));
            this._lruCache.set(addressHex, storageMap);
        }
        else {
            let storageMap = this._orderedMapCache.getElementByKey(addressHex);
            if (!storageMap) {
                storageMap = new Map();
            }
            storageMap.set(keyHex, (0, util_1.hexToBytes)('0x80'));
            this._orderedMapCache.setElement(addressHex, storageMap);
        }
        this._stats.deletions += 1;
    }
    /**
     * Deletes all storage slots for address from the cache
     * @param address
     */
    clearStorage(address) {
        const addressHex = (0, util_1.bytesToUnprefixedHex)(address.bytes);
        if (this._lruCache) {
            this._lruCache.set(addressHex, new Map());
        }
        else {
            this._orderedMapCache.setElement(addressHex, new Map());
        }
    }
    /**
     * Flushes cache by returning storage slots that have been modified
     * or deleted and resetting the diff cache (at checkpoint height).
     */
    flush() {
        if (this.DEBUG) {
            this._debug(`Flushing cache on checkpoint ${this._checkpoints}`);
        }
        const diffMap = this._diffCache[this._checkpoints];
        const items = [];
        for (const entry of diffMap.entries()) {
            const addressHex = entry[0];
            const diffStorageMap = entry[1];
            let storageMap;
            if (this._lruCache) {
                storageMap = this._lruCache.get(addressHex);
            }
            else {
                storageMap = this._orderedMapCache.getElementByKey(addressHex);
            }
            if (storageMap !== undefined) {
                for (const entry of diffStorageMap.entries()) {
                    const keyHex = entry[0];
                    const value = storageMap.get(keyHex);
                    items.push([addressHex, keyHex, value]);
                }
            }
            else {
                throw new Error('internal error: storage cache map for account should be defined');
            }
        }
        this._diffCache[this._checkpoints] = new Map();
        return items;
    }
    /**
     * Revert changes to cache last checkpoint (no effect on trie).
     */
    revert() {
        this._checkpoints -= 1;
        if (this.DEBUG) {
            this._debug(`Revert to checkpoint ${this._checkpoints}`);
        }
        const diffMap = this._diffCache.pop();
        for (const entry of diffMap.entries()) {
            const addressHex = entry[0];
            const diffStorageMap = entry[1];
            for (const entry of diffStorageMap.entries()) {
                const keyHex = entry[0];
                const value = entry[1];
                if (this._lruCache) {
                    const storageMap = this._lruCache.get(addressHex) ?? new Map();
                    if (value === undefined) {
                        // Value is known not to be in the cache before
                        // -> delete from cache
                        storageMap.delete(keyHex);
                    }
                    else {
                        // Value is known to be in the cache before
                        // (being either some storage value or the RLP-encoded empty Uint8Array)
                        storageMap.set(keyHex, value);
                    }
                    this._lruCache.set(addressHex, storageMap);
                }
                else {
                    const storageMap = this._orderedMapCache.getElementByKey(addressHex) ?? new Map();
                    if (!value) {
                        storageMap.delete(keyHex);
                    }
                    else {
                        storageMap.set(keyHex, value);
                    }
                    this._orderedMapCache.setElement(addressHex, storageMap);
                }
            }
        }
    }
    /**
     * Commits to current state of cache (no effect on trie).
     */
    commit() {
        this._checkpoints -= 1;
        if (this.DEBUG) {
            this._debug(`Commit to checkpoint ${this._checkpoints}`);
        }
        const higherHeightDiffMap = this._diffCache.pop();
        const lowerHeightDiffMap = this._diffCache[this._checkpoints];
        // Go through diffMap from the pre-commit checkpoint height.
        // 1. Iterate through all state pre states
        // 2. If state pre-state is not in the new (lower) height diff map, take pre commit pre state value
        // 3. If state is in new map, take this one, since this supersedes subsequent changes
        for (const entry of higherHeightDiffMap.entries()) {
            const addressHex = entry[0];
            const higherHeightStorageDiff = entry[1];
            const lowerHeightStorageDiff = lowerHeightDiffMap.get(addressHex) ?? new Map();
            for (const entry of higherHeightStorageDiff.entries()) {
                const keyHex = entry[0];
                if (!lowerHeightStorageDiff.has(keyHex)) {
                    const elem = entry[1];
                    lowerHeightStorageDiff.set(keyHex, elem);
                }
            }
            lowerHeightDiffMap.set(addressHex, lowerHeightStorageDiff);
        }
    }
    /**
     * Marks current state of cache as checkpoint, which can
     * later on be reverted or committed.
     */
    checkpoint() {
        this._checkpoints += 1;
        if (this.DEBUG) {
            this._debug(`New checkpoint ${this._checkpoints}`);
        }
        this._diffCache.push(new Map());
    }
    /**
     * Returns the size of the cache
     * @returns
     */
    size() {
        if (this._lruCache) {
            return this._lruCache.size;
        }
        else {
            return this._orderedMapCache.size();
        }
    }
    /**
     * Returns a dict with cache stats
     * @param reset
     */
    stats(reset = true) {
        const stats = { ...this._stats };
        stats.size = this.size();
        if (reset) {
            this._stats = {
                size: 0,
                reads: 0,
                hits: 0,
                writes: 0,
                deletions: 0,
            };
        }
        return stats;
    }
    /**
     * Clears cache.
     */
    clear() {
        if (this.DEBUG) {
            this._debug(`Clear cache`);
        }
        if (this._lruCache) {
            this._lruCache.clear();
        }
        else {
            this._orderedMapCache.clear();
        }
    }
    /**
     * Dumps the RLP-encoded storage values for an `account` specified by `address`.
     * @param address - The address of the `account` to return storage for
     * @returns {StorageCacheMap | undefined} - The storage values for the `account` or undefined if the `account` is not in the cache
     */
    dump(address) {
        let storageMap;
        if (this._lruCache) {
            storageMap = this._lruCache.get((0, util_1.bytesToUnprefixedHex)(address.bytes));
        }
        else {
            storageMap = this._orderedMapCache?.getElementByKey((0, util_1.bytesToUnprefixedHex)(address.bytes));
        }
        return storageMap;
    }
}
exports.StorageCache = StorageCache;
=======
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageCache = void 0;
const util_1 = require("@synthesizer-libs/util");
const ordered_map_1 = require("@js-sdsl/ordered-map");
const debug_1 = require("debug");
const lru_cache_1 = require("lru-cache");
const cache_js_1 = require("./cache.js");
const types_js_1 = require("./types.js");
class StorageCache extends cache_js_1.Cache {
    constructor(opts) {
        super();
        /**
         * Diff cache collecting the state of the cache
         * at the beginning of checkpoint height
         * (respectively: before a first modification)
         *
         * If the whole cache element is undefined (in contrast
         * to the account), the element didn't exist in the cache
         * before.
         */
        this._diffCache = [];
        if (opts.type === types_js_1.CacheType.LRU) {
            this._lruCache = new lru_cache_1.LRUCache({
                max: opts.size,
                updateAgeOnGet: true,
            });
        }
        else {
            this._orderedMapCache = new ordered_map_1.OrderedMap();
        }
        this._diffCache.push(new Map());
        if (this.DEBUG) {
            this._debug = (0, debug_1.default)('statemanager:cache:storage');
        }
    }
    _saveCachePreState(addressHex, keyHex) {
        const addressStoragePreState = this._diffCache[this._checkpoints].get(addressHex);
        const diffStorageMap = addressStoragePreState ?? new Map();
        if (!diffStorageMap.has(keyHex)) {
            let oldStorageMap;
            let oldStorage = undefined;
            if (this._lruCache) {
                oldStorageMap = this._lruCache.get(addressHex);
                if (oldStorageMap) {
                    oldStorage = oldStorageMap.get(keyHex);
                }
            }
            else {
                oldStorageMap = this._orderedMapCache.getElementByKey(addressHex);
                if (oldStorageMap) {
                    oldStorage = oldStorageMap.get(keyHex);
                }
            }
            diffStorageMap.set(keyHex, oldStorage);
            this._diffCache[this._checkpoints].set(addressHex, diffStorageMap);
        }
    }
    /**
     * Puts storage value to cache under address_key cache key.
     * @param address - Account address
     * @param key - Storage key
     * @param val - RLP-encoded storage value
     */
    put(address, key, value) {
        const addressHex = (0, util_1.bytesToUnprefixedHex)(address.bytes);
        const keyHex = (0, util_1.bytesToUnprefixedHex)(key);
        this._saveCachePreState(addressHex, keyHex);
        if (this.DEBUG) {
            this._debug(`Put storage for ${addressHex}: ${keyHex} -> ${value !== undefined ? (0, util_1.bytesToUnprefixedHex)(value) : ''}`);
        }
        if (this._lruCache) {
            let storageMap = this._lruCache.get(addressHex);
            if (!storageMap) {
                storageMap = new Map();
            }
            storageMap.set(keyHex, value);
            this._lruCache.set(addressHex, storageMap);
        }
        else {
            let storageMap = this._orderedMapCache.getElementByKey(addressHex);
            if (!storageMap) {
                storageMap = new Map();
            }
            storageMap.set(keyHex, value);
            this._orderedMapCache.setElement(addressHex, storageMap);
        }
        this._stats.writes += 1;
    }
    /**
     * Returns the queried slot as the RLP encoded storage value
     * hexToBytes('0x80'): slot is known to be empty
     * undefined: slot is not in cache
     * @param address - Address of account
     * @param key - Storage key
     * @returns Storage value or undefined
     */
    get(address, key) {
        const addressHex = (0, util_1.bytesToUnprefixedHex)(address.bytes);
        const keyHex = (0, util_1.bytesToUnprefixedHex)(key);
        if (this.DEBUG) {
            this._debug(`Get storage for ${addressHex}`);
        }
        let storageMap;
        if (this._lruCache) {
            storageMap = this._lruCache.get(addressHex);
        }
        else {
            storageMap = this._orderedMapCache.getElementByKey(addressHex);
        }
        this._stats.reads += 1;
        if (storageMap) {
            this._stats.hits += 1;
            return storageMap.get(keyHex);
        }
    }
    /**
     * Marks storage key for address as deleted in cache.
     * @param address - Address
     * @param key - Storage key
     */
    del(address, key) {
        const addressHex = (0, util_1.bytesToUnprefixedHex)(address.bytes);
        const keyHex = (0, util_1.bytesToUnprefixedHex)(key);
        this._saveCachePreState(addressHex, keyHex);
        if (this.DEBUG) {
            this._debug(`Delete storage for ${addressHex}: ${keyHex}`);
        }
        if (this._lruCache) {
            let storageMap = this._lruCache.get(addressHex);
            if (!storageMap) {
                storageMap = new Map();
            }
            storageMap.set(keyHex, (0, util_1.hexToBytes)('0x80'));
            this._lruCache.set(addressHex, storageMap);
        }
        else {
            let storageMap = this._orderedMapCache.getElementByKey(addressHex);
            if (!storageMap) {
                storageMap = new Map();
            }
            storageMap.set(keyHex, (0, util_1.hexToBytes)('0x80'));
            this._orderedMapCache.setElement(addressHex, storageMap);
        }
        this._stats.deletions += 1;
    }
    /**
     * Deletes all storage slots for address from the cache
     * @param address
     */
    clearStorage(address) {
        const addressHex = (0, util_1.bytesToUnprefixedHex)(address.bytes);
        if (this._lruCache) {
            this._lruCache.set(addressHex, new Map());
        }
        else {
            this._orderedMapCache.setElement(addressHex, new Map());
        }
    }
    /**
     * Flushes cache by returning storage slots that have been modified
     * or deleted and resetting the diff cache (at checkpoint height).
     */
    flush() {
        if (this.DEBUG) {
            this._debug(`Flushing cache on checkpoint ${this._checkpoints}`);
        }
        const diffMap = this._diffCache[this._checkpoints];
        const items = [];
        for (const entry of diffMap.entries()) {
            const addressHex = entry[0];
            const diffStorageMap = entry[1];
            let storageMap;
            if (this._lruCache) {
                storageMap = this._lruCache.get(addressHex);
            }
            else {
                storageMap = this._orderedMapCache.getElementByKey(addressHex);
            }
            if (storageMap !== undefined) {
                for (const entry of diffStorageMap.entries()) {
                    const keyHex = entry[0];
                    const value = storageMap.get(keyHex);
                    items.push([addressHex, keyHex, value]);
                }
            }
            else {
                throw new Error('internal error: storage cache map for account should be defined');
            }
        }
        this._diffCache[this._checkpoints] = new Map();
        return items;
    }
    /**
     * Revert changes to cache last checkpoint (no effect on trie).
     */
    revert() {
        this._checkpoints -= 1;
        if (this.DEBUG) {
            this._debug(`Revert to checkpoint ${this._checkpoints}`);
        }
        const diffMap = this._diffCache.pop();
        for (const entry of diffMap.entries()) {
            const addressHex = entry[0];
            const diffStorageMap = entry[1];
            for (const entry of diffStorageMap.entries()) {
                const keyHex = entry[0];
                const value = entry[1];
                if (this._lruCache) {
                    const storageMap = this._lruCache.get(addressHex) ?? new Map();
                    if (value === undefined) {
                        // Value is known not to be in the cache before
                        // -> delete from cache
                        storageMap.delete(keyHex);
                    }
                    else {
                        // Value is known to be in the cache before
                        // (being either some storage value or the RLP-encoded empty Uint8Array)
                        storageMap.set(keyHex, value);
                    }
                    this._lruCache.set(addressHex, storageMap);
                }
                else {
                    const storageMap = this._orderedMapCache.getElementByKey(addressHex) ?? new Map();
                    if (!value) {
                        storageMap.delete(keyHex);
                    }
                    else {
                        storageMap.set(keyHex, value);
                    }
                    this._orderedMapCache.setElement(addressHex, storageMap);
                }
            }
        }
    }
    /**
     * Commits to current state of cache (no effect on trie).
     */
    commit() {
        this._checkpoints -= 1;
        if (this.DEBUG) {
            this._debug(`Commit to checkpoint ${this._checkpoints}`);
        }
        const higherHeightDiffMap = this._diffCache.pop();
        const lowerHeightDiffMap = this._diffCache[this._checkpoints];
        // Go through diffMap from the pre-commit checkpoint height.
        // 1. Iterate through all state pre states
        // 2. If state pre-state is not in the new (lower) height diff map, take pre commit pre state value
        // 3. If state is in new map, take this one, since this supersedes subsequent changes
        for (const entry of higherHeightDiffMap.entries()) {
            const addressHex = entry[0];
            const higherHeightStorageDiff = entry[1];
            const lowerHeightStorageDiff = lowerHeightDiffMap.get(addressHex) ?? new Map();
            for (const entry of higherHeightStorageDiff.entries()) {
                const keyHex = entry[0];
                if (!lowerHeightStorageDiff.has(keyHex)) {
                    const elem = entry[1];
                    lowerHeightStorageDiff.set(keyHex, elem);
                }
            }
            lowerHeightDiffMap.set(addressHex, lowerHeightStorageDiff);
        }
    }
    /**
     * Marks current state of cache as checkpoint, which can
     * later on be reverted or committed.
     */
    checkpoint() {
        this._checkpoints += 1;
        if (this.DEBUG) {
            this._debug(`New checkpoint ${this._checkpoints}`);
        }
        this._diffCache.push(new Map());
    }
    /**
     * Returns the size of the cache
     * @returns
     */
    size() {
        if (this._lruCache) {
            return this._lruCache.size;
        }
        else {
            return this._orderedMapCache.size();
        }
    }
    /**
     * Returns a dict with cache stats
     * @param reset
     */
    stats(reset = true) {
        const stats = { ...this._stats };
        stats.size = this.size();
        if (reset) {
            this._stats = {
                size: 0,
                reads: 0,
                hits: 0,
                writes: 0,
                deletions: 0,
            };
        }
        return stats;
    }
    /**
     * Clears cache.
     */
    clear() {
        if (this.DEBUG) {
            this._debug(`Clear cache`);
        }
        if (this._lruCache) {
            this._lruCache.clear();
        }
        else {
            this._orderedMapCache.clear();
        }
    }
    /**
     * Dumps the RLP-encoded storage values for an `account` specified by `address`.
     * @param address - The address of the `account` to return storage for
     * @returns {StorageCacheMap | undefined} - The storage values for the `account` or undefined if the `account` is not in the cache
     */
    dump(address) {
        let storageMap;
        if (this._lruCache) {
            storageMap = this._lruCache.get((0, util_1.bytesToUnprefixedHex)(address.bytes));
        }
        else {
            storageMap = this._orderedMapCache?.getElementByKey((0, util_1.bytesToUnprefixedHex)(address.bytes));
        }
        return storageMap;
    }
}
exports.StorageCache = StorageCache;
>>>>>>> 603bf51d9e02a58183fabb7f7fd08e9580ceef44
//# sourceMappingURL=storage.js.map