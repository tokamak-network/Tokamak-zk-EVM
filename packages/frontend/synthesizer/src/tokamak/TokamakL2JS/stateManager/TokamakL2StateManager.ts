import { MerkleStateManager } from "@ethereumjs/statemanager";
import { TokamakL2StateManagerOpts } from "./types.ts";
import { StateManagerInterface } from "@ethereumjs/common";
import { jubjub } from "@noble/curves/misc";
import { IMT, IMTHashFunction, IMTNode } from "@zk-kit/imt"
import { MAX_MT_LEAVES, POSEIDON_INPUTS, poseidon_raw } from "src/tokamak/constant/constants.ts";
import { addHexPrefix, Address, bigIntToBytes, bytesToBigInt, hexToBytes, toBytes } from "@ethereumjs/util";


export class TokamakL2StateManager extends MerkleStateManager implements StateManagerInterface {
    private _cachedOpts: TokamakL2StateManagerOpts | null = null
    private _registeredKeys: Uint8Array[] | null = null
    private _merkleTreeRoot: Uint8Array | undefined = undefined

    public initRegisteredKeys(keys: Uint8Array[]): void {
        if (this._registeredKeys !== null) {
            throw new Error('Cannot rewrite registered keys')
        }
        this._registeredKeys = keys
    }
    public initCachedOpts(opts: TokamakL2StateManagerOpts): void {
        if (this._cachedOpts !== null) {
            throw new Error('Cannot rewrite cached opts')
        }
        this._cachedOpts = opts
    }
    public async getUpdatedMerkleTreeRoot(): Promise<bigint> {
        const merkleTree = await TokamakL2MerkleTree.buildFromTokamakL2StateManager(this)
        const root = merkleTree.root
        if (typeof root === 'bigint') {
            this._merkleTreeRoot = bigIntToBytes(root)
        }
        if (typeof root === 'string') {
            this._merkleTreeRoot = hexToBytes(addHexPrefix(root))
        }
        if (typeof root === 'number') {
            this._merkleTreeRoot = bigIntToBytes(BigInt(root))
        }
        return bytesToBigInt(this._merkleTreeRoot!)
    }

    public get registeredKeys() {return this._registeredKeys}
    public get cachedOpts() {return this._cachedOpts}
    public async convertLeavesIntoMerkleTreeLeaves(): Promise<bigint[]> {
        const contractAddress = new Address(toBytes(this.cachedOpts!.contractAddress))
        const leaves = new Array<bigint>(MAX_MT_LEAVES)
        for (var i = 0; i < MAX_MT_LEAVES; i++) {
            const key = this.registeredKeys![i]
            const val = await this.getStorage(contractAddress, key)
            leaves[i] = poseidon_raw([bytesToBigInt(key), bytesToBigInt(val), 0n, 0n])
        }
        return leaves
    }
}

class TokamakL2MerkleTree extends IMT {
    private _cachedTokamakL2StateManager: TokamakL2StateManager | null = null

    public initCachedTokamakL2StateManager(stateManager: TokamakL2StateManager): void {
        if (this._cachedTokamakL2StateManager !== null) {
            throw new Error('Cannot rewirte cached state manager')
        }
        this._cachedTokamakL2StateManager = stateManager
    }
    public get cachedTokamakL2StateManager() {
        return this._cachedTokamakL2StateManager
    }
    public static async buildFromTokamakL2StateManager(mpt: TokamakL2StateManager): Promise<TokamakL2MerkleTree> {
        const treeDepth = Math.ceil(Math.log10(MAX_MT_LEAVES) / Math.log10(POSEIDON_INPUTS))
        const leaves = await mpt.convertLeavesIntoMerkleTreeLeaves()
        const mt = new TokamakL2MerkleTree(poseidon_raw as IMTHashFunction, treeDepth, 0n, POSEIDON_INPUTS, leaves as IMTNode[])
        mt.initCachedTokamakL2StateManager(mpt)
        return mt
    }
}