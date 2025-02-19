import { Common } from '@synthesizer-libs/common';
import { Account } from '@ethereumjs/util';
import { Caches, OriginalStorageCache } from './cache/index.js';
import type { RPCStateManagerOpts } from './index.js';
import type { AccountFields, StateManagerInterface, StorageDump } from '@synthesizer-libs/common';
import type { Address } from '@ethereumjs/util';
import type { Debugger } from 'debug';
export declare class RPCStateManager implements StateManagerInterface {
    protected _provider: string;
    protected _caches: Caches;
    protected _blockTag: string;
    originalStorageCache: OriginalStorageCache;
    protected _debug: Debugger;
    protected DEBUG: boolean;
    private keccakFunction;
    readonly common: Common;
    constructor(opts: RPCStateManagerOpts);
    /**
     * Note that the returned statemanager will share the same JSONRPCProvider as the original
     *
     * @returns RPCStateManager
     */
    shallowCopy(): RPCStateManager;
    /**
     * Sets the new block tag used when querying the provider and clears the
     * internal cache.
     * @param blockTag - the new block tag to use when querying the provider
     */
    setBlockTag(blockTag: bigint | 'earliest'): void;
    /**
     * Clears the internal cache so all accounts, contract code, and storage slots will
     * initially be retrieved from the provider
     */
    clearCaches(): void;
    /**
     * Gets the code corresponding to the provided `address`.
     * @param address - Address to get the `code` for
     * @returns {Promise<Uint8Array>} - Resolves with the code corresponding to the provided address.
     * Returns an empty `Uint8Array` if the account has no associated code.
     */
    getCode(address: Address): Promise<Uint8Array>;
    getCodeSize(address: Address): Promise<number>;
    /**
     * Adds `value` to the state trie as code, and sets `codeHash` on the account
     * corresponding to `address` to reference this.
     * @param address - Address of the `account` to add the `code` for
     * @param value - The value of the `code`
     */
    putCode(address: Address, value: Uint8Array): Promise<void>;
    /**
     * Gets the storage value associated with the provided `address` and `key`. This method returns
     * the shortest representation of the stored value.
     * @param address - Address of the account to get the storage for
     * @param key - Key in the account's storage to get the value for. Must be 32 bytes long.
     * @returns {Uint8Array} - The storage value for the account
     * corresponding to the provided address at the provided key.
     * If this does not exist an empty `Uint8Array` is returned.
     */
    getStorage(address: Address, key: Uint8Array): Promise<Uint8Array>;
    /**
     * Adds value to the cache for the `account`
     * corresponding to `address` at the provided `key`.
     * @param address - Address to set a storage value for
     * @param key - Key to set the value at. Must be 32 bytes long.
     * @param value - Value to set at `key` for account corresponding to `address`.
     * Cannot be more than 32 bytes. Leading zeros are stripped.
     * If it is empty or filled with zeros, deletes the value.
     */
    putStorage(address: Address, key: Uint8Array, value: Uint8Array): Promise<void>;
    /**
     * Clears all storage entries for the account corresponding to `address`.
     * @param address - Address to clear the storage of
     */
    clearStorage(address: Address): Promise<void>;
    /**
     * Dumps the RLP-encoded storage values for an `account` specified by `address`.
     * @param address - The address of the `account` to return storage for
     * @returns {Promise<StorageDump>} - The state of the account as an `Object` map.
     * Keys are the storage keys, values are the storage values as strings.
     * Both are represented as `0x` prefixed hex strings.
     */
    dumpStorage(address: Address): Promise<StorageDump>;
    /**
     * Gets the account associated with `address` or `undefined` if account does not exist
     * @param address - Address of the `account` to get
     */
    getAccount(address: Address): Promise<Account | undefined>;
    /**
     * Retrieves an account from the provider and stores in the local trie
     * @param address Address of account to be retrieved from provider
     * @private
     */
    getAccountFromProvider(address: Address): Promise<Account>;
    /**
     * Saves an account into state under the provided `address`.
     * @param address - Address under which to store `account`
     * @param account - The account to store
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
     * Returns the applied key for a given address
     * Used for saving preimages
     * @param address - The address to return the applied key
     * @returns {Uint8Array} - The applied key (e.g. hashed address)
     */
    getAppliedKey(address: Uint8Array): Uint8Array;
    /**
     * Checkpoints the current state of the StateManager instance.
     * State changes that follow can then be committed by calling
     * `commit` or `reverted` by calling rollback.
     */
    checkpoint(): Promise<void>;
    /**
     * Commits the current change-set to the instance since the
     * last call to checkpoint.
     *
     * Partial implementation, called from the subclass.
     */
    commit(): Promise<void>;
    /**
     * Reverts the current change-set to the instance since the
     * last call to checkpoint.
     *
     * Partial implementation , called from the subclass.
     */
    revert(): Promise<void>;
    flush(): Promise<void>;
    /**
     * @deprecated This method is not used by the RPC State Manager and is a stub required by the State Manager interface
     */
    getStateRoot: () => Promise<Uint8Array>;
    /**
     * @deprecated This method is not used by the RPC State Manager and is a stub required by the State Manager interface
     */
    setStateRoot: (_root: Uint8Array) => Promise<void>;
    /**
     * @deprecated This method is not used by the RPC State Manager and is a stub required by the State Manager interface
     */
    hasStateRoot: () => never;
}
export declare class RPCBlockChain {
    readonly provider: string;
    constructor(provider: string);
    getBlock(blockId: number): Promise<{
        hash: () => Uint8Array;
    }>;
    shallowCopy(): this;
}
//# sourceMappingURL=rpcStateManager.d.ts.map