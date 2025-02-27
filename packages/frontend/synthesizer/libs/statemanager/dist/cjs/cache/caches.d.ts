<<<<<<< HEAD
import { AccountCache } from './account.js';
import { CodeCache } from './code.js';
import { StorageCache } from './storage.js';
import { type CachesStateManagerOpts } from './types.js';
import type { CacheOpts } from './types.js';
import type { Address } from '@ethereumjs/util';
export declare class Caches {
    account?: AccountCache;
    code?: CodeCache;
    storage?: StorageCache;
    settings: Record<'account' | 'code' | 'storage', CacheOpts>;
    constructor(opts?: CachesStateManagerOpts);
    checkpoint(): void;
    clear(): void;
    commit(): void;
    deleteAccount(address: Address): void;
    shallowCopy(downlevelCaches: boolean): Caches | undefined;
    revert(): void;
}
=======
import { AccountCache } from './account.js';
import { CodeCache } from './code.js';
import { StorageCache } from './storage.js';
import { type CachesStateManagerOpts } from './types.js';
import type { CacheOpts } from './types.js';
import type { Address } from '@synthesizer-libs/util';
export declare class Caches {
    account?: AccountCache;
    code?: CodeCache;
    storage?: StorageCache;
    settings: Record<'account' | 'code' | 'storage', CacheOpts>;
    constructor(opts?: CachesStateManagerOpts);
    checkpoint(): void;
    clear(): void;
    commit(): void;
    deleteAccount(address: Address): void;
    shallowCopy(downlevelCaches: boolean): Caches | undefined;
    revert(): void;
}
>>>>>>> 603bf51d9e02a58183fabb7f7fd08e9580ceef44
//# sourceMappingURL=caches.d.ts.map