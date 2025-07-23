import { LeanIMT } from "@zk-kit/lean-imt";
import { poseidon2 } from "poseidon-bls12381";
import { MPT } from "./MPTManager";
// @ts-ignore
import { getCurveFromName } from "ffjavascript";
import { StateChange, StateDiff } from "./EthereumJsExecutionEngine";
import { toBigInt } from "ethers";
import { addHexPrefix, Address, bytesToBigInt, concatBytes, createAddressFromString } from "@ethereumjs/util";
import { pairL1L2Address } from "./utils";
import { HeaderData } from "@ethereumjs/block";
import { MerkleStateManager } from "@ethereumjs/statemanager";

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

type RootBySlot = Record<number, bigint>

export class MT {
    // Current, committed state
    public rootSequence: Record<number, string[]> = {}

    public blockNumber: number
    public blockHeaderData: HeaderData = {}
    public contractAddress: Address
    public slots: number[]
    public addrPairsFromL2toL1: Map<string, Address> = new Map()
    public addrPairsFromL1ToL2: Map<string, Address> = new Map()
    public rootHistoryByNonce: Record<number, RootBySlot> = {}
    private _treesBySlot: Record<number, LeanIMT> = {}
    private _field: any
    private _nonce: number
    

    /**
   * @deprecated Use the static factory methods 
   */
    private constructor(
        blockNumber: number, 
        ca: Address, 
        slots: number[],
        addrPairFromL2ToL1: Map<string, Address>,
        addrPairFromL1ToL2: Map<string, Address>, 
        field: any,
    ) {
        this._field = field
        this.contractAddress = ca
        this.slots = slots
        this.blockNumber = blockNumber
        this.addrPairsFromL2toL1 = addrPairFromL2ToL1
        this.addrPairsFromL1ToL2 = addrPairFromL1ToL2
        this._nonce = 0
    }

    public static async buildFromMPT(
        mpt: MPT
    ): Promise<MT> {
        const bls12381 = await getCurveFromName("BLS12381", true)
        const mt = new MT(mpt.blockNumber , mpt.contractAddress, mpt.slots, mpt.addrPairsFromL1ToL2, mpt.addrPairsFromL1ToL2, bls12381.Fr)
        const rootBySlot: RootBySlot = await mt.fetchMPT(mpt)
        mt.rootHistoryByNonce[mt._nonce] = {...rootBySlot}
        return mt
    }

    public async simulateUpdatedMPT(mpt: MPT): Promise<MT> {
        const simulated_mt = structuredClone(this)
        const rootBySlot: RootBySlot = await simulated_mt.fetchMPT(mpt)
        simulated_mt._nonce ++
        simulated_mt.rootHistoryByNonce[simulated_mt._nonce] = {...rootBySlot}
        return simulated_mt
    }

    public applySimulatedMT(simulated_mt: MT) {
        this._nonce = simulated_mt._nonce
        this._treesBySlot = structuredClone(simulated_mt._treesBySlot)
        this.rootHistoryByNonce = structuredClone(simulated_mt.rootHistoryByNonce)
    }

    private async fetchMPT(mpt: MPT): Promise<RootBySlot> {
        const rootBySlot: RootBySlot = {}
        for (const slot of this.slots) {
            const leaves: bigint[] = []
            for (const L1Addr in this.addrPairsFromL1ToL2) {
                const valBytes = await mpt.getStorage(slot, L1Addr)
                let L2Addr: Address
                if (this.addrPairsFromL1ToL2.has(L1Addr)) {
                    L2Addr = this.addrPairsFromL1ToL2.get(L1Addr)!
                } else {
                    throw new Error('Error while fetching MT')
                }
                const L2AddrStr = L2Addr.toString()
                const leaf = this.RLC(slot, L2AddrStr, bytesToBigInt(valBytes))
                leaves.push(leaf) 
            }
            this._treesBySlot[slot].insertMany(leaves)
            rootBySlot[slot] = this._treesBySlot[slot].root
        }
        return rootBySlot
    }

    public hash = (a: bigint, b: bigint): bigint => poseidon2([a, b]);

    private RLC(slot: number, L2Addr: string, value: bigint): bigint {
        const fieldToBigInt = (val: Uint8Array): bigint => toBigInt('0x' + this._field.toString(val, 16))
        const L2AddrF = toBigInt(L2Addr)
        const prevRoot = this._nonce == 0 ? slot : this.rootHistoryByNonce[this._nonce - 1][slot]
        const gamma = this.hash(toBigInt(prevRoot), L2AddrF)
        return fieldToBigInt(this._field.e(L2AddrF + gamma * value))
    }
    
}






