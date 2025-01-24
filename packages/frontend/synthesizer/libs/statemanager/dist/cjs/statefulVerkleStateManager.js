"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatefulVerkleStateManager = void 0;
const common_1 = require("@ethereumjs/common");
const rlp_1 = require("@ethereumjs/rlp");
const util_1 = require("@ethereumjs/util");
const verkle_1 = require("@ethereumjs/verkle");
const debug_1 = require("debug");
const keccak_js_1 = require("ethereum-cryptography/keccak.js");
const originalStorageCache_js_1 = require("./cache/originalStorageCache.js");
const util_js_1 = require("./util.js");
const ZEROVALUE = '0x0000000000000000000000000000000000000000000000000000000000000000';
class StatefulVerkleStateManager {
    constructor(opts) {
        // Post-state provided from the executionWitness.
        // Should not update. Used for comparing our computed post-state with the canonical one.
        this._postState = {};
        this._preState = {};
        /**
         * StateManager is run in DEBUG mode (default: false)
         * Taken from DEBUG environment variable
         *
         * Safeguards on debug() calls are added for
         * performance reasons to avoid string literal evaluation
         * @hidden
         */
        this.DEBUG = false;
        /**
         * Gets the account associated with `address` or `undefined` if account does not exist
         * @param address - Address of the `account` to get
         */
        this.getAccount = async (address) => {
            const elem = this._caches?.account?.get(address);
            if (elem !== undefined) {
                return elem.accountRLP !== undefined
                    ? (0, util_1.createPartialAccountFromRLP)(elem.accountRLP)
                    : undefined;
            }
            const stem = (0, util_1.getVerkleStem)(this.verkleCrypto, address, 0);
            // First retrieve the account "header" values from the trie
            const accountValues = await this._trie.get(stem, [
                util_1.VerkleLeafType.BasicData,
                util_1.VerkleLeafType.CodeHash,
            ]);
            let account;
            if (accountValues[0] !== undefined) {
                const basicData = (0, util_1.decodeVerkleLeafBasicData)(accountValues[0]);
                account = (0, util_1.createPartialAccount)({
                    version: basicData.version,
                    balance: basicData.balance,
                    nonce: basicData.nonce,
                    // Codehash is either untouched (i.e. undefined) or deleted (i.e. overwritten with zeros)
                    codeHash: accountValues[1] === undefined || (0, util_1.equalsBytes)(accountValues[1], new Uint8Array(32))
                        ? util_1.KECCAK256_NULL
                        : accountValues[1],
                    codeSize: basicData.codeSize,
                    storageRoot: util_1.KECCAK256_NULL, // TODO: Add storage stuff
                });
            }
            else if (accountValues[1] === undefined) {
                // account does not exist if both basic fields and codehash are undefined
                if (this.DEBUG) {
                    this._debug(`getAccount address=${address.toString()} from DB (non-existent)`);
                }
                this._caches?.account?.put(address, account);
            }
            if (this.DEBUG) {
                this._debug(`getAccount address=${address.toString()} stem=${(0, util_1.short)(stem)}`);
            }
            return account;
        };
        /**
         * Saves an account into state under the provided `address`.
         * @param address - Address under which to store `account`
         * @param account - The account to store or undefined if to be deleted
         */
        this.putAccount = async (address, account) => {
            if (this.DEBUG) {
                this._debug(`putAccount address=${address} nonce=${account?.nonce} balance=${account?.balance} contract=${account && account.isContract() ? 'yes' : 'no'} empty=${account && account.isEmpty() ? 'yes' : 'no'}`);
            }
            if (this._caches?.account === undefined) {
                if (account !== undefined) {
                    const stem = (0, util_1.getVerkleStem)(this.verkleCrypto, address, 0);
                    const basicDataBytes = (0, util_1.encodeVerkleLeafBasicData)(account);
                    await this._trie.put(stem, [util_1.VerkleLeafType.BasicData, util_1.VerkleLeafType.CodeHash], [basicDataBytes, account.codeHash]);
                }
                else {
                    // Delete account
                    await this.deleteAccount(address);
                }
            }
            else {
                if (account !== undefined) {
                    this._caches?.account?.put(address, account, true);
                }
                else {
                    this._caches?.account?.del(address);
                }
            }
        };
        /**
         * Deletes an account from state under the provided `address`.
         * @param address - Address of the account which should be deleted
         */
        this.deleteAccount = async (address) => {
            if (this.DEBUG) {
                this._debug(`Delete account ${address}`);
            }
            this._caches?.deleteAccount(address);
            if (this._caches?.account === undefined) {
                const stem = (0, util_1.getVerkleStem)(this.verkleCrypto, address);
                // TODO: Determine the best way to clear code/storage for an account when deleting
                // Will need to inspect all possible code and storage keys to see if it's anything
                // other than untouched leaf values
                // Special instance where we delete the account and revert the trie value to untouched
                await this._trie.put(stem, [util_1.VerkleLeafType.BasicData, util_1.VerkleLeafType.CodeHash], [verkle_1.LeafVerkleNodeValue.Untouched, verkle_1.LeafVerkleNodeValue.Untouched]);
            }
        };
        this.modifyAccountFields = async (address, accountFields) => {
            //@ts-ignore
            await (0, util_js_1.modifyAccountFields)(this, address, accountFields);
        };
        this.putCode = async (address, value) => {
            if (this.DEBUG) {
                this._debug(`putCode address=${address.toString()} value=${(0, util_1.short)(value)}`);
            }
            this._caches?.code?.put(address, value);
            const codeHash = (0, keccak_js_1.keccak256)(value);
            if ((0, util_1.equalsBytes)(codeHash, util_1.KECCAK256_NULL)) {
                // If the code hash is the null hash, no code has to be stored
                return;
            }
            if ((await this.getAccount(address)) === undefined) {
                await this.putAccount(address, new util_1.Account());
            }
            if (this.DEBUG) {
                this._debug(`Update codeHash (-> ${(0, util_1.short)(codeHash)}) for account ${address}`);
            }
            const codeChunks = (0, util_1.chunkifyCode)(value);
            const chunkStems = await (0, util_1.generateCodeStems)(codeChunks.length, address, this.verkleCrypto);
            const chunkSuffixes = (0, util_1.generateChunkSuffixes)(codeChunks.length);
            // Put the code chunks corresponding to the first stem (up to 128 chunks)
            await this._trie.put(chunkStems[0], chunkSuffixes.slice(0, codeChunks.length <= util_1.VERKLE_CODE_OFFSET ? codeChunks.length : util_1.VERKLE_CODE_OFFSET), codeChunks.slice(0, codeChunks.length <= util_1.VERKLE_CODE_OFFSET ? codeChunks.length : util_1.VERKLE_CODE_OFFSET));
            // Put additional chunks under additional stems as applicable
            for (let stem = 1; stem < chunkStems.length; stem++) {
                const sliceStart = util_1.VERKLE_CODE_OFFSET + util_1.VERKLE_NODE_WIDTH * (stem - 1);
                const sliceEnd = value.length <= util_1.VERKLE_CODE_OFFSET + util_1.VERKLE_NODE_WIDTH * stem
                    ? value.length
                    : util_1.VERKLE_CODE_OFFSET + util_1.VERKLE_NODE_WIDTH * stem;
                await this._trie.put(chunkStems[stem], chunkSuffixes.slice(sliceStart, sliceEnd), codeChunks.slice(sliceStart, sliceEnd));
            }
            await this.modifyAccountFields(address, { codeHash, codeSize: value.length });
        };
        this.getCode = async (address) => {
            if (this.DEBUG) {
                this._debug(`getCode address=${address.toString()}`);
            }
            const elem = this._caches?.code?.get(address);
            if (elem !== undefined) {
                return elem.code ?? new Uint8Array(0);
            }
            const account = await this.getAccount(address);
            if (!account) {
                return new Uint8Array(0);
            }
            if (!account.isContract()) {
                return new Uint8Array(0);
            }
            // allocate the code
            const codeSize = account.codeSize;
            const stems = await (0, util_1.generateCodeStems)(Math.ceil(codeSize / util_1.VERKLE_CODE_CHUNK_SIZE), address, this.verkleCrypto);
            const chunkSuffixes = (0, util_1.generateChunkSuffixes)(Math.ceil(codeSize / util_1.VERKLE_CODE_CHUNK_SIZE));
            const chunksByStem = new Array(stems.length);
            // Retrieve the code chunks stored in the first leaf node
            chunksByStem[0] = await this._trie.get(stems[0], chunkSuffixes.slice(0, codeSize <= util_1.VERKLE_CODE_OFFSET ? codeSize : util_1.VERKLE_CODE_OFFSET));
            // Retrieve code chunks on any additional stems
            for (let stem = 1; stem < stems.length; stem++) {
                const sliceStart = util_1.VERKLE_CODE_OFFSET + util_1.VERKLE_NODE_WIDTH * (stem - 1);
                const sliceEnd = codeSize <= util_1.VERKLE_CODE_OFFSET + util_1.VERKLE_NODE_WIDTH * stem
                    ? codeSize
                    : util_1.VERKLE_CODE_OFFSET + util_1.VERKLE_NODE_WIDTH * stem;
                chunksByStem[stem] = await this._trie.get(stems[stem], chunkSuffixes.slice(sliceStart, sliceEnd));
            }
            const chunks = chunksByStem.flat();
            const code = new Uint8Array(codeSize);
            // Insert code chunks into final array (skipping PUSHDATA overflow indicator byte)
            for (let x = 0; x < chunks.length; x++) {
                if (chunks[x] === undefined)
                    throw new Error(`expected code chunk at ID ${x}, got undefined`);
                // Determine code ending byte (if we're on the last chunk)
                let sliceEnd = 32;
                if (x === chunks.length - 1) {
                    sliceEnd = (codeSize % util_1.VERKLE_CODE_CHUNK_SIZE) + 1;
                }
                code.set(chunks[x].slice(1, sliceEnd), code.byteOffset + x * util_1.VERKLE_CODE_CHUNK_SIZE);
            }
            this._caches?.code?.put(address, code);
            return code;
        };
        this.getCodeSize = async (address) => {
            const accountBytes = (await this._trie.get((0, util_1.getVerkleStem)(this.verkleCrypto, address), [util_1.VerkleLeafType.BasicData]))[0];
            if (accountBytes === undefined)
                return 0;
            return (0, util_1.decodeVerkleLeafBasicData)(accountBytes).codeSize;
        };
        this.getStorage = async (address, key) => {
            if (key.length !== 32) {
                throw new Error('Storage key must be 32 bytes long');
            }
            const cachedValue = this._caches?.storage?.get(address, key);
            if (cachedValue !== undefined) {
                const decoded = rlp_1.RLP.decode(cachedValue ?? new Uint8Array(0));
                return decoded;
            }
            const account = await this.getAccount(address);
            if (!account) {
                return new Uint8Array();
            }
            const storageKey = await (0, util_1.getVerkleTreeKeyForStorageSlot)(address, (0, util_1.bytesToBigInt)(key, true), this.verkleCrypto);
            const value = await this._trie.get(storageKey.slice(0, 31), [storageKey[31]]);
            this._caches?.storage?.put(address, key, value[0] ?? (0, util_1.hexToBytes)('0x80'));
            const decoded = rlp_1.RLP.decode(value[0] ?? new Uint8Array(0));
            return decoded;
        };
        this.putStorage = async (address, key, value) => {
            value = (0, util_1.unpadBytes)(value);
            this._caches?.storage?.put(address, key, rlp_1.RLP.encode(value));
            if (this._caches?.storage === undefined) {
                const storageKey = await (0, util_1.getVerkleTreeKeyForStorageSlot)(address, (0, util_1.bytesToBigInt)(key, true), this.verkleCrypto);
                await this._trie.put(storageKey.slice(0, 31), [storageKey[31]], [rlp_1.RLP.encode(value)]);
            }
        };
        this.clearStorage = async (address) => {
            // TODO: Determine if it's possible to clear the actual slots in the trie
            // since the EIP doesn't seem to state how to handle this
            // The main concern I have is that we have no way of identifying all storage slots
            // for a given account so we can't correctly update the trie's root hash
            // (since presumably "clearStorage" would imply writing over all of the storage slots with zeros)
            // Also, do we still need a storageRoot? - presumably not since we don't have separate storage tries
            this._caches?.storage?.clearStorage(address);
        };
        this.checkpoint = async () => {
            this._trie.checkpoint();
            this._caches?.checkpoint();
            this._checkpointCount++;
        };
        this.commit = async () => {
            await this._trie.commit();
            this._caches?.commit();
            this._checkpointCount--;
            if (this._checkpointCount === 0) {
                await this.flush();
                this.originalStorageCache.clear();
            }
            if (this.DEBUG) {
                this._debug(`state checkpoint committed`);
            }
        };
        this.revert = async () => {
            await this._trie.revert();
            this._caches?.revert();
            this._checkpointCount--;
            if (this._checkpointCount === 0) {
                await this.flush();
                this.originalStorageCache.clear();
            }
        };
        this.flush = async () => {
            const codeItems = this._caches?.code?.flush() ?? [];
            for (const item of codeItems) {
                const addr = (0, util_1.createAddressFromString)(`0x${item[0]}`);
                const code = item[1].code;
                if (code === undefined) {
                    continue;
                }
                await this.putCode(addr, code);
            }
            const storageItems = this._caches?.storage?.flush() ?? [];
            for (const item of storageItems) {
                const address = (0, util_1.createAddressFromString)(`0x${item[0]}`);
                const keyHex = item[1];
                const keyBytes = (0, util_1.unprefixedHexToBytes)(keyHex);
                const value = item[2];
                const decoded = rlp_1.RLP.decode(value ?? new Uint8Array(0));
                const account = await this.getAccount(address);
                if (account) {
                    await this.putStorage(address, keyBytes, decoded);
                }
            }
            const accountItems = this._caches?.account?.flush() ?? [];
            for (const item of accountItems) {
                const address = (0, util_1.createAddressFromString)(`0x${item[0]}`);
                const elem = item[1];
                if (elem.accountRLP === undefined) {
                    await this.deleteAccount(address);
                }
                else {
                    const account = (0, util_1.createPartialAccountFromRLP)(elem.accountRLP);
                    await this.putAccount(address, account);
                }
            }
        };
        // Skip DEBUG calls unless 'ethjs' included in environmental DEBUG variables
        // Additional window check is to prevent vite browser bundling (and potentially other) to break
        this.DEBUG =
            typeof window === 'undefined' ? (process?.env?.DEBUG?.includes('ethjs') ?? false) : false;
        this._checkpointCount = 0;
        if (opts.common?.isActivatedEIP(6800) === false)
            throw new Error('EIP-6800 required for verkle state management');
        this.common = opts.common ?? new common_1.Common({ chain: common_1.Mainnet, eips: [6800] });
        this._trie =
            opts.trie ??
                new verkle_1.VerkleTree({
                    verkleCrypto: opts.verkleCrypto,
                    db: new util_1.MapDB(),
                    useRootPersistence: false,
                    cacheSize: 0,
                });
        this._debug = (0, debug_1.default)('statemanager:verkle:stateful');
        this.originalStorageCache = new originalStorageCache_js_1.OriginalStorageCache(this.getStorage.bind(this));
        this._caches = opts.caches;
        this.keccakFunction = opts.common?.customCrypto.keccak256 ?? keccak_js_1.keccak256;
        this.verkleCrypto = opts.verkleCrypto;
    }
    initVerkleExecutionWitness(_blockNum, executionWitness) {
        if (executionWitness === null || executionWitness === undefined) {
            const errorMsg = `Invalid executionWitness=${executionWitness} for initVerkleExecutionWitness`;
            this._debug(errorMsg);
            throw Error(errorMsg);
        }
        // Populate the pre-state and post-state from the executionWitness
        const preStateRaw = executionWitness.stateDiff.flatMap(({ stem, suffixDiffs }) => {
            const suffixDiffPairs = suffixDiffs.map(({ currentValue, suffix }) => {
                const key = `${stem}${(0, util_1.padToEven)(Number(suffix).toString(16))}`;
                return {
                    [key]: currentValue,
                };
            });
            return suffixDiffPairs;
        });
        // also maintain a separate preState unaffected by any changes in _state
        this._preState = preStateRaw.reduce((prevValue, currentValue) => {
            const acc = { ...prevValue, ...currentValue };
            return acc;
        }, {});
        const postStateRaw = executionWitness.stateDiff.flatMap(({ stem, suffixDiffs }) => {
            const suffixDiffPairs = suffixDiffs.map(({ newValue, currentValue, suffix }) => {
                const key = `${stem}${(0, util_1.padToEven)(Number(suffix).toString(16))}`;
                // A postState value of null means there was no change from the preState.
                // In this implementation, we therefore replace null with the preState.
                const value = newValue ?? currentValue;
                return {
                    [key]: value,
                };
            });
            return suffixDiffPairs;
        });
        const postState = postStateRaw.reduce((prevValue, currentValue) => {
            const acc = { ...prevValue, ...currentValue };
            return acc;
        }, {});
        this._postState = postState;
        this._debug('initVerkleExecutionWitness postState', this._postState);
    }
    async getComputedValue(accessedState) {
        const { address, type } = accessedState;
        switch (type) {
            case common_1.VerkleAccessedStateType.BasicData: {
                if (this._caches === undefined) {
                    const accountData = await this.getAccount(address);
                    if (accountData === undefined) {
                        return null;
                    }
                    const basicDataBytes = (0, util_1.encodeVerkleLeafBasicData)(accountData);
                    return (0, util_1.bytesToHex)(basicDataBytes);
                }
                else {
                    const encodedAccount = this._caches?.account?.get(address)?.accountRLP;
                    this._debug(`we have encoded account ${encodedAccount}`);
                    if (encodedAccount === undefined) {
                        return null;
                    }
                    const basicDataBytes = (0, util_1.encodeVerkleLeafBasicData)((0, util_1.createPartialAccountFromRLP)(encodedAccount));
                    return (0, util_1.bytesToHex)(basicDataBytes);
                }
            }
            case common_1.VerkleAccessedStateType.CodeHash: {
                if (this._caches === undefined) {
                    const accountData = await this.getAccount(address);
                    if (accountData === undefined) {
                        return null;
                    }
                    return (0, util_1.bytesToHex)(accountData.codeHash);
                }
                else {
                    const encodedAccount = this._caches?.account?.get(address)?.accountRLP;
                    if (encodedAccount === undefined) {
                        return null;
                    }
                    return (0, util_1.bytesToHex)((0, util_1.createPartialAccountFromRLP)(encodedAccount).codeHash);
                }
            }
            case common_1.VerkleAccessedStateType.Code: {
                const { codeOffset } = accessedState;
                let code = null;
                if (this._caches === undefined) {
                    code = await this.getCode(address);
                    if (code === undefined) {
                        return null;
                    }
                }
                else {
                    code = this._caches?.code?.get(address)?.code;
                    if (code === undefined) {
                        return null;
                    }
                }
                // we can only compare the actual code because to compare the first byte would
                // be very tricky and impossible in certain scenarios like when the previous code chunk
                // was not accessed and hence not even provided in the witness
                return (0, util_1.bytesToHex)((0, util_1.setLengthRight)(code.slice(codeOffset, codeOffset + util_1.VERKLE_CODE_CHUNK_SIZE), util_1.VERKLE_CODE_CHUNK_SIZE));
            }
            case common_1.VerkleAccessedStateType.Storage: {
                const { slot } = accessedState;
                const key = (0, util_1.setLengthLeft)((0, util_1.bigIntToBytes)(slot), 32);
                let storage = null;
                if (this._caches === undefined) {
                    storage = await this.getStorage(address, key);
                    if (storage === undefined) {
                        return null;
                    }
                }
                else {
                    storage = this._caches?.storage?.get(address, key);
                }
                if (storage === undefined) {
                    return null;
                }
                return (0, util_1.bytesToHex)((0, util_1.setLengthLeft)(storage, 32));
            }
        }
    }
    // Verifies that the witness post-state matches the computed post-state
    async verifyPostState(accessWitness) {
        // track what all chunks were accessed so as to compare in the end if any chunks were missed
        // in access while comparing against the provided poststate in the execution witness
        const accessedChunks = new Map();
        // switch to false if postVerify fails
        let postFailures = 0;
        for (const accessedState of accessWitness?.accesses() ?? []) {
            const { address, type } = accessedState;
            let extraMeta = '';
            if (accessedState.type === common_1.VerkleAccessedStateType.Code) {
                extraMeta = `codeOffset=${accessedState.codeOffset}`;
            }
            else if (accessedState.type === common_1.VerkleAccessedStateType.Storage) {
                extraMeta = `slot=${accessedState.slot}`;
            }
            const { chunkKey } = accessedState;
            accessedChunks.set(chunkKey, true);
            const computedValue = await this.getComputedValue(accessedState);
            if (computedValue === undefined) {
                this.DEBUG &&
                    this._debug(`Block accesses missing in canonical address=${address} type=${type} ${extraMeta} chunkKey=${chunkKey}`);
                postFailures++;
                continue;
            }
            let canonicalValue = this._postState[chunkKey];
            if (canonicalValue === undefined) {
                this.DEBUG &&
                    this._debug(`Block accesses missing in canonical address=${address} type=${type} ${extraMeta} chunkKey=${chunkKey}`);
                postFailures++;
                continue;
            }
            // if the access type is code, then we can't match the first byte because since the computed value
            // doesn't has the first byte for push data since previous chunk code itself might not be available
            if (accessedState.type === common_1.VerkleAccessedStateType.Code) {
                // computedValue = computedValue !== null ? `0x${computedValue.slice(4)}` : null
                canonicalValue = canonicalValue !== null ? `0x${canonicalValue.slice(4)}` : null;
            }
            else if (accessedState.type === common_1.VerkleAccessedStateType.Storage &&
                canonicalValue === null &&
                computedValue === ZEROVALUE) {
                canonicalValue = ZEROVALUE;
            }
            if (computedValue !== canonicalValue) {
                if (type === common_1.VerkleAccessedStateType.BasicData) {
                    this.DEBUG &&
                        this._debug(`canonical value: `, canonicalValue === null
                            ? null
                            : (0, util_1.decodeVerkleLeafBasicData)((0, util_1.hexToBytes)(canonicalValue)));
                    this.DEBUG &&
                        this._debug(`computed value: `, computedValue === null ? null : (0, util_1.decodeVerkleLeafBasicData)((0, util_1.hexToBytes)(computedValue)));
                }
                this.DEBUG &&
                    this._debug(`Block accesses mismatch address=${address} type=${type} ${extraMeta} chunkKey=${chunkKey}`);
                this.DEBUG && this._debug(`expected=${canonicalValue}`);
                this.DEBUG && this._debug(`computed=${computedValue}`);
                postFailures++;
            }
        }
        for (const canChunkKey of Object.keys(this._postState)) {
            if (accessedChunks.get(canChunkKey) === undefined) {
                this.DEBUG && this._debug(`Missing chunk access for canChunkKey=${canChunkKey}`);
                postFailures++;
            }
        }
        const verifyPassed = postFailures === 0;
        this.DEBUG &&
            this._debug(`verifyPostState verifyPassed=${verifyPassed} postFailures=${postFailures}`);
        return verifyPassed;
    }
    getStateRoot() {
        return Promise.resolve(this._trie.root());
    }
    setStateRoot(stateRoot, clearCache) {
        this._trie.root(stateRoot);
        clearCache === true && this.clearCaches();
        return Promise.resolve();
    }
    hasStateRoot(_root) {
        throw new Error('Method not implemented.');
    }
    dumpStorage(_address) {
        throw new Error('Method not implemented.');
    }
    dumpStorageRange(_address, _startKey, _limit) {
        throw new Error('Method not implemented.');
    }
    clearCaches() {
        this._caches?.clear();
    }
    shallowCopy(_downlevelCaches) {
        throw new Error('Method not implemented.');
    }
    async checkChunkWitnessPresent(_address, _codeOffset) {
        throw new Error('Method not implemented.');
    }
}
exports.StatefulVerkleStateManager = StatefulVerkleStateManager;
//# sourceMappingURL=statefulVerkleStateManager.js.map