"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Journal = void 0;
const index_js_1 = require("@ethereumjs/common/dist/esm/index.js");
const index_js_2 = require("@ethereumjs/util/index.js");
const debug_1 = require("debug");
const utils_1 = require("ethereum-cryptography/utils");
class Journal {
    constructor(stateManager, common) {
        // Skip DEBUG calls unless 'ethjs' included in environmental DEBUG variables
        // Additional window check is to prevent vite browser bundling (and potentially other) to break
        this.DEBUG =
            typeof window === 'undefined' ? (process?.env?.DEBUG?.includes('ethjs') ?? false) : false;
        this._debug = (0, debug_1.default)('evm:journal');
        // TODO maybe call into this.clearJournal
        this.cleanJournal();
        this.journalHeight = 0;
        this.stateManager = stateManager;
        this.common = common;
    }
    /**
     * Clears the internal `accessList` map, and mark this journal to start reporting
     * which addresses and storages have been accessed
     */
    startReportingAccessList() {
        this.accessList = new Map();
    }
    /**
     * Clears the internal `preimages` map, and marks this journal to start reporting
     * the images (hashed addresses) of the accounts that have been accessed
     */
    startReportingPreimages() {
        this.preimages = new Map();
    }
    async putAccount(address, account) {
        this.touchAddress(address);
        return this.stateManager.putAccount(address, account);
    }
    async deleteAccount(address) {
        this.touchAddress(address);
        await this.stateManager.deleteAccount(address);
    }
    touchAddress(address) {
        const str = address.toString().slice(2);
        this.touchAccount(str);
    }
    touchAccount(address) {
        // If preimages are being reported, add the address to the preimages map
        if (this.preimages !== undefined) {
            const bytesAddress = (0, index_js_2.unprefixedHexToBytes)(address);
            if (this.stateManager.getAppliedKey === undefined) {
                throw new Error('touchAccount: stateManager.getAppliedKey can not be undefined if preimage storing is enabled');
            }
            const hashedKey = this.stateManager.getAppliedKey(bytesAddress);
            this.preimages.set((0, index_js_2.bytesToHex)(hashedKey), bytesAddress);
        }
        if (!this.touched.has(address)) {
            this.touched.add(address);
            const diffArr = this.journalDiff[this.journalDiff.length - 1][1];
            diffArr[2].add(address);
        }
    }
    async commit() {
        this.journalHeight--;
        this.journalDiff.push([this.journalHeight, [new Set(), new Map(), new Set()]]);
        await this.stateManager.commit();
    }
    async checkpoint() {
        this.journalHeight++;
        this.journalDiff.push([this.journalHeight, [new Set(), new Map(), new Set()]]);
        await this.stateManager.checkpoint();
    }
    async revert() {
        // Loop backwards over the journal diff and stop if we are at a lower height than current journal height
        // During this process, delete all items.
        // TODO check this logic, if there is this array: height [4,3,4] and we revert height 4, then the final
        // diff arr will be reverted, but it will stop at height 3, so [4,3] are both not reverted..?
        let finalI;
        for (let i = this.journalDiff.length - 1; i >= 0; i--) {
            finalI = i;
            const [height, diff] = this.journalDiff[i];
            if (height < this.journalHeight) {
                break;
            }
            const addressSet = diff[0];
            const slotsMap = diff[1];
            const touchedSet = diff[2];
            for (const address of addressSet) {
                // Sanity check, journal should have the item
                if (this.journal.has(address)) {
                    this.journal.delete(address);
                }
            }
            for (const [address, delSlots] of slotsMap) {
                // Sanity check, the address SHOULD be in the journal
                if (this.journal.has(address)) {
                    const slots = this.journal.get(address);
                    for (const delSlot of delSlots) {
                        slots.delete(delSlot);
                    }
                }
            }
            for (const address of touchedSet) {
                // Delete the address from the journal
                if (address !== index_js_2.RIPEMD160_ADDRESS_STRING) {
                    // If RIPEMD160 is touched, keep it touched.
                    // Default behavior for others.
                    this.touched.delete(address);
                }
            }
        }
        // the final diffs are reverted and we can dispose those
        this.journalDiff = this.journalDiff.slice(0, finalI + 1);
        this.journalHeight--;
        await this.stateManager.revert();
    }
    cleanJournal() {
        this.journalHeight = 0;
        this.journal = new Map();
        this.alwaysWarmJournal = new Map();
        this.touched = new Set();
        this.journalDiff = [[0, [new Set(), new Map(), new Set()]]];
    }
    /**
     * Removes accounts from the state trie that have been touched,
     * as defined in EIP-161 (https://eips.ethereum.org/EIPS/eip-161).
     * Also cleanups any other internal fields
     */
    async cleanup() {
        if (this.common.gteHardfork(index_js_1.Hardfork.SpuriousDragon)) {
            for (const addressHex of this.touched) {
                const address = new index_js_2.Address((0, utils_1.hexToBytes)(`0x${addressHex}`));
                const account = await this.stateManager.getAccount(address);
                if (account === undefined || account.isEmpty()) {
                    await this.deleteAccount(address);
                    if (this.DEBUG) {
                        this._debug(`Cleanup touched account address=${address} (>= SpuriousDragon)`);
                    }
                }
            }
        }
        this.cleanJournal();
        delete this.accessList;
        delete this.preimages;
    }
    addAlwaysWarmAddress(addressStr, addToAccessList = false) {
        const address = (0, index_js_2.stripHexPrefix)(addressStr);
        if (!this.alwaysWarmJournal.has(address)) {
            this.alwaysWarmJournal.set(address, new Set());
        }
        if (addToAccessList && this.accessList !== undefined) {
            if (!this.accessList.has(address)) {
                this.accessList.set(address, new Set());
            }
        }
    }
    addAlwaysWarmSlot(addressStr, slotStr, addToAccessList = false) {
        const address = (0, index_js_2.stripHexPrefix)(addressStr);
        this.addAlwaysWarmAddress(address, addToAccessList);
        const slotsSet = this.alwaysWarmJournal.get(address);
        const slot = (0, index_js_2.stripHexPrefix)(slotStr);
        slotsSet.add(slot);
        if (addToAccessList && this.accessList !== undefined) {
            this.accessList.get(address).add(slot);
        }
    }
    /**
     * Returns true if the address is warm in the current context
     * @param address - The address (as a Uint8Array) to check
     */
    isWarmedAddress(address) {
        const addressHex = (0, index_js_2.bytesToUnprefixedHex)(address);
        const warm = this.journal.has(addressHex) || this.alwaysWarmJournal.has(addressHex);
        return warm;
    }
    /**
     * Add a warm address in the current context
     * @param addressArr - The address (as a Uint8Array) to check
     */
    addWarmedAddress(addressArr) {
        const address = (0, index_js_2.bytesToUnprefixedHex)(addressArr);
        if (!this.journal.has(address)) {
            this.journal.set(address, new Set());
            const diffArr = this.journalDiff[this.journalDiff.length - 1][1];
            diffArr[0].add(address);
        }
        if (this.accessList !== undefined) {
            if (!this.accessList.has(address)) {
                this.accessList.set(address, new Set());
            }
        }
    }
    /**
     * Returns true if the slot of the address is warm
     * @param address - The address (as a Uint8Array) to check
     * @param slot - The slot (as a Uint8Array) to check
     */
    isWarmedStorage(address, slot) {
        const addressHex = (0, index_js_2.bytesToUnprefixedHex)(address);
        const slots = this.journal.get(addressHex);
        if (slots === undefined) {
            if (this.alwaysWarmJournal.has(addressHex)) {
                return this.alwaysWarmJournal.get(addressHex).has((0, index_js_2.bytesToUnprefixedHex)(slot));
            }
            return false;
        }
        if (slots.has((0, index_js_2.bytesToUnprefixedHex)(slot))) {
            return true;
        }
        else if (this.alwaysWarmJournal.has(addressHex)) {
            return this.alwaysWarmJournal.get(addressHex).has((0, index_js_2.bytesToUnprefixedHex)(slot));
        }
        return false;
    }
    /**
     * Mark the storage slot in the address as warm in the current context
     * @param address - The address (as a Uint8Array) to check
     * @param slot - The slot (as a Uint8Array) to check
     */
    addWarmedStorage(address, slot) {
        const addressHex = (0, index_js_2.bytesToUnprefixedHex)(address);
        let slots = this.journal.get(addressHex);
        if (slots === undefined) {
            this.addWarmedAddress(address);
            slots = this.journal.get(addressHex);
        }
        const slotStr = (0, index_js_2.bytesToUnprefixedHex)(slot);
        if (!slots.has(slotStr)) {
            slots.add(slotStr);
            const diff = this.journalDiff[this.journalDiff.length - 1][1];
            const addressSlotMap = diff[1];
            if (!addressSlotMap.has(addressHex)) {
                addressSlotMap.set(addressHex, new Set());
            }
            const slotsSet = addressSlotMap.get(addressHex);
            slotsSet.add(slotStr);
        }
        if (this.accessList !== undefined) {
            // Note: in `addWarmedAddress` the address is added to warm addresses
            const addrSet = this.accessList.get(addressHex);
            addrSet.add(slotStr);
        }
    }
}
exports.Journal = Journal;
//# sourceMappingURL=journal.js.map