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


type RootBySlot = Record<number, bigint>

export class MT {
    public blockNumber: number
    public blockHeaderData: HeaderData = {}
    public contractAddress: Address
    public contractSlots: number[]
    public userSlots: number[]
    public addrPairsFromL2toL1: Map<string, Address> = new Map()
    public addrPairsFromL1ToL2: Map<string, Address> = new Map()
    public userStorageRootsByNonce: Record<number, RootBySlot> = {}
    public hash = (a: bigint, b: bigint): bigint => poseidon2([a, b])
    private _userStorageBySlot: Record<number, LeanIMT> = {}
    private _contractStorage: LeanIMT = new LeanIMT<bigint>(this.hash)
    private _field: any
    private _nonce: number
    

    /**
   * @deprecated Use the static factory methods 
   */
    private constructor(
        blockNumber: number, 
        ca: Address, 
        contractSlots: number[],
        userSlots: number[],
        addrPairFromL2ToL1: Map<string, Address>,
        addrPairFromL1ToL2: Map<string, Address>, 
        field: any,
    ) {
        this._field = field
        this.contractAddress = ca
        this.contractSlots = contractSlots
        this.userSlots = userSlots
        this.blockNumber = blockNumber
        this.addrPairsFromL2toL1 = addrPairFromL2ToL1
        this.addrPairsFromL1ToL2 = addrPairFromL1ToL2
        this._nonce = 0
    }

    public static async buildFromMPT(
        mpt: MPT
    ): Promise<MT> {
        const bls12381 = await getCurveFromName("BLS12381", true)
        const mt = new MT(mpt.blockNumber , mpt.contractAddress, mpt.contractSlots, mpt.userSlots, mpt.addrPairsFromL1ToL2, mpt.addrPairsFromL1ToL2, bls12381.Fr)
        const rootBySlot: RootBySlot = await mt.fetchMPT(mpt)
        mt.userStorageRootsByNonce[mt._nonce] = {...rootBySlot}
        return mt
    }

    public async simulateUpdatedMPT(mpt: MPT): Promise<MT> {
        const simulated_mt = structuredClone(this)
        const rootBySlot: RootBySlot = await simulated_mt.fetchMPT(mpt)
        simulated_mt._nonce ++
        simulated_mt.userStorageRootsByNonce[simulated_mt._nonce] = {...rootBySlot}
        return simulated_mt
    }

    public applySimulatedMT(simulated_mt: MT) {
        this._nonce = simulated_mt._nonce
        this._userStorageBySlot = structuredClone(simulated_mt._userStorageBySlot)
        this._userStorageBySlot = structuredClone(simulated_mt._userStorageBySlot)
    }

    private async fetchMPT(mpt: MPT): Promise<RootBySlot> {
        const rootBySlot: RootBySlot = {}
        for (const slot of this.userSlots) {
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
                const leaf = this.RLCForUserStorage(slot, L2AddrStr, bytesToBigInt(valBytes))
                leaves.push(leaf) 
            }
            this._userStorageBySlot[slot] = new LeanIMT<bigint>(this.hash, leaves)
            rootBySlot[slot] = this._userStorageBySlot[slot].root
        }

        const leaves: bigint[] = []
        for (const slot of this.contractSlots) {
            const valBytes = await mpt.getStorage(slot)
            const leaf = this.RLCForContractStorage(slot, bytesToBigInt(valBytes))
            leaves.push(leaf) 
        }
        this._contractStorage.insertMany(leaves)
        return rootBySlot
    }

    private RLCForUserStorage(slot: number, L2Addr: string, value: bigint): bigint {
        const fieldToBigInt = (val: Uint8Array): bigint => toBigInt('0x' + this._field.toString(val, 16))
        const L2AddrF = toBigInt(L2Addr)
        const prevRoot = this._nonce == 0 ? slot : this.userStorageRootsByNonce[this._nonce - 1][slot]
        const gamma = this.hash(toBigInt(prevRoot), L2AddrF)
        return fieldToBigInt(this._field.e(L2AddrF + gamma * value))
    }

    private RLCForContractStorage(slot: number, value: bigint): bigint {
        const fieldToBigInt = (val: Uint8Array): bigint => toBigInt('0x' + this._field.toString(val, 16))
        const gamma = this.hash(toBigInt(slot), 0n)
        return fieldToBigInt(this._field.e(toBigInt(slot) + gamma * value))
    }
    
}






