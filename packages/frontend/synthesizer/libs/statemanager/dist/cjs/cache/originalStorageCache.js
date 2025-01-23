"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OriginalStorageCache = void 0;
const util_1 = require("@ethereumjs/util");
/**
 * Helper class to cache original storage values (so values already being present in
 * the pre-state of a call), mainly for correct gas cost calculation in EVM/VM.
 *
 * TODO: Usage of this class is very implicit through the injected `getStorage()`
 * method bound to the calling state manager. It should be examined if there are alternative
 * designs being more transparent and direct along the next breaking release round.
 *
 */
class OriginalStorageCache {
    constructor(getStorage) {
        this.map = new Map();
        this.getStorage = getStorage;
    }
    async get(address, key) {
        const addressHex = (0, util_1.bytesToUnprefixedHex)(address.bytes);
        const map = this.map.get(addressHex);
        if (map !== undefined) {
            const keyHex = (0, util_1.bytesToUnprefixedHex)(key);
            const value = map.get(keyHex);
            if (value !== undefined) {
                return value;
            }
        }
        const value = await this.getStorage(address, key);
        this.put(address, key, value);
        return value;
    }
    put(address, key, value) {
        const addressHex = (0, util_1.bytesToUnprefixedHex)(address.bytes);
        let map = this.map.get(addressHex);
        if (map === undefined) {
            map = new Map();
            this.map.set(addressHex, map);
        }
        const keyHex = (0, util_1.bytesToUnprefixedHex)(key);
        if (map.has(keyHex) === false) {
            map.set(keyHex, value);
        }
    }
    clear() {
        this.map = new Map();
    }
}
exports.OriginalStorageCache = OriginalStorageCache;
//# sourceMappingURL=originalStorageCache.js.map