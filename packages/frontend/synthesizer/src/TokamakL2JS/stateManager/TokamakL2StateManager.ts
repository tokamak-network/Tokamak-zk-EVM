import { MerkleStateManager } from '@ethereumjs/statemanager';
import { TokamakL2StateManagerOpts, StateSnapshot, StorageEntry } from './types.ts';
import { StateManagerInterface } from '@ethereumjs/common';
import { jubjub } from '@noble/curves/misc';
import { IMT, IMTHashFunction, IMTMerkleProof, IMTNode } from '@zk-kit/imt';
import {
  addHexPrefix,
  Address,
  bigIntToBytes,
  bigIntToHex,
  bytesToBigInt,
  bytesToHex,
  concatBytes,
  createAccount,
  createAddressFromString,
  hexToBytes,
  setLengthLeft,
  setLengthRight,
  toBytes,
} from '@ethereumjs/util';
import { MAX_MT_LEAVES, MT_DEPTH, POSEIDON_INPUTS } from 'src/interface/qapCompiler/importedConstants.ts';
import { ethers, solidityPacked } from 'ethers';
import { poseidon } from '../crypto/index.ts';
import { keccak256 } from 'ethereum-cryptography/keccak';
import { RLP } from '@ethereumjs/rlp';
import { poseidon_raw } from 'src/interface/qapCompiler/configuredTypes.ts';

export class TokamakL2StateManager extends MerkleStateManager implements StateManagerInterface {
  private _cachedOpts: TokamakL2StateManagerOpts | null = null;
  private _registeredKeys: Uint8Array[] | null = null;
  private _initialMerkleTree: IMT | null = null;

  public async initTokamakExtendsFromRPC(rpcUrl: string, opts: TokamakL2StateManagerOpts): Promise<void> {
    if (opts.common.customCrypto.keccak256 === undefined) {
      throw new Error('Custom crypto must be set');
    }
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contractAddress = new Address(toBytes(opts.contractAddress));
    const POSEIDON_RLP = opts.common.customCrypto.keccak256(RLP.encode(new Uint8Array([])));
    const POSEIDON_NULL = opts.common.customCrypto.keccak256(new Uint8Array(0));
    const contractAccount = createAccount({
      nonce: 0n,
      balance: 0n,
      storageRoot: POSEIDON_RLP,
      codeHash: POSEIDON_NULL,
    });
    await this.putAccount(contractAddress, contractAccount);
    const byteCodeStr = await provider.getCode(contractAddress.toString(), opts.blockNumber);
    await this.putCode(contractAddress, hexToBytes(addHexPrefix(byteCodeStr)));
    if (this._registeredKeys !== null) {
      throw new Error('Cannot rewrite registered keys');
    }
    const userL1Addresses = opts.userL1Addresses.map(addr => new Address(toBytes(addr)));
    const userL2Addresses = opts.userL2Addresses.map(addr => new Address(toBytes(addr)));
    const registeredKeys: Uint8Array[] = [];
    for (const [idx, L1Addr] of userL1Addresses.entries()) {
      for (const slot of opts.userStorageSlots) {
        const L1key = this.getUserStorageKey([L1Addr, slot], 'L1');
        const v = await provider.getStorage(contractAddress.toString(), bytesToBigInt(L1key), opts.blockNumber);

        const vBytes = hexToBytes(addHexPrefix(v));
        const L2key = this.getUserStorageKey([userL2Addresses[idx], slot], 'L2');
        await this.putStorage(contractAddress, L2key, vBytes);

        registeredKeys.push(L2key);
      }
    }
    this._registeredKeys = registeredKeys;

    if (this._cachedOpts !== null) {
      throw new Error('Cannot rewrite cached opts');
    }
    this._cachedOpts = opts;

    if (this._initialMerkleTree !== null) {
      throw new Error('Merkle tree is already initialized');
    }
    this._initialMerkleTree = await TokamakL2MerkleTree.buildFromTokamakL2StateManager(this);
  }

