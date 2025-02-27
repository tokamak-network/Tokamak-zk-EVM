import { Common } from '@ethereumjs/common';
import { MerklePatriciaTrie } from '@ethereumjs/mpt';
import { Account } from '@ethereumjs/util';
import { OriginalStorageCache } from './cache/index.js';
import { type MerkleStateManagerOpts } from './index.js';
import type { Caches } from './index.js';
import type { AccountFields, StateManagerInterface, StorageDump, StorageRange } from '@ethereumjs/common';
import type { Address, DB } from '@ethereumjs/util';
import type { Debugger } from 'debug';
/**
 * Prefix to distinguish between a contract deployed with code `0x80`
 * and `RLP([])` (also having the value `0x80`).
 *
 * Otherwise the creation of the code hash for the `0x80` contract
 * will be the same as the hash of the empty trie which leads to
 * misbehaviour in the underlying trie library.
 */
export declare const CODEHASH_PREFIX: Uint8Array;
/**
 * Default StateManager implementation for the VM.
 *
 * The state manager abstracts from the underlying data store
 * by providing higher level access to accounts, contract code
 * and storage slots.
 *
 * The default state manager implementation uses a
 * `@ethereumjs/mpt` trie as a data backend.
 *
 * Note that there is a `SimpleStateManager` dependency-free state
 * manager implementation available shipped with the `@ethereumjs/statemanager`
 * package which might be an alternative to this implementation
 * for many basic use cases.
 */
