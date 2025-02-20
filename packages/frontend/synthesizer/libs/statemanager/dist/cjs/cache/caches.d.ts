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
//# sourceMappingURL=caches.d.ts.map