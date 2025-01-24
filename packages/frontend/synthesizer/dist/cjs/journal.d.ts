import { Address } from "@ethereumjs/util/index.js";
import type { Common, StateManagerInterface } from '@ethereumjs/common/dist/esm/index.js';
import type { Account, PrefixedHexString } from "@ethereumjs/util/index.js";
type AddressString = string;
type SlotString = string;
export declare class Journal {
    private stateManager;
    private common;
    private DEBUG;
    private _debug;
    private journal;
    private alwaysWarmJournal;
    private touched;
    private journalDiff;
    private journalHeight;
    accessList?: Map<AddressString, Set<SlotString>>;
    preimages?: Map<PrefixedHexString, Uint8Array>;
    constructor(stateManager: StateManagerInterface, common: Common);
    /**
     * Clears the internal `accessList` map, and mark this journal to start reporting
     * which addresses and storages have been accessed
     */
    startReportingAccessList(): void;
    /**
     * Clears the internal `preimages` map, and marks this journal to start reporting
     * the images (hashed addresses) of the accounts that have been accessed
     */
    startReportingPreimages(): void;
    putAccount(address: Address, account: Account | undefined): Promise<void>;
    deleteAccount(address: Address): Promise<void>;
    private touchAddress;
    private touchAccount;
    commit(): Promise<void>;
    checkpoint(): Promise<void>;
    revert(): Promise<void>;
    cleanJournal(): void;
    /**
     * Removes accounts from the state trie that have been touched,
     * as defined in EIP-161 (https://eips.ethereum.org/EIPS/eip-161).
     * Also cleanups any other internal fields
     */
    cleanup(): Promise<void>;
    addAlwaysWarmAddress(addressStr: string, addToAccessList?: boolean): void;
    addAlwaysWarmSlot(addressStr: string, slotStr: string, addToAccessList?: boolean): void;
    /**
     * Returns true if the address is warm in the current context
     * @param address - The address (as a Uint8Array) to check
     */
    isWarmedAddress(address: Uint8Array): boolean;
    /**
     * Add a warm address in the current context
     * @param addressArr - The address (as a Uint8Array) to check
     */
    addWarmedAddress(addressArr: Uint8Array): void;
    /**
     * Returns true if the slot of the address is warm
     * @param address - The address (as a Uint8Array) to check
     * @param slot - The slot (as a Uint8Array) to check
     */
    isWarmedStorage(address: Uint8Array, slot: Uint8Array): boolean;
    /**
     * Mark the storage slot in the address as warm in the current context
     * @param address - The address (as a Uint8Array) to check
     * @param slot - The slot (as a Uint8Array) to check
     */
    addWarmedStorage(address: Uint8Array, slot: Uint8Array): void;
}
export {};
//# sourceMappingURL=journal.d.ts.map