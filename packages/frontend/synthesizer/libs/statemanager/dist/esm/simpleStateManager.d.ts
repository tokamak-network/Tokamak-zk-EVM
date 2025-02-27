<<<<<<< HEAD
import { Account } from '@ethereumjs/util';
import type { SimpleStateManagerOpts } from './index.js';
import type { AccountFields, Common, StateManagerInterface } from '@ethereumjs/common';
import type { Address, PrefixedHexString } from '@ethereumjs/util';
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
export declare class SimpleStateManager implements StateManagerInterface {
    accountStack: Map<PrefixedHexString, Account | undefined>[];
    codeStack: Map<PrefixedHexString, Uint8Array>[];
    storageStack: Map<string, Uint8Array>[];
    originalStorageCache: {
        get(address: Address, key: Uint8Array): Promise<Uint8Array>;
        clear(): void;
    };
    readonly common?: Common;
    constructor(opts?: SimpleStateManagerOpts);
    protected topAccountStack(): Map<`0x${string}`, Account | undefined>;
    protected topCodeStack(): Map<`0x${string}`, Uint8Array>;
    protected topStorageStack(): Map<string, Uint8Array>;
    protected checkpointSync(): void;
    getAccount(address: Address): Promise<Account | undefined>;
    putAccount(address: Address, account?: Account | undefined): Promise<void>;
    deleteAccount(address: Address): Promise<void>;
    modifyAccountFields(address: Address, accountFields: AccountFields): Promise<void>;
    getCode(address: Address): Promise<Uint8Array>;
    putCode(address: Address, value: Uint8Array): Promise<void>;
    getCodeSize(address: Address): Promise<number>;
    getStorage(address: Address, key: Uint8Array): Promise<Uint8Array>;
    putStorage(address: Address, key: Uint8Array, value: Uint8Array): Promise<void>;
    clearStorage(): Promise<void>;
    checkpoint(): Promise<void>;
    commit(): Promise<void>;
    revert(): Promise<void>;
    flush(): Promise<void>;
    clearCaches(): void;
    shallowCopy(): StateManagerInterface;
    getStateRoot(): Promise<Uint8Array>;
    setStateRoot(): Promise<void>;
    hasStateRoot(): Promise<boolean>;
}
=======
import { Account } from '@synthesizer-libs/util';
import type { SimpleStateManagerOpts } from './index.js';
import type { AccountFields, Common, StateManagerInterface } from '@synthesizer-libs/common';
import type { Address, PrefixedHexString } from '@synthesizer-libs/util';
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
 * have a look at the `@synthesizer-libs/statemanager` package.
 */
export declare class SimpleStateManager implements StateManagerInterface {
    accountStack: Map<PrefixedHexString, Account | undefined>[];
    codeStack: Map<PrefixedHexString, Uint8Array>[];
    storageStack: Map<string, Uint8Array>[];
    originalStorageCache: {
        get(address: Address, key: Uint8Array): Promise<Uint8Array>;
        clear(): void;
    };
    readonly common?: Common;
    constructor(opts?: SimpleStateManagerOpts);
    protected topAccountStack(): Map<`0x${string}`, Account | undefined>;
    protected topCodeStack(): Map<`0x${string}`, Uint8Array>;
    protected topStorageStack(): Map<string, Uint8Array>;
    protected checkpointSync(): void;
    getAccount(address: Address): Promise<Account | undefined>;
    putAccount(address: Address, account?: Account | undefined): Promise<void>;
    deleteAccount(address: Address): Promise<void>;
    modifyAccountFields(address: Address, accountFields: AccountFields): Promise<void>;
    getCode(address: Address): Promise<Uint8Array>;
    putCode(address: Address, value: Uint8Array): Promise<void>;
    getCodeSize(address: Address): Promise<number>;
    getStorage(address: Address, key: Uint8Array): Promise<Uint8Array>;
    putStorage(address: Address, key: Uint8Array, value: Uint8Array): Promise<void>;
    clearStorage(): Promise<void>;
    checkpoint(): Promise<void>;
    commit(): Promise<void>;
    revert(): Promise<void>;
    flush(): Promise<void>;
    clearCaches(): void;
    shallowCopy(): StateManagerInterface;
    getStateRoot(): Promise<Uint8Array>;
    setStateRoot(): Promise<void>;
    hasStateRoot(): Promise<boolean>;
}
>>>>>>> 603bf51d9e02a58183fabb7f7fd08e9580ceef44
//# sourceMappingURL=simpleStateManager.d.ts.map