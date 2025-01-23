import type { Address } from '@ethereumjs/util';
type getStorage = (address: Address, key: Uint8Array) => Promise<Uint8Array>;
/**
 * Helper class to cache original storage values (so values already being present in
 * the pre-state of a call), mainly for correct gas cost calculation in EVM/VM.
 *
 * TODO: Usage of this class is very implicit through the injected `getStorage()`
 * method bound to the calling state manager. It should be examined if there are alternative
 * designs being more transparent and direct along the next breaking release round.
 *
 */
export declare class OriginalStorageCache {
    private map;
    private getStorage;
    constructor(getStorage: getStorage);
    get(address: Address, key: Uint8Array): Promise<Uint8Array>;
    put(address: Address, key: Uint8Array, value: Uint8Array): void;
    clear(): void;
}
export {};
//# sourceMappingURL=originalStorageCache.d.ts.map