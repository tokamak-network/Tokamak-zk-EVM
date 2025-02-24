import { Account } from '@synthesizer-libs/util';
import { OriginalStorageCache } from './cache/index.js';
import type { Caches } from './cache/index.js';
import type { StatelessVerkleStateManagerOpts } from './index.js';
import type { MerkleStateManager } from './merkleStateManager.js';
import type { AccountFields, StateManagerInterface, VerkleAccessWitnessInterface, VerkleAccessedStateWithAddress } from '@synthesizer-libs/common';
import type { Address, PrefixedHexString, VerkleCrypto, VerkleExecutionWitness } from '@synthesizer-libs/util';
import type { Debugger } from 'debug';
/**
 * Stateless Verkle StateManager implementation for the VM.
 *
 * Experimental.
 *
 * This State Manager enables stateless block execution by building a
 * temporary (1-block) state from the verkle block witness.
 * The Stateless Verkle State Manager then uses that populated state
 * to fetch data requested by the the VM.
 *
 */
export declare class StatelessVerkleStateManager implements StateManagerInterface {
    _cachedStateRoot?: Uint8Array;
    originalStorageCache: OriginalStorageCache;
    verkleCrypto: VerkleCrypto;
    protected _caches?: Caches;
    protected _debug: Debugger;
    /**
     * StateManager is run in DEBUG mode (default: false)
     * Taken from DEBUG environment variable
     *
     * Safeguards on this._debug() calls are added for
     * performance reasons to avoid string literal evaluation
     * @hidden
     */
    protected readonly DEBUG: boolean;
    private _blockNum;
    private _executionWitness?;
    private _proof;
    private _state;
    private _postState;
    private _preState;
    private _checkpoints;
    private keccakFunction;
    /**
     * Instantiate the StateManager interface.
     */
    constructor(opts: StatelessVerkleStateManagerOpts);
    getTransitionStateRoot(_: MerkleStateManager, __: Uint8Array): Promise<Uint8Array>;
    initVerkleExecutionWitness(blockNum: bigint, executionWitness?: VerkleExecutionWitness | null): void;
    checkChunkWitnessPresent(address: Address, codeOffset: number): Promise<boolean>;
    /**
     * Copies the current instance of the `StateManager`
     * at the last fully committed point, i.e. as if all current
     * checkpoints were reverted.
     */
    shallowCopy(downlevelCaches?: boolean): StatelessVerkleStateManager;
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
     * Gets the storage value associated with the provided `address` and `key`. This method returns
     * the shortest representation of the stored value.
     * @param address -  Address of the account to get the storage for
     * @param key - Key in the account's storage to get the value for. Must be 32 bytes long.
     * @returns {Promise<Uint8Array>} - The storage value for the account
     * corresponding to the provided address at the provided key.
     * If this does not exist an empty `Uint8Array` is returned.
     */
    getStorage(address: Address, key: Uint8Array): Promise<Uint8Array>;
    /**
     * Adds value to the state for the `account`
     * corresponding to `address` at the provided `key`.
     * @param address -  Address to set a storage value for
     * @param key - Key to set the value at. Must be 32 bytes long.
     * @param value - Value to set at `key` for account corresponding to `address`. Cannot be more than 32 bytes. Leading zeros are stripped. If it is a empty or filled with zeros, deletes the value.
     */
    putStorage(address: Address, key: Uint8Array, value: Uint8Array): Promise<void>;
    /**
     * Clears all storage entries for the account corresponding to `address`.
     * @param address -  Address to clear the storage of
     */
    clearStorage(address: Address): Promise<void>;
    getAccount(address: Address): Promise<Account | undefined>;
    putAccount(address: Address, account: Account): Promise<void>;
    /**
     * Deletes an account from state under the provided `address`.
     * @param address - Address of the account which should be deleted
     */
    deleteAccount(address: Address): Promise<void>;
    modifyAccountFields(address: Address, accountFields: AccountFields): Promise<void>;
    verifyPostState(accessWitness: VerkleAccessWitnessInterface): Promise<boolean>;
    getComputedValue(accessedState: VerkleAccessedStateWithAddress): PrefixedHexString | null;
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
    hasStateRoot(_: Uint8Array): Promise<boolean>;
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
     * Gets the cache state root.
     * This is used to persist the stateRoot between blocks, so that blocks can retrieve the stateRoot of the parent block.
     * This is required to verify and prove verkle execution witnesses.
     * @returns {Promise<Uint8Array>} - Returns the cached state root
     */
    getStateRoot(): Promise<Uint8Array>;
    /**
     * Sets the cache state root.
     * This is used to persist the stateRoot between blocks, so that blocks can retrieve the stateRoot of the parent block.
     * @param stateRoot - The stateRoot to set
     */
    setStateRoot(stateRoot: Uint8Array): Promise<void>;
    /**
     * Clears all underlying caches
     */
    clearCaches(): void;
    generateCanonicalGenesis(_initState: any): Promise<void>;
}
//# sourceMappingURL=statelessVerkleStateManager.d.ts.map