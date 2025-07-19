import { LeanIMT } from "@zk-kit/lean-imt";
import { poseidon2 } from "poseidon-bls12381";
import { L1DataBaseBySlot, RawLeavesByL1Addr } from "./MPTManager";
// @ts-ignore
import { getCurveFromName } from "ffjavascript";
import { StateChange, StateDiff } from "./EthereumJsExecutionEngine";
import { toBigInt } from "ethers";

// Type definitions
type RawLeavesByL2Addr = Record<string, { index: number; value: bigint }>;
export type L2DataBaseBySlot = Record<number, RawLeavesByL2Addr>;

// Holds the state before and after a transaction for ZKP generation.
interface PendingState {
    oldRoots: Record<number, bigint>;
    newRoots: Record<number, bigint>;
    oldRawLeaves: L2DataBaseBySlot;
    newRawLeaves: L2DataBaseBySlot;
    newTrees: Record<number, LeanIMT>;
}

export class StateL2 {
    // Current, committed state
    public treesBySlot: Record<number, LeanIMT> = {};
    public dbBySlot: L2DataBaseBySlot = {};
    public rootHistoryBySlot: Record<number, bigint[]> = {};

    // Pending state for the next transaction
    public pending: PendingState | null = null;

    // Configuration
    public field: any;
    public L1ContractAddress: string;
    public storageSlots: number[];
    public blockNumber: number;
    public addrPairsFromL2ToL1: Record<string, string> = {};
    private addrPairsFromL1ToL2: Record<string, string> = {};

    // --- Initialization ---
    private constructor(
        CA: string, slots: number[], blockNumber: number, 
        L1Addrs: string[], L2Addrs: string[], L1DbBySlot: L1DataBaseBySlot, field: any
    ) {
        this.field = field;
        this.L1ContractAddress = CA;
        this.storageSlots = slots;
        this.blockNumber = blockNumber;
        this.pairL1L2Address(L1Addrs, L2Addrs);
        this.conversion(L1DbBySlot);
    }

    public static async build(
        CA: string, slots: number[], blockNumber: number, 
        L1Addrs: string[], L2Addrs: string[], L1DbBySlot: L1DataBaseBySlot
    ): Promise<StateL2> {
        const bls12381 = await getCurveFromName("BLS12381", true);
        return new StateL2(CA, slots, blockNumber, L1Addrs, L2Addrs, L1DbBySlot, bls12381.Fr);
    }

    // --- State Update Workflow ---

    /**
     * [2-A] Calculates the potential new state without committing it.
     * This populates the `pending` property with old/new roots and leaves.
     * @param stateDiff The state changes from the Execution Engine.
     */
    public prepareUpdate(stateDiff: StateDiff) {
        console.log("[L2SM] Preparing state update...");
        const oldRoots: Record<number, bigint> = {};
        const newRoots: Record<number, bigint> = {};
        const oldRawLeaves = JSON.parse(JSON.stringify(this.dbBySlot)); // Deep copy
        const newRawLeaves = JSON.parse(JSON.stringify(this.dbBySlot)); // Deep copy
        const newTrees: Record<number, LeanIMT> = {};

        for (const slot of this.storageSlots) {
            oldRoots[slot] = this.treesBySlot[slot].root;

            // Create a temporary tree to calculate the new root
            const tempTree = new LeanIMT<bigint>((a, b) => poseidon2([a,b]));
            this.treesBySlot[slot].leaves.forEach((leaf: bigint) => tempTree.insert(leaf));

            const changesInSlot = stateDiff.filter((d: StateChange) => d.slot === slot);
            for (const change of changesInSlot) {
                const { l2Addr, newValue } = change;
                const leafInfo = newRawLeaves[slot][l2Addr];
                if (!leafInfo) {
                    throw new Error(`Address ${l2Addr} not found in slot ${slot} for update.`);
                }
                // Update the leaf value in the temporary tree and raw leaves object
                const newRlc = this.RLC(slot, l2Addr, newValue);
                tempTree.update(leafInfo.index, newRlc);
                leafInfo.value = newValue.toString(); // Note: JSON stringify limitation
            }
            newRoots[slot] = tempTree.root;
            newTrees[slot] = tempTree;
        }
        
        // Convert stringified BigInts back to BigInts
        for (const slot in newRawLeaves) {
            for (const addr in newRawLeaves[slot]) {
                newRawLeaves[slot][addr].value = BigInt(newRawLeaves[slot][addr].value);
            }
        }

        this.pending = { oldRoots, newRoots, oldRawLeaves, newRawLeaves, newTrees };
        console.log("[L2SM] State update prepared. Pending roots calculated.");
    }