  public async convertLeavesIntoMerkleTreeLeaves(): Promise<bigint[]> {
    const contractAddress = new Address(toBytes(this.cachedOpts!.contractAddress));
    const leaves = new Array<bigint>(MAX_MT_LEAVES);
    for (var index = 0; index < MAX_MT_LEAVES; index++) {
      const key = this.registeredKeys![index];
      if (key === undefined) {
        leaves[index] = 0n;
      } else {
        const val = await this.getStorage(contractAddress, key);
        leaves[index] = poseidon_raw([bytesToBigInt(key), bytesToBigInt(val)]);
      }
    }
    return leaves;
  }

  // getters
  public get initialMerkleTree(): IMT {
    if (this._initialMerkleTree === null) {
      throw new Error('Merkle tree is not initialized');
    }
    const imt = this._initialMerkleTree;
    return new IMT(poseidon_raw as IMTHashFunction, imt.depth, 0n, imt.arity, imt.leaves);
  }

  public async getUpdatedMerkleTreeRoot(): Promise<bigint> {
    const merkleTree = await TokamakL2MerkleTree.buildFromTokamakL2StateManager(this);
    const _root = merkleTree.root;
    let root: Uint8Array = new Uint8Array([]);
    if (typeof _root === 'bigint') {
      root = bigIntToBytes(_root);
    }
    if (typeof _root === 'string') {
      root = hexToBytes(addHexPrefix(_root));
    }
    if (typeof _root === 'number') {
      root = bigIntToBytes(BigInt(_root));
    }
    return bytesToBigInt(root);
  }

  public async getMerkleProof(leafIndex: number): Promise<IMTMerkleProof> {
    const merkleTree = await TokamakL2MerkleTree.buildFromTokamakL2StateManager(this);
    // pathIndices of this proof generation is incorrect. The indices are based on binary, but we are using 4-ary.
    return merkleTree.createProof(leafIndex);
  }

  // public getInputMerkleTreeRootForTxNonce(txNonce: number) {
  //     const val = this._merkleTreeRoots[txNonce]
  //     if (val === undefined) {
  //         throw new Error('The Merkle tree has not been updated')
  //     }
  //     return val
  // }

  public get registeredKeys() {
    return this._registeredKeys;
  }
  public getMTIndex(key: bigint): number {
    const MTIndex = this.registeredKeys!.findIndex(register => bytesToBigInt(register) === key);
    return MTIndex;
  }
  public get cachedOpts() {
    return this._cachedOpts;
  }

  // public getL1UserStorageKey(parts: Array<Address | number | bigint | string>): Uint8Array {
  //     const bytesArray: Uint8Array[] = []

  //     for (const p of parts) {
  //         let b: Uint8Array

  //         if (p instanceof Address) {
  //         b = p.toBytes()
  //         } else if (typeof p === 'number') {
  //         b = bigIntToBytes(BigInt(p))
  //         } else if (typeof p === 'bigint') {
  //         b = bigIntToBytes(p)
  //         } else if (typeof p === 'string') {
  //         b = hexToBytes(addHexPrefix(p))
  //         } else {
  //         throw new Error('getStorageKey accepts only Address | number | bigint | string');
  //         }

  //         bytesArray.push(setLengthLeft(b, 32))
  //     }

  //     const packed = solidityPacked(Array(parts.length).fill('bytes'), bytesArray);
  //     const keyHex = keccak256(packed);          // 0x-prefixed string
  //     return hexToBytes(addHexPrefix(keyHex));
  // }

  public getUserStorageKey(parts: Array<Address | number | bigint | string>, usage: 'L1' | 'L2'): Uint8Array {
    const bytesArray: Uint8Array[] = [];

    for (const p of parts) {
      let b: Uint8Array;

      if (p instanceof Address) {
        b = p.toBytes();
      } else if (typeof p === 'number') {
        b = bigIntToBytes(BigInt(p));
      } else if (typeof p === 'bigint') {
        b = bigIntToBytes(p);
      } else if (typeof p === 'string') {
        b = hexToBytes(addHexPrefix(p));
      } else {
        throw new Error('getStorageKey accepts only Address | number | bigint | string');
      }

      bytesArray.push(setLengthLeft(b, 32));
    }
    const packed = concatBytes(...bytesArray);
    let hash;
    if (usage === 'L1') {
      hash = keccak256;
    } else {
      hash = this._cachedOpts === null ? poseidon : this._cachedOpts.common.customCrypto.keccak256!;
    }
    return hash(packed);
  }

