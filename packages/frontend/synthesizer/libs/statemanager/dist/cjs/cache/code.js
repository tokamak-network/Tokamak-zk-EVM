"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeCache = void 0;
const util_1 = require("@ethereumjs/util");
const ordered_map_1 = require("@js-sdsl/ordered-map");
const debug_1 = require("debug");
const lru_cache_1 = require("lru-cache");
const cache_js_1 = require("./cache.js");
const types_js_1 = require("./types.js");
class CodeCache extends cache_js_1.Cache {
    constructor(opts) {
        super();
        /**
         * Diff cache collecting the state of the cache
         * at the beginning of checkpoint height
         * (respectively: before a first modification)
         *
         * If the whole cache element is undefined (in contrast
         * to the code), the element didn't exist in the cache
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
        this._debug = (0, debug_1.default)('statemanager:cache:code');
    }
    /**
     * Saves the state of the code cache before making changes to it.
     *
     * @param cacheKeyHex Account key for which code is being modified.
     */
    _saveCachePreState(cacheKeyHex) {
        const diffMap = this._diffCache[this._checkpoints];
        if (!diffMap.has(cacheKeyHex)) {
            let oldElem;
            if (this._lruCache) {
                oldElem = this._lruCache.get(cacheKeyHex);
            }
            else {
                oldElem = this._orderedMapCache.getElementByKey(cacheKeyHex);
            }
            diffMap.set(cacheKeyHex, oldElem);
        }
    }
    /**
     * Puts code into the cache under its hash.
     *
     * @param address - Address of account code is being modified for.
     * @param code - Bytecode or undefined if code doesn't exist.
     */
    put(address, code) {
        const addressHex = (0, util_1.bytesToUnprefixedHex)(address.bytes);
        this._saveCachePreState(addressHex);
        const elem = {
            code,
        };
        if (this.DEBUG) {
            this._debug(`Put code ${addressHex}`);
        }
        if (this._lruCache) {
            this._lruCache.set(addressHex, elem);
        }
        else {
            this._orderedMapCache.setElement(addressHex, elem);
        }
        this._stats.writes += 1;
    }
    /**
     * Returns the queried code or undefined if it doesn't exist.
     *
     * @param address - Account address for which code is being fetched.
     */
    get(address) {
        const addressHex = (0, util_1.bytesToUnprefixedHex)(address.bytes);
        if (this.DEBUG) {
            this._debug(`Get code ${addressHex}`);
        }
        let elem;
        if (this._lruCache) {
            elem = this._lruCache.get(addressHex);
        }
        else {
            elem = this._orderedMapCache.getElementByKey(addressHex);
        }
        this._stats.reads += 1;
        if (elem) {
            this._stats.hits += 1;
        }
        return elem;
    }
    /**
     * Marks code as deleted in the cache.
     *
     * @param address - Account address for which code is being fetched.
     */
    del(address) {
        const addressHex = (0, util_1.bytesToUnprefixedHex)(address.bytes);
        this._saveCachePreState(addressHex);
        if (this.DEBUG) {
            this._debug(`Delete code ${addressHex}`);
        }
        if (this._lruCache) {
            this._lruCache.set(addressHex, {
                code: undefined,
            });
        }
        else {
            this._orderedMapCache.setElement(addressHex, {
                code: undefined,
            });
        }
        this._stats.deletions += 1;
    }
    /**
     * Flushes the cache by returning codes that have been modified
     * or deleted and resetting the diff cache (at checkpoint height).
     */
    flush() {
        if (this.DEBUG) {
            this._debug(`Flushing cache on checkpoint ${this._checkpoints}`);
        }
        const diffMap = this._diffCache[this._checkpoints];
        const items = [];
        for (const entry of diffMap.entries()) {
            const cacheKeyHex = entry[0];
            let elem;
            if (this._lruCache) {
                elem = this._lruCache.get(cacheKeyHex);
            }
            else {
                elem = this._orderedMapCache.getElementByKey(cacheKeyHex);
            }
            if (elem !== undefined) {
                items.push([cacheKeyHex, elem]);
            }
        }
        this._diffCache[this._checkpoints] = new Map();
        return items;
    }
    /**
     * Revert changes to the cache to the last checkpoint (no effect on trie).
     */
    revert() {
        this._checkpoints -= 1;
        if (this.DEBUG) {
            this._debug(`Revert to checkpoint ${this._checkpoints}`);
        }
        const diffMap = this._diffCache.pop();
        for (const entry of diffMap.entries()) {
            const addressHex = entry[0];
            const elem = entry[1];
            if (elem === undefined) {
                if (this._lruCache) {
                    this._lruCache.delete(addressHex);
                }
                else {
                    this._orderedMapCache.eraseElementByKey(addressHex);
                }
            }
            else {
                if (this._lruCache) {
                    this._lruCache.set(addressHex, elem);
                }
                else {
                    this._orderedMapCache.setElement(addressHex, elem);
                }
            }
        }
    }
    /**
     * Commits the current state of the cache (no effect on trie).
     */
    commit() {
        this._checkpoints -= 1;
        if (this.DEBUG) {
            this._debug(`Commit to checkpoint ${this._checkpoints}`);
        }
        const diffMap = this._diffCache.pop();
        for (const entry of diffMap.entries()) {
            const addressHex = entry[0];
            const oldEntry = this._diffCache[this._checkpoints].has(addressHex);
            if (!oldEntry) {
                const elem = entry[1];
                this._diffCache[this._checkpoints].set(addressHex, elem);
            }
        }
    }
    /**
     * Marks the current state of the cache as a checkpoint, which can
     * later be reverted or committed.
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
     * Returns a dictionary with cache statistics.
     *
     * @param reset - Whether to reset statistics after retrieval.
     * @returns A dictionary with cache statistics.
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
     * Clears the cache.
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
}
exports.CodeCache = CodeCache;
//# sourceMappingURL=code.js.map