    /**
     * [3] Commits the pending state changes to the actual Merkle trees.
     */
    public commitUpdate() {
        if (!this.pending) {
            throw new Error("No pending state to commit.");
        }
        console.log("[L2SM] Committing state update...");

        this.dbBySlot = this.pending.newRawLeaves;
        for (const slot of this.storageSlots) {
            this.treesBySlot[slot] = this.pending.newTrees[slot];
            this.rootHistoryBySlot[slot].push(this.pending.newRoots[slot]);
        }

        this.pending = null; // Clear the pending state
        console.log("[L2SM] Commit successful. Merkle roots updated.");
    }

    // --- Helper & Private Methods ---

    private conversion(L1DbBySlot: L1DataBaseBySlot) {
        for (const slot of this.storageSlots) {
            const rawLeavesByL1Addr = L1DbBySlot[slot];
            const rawLeavesByL2Addr: RawLeavesByL2Addr = {};
            const tree = new LeanIMT<bigint>((a, b) => poseidon2([a,b]));

            if (rawLeavesByL1Addr) {
                for (const [L1Addr, val] of Object.entries(rawLeavesByL1Addr)) {
                    const L2Addr = this.addrPairsFromL1ToL2[L1Addr]!;
                    const rlc = this.RLC(slot, L2Addr, val);
                    tree.insert(rlc);
                    const index = tree.indexOf(rlc);
                    rawLeavesByL2Addr[L2Addr] = { index, value: val };
                }
            }
            this.treesBySlot[slot] = tree;
            this.dbBySlot[slot] = rawLeavesByL2Addr;
            this.rootHistoryBySlot[slot] = [tree.root];
        }
    }

    public hash = (a: bigint, b: bigint): bigint => poseidon2([a, b]);

    private RLC(slot: number, L2Addr: string, value: bigint): bigint {
        const fieldToBigInt = (val: Uint8Array): bigint => toBigInt('0x' + this.field.toString(val, 16));
        const L2AddrF = toBigInt(L2Addr);
        const gamma = this.hash(toBigInt(this.rootHistoryBySlot[slot].at(-1)!), L2AddrF);
        return fieldToBigInt(this.field.e(L2AddrF + gamma * value));
    }

    public reconstructL1State(): L1DataBaseBySlot {
        const L1DbBySlot: L1DataBaseBySlot = {};
        for (const slot of this.storageSlots) {
            const rawLeavesByL1Addr: RawLeavesByL1Addr = {};
            for (const [L2Addr, items] of Object.entries(this.dbBySlot[slot])) {
                const L1Addr = this.addrPairsFromL2ToL1[L2Addr];
                rawLeavesByL1Addr[L1Addr] = items.value;
            }
            L1DbBySlot[slot] = rawLeavesByL1Addr;
        }
        return L1DbBySlot;
    }
    
    private pairL1L2Address(L1Addrs: string[], L2Addrs: string[]) {
        if (!this.checkAddressDuplication(L1Addrs, L2Addrs)) {
            throw new Error("Address duplication or length mismatch.");
        }
        for (const [idx, L1Addr] of L1Addrs.entries()) {
            this.addrPairsFromL1ToL2[L1Addr] = L2Addrs[idx];
        }
        for (const [idx, L2Addr] of L2Addrs.entries()) {
            this.addrPairsFromL2ToL1[L2Addr] = L1Addrs[idx];
        }
    }

    private checkAddressDuplication(L1Addrs: string[], L2Addrs: string[]): boolean {
        const L1AddrSet = new Set(L1Addrs);
        if (L1AddrSet.size !== L1Addrs.length) return false;
        const L2AddrSet = new Set(L2Addrs);
        if (L2AddrSet.size !== L2Addrs.length) return false;
        if (L1Addrs.length !== L2Addrs.length) return false;
        return true;
    }
}






