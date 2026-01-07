import { MerkleStateManager } from "@ethereumjs/statemanager";
import { StateSnapshot, TokamakL2StateManagerOpts } from "./types.ts";
import { StateManagerInterface } from "@ethereumjs/common";
import { IMT, IMTHashFunction, IMTMerkleProof, IMTNode } from "@zk-kit/imt"
import { addHexPrefix, Address, bigIntToBytes, bytesToBigInt, bytesToHex, createAccount, hexToBigInt, hexToBytes, toBytes } from "@ethereumjs/util";
import { MAX_MT_LEAVES, MT_DEPTH, POSEIDON_INPUTS } from "../../interface/qapCompiler/importedConstants.ts";
import { ethers } from "ethers";
import { RLP } from "@ethereumjs/rlp";
import { poseidon_raw } from "../../interface/qapCompiler/configuredTypes.ts";

export class TokamakL2StateManager extends MerkleStateManager implements StateManagerInterface {
    private _cachedOpts: TokamakL2StateManagerOpts | null = null
    private _registeredKeys: Uint8Array[] | null = null
    private _initialMerkleTree: IMT | null = null

    public async initTokamakExtendsFromRPC(rpcUrl: string, opts: TokamakL2StateManagerOpts): Promise<void> {
        if (this._cachedOpts !== null) {
            throw new Error('Cannot rewrite cached opts')
        }
        this._cachedOpts = opts;

        await this.initTokamakExtend(opts);
        await this.fetchStorageFromRPC(rpcUrl, opts);

        if (this._initialMerkleTree !== null) {
            throw new Error('Merkle tree is already initialized')
        }
        this._initialMerkleTree = await TokamakL2MerkleTree.buildFromTokamakL2StateManager(this);
    }

    public async initTokamakExtendsFromSnapshot(snapshot: StateSnapshot, opts: TokamakL2StateManagerOpts): Promise<void> {
        if (this._cachedOpts !== null) {
            throw new Error('Cannot rewrite cached opts')
        }
        this._cachedOpts = opts;

        await this.initTokamakExtend(opts);
        await this.fetchStorageFromSnapshot(snapshot, opts);

        if (this._initialMerkleTree !== null) {
            throw new Error('Merkle tree is already initialized')
        }
        this._initialMerkleTree = await TokamakL2MerkleTree.buildFromTokamakL2StateManager(this);
        if (BigInt(this._initialMerkleTree.root) !== hexToBigInt(addHexPrefix(snapshot.stateRoot))) {
            throw new Error(`Creating TokamakL2StateManager using StateSnapshot fails: (provided root: ${snapshot.stateRoot}, reconstructed root: ${this._initialMerkleTree.toString()})`)
        }
    }

    async initTokamakExtend(opts: TokamakL2StateManagerOpts): Promise<void> {
        if (opts.common.customCrypto.keccak256 === undefined) {
            throw new Error('Custom crypto must be set')
        }
        const contractAddress = new Address(toBytes(opts.contractAddress))
        const POSEIDON_RLP = opts.common.customCrypto.keccak256(RLP.encode(new Uint8Array([])))
        const POSEIDON_NULL = opts.common.customCrypto.keccak256(new Uint8Array(0))
        const contractAccount = createAccount({nonce: 0n, balance: 0n, storageRoot: POSEIDON_RLP, codeHash: POSEIDON_NULL})
        await this.putAccount(contractAddress, contractAccount)
    }

