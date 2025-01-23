"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Caches = void 0;
const account_js_1 = require("./account.js");
const code_js_1 = require("./code.js");
const storage_js_1 = require("./storage.js");
const types_js_1 = require("./types.js");
class Caches {
    constructor(opts = {}) {
        const accountSettings = {
            type: opts.account?.type ?? types_js_1.CacheType.ORDERED_MAP,
            size: opts.account?.size ?? 100000,
        };
        const codeSettings = {
            type: opts.code?.type ?? types_js_1.CacheType.ORDERED_MAP,
            size: opts.code?.size ?? 20000,
        };
        const storageSettings = {
            type: opts.storage?.type ?? types_js_1.CacheType.ORDERED_MAP,
            size: opts.storage?.size ?? 20000,
        };
        this.settings = {
            account: accountSettings,
            code: codeSettings,
            storage: storageSettings,
        };
        if (this.settings.account.size !== 0) {
            this.account = new account_js_1.AccountCache({
                size: this.settings.account.size,
                type: this.settings.account.type,
            });
        }
        if (this.settings.code.size !== 0) {
            this.code = new code_js_1.CodeCache({
                size: this.settings.code.size,
                type: this.settings.code.type,
            });
        }
        if (this.settings.storage.size !== 0) {
            this.storage = new storage_js_1.StorageCache({
                size: this.settings.storage.size,
                type: this.settings.storage.type,
            });
        }
    }
    checkpoint() {
        this.account?.checkpoint();
        this.storage?.checkpoint();
        this.code?.checkpoint();
    }
    clear() {
        this.account?.clear();
        this.storage?.clear();
        this.code?.clear();
    }
    commit() {
        this.account?.commit();
        this.storage?.commit();
        this.code?.commit();
    }
    deleteAccount(address) {
        this.code?.del(address);
        this.account?.del(address);
        this.storage?.clearStorage(address);
    }
    shallowCopy(downlevelCaches) {
        let cacheOptions;
        // Account cache options
        if (this.settings.account.size !== 0) {
            cacheOptions = {
                account: downlevelCaches
                    ? { size: this.settings.account.size, type: types_js_1.CacheType.ORDERED_MAP }
                    : this.settings.account,
            };
        }
        // Storage cache options
        if (this.settings.storage.size !== 0) {
            cacheOptions = {
                ...cacheOptions,
                storage: downlevelCaches
                    ? { size: this.settings.storage.size, type: types_js_1.CacheType.ORDERED_MAP }
                    : this.settings.storage,
            };
        }
        // Code cache options
        if (this.settings.code.size !== 0) {
            cacheOptions = {
                ...cacheOptions,
                code: downlevelCaches
                    ? { size: this.settings.code.size, type: types_js_1.CacheType.ORDERED_MAP }
                    : this.settings.code,
            };
        }
        if (cacheOptions !== undefined) {
            return new Caches(cacheOptions);
        }
        else
            return undefined;
    }
    revert() {
        this.account?.revert();
        this.storage?.revert();
        this.code?.revert();
    }
}
exports.Caches = Caches;
//# sourceMappingURL=caches.js.map