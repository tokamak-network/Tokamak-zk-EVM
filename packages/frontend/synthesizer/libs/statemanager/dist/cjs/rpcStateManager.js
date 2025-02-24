"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RPCBlockChain = exports.RPCStateManager = void 0;
const common_1 = require("@synthesizer-libs/common");
const rlp_1 = require("@ethereumjs/rlp");
const util_1 = require("@synthesizer-libs/util");
const debug_1 = require("debug");
const keccak_js_1 = require("ethereum-cryptography/keccak.js");
const index_js_1 = require("./cache/index.js");
const util_js_1 = require("./util.js");
const KECCAK256_RLP_EMPTY_ACCOUNT = rlp_1.RLP.encode(new util_1.Account().serialize()).slice(2);
class RPCStateManager {
    constructor(opts) {
        /**
         * @deprecated This method is not used by the RPC State Manager and is a stub required by the State Manager interface
         */
        this.getStateRoot = async () => {
            return new Uint8Array(32);
        };
        /**
         * @deprecated This method is not used by the RPC State Manager and is a stub required by the State Manager interface
         */
        this.setStateRoot = async (_root) => { };
        /**
         * @deprecated This method is not used by the RPC State Manager and is a stub required by the State Manager interface
         */
        this.hasStateRoot = () => {
            throw new Error('function not implemented');
        };
        // Skip DEBUG calls unless 'ethjs' included in environmental DEBUG variables
        // Additional window check is to prevent vite browser bundling (and potentially other) to break
        this.DEBUG =
            typeof window === 'undefined' ? (process?.env?.DEBUG?.includes('ethjs') ?? false) : false;
        this._debug = (0, debug_1.default)('statemanager:rpc');
        if (typeof opts.provider === 'string' && opts.provider.startsWith('http')) {
            this._provider = opts.provider;
        }
        else {
            throw new Error(`valid RPC provider url required; got ${opts.provider}`);
        }
        this._blockTag = opts.blockTag === 'earliest' ? opts.blockTag : (0, util_1.bigIntToHex)(opts.blockTag);
        this._caches = new index_js_1.Caches({ storage: { size: 100000 }, code: { size: 100000 } });
        this.originalStorageCache = new index_js_1.OriginalStorageCache(this.getStorage.bind(this));
        this.common = opts.common ?? new common_1.Common({ chain: common_1.Mainnet });
        this.keccakFunction = opts.common?.customCrypto.keccak256 ?? keccak_js_1.keccak256;
    }
    /**
     * Note that the returned statemanager will share the same JSONRPCProvider as the original
     *
     * @returns RPCStateManager
     */
    shallowCopy() {
        const newState = new RPCStateManager({
            provider: this._provider,
            blockTag: BigInt(this._blockTag),
        });
        newState._caches = new index_js_1.Caches({ storage: { size: 100000 } });
        return newState;
    }
    /**
     * Sets the new block tag used when querying the provider and clears the
     * internal cache.
     * @param blockTag - the new block tag to use when querying the provider
     */
    setBlockTag(blockTag) {
        this._blockTag = blockTag === 'earliest' ? blockTag : (0, util_1.bigIntToHex)(blockTag);
        this.clearCaches();
        if (this.DEBUG)
            this._debug(`setting block tag to ${this._blockTag}`);
    }
    /**
     * Clears the internal cache so all accounts, contract code, and storage slots will
     * initially be retrieved from the provider
     */
    clearCaches() {
        this._caches.clear();
    }
    /**
     * Gets the code corresponding to the provided `address`.
     * @param address - Address to get the `code` for
     * @returns {Promise<Uint8Array>} - Resolves with the code corresponding to the provided address.
     * Returns an empty `Uint8Array` if the account has no associated code.
     */
    async getCode(address) {
        let codeBytes = this._caches.code?.get(address)?.code;
        if (codeBytes !== undefined)
            return codeBytes;
        const code = await (0, util_1.fetchFromProvider)(this._provider, {
            method: 'eth_getCode',
            params: [address.toString(), this._blockTag],
        });
        codeBytes = (0, util_1.toBytes)(code);
        this._caches.code?.put(address, codeBytes);
        return codeBytes;
    }
    async getCodeSize(address) {
        const contractCode = await this.getCode(address);
        return contractCode.length;
    }
    /**
     * Adds `value` to the state trie as code, and sets `codeHash` on the account
     * corresponding to `address` to reference this.
     * @param address - Address of the `account` to add the `code` for
     * @param value - The value of the `code`
     */
    async putCode(address, value) {
        // Store contract code in the cache
        this._caches.code?.put(address, value);
    }
    /**
     * Gets the storage value associated with the provided `address` and `key`. This method returns
     * the shortest representation of the stored value.
     * @param address - Address of the account to get the storage for
     * @param key - Key in the account's storage to get the value for. Must be 32 bytes long.
     * @returns {Uint8Array} - The storage value for the account
     * corresponding to the provided address at the provided key.
     * If this does not exist an empty `Uint8Array` is returned.
     */
    async getStorage(address, key) {
        // Check storage slot in cache
        if (key.length !== 32) {
            throw new Error('Storage key must be 32 bytes long');
        }
        let value = this._caches.storage?.get(address, key);
        if (value !== undefined) {
            return value;
        }
        // Retrieve storage slot from provider if not found in cache
        const storage = await (0, util_1.fetchFromProvider)(this._provider, {
            method: 'eth_getStorageAt',
            params: [address.toString(), (0, util_1.bytesToHex)(key), this._blockTag],
        });
        value = (0, util_1.toBytes)(storage);
        await this.putStorage(address, key, value);
        return value;
    }
    /**
     * Adds value to the cache for the `account`
     * corresponding to `address` at the provided `key`.
     * @param address - Address to set a storage value for
     * @param key - Key to set the value at. Must be 32 bytes long.
     * @param value - Value to set at `key` for account corresponding to `address`.
     * Cannot be more than 32 bytes. Leading zeros are stripped.
     * If it is empty or filled with zeros, deletes the value.
     */
    async putStorage(address, key, value) {
        this._caches.storage?.put(address, key, value);
    }
    /**
     * Clears all storage entries for the account corresponding to `address`.
     * @param address - Address to clear the storage of
     */
    async clearStorage(address) {
        this._caches.storage?.clearStorage(address);
    }
    /**
     * Dumps the RLP-encoded storage values for an `account` specified by `address`.
     * @param address - The address of the `account` to return storage for
     * @returns {Promise<StorageDump>} - The state of the account as an `Object` map.
     * Keys are the storage keys, values are the storage values as strings.
     * Both are represented as `0x` prefixed hex strings.
     */
    dumpStorage(address) {
        const storageMap = this._caches.storage?.dump(address);
        const dump = {};
        if (storageMap !== undefined) {
            for (const slot of storageMap) {
                dump[slot[0]] = (0, util_1.bytesToHex)(slot[1]);
            }
        }
        return Promise.resolve(dump);
    }
    /**
     * Gets the account associated with `address` or `undefined` if account does not exist
     * @param address - Address of the `account` to get
     */
    async getAccount(address) {
        const elem = this._caches.account?.get(address);
        if (elem !== undefined) {
            return elem.accountRLP !== undefined ? (0, util_1.createAccountFromRLP)(elem.accountRLP) : undefined;
        }
        const accountFromProvider = await this.getAccountFromProvider(address);
        const account = (0, util_1.equalsBytes)(accountFromProvider.codeHash, new Uint8Array(32)) ||
            (0, util_1.equalsBytes)(accountFromProvider.serialize(), KECCAK256_RLP_EMPTY_ACCOUNT)
            ? undefined
            : (0, util_1.createAccountFromRLP)(accountFromProvider.serialize());
        this._caches.account?.put(address, account);
        return account;
    }
    /**
     * Retrieves an account from the provider and stores in the local trie
     * @param address Address of account to be retrieved from provider
     * @private
     */
    async getAccountFromProvider(address) {
        if (this.DEBUG)
            this._debug(`retrieving account data from ${address.toString()} from provider`);
        const accountData = await (0, util_1.fetchFromProvider)(this._provider, {
            method: 'eth_getProof',
            params: [address.toString(), [], this._blockTag],
        });
        const account = (0, util_1.createAccount)({
            balance: BigInt(accountData.balance),
            nonce: BigInt(accountData.nonce),
            codeHash: (0, util_1.toBytes)(accountData.codeHash),
            storageRoot: (0, util_1.toBytes)(accountData.storageHash),
        });
        return account;
    }
    /**
     * Saves an account into state under the provided `address`.
     * @param address - Address under which to store `account`
     * @param account - The account to store
     */
    async putAccount(address, account) {
        if (this.DEBUG) {
            this._debug(`Save account address=${address} nonce=${account?.nonce} balance=${account?.balance} contract=${account && account.isContract() ? 'yes' : 'no'} empty=${account && account.isEmpty() ? 'yes' : 'no'}`);
        }
        if (account !== undefined) {
            this._caches.account.put(address, account);
        }
        else {
            this._caches.account.del(address);
        }
    }
    /**
     * Gets the account associated with `address`, modifies the given account
     * fields, then saves the account into state. Account fields can include
     * `nonce`, `balance`, `storageRoot`, and `codeHash`.
     * @param address - Address of the account to modify
     * @param accountFields - Object containing account fields and values to modify
     */
    async modifyAccountFields(address, accountFields) {
        if (this.DEBUG) {
            this._debug(`modifying account fields for ${address.toString()}`);
            this._debug(JSON.stringify(accountFields, (k, v) => {
                if (k === 'nonce')
                    return v.toString();
                return v;
            }, 2));
        }
        await (0, util_js_1.modifyAccountFields)(this, address, accountFields);
    }
    /**
     * Deletes an account from state under the provided `address`.
     * @param address - Address of the account which should be deleted
     */
    async deleteAccount(address) {
        if (this.DEBUG) {
            this._debug(`deleting account corresponding to ${address.toString()}`);
        }
        this._caches.account?.del(address);
    }
    /**
     * Returns the applied key for a given address
     * Used for saving preimages
     * @param address - The address to return the applied key
     * @returns {Uint8Array} - The applied key (e.g. hashed address)
     */
    getAppliedKey(address) {
        return this.keccakFunction(address);
    }
    /**
     * Checkpoints the current state of the StateManager instance.
     * State changes that follow can then be committed by calling
     * `commit` or `reverted` by calling rollback.
     */
    async checkpoint() {
        this._caches.checkpoint();
    }
    /**
     * Commits the current change-set to the instance since the
     * last call to checkpoint.
     *
     * Partial implementation, called from the subclass.
     */
    async commit() {
        // setup cache checkpointing
        this._caches.account?.commit();
    }
    /**
     * Reverts the current change-set to the instance since the
     * last call to checkpoint.
     *
     * Partial implementation , called from the subclass.
     */
    async revert() {
        this._caches.revert();
    }
    async flush() {
        this._caches.account?.flush();
    }
}
exports.RPCStateManager = RPCStateManager;
class RPCBlockChain {
    constructor(provider) {
        if (provider === undefined || provider === '')
            throw new Error('provider URL is required');
        this.provider = provider;
    }
    async getBlock(blockId) {
        const block = await (0, util_1.fetchFromProvider)(this.provider, {
            method: 'eth_getBlockByNumber',
            params: [(0, util_1.intToHex)(blockId), false],
        });
        return {
            hash: () => (0, util_1.hexToBytes)(block.hash),
        };
    }
    shallowCopy() {
        return this;
    }
}
exports.RPCBlockChain = RPCBlockChain;
//# sourceMappingURL=rpcStateManager.js.map