import { LeanIMT } from "@zk-kit/lean-imt";
import { poseidon2 } from "poseidon-bls12381";
import { MPT } from "./MPTManager";
// @ts-ignore
import { getCurveFromName } from "ffjavascript";
import { toBigInt } from "ethers";
import { addHexPrefix, Address, bytesToBigInt, concatBytes, createAddressFromString } from "@ethereumjs/util";
import { HeaderData } from "@ethereumjs/block";
import { MerkleStateManager } from "@ethereumjs/statemanager";
import { L1Address, L2Address, RootSequencesBySlot } from "./types";
import { L2hash } from "./utils";



export class MT {
    public blockNumber: number
    public blockHeaderData: HeaderData = {}
    public contractAddress: L1Address
    public contractSlots: number[]
    public userSlots: number[]
    public addrPairsFromL2toL1: Map<string, L1Address> = new Map()
    public addrPairsFromL1ToL2: Map<string, L2Address> = new Map()
    public userStorageRootSequenceBySlot: RootSequencesBySlot = {}
    private _userStorageBySlot: Record<number, LeanIMT> = {}
    private _field: any
    private _nonce: number
    

    /**
   * @deprecated Use the static factory methods 
   */
    private constructor(
        blockNumber: number, 
        ca: L1Address, 
        contractSlots: number[],
        userSlots: number[],
        addrPairFromL2ToL1: Map<string, L1Address>,
        addrPairFromL1ToL2: Map<string, L2Address>, 
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
        for (const userSlot of this.userSlots) {
            this.userStorageRootSequenceBySlot[userSlot] = []
        }
    }

    public static async buildFromMPT(mpt: MPT): Promise<MT> {
        const bls12381 = await getCurveFromName("BLS12381", true)
        const mt = new MT(mpt.blockNumber , mpt.contractAddress, mpt.contractSlots, mpt.userSlots, mpt.addrPairsFromL1ToL2, mpt.addrPairsFromL1ToL2, bls12381.Fr)
        await mt.fetchMPT(mpt)
        return mt
    }

    public async simulateUpdatedMPT(mpts: MPT[]): Promise<MT> {
        const simulatedMt = await MT.buildFromMPT(mpts[0])
        for (let idx = 1; idx < mpts.length; idx++){
            await simulatedMt.fetchMPT(mpts[idx])
        }
        return simulatedMt
    }

    private async fetchMPT(mpt: MPT): Promise<void> {
        for (const slot of this.userSlots) {
            if (this._nonce !== this.userStorageRootSequenceBySlot[slot].length) {
                throw new Error('Mismatch between the nonce and the root sequence length in MT')
            }
            const leaves: bigint[] = []
            for (const L1Addr of this.addrPairsFromL1ToL2.keys()) {
                const valBytes = await mpt.getStorage(slot, L1Addr)
                let L2Addr: L2Address
                if (this.addrPairsFromL1ToL2.has(L1Addr)) {
                    L2Addr = this.addrPairsFromL1ToL2.get(L1Addr)!
                } else {
                    throw new Error('Error while fetching MT')
                }
                const L2AddrStr = L2Addr.toString()
                const leaf = this.RLCForUserStorage(slot, L2AddrStr, bytesToBigInt(valBytes))
                leaves.push(leaf) 
            }
            this._userStorageBySlot[slot] = new LeanIMT<bigint>(L2hash, leaves)
            this.userStorageRootSequenceBySlot[slot].push(this._userStorageBySlot[slot].root)
            this._nonce++
        }

        // const leaves: bigint[] = []
        // for (const slot of this.contractSlots) {
        //     const valBytes = await mpt.getStorage(slot)
        //     const leaf = this.RLCForContractStorage(slot, bytesToBigInt(valBytes))
        //     leaves.push(leaf) 
        // }
        // this._contractStorage = new LeanIMT<bigint>(L2hash, leaves)
    }

    private RLCForUserStorage(slot: number, L2Addr: string, value: bigint): bigint {
        const fieldToBigInt = (val: Uint8Array): bigint => toBigInt('0x' + this._field.toString(val, 16))
        const L2AddrF = toBigInt(L2Addr)
        const prevRoot = this._nonce == 0 ? slot : this.userStorageRootSequenceBySlot[slot][this._nonce - 1]
        const gamma = L2hash(toBigInt(prevRoot), L2AddrF)
        return fieldToBigInt(this._field.e(L2AddrF + gamma * value))
    }

    private RLCForContractStorage(slot: number, value: bigint): bigint {
        const fieldToBigInt = (val: Uint8Array): bigint => toBigInt('0x' + this._field.toString(val, 16))
        const gamma = L2hash(toBigInt(slot), 0n)
        return fieldToBigInt(this._field.e(toBigInt(slot) + gamma * value))
    }
    
}






