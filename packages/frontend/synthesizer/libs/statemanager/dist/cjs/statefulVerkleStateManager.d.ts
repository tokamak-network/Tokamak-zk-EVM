import { Common } from '@ethereumjs/common';
import { Account, type Address } from '@ethereumjs/util';
import { VerkleTree } from '@ethereumjs/verkle';
import { OriginalStorageCache } from './cache/originalStorageCache.js';
import type { Caches } from './cache/caches.js';
import type { StatefulVerkleStateManagerOpts } from './types.js';
import type { AccountFields, StateManagerInterface, StorageDump, StorageRange, VerkleAccessWitnessInterface, VerkleAccessedStateWithAddress } from '@ethereumjs/common';
import type { PrefixedHexString, VerkleCrypto, VerkleExecutionWitness } from '@ethereumjs/util';
import type { Debugger } from 'debug';
export declare class StatefulVerkleStateManager implements StateManagerInterface {
    protected _debug: Debugger;
    protected _caches?: Caches;
    originalStorageCache: OriginalStorageCache;
    verkleCrypto: VerkleCrypto;
    protected _trie: VerkleTree;
    readonly common: Common;
    protected _checkpointCount: number;
    private _postState;
    private _preState;
    /**
     * StateManager is run in DEBUG mode (default: false)
     * Taken from DEBUG environment variable
     *
     * Safeguards on debug() calls are added for
     * performance reasons to avoid string literal evaluation
     * @hidden
     */
    protected readonly DEBUG: boolean;
    private keccakFunction;
    constructor(opts: StatefulVerkleStateManagerOpts);
    /**
     * Gets the account associated with `address` or `undefined` if account does not exist
     * @param address - Address of the `account` to get
     */
    getAccount: (address: Address) => Promise<Account | undefined>;
    initVerkleExecutionWitness(_blockNum: bigint, executionWitness?: VerkleExecutionWitness | null): void;
    /**
     * Saves an account into state under the provided `address`.
     * @param address - Address under which to store `account`
     * @param account - The account to store or undefined if to be deleted
     */
    putAccount: (address: Address, account?: Account) => Promise<void>;
    /**
     * Deletes an account from state under the provided `address`.
     * @param address - Address of the account which should be deleted
     */
    deleteAccount: (address: Address) => Promise<void>;
    modifyAccountFields: (address: Address, accountFields: AccountFields) => Promise<void>;
    putCode: (address: Address, value: Uint8Array) => Promise<void>;
    getCode: (address: Address) => Promise<Uint8Array>;
    getCodeSize: (address: Address) => Promise<number>;
    getStorage: (address: Address, key: Uint8Array) => Promise<Uint8Array>;
    putStorage: (address: Address, key: Uint8Array, value: Uint8Array) => Promise<void>;
    clearStorage: (address: Address) => Promise<void>;
    checkpoint: () => Promise<void>;
    commit: () => Promise<void>;
    revert: () => Promise<void>;
    flush: () => Promise<void>;
    getComputedValue(accessedState: VerkleAccessedStateWithAddress): Promise<PrefixedHexString | null>;
    verifyPostState(accessWitness: VerkleAccessWitnessInterface): Promise<boolean>;
    getStateRoot(): Promise<Uint8Array>;
    setStateRoot(stateRoot: Uint8Array, clearCache?: boolean): Promise<void>;
    hasStateRoot(_root: Uint8Array): Promise<boolean>;
    dumpStorage?(_address: Address): Promise<StorageDump>;
    dumpStorageRange?(_address: Address, _startKey: bigint, _limit: number): Promise<StorageRange>;
    clearCaches(): void;
    shallowCopy(_downlevelCaches?: boolean): StateManagerInterface;
    checkChunkWitnessPresent(_address: Address, _codeOffset: number): Promise<boolean>;
}
//# sourceMappingURL=statefulVerkleStateManager.d.ts.map