    async fetchStorageFromRPC(rpcUrl: string, opts: TokamakL2StateManagerOpts): Promise<void> {
        const provider = new ethers.JsonRpcProvider(rpcUrl)

        const contractAddress = new Address(toBytes(opts.contractAddress))
        if (await this.getAccount(contractAddress) === undefined) {
            throw new Error('TokamakL2StateManager is not initialized.')
        }
        if (opts.blockNumber === undefined ) {
            throw new Error('Creating TokamakL2StateManager from RPC requires a block number.')
        }
        const byteCodeStr = await provider.getCode(contractAddress.toString(), opts.blockNumber)
        await this.putCode(contractAddress, hexToBytes(addHexPrefix(byteCodeStr)))
        
        if (opts.initStorageKeys === undefined) {
            throw new Error('Creating TokamakL2StateManager from RPC requires L1 and L2 key pairs.')
        }
        if (this._registeredKeys !== null) {
            throw new Error('Cannot rewrite registered keys')
        }
        const usedL1Keys = new Set<bigint>();
        const registeredL2KeyBigInts = new Set<bigint>();
        this._registeredKeys = [];
        for (const keys of opts.initStorageKeys) {
            const keyL1BigInt = bytesToBigInt(keys.L1);
            const keyL2BigInt = bytesToBigInt(keys.L2);
            if (usedL1Keys.has(keyL1BigInt)) {
                throw new Error(`Duplication in L1 MPT keys.`);
            }
            if (registeredL2KeyBigInts.has(keyL2BigInt)) {
                throw new Error(`Duplication in L2 MPT keys.`);
            }

            const v = await provider.getStorage(contractAddress.toString(), bytesToBigInt(keys.L1), opts.blockNumber);
            const vBytes = hexToBytes(addHexPrefix(v));
            await this.putStorage(contractAddress, keys.L2, vBytes);

            usedL1Keys.add(keyL1BigInt);
            registeredL2KeyBigInts.add(keyL2BigInt);
            this._registeredKeys.push(keys.L2);
        }
    }

    async fetchStorageFromSnapshot(snapshot: StateSnapshot, opts: TokamakL2StateManagerOpts): Promise<void> {
        if (opts.contractCode === undefined) {
            throw new Error('Creating TokamakL2StateManager using StateSnapshot requires a contract code.')
        }
        const contractAddress = new Address(toBytes(opts.contractAddress));
        await this.putCode(contractAddress, hexToBytes(addHexPrefix(opts.contractCode)));

        if (this._registeredKeys !== null) {
            throw new Error('Cannot rewrite registered keys')
        }
        this._registeredKeys = snapshot.registeredKeys.map( str => hexToBytes(addHexPrefix(str)));
        for (const entry of [...snapshot.storageEntries, ...snapshot.preAllocatedLeaves]) {
            const vBytes = hexToBytes(addHexPrefix(entry.value));
            const keyBytes = hexToBytes(addHexPrefix(entry.key));
            await this.putStorage(contractAddress, keyBytes, vBytes);
        }
    }


    public async convertLeavesIntoMerkleTreeLeaves(): Promise<bigint[]> {
        const contractAddress = new Address(toBytes(this.cachedOpts!.contractAddress))
        const leaves = new Array<bigint>(MAX_MT_LEAVES)
        for (var index = 0; index < MAX_MT_LEAVES; index++) {
            const key = this.registeredKeys![index]
            if (key === undefined) {
                leaves[index] = poseidon_raw([0n, 0n])
            } else {
                const val = await this.getStorage(contractAddress, key)
                leaves[index] = poseidon_raw([bytesToBigInt(key), bytesToBigInt(val)])
            }
        }
        return leaves
    }

    private _permuteRegisteredKeys(permutation: number[]) {
        if (this._registeredKeys === null) {
            throw new Error('Registered storage keys must be permuted after init.')
        }
        const permutedKeys: Uint8Array[] = [...this._registeredKeys];
        for (const [newIdx, oldIdx] of permutation.entries()) {
            permutedKeys[newIdx] = this._registeredKeys[oldIdx].slice();
        }
        this._registeredKeys = permutedKeys;
    }

    // getters
    public get initialMerkleTree(): IMT {
        if (this._initialMerkleTree === null) {
            throw new Error('Merkle tree is not initialized')
        }
        const imt = this._initialMerkleTree
        return new IMT(poseidon_raw as IMTHashFunction, imt.depth, 0n, imt.arity, imt.leaves)
    }

