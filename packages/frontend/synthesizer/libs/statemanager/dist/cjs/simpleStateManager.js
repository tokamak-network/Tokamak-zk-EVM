"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimpleStateManager = void 0;
const util_1 = require("@ethereumjs/util");
const keccak_js_1 = require("ethereum-cryptography/keccak.js");
const originalStorageCache_js_1 = require("./cache/originalStorageCache.js");
const util_js_1 = require("./util.js");
/**
 * Simple and dependency-free state manager for basic state access use cases
 * where a merkle-patricia or verkle tree backed state manager is too heavy-weight.
 *
 * This state manager comes with the basic state access logic for
 * accounts, storage and code (put* and get* methods) as well as a simple
 * implementation of checkpointing but lacks methods implementations of
 * state root related logic as well as some other non-core functions.
 *
 * Functionality provided is sufficient to be used for simple EVM use
 * cases and the state manager is used as default there.
 *
 * For a more full fledged and MPT-backed state manager implementation
 * have a look at the `@ethereumjs/statemanager` package.
 */
class SimpleStateManager {
    constructor(opts = {}) {
        this.accountStack = [];
        this.codeStack = [];
        this.storageStack = [];
        this.checkpointSync();
        this.originalStorageCache = new originalStorageCache_js_1.OriginalStorageCache(this.getStorage.bind(this));
        this.common = opts.common;
    }
    topAccountStack() {
        return this.accountStack[this.accountStack.length - 1];
    }
    topCodeStack() {
        return this.codeStack[this.codeStack.length - 1];
    }
    topStorageStack() {
        return this.storageStack[this.storageStack.length - 1];
    }
    // Synchronous version of checkpoint() to allow to call from constructor
    checkpointSync() {
        const newTopA = new Map(this.topAccountStack());
        for (const [address, account] of newTopA) {
            const accountCopy = account !== undefined
                ? Object.assign(Object.create(Object.getPrototypeOf(account)), account)
                : undefined;
            newTopA.set(address, accountCopy);
        }
        this.accountStack.push(newTopA);
        this.codeStack.push(new Map(this.topCodeStack()));
        this.storageStack.push(new Map(this.topStorageStack()));
    }
    async getAccount(address) {
        return this.topAccountStack().get(address.toString());
    }
    async putAccount(address, account) {
        this.topAccountStack().set(address.toString(), account);
    }
    async deleteAccount(address) {
        this.topAccountStack().set(address.toString(), undefined);
    }
    async modifyAccountFields(address, accountFields) {
        await (0, util_js_1.modifyAccountFields)(this, address, accountFields);
    }
    async getCode(address) {
        return this.topCodeStack().get(address.toString()) ?? new Uint8Array(0);
    }
    async putCode(address, value) {
        this.topCodeStack().set(address.toString(), value);
        if ((await this.getAccount(address)) === undefined) {
            await this.putAccount(address, new util_1.Account());
        }
        await this.modifyAccountFields(address, {
            codeHash: (this.common?.customCrypto.keccak256 ?? keccak_js_1.keccak256)(value),
        });
    }
    async getCodeSize(address) {
        const contractCode = await this.getCode(address);
        return contractCode.length;
    }
    async getStorage(address, key) {
        return (this.topStorageStack().get(`${address.toString()}_${(0, util_1.bytesToHex)(key)}`) ?? new Uint8Array(0));
    }
    async putStorage(address, key, value) {
        this.topStorageStack().set(`${address.toString()}_${(0, util_1.bytesToHex)(key)}`, value);
    }
    async clearStorage() { }
    async checkpoint() {
        this.checkpointSync();
    }
    async commit() {
        this.accountStack.splice(-2, 1);
        this.codeStack.splice(-2, 1);
        this.storageStack.splice(-2, 1);
    }
    async revert() {
        this.accountStack.pop();
        this.codeStack.pop();
        this.storageStack.pop();
    }
    async flush() { }
    clearCaches() { }
    shallowCopy() {
        const copy = new SimpleStateManager({ common: this.common });
        for (let i = 0; i < this.accountStack.length; i++) {
            copy.accountStack.push(new Map(this.accountStack[i]));
            copy.codeStack.push(new Map(this.codeStack[i]));
            copy.storageStack.push(new Map(this.storageStack[i]));
        }
        return copy;
    }
    // State root functionality not implemented
    getStateRoot() {
        throw new Error('Method not implemented.');
    }
    setStateRoot() {
        throw new Error('Method not implemented.');
    }
    hasStateRoot() {
        throw new Error('Method not implemented.');
    }
}
exports.SimpleStateManager = SimpleStateManager;
//# sourceMappingURL=simpleStateManager.js.map