  /**
   * Export current state including state root, merkle leaves, and storage entries
   */
  public async exportState(): Promise<StateSnapshot> {
    const contractAddress = new Address(toBytes(this.cachedOpts!.contractAddress));
    const leaves = await this.convertLeavesIntoMerkleTreeLeaves();
    const merkleRoot = await this.getUpdatedMerkleTreeRoot();

    // Get registered keys
    const registeredKeys = this.registeredKeys!.map(k => bytesToHex(k));

    // Get all storage entries
    const storageEntries: StorageEntry[] = [];
    for (let i = 0; i < this.registeredKeys!.length; i++) {
      const key = this.registeredKeys![i];
      const value = await this.getStorage(contractAddress, key);
      storageEntries.push({
        index: i,
        key: bytesToHex(key),
        value: bytesToHex(value),
      });
    }

    // Get user nonces (parallel to userL2Addresses)
    const userNonces: bigint[] = [];
    for (const addr of this.cachedOpts!.userL2Addresses) {
      const account = await this.getAccount(new Address(toBytes(addr)));
      if (account) {
        userNonces.push(account.nonce);
      } else {
        userNonces.push(0n);
      }
    }

    return {
      stateRoot: bigIntToHex(merkleRoot),
      merkleLeaves: leaves.map(l => l.toString()),
      registeredKeys,
      storageEntries,
      contractAddress: this.cachedOpts!.contractAddress as string,
      userL2Addresses: this.cachedOpts!.userL2Addresses as string[],
      userStorageSlots: this.cachedOpts!.userStorageSlots.map(s => BigInt(s)),
      timestamp: Date.now(),
      userNonces,
    };
  }

  /**
   * Restore state from a snapshot
   * This is the inverse operation of exportState()
   */
  public async createStateFromSnapshot(snapshot: StateSnapshot): Promise<void> {
    if (!this.cachedOpts) {
      throw new Error('StateManager not initialized');
    }

    const contractAddress = new Address(toBytes(snapshot.contractAddress as `0x${string}`));

    // Restore all storage entries
    for (const entry of snapshot.storageEntries) {
      const key = hexToBytes(entry.key as `0x${string}`);
      const value = hexToBytes(entry.value as `0x${string}`);
      await this.putStorage(contractAddress, key, value);
    }

    // Restore user nonces (parallel to userL2Addresses)
    for (let i = 0; i < snapshot.userL2Addresses.length; i++) {
      const addr = snapshot.userL2Addresses[i];
      const nonce = snapshot.userNonces[i];
      const address = new Address(toBytes(addr as `0x${string}`));
      const account = await this.getAccount(address);
      if (account) {
        account.nonce = nonce;
        await this.putAccount(address, account);
      }
    }

    // Rebuild Merkle tree with restored state
    this._initialMerkleTree = await TokamakL2MerkleTree.buildFromTokamakL2StateManager(this);
  }
}

class TokamakL2MerkleTree extends IMT {
  private _cachedTokamakL2StateManager: TokamakL2StateManager | null = null;

  public initCache(stateManager: TokamakL2StateManager): void {
    if (this._cachedTokamakL2StateManager !== null) {
      throw new Error('Cannot rewirte cached state manager');
    }
    this._cachedTokamakL2StateManager = stateManager;
  }
  public get cachedTokamakL2StateManager() {
    return this._cachedTokamakL2StateManager;
  }
  public static async buildFromTokamakL2StateManager(mpt: TokamakL2StateManager): Promise<TokamakL2MerkleTree> {
    const treeDepth = MT_DEPTH;
    const leaves = await mpt.convertLeavesIntoMerkleTreeLeaves();
    const mt = new TokamakL2MerkleTree(
      poseidon_raw as IMTHashFunction,
      treeDepth,
      0n,
      POSEIDON_INPUTS,
      leaves as IMTNode[],
    );
    mt.initCache(mpt);
    return mt;
  }
}