    public async getUpdatedMerkleTreeRoot(permutation?: number[]): Promise<bigint> {
        if (permutation !== undefined) {
            this._permuteRegisteredKeys(permutation);
        }
        const merkleTree = await TokamakL2MerkleTree.buildFromTokamakL2StateManager(this)
        const _root = merkleTree.root
        let root: Uint8Array = new Uint8Array([])
        if (typeof _root === 'bigint') {
            root = bigIntToBytes(_root)
        }
        if (typeof _root === 'string') {
            root = hexToBytes(addHexPrefix(_root))
        }
        if (typeof _root === 'number') {
            root = bigIntToBytes(BigInt(_root))
        }
        return bytesToBigInt(root)
    }

    public async getMerkleProof(leafIndex: number): Promise<IMTMerkleProof> {
        const merkleTree = await TokamakL2MerkleTree.buildFromTokamakL2StateManager(this)
        // pathIndices of this proof generation is incorrect. The indices are based on binary, but we are using 4-ary.
        return merkleTree.createProof(leafIndex)
    }

    // public getInputMerkleTreeRootForTxNonce(txNonce: number) {
    //     const val = this._merkleTreeRoots[txNonce]
    //     if (val === undefined) {
    //         throw new Error('The Merkle tree has not been updated')
    //     }
    //     return val
    // }

    public get registeredKeys() {return this._registeredKeys}
    public getMTIndex(key: bigint): number {
        const MTIndex = this.registeredKeys!.findIndex(
            register => bytesToBigInt(register) === key
          )
        return MTIndex
    }
    public get cachedOpts() {return this._cachedOpts}

    public async captureStateSnapshot(prevSnapshot: StateSnapshot): Promise<StateSnapshot> {

        if (hexToBigInt(addHexPrefix(prevSnapshot.contractAddress)) !==  bytesToBigInt(this.cachedOpts!.contractAddress.bytes)) {
            throw new Error ('Mismatch between contract addresses of the previous state snapshot and the current state.')
        }
        const contractAddress = this.cachedOpts!.contractAddress;

        const getUpdatedEntry = async (entry:  {key: string; value: string;}): Promise<{key: string; value: string;}> => {
            const keyBytes = hexToBytes(addHexPrefix(entry.key));
            const value = await this.getStorage(contractAddress, keyBytes);
            return {
                key: entry.key,
                value: bytesToHex(value),
            }
        }

        // Build state snapshot (matching snapshot.ts logic)
        const permutedRegisteredKeys = this.registeredKeys!.map((key: Uint8Array) => bytesToHex(key));
        
        const afterStorageEntries: {
            key: string;
            value: string;
        }[] = await Promise.all(
            prevSnapshot.storageEntries.map(entry => getUpdatedEntry(entry))
        );
        const afterPreAllocatedLeaves: {
            key: string;
            value: string;
        }[] = await Promise.all(
            prevSnapshot.preAllocatedLeaves.map(entry => getUpdatedEntry(entry))
        );
    
        return {
            channelId: prevSnapshot.channelId,
            stateRoot: (await this.getUpdatedMerkleTreeRoot()).toString(16),
            registeredKeys: permutedRegisteredKeys,
            storageEntries: afterStorageEntries,
            contractAddress: prevSnapshot.contractAddress,
            preAllocatedLeaves: afterPreAllocatedLeaves,
        };
    }
}

class TokamakL2MerkleTree extends IMT {
    private _cachedTokamakL2StateManager: TokamakL2StateManager | null = null

    public initCache(stateManager: TokamakL2StateManager): void {
        if (this._cachedTokamakL2StateManager !== null) {
            throw new Error('Cannot rewirte cached state manager')
        }
        this._cachedTokamakL2StateManager = stateManager
    }
    public get cachedTokamakL2StateManager() {
        return this._cachedTokamakL2StateManager
    }
    public static async buildFromTokamakL2StateManager(mpt: TokamakL2StateManager): Promise<TokamakL2MerkleTree> {
        const treeDepth = MT_DEPTH
        const leaves = await mpt.convertLeavesIntoMerkleTreeLeaves()
        const mt = new TokamakL2MerkleTree(poseidon_raw as IMTHashFunction, treeDepth, 0n, POSEIDON_INPUTS, leaves as IMTNode[])
        mt.initCache(mpt)
        return mt
    }

    
}