export declare class MerkleStateManager implements StateManagerInterface {
    protected _debug: Debugger;
    protected _caches?: Caches;
    originalStorageCache: OriginalStorageCache;
    protected _trie: MerklePatriciaTrie;
    protected _storageTries: {
        [key: string]: MerklePatriciaTrie;
    };
    protected readonly _prefixCodeHashes: boolean;
    protected readonly _prefixStorageTrieKeys: boolean;
    readonly common: Common;
    protected _checkpointCount: number;
    private keccakFunction;
    /**
     * StateManager is run in DEBUG mode (default: false)
     * Taken from DEBUG environment variable
     *
     * Safeguards on debug() calls are added for
     * performance reasons to avoid string literal evaluation
     * @hidden
     */
    protected readonly DEBUG: boolean;
    /**
     * Instantiate the StateManager interface.
     */
    constructor(opts?: MerkleStateManagerOpts);
    /**
     * Gets the account associated with `address` or `undefined` if account does not exist
     * @param address - Address of the `account` to get
     */
    getAccount(address: Address): Promise<Account | undefined>;
    /**
     * Saves an account into state under the provided `address`.
     * @param address - Address under which to store `account`
     * @param account - The account to store or undefined if to be deleted
     */
    putAccount(address: Address, account: Account | undefined): Promise<void>;
    /**
     * Gets the account associated with `address`, modifies the given account
     * fields, then saves the account into state. Account fields can include
     * `nonce`, `balance`, `storageRoot`, and `codeHash`.
     * @param address - Address of the account to modify
     * @param accountFields - Object containing account fields and values to modify
     */
    modifyAccountFields(address: Address, accountFields: AccountFields): Promise<void>;
    /**
     * Deletes an account from state under the provided `address`.
     * @param address - Address of the account which should be deleted
     */
    deleteAccount(address: Address): Promise<void>;
    /**
     * Adds `value` to the state trie as code, and sets `codeHash` on the account
     * corresponding to `address` to reference this.
     * @param address - Address of the `account` to add the `code` for
     * @param value - The value of the `code`
     */
    putCode(address: Address, value: Uint8Array): Promise<void>;
    /**
     * Gets the code corresponding to the provided `address`.
     * @param address - Address to get the `code` for
     * @returns {Promise<Uint8Array>} -  Resolves with the code corresponding to the provided address.
     * Returns an empty `Uint8Array` if the account has no associated code.
     */
    getCode(address: Address): Promise<Uint8Array>;
    getCodeSize(address: Address): Promise<number>;
    /**
     * Gets the storage trie for the EVM-internal account identified by the provided address/hash.
     * If the storage trie is not in the local cache ('this._storageTries'),
     *   generates a new storage trie object based on a lookup (shallow copy from 'this._trie'),
     *   applies the storage root of the provided rootAccount (or an
     *   empty trie root if no rootAccount is provided), and stores the new entry
     *   in the local cache.
     * @param addressOrHash Address (or other object) with populated 'bytes', or a raw Uint8Array.
     *   Used to identify the requested storage trie in the local cache and define the
     *   prefix used when creating a new storage trie.
     * @param  rootAccount (Optional) Account object whose 'storageRoot' is to be used as
     *   the root of the new storageTrie returned when there is no pre-existing trie.
     *   If left undefined, the EMPTY_TRIE_ROOT will be used as the root instead.
     * @returns storage MerklePatriciaTrie object
     * @private
     */
    protected _getStorageTrie(addressOrHash: Address | {
        bytes: Uint8Array;
    } | Uint8Array, rootAccount?: Account): MerklePatriciaTrie;
    /**
     * Gets the storage trie for an account from the storage
     * cache or does a lookup.
     * @private
     */
    protected _getAccountTrie(): MerklePatriciaTrie;
    /**
     * Gets the storage trie for an account from the storage
     * cache or does a lookup.
     * @private
     */
    protected _getCodeDB(): DB;
    /**
     * Gets the storage value associated with the provided `address` and `key`. This method returns
     * the shortest representation of the stored value.
     * @param address -  Address of the account to get the storage for
     * @param key - Key in the account's storage to get the value for. Must be 32 bytes long.
     * @returns - The storage value for the account
     * corresponding to the provided address at the provided key.
     * If this does not exist an empty `Uint8Array` is returned.
     */
    getStorage(address: Address, key: Uint8Array): Promise<Uint8Array>;
    /**
     * Modifies the storage trie of an account.
     * @private
     * @param address -  Address of the account whose storage is to be modified
     * @param modifyTrie - Function to modify the storage trie of the account
     */
    protected _modifyContractStorage(address: Address, account: Account, modifyTrie: (storageTrie: MerklePatriciaTrie, done: Function) => void): Promise<void>;
    protected _writeContractStorage(address: Address, account: Account, key: Uint8Array, value: Uint8Array): Promise<void>;
    /**
     * Adds value to the state trie for the `account`
     * corresponding to `address` at the provided `key`.
     * @param address -  Address to set a storage value for
     * @param key - Key to set the value at. Must be 32 bytes long.
     * @param value - Value to set at `key` for account corresponding to `address`.
     * Cannot be more than 32 bytes. Leading zeros are stripped.
     * If it is a empty or filled with zeros, deletes the value.
     */
    putStorage(address: Address, key: Uint8Array, value: Uint8Array): Promise<void>;
    /**
     * Clears all storage entries for the account corresponding to `address`.
     * @param address - Address to clear the storage of
     */
    clearStorage(address: Address): Promise<void>;
    /**
     * Checkpoints the current state of the StateManager instance.
     * State changes that follow can then be committed by calling
     * `commit` or `reverted` by calling rollback.
     */
    checkpoint(): Promise<void>;
    /**
     * Commits the current change-set to the instance since the
     * last call to checkpoint.
     */
    commit(): Promise<void>;
    /**
     * Reverts the current change-set to the instance since the
     * last call to checkpoint.
     */
    revert(): Promise<void>;
    /**
     * Writes all cache items to the trie
     */
    flush(): Promise<void>;
    /**
     * Gets the state-root of the Merkle-Patricia trie representation
     * of the state of this StateManager. Will error if there are uncommitted
     * checkpoints on the instance.
     * @returns {Promise<Uint8Array>} - Returns the state-root of the `StateManager`
     */
    getStateRoot(): Promise<Uint8Array>;
    /**
     * Sets the state of the instance to that represented
     * by the provided `stateRoot`. Will error if there are uncommitted
     * checkpoints on the instance or if the state root does not exist in
     * the state trie.
     * @param stateRoot - The state-root to reset the instance to
     */
    setStateRoot(stateRoot: Uint8Array, clearCache?: boolean): Promise<void>;
    /**
     * Dumps the RLP-encoded storage values for an `account` specified by `address`.
     * @param address - The address of the `account` to return storage for
     * @returns {Promise<StorageDump>} - The state of the account as an `Object` map.
     * Keys are are the storage keys, values are the storage values as strings.
     * Both are represented as hex strings without the `0x` prefix.
     */
    dumpStorage(address: Address): Promise<StorageDump>;
    /**
     Dumps a limited number of RLP-encoded storage values for an account specified by `address`,
     starting from `startKey` or greater.
     @param address - The address of the `account` to return storage for.
     @param startKey - The bigint representation of the smallest storage key that will be returned.
     @param limit - The maximum number of storage values that will be returned.
     @returns {Promise<StorageRange>} - A {@link StorageRange} object that will contain at most `limit` entries in its `storage` field.
     The object will also contain `nextKey`, the next (hashed) storage key after the range included in `storage`.
     */
    dumpStorageRange(address: Address, startKey: bigint, limit: number): Promise<StorageRange>;
    /**
     * Initializes the provided genesis state into the state trie.
     * Will error if there are uncommitted checkpoints on the instance.
     * @param initState address -> balance | [balance, code, storage]
     */
    generateCanonicalGenesis(initState: any): Promise<void>;
    /**
     * Checks whether there is a state corresponding to a stateRoot
     */
    hasStateRoot(root: Uint8Array): Promise<boolean>;
    /**
     * Copies the current instance of the `StateManager`
     * at the last fully committed point, i.e. as if all current
     * checkpoints were reverted.
     *
     * Caches are downleveled (so: adopted for short-term usage)
     * by default.
     *
     * This means in particular:
     * 1. For caches instantiated as an LRU cache type
     * the copy() method will instantiate with an ORDERED_MAP cache
     * instead, since copied instances are mostly used in
     * short-term usage contexts and LRU cache instantiation would create
     * a large overhead here.
     * 2. The underlying trie object is initialized with 0 cache size
     *
     * Both adoptions can be deactivated by setting `downlevelCaches` to
     * `false`.
     *
     * Cache values are generally not copied along regardless of the
     * `downlevelCaches` setting.
     */
    shallowCopy(downlevelCaches?: boolean): MerkleStateManager;
    /**
     * Clears all underlying caches
     */
    clearCaches(): void;
    /**
     * Returns the applied key for a given address
     * Used for saving preimages
     * @param address - The address to return the applied key
     * @returns {Uint8Array} - The applied key (e.g. hashed address)
     */
    getAppliedKey(address: Uint8Array): Uint8Array;
}
//# sourceMappingURL=merkleStateManager.d.ts.map