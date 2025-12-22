import { MerkleStateManager } from '@ethereumjs/statemanager';
import { TokamakL2StateManagerOpts } from './types.ts';
import { StateManagerInterface } from '@ethereumjs/common';
import { jubjub } from '@noble/curves/misc.js';
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
import { MAX_MT_LEAVES, MT_DEPTH, POSEIDON_INPUTS } from '../../interface/qapCompiler/importedConstants.ts';
import { ethers, solidityPacked } from 'ethers';
import { poseidon } from '../crypto/index.ts';
import { keccak256 } from 'ethereum-cryptography/keccak';
import { RLP } from '@ethereumjs/rlp';
import { poseidon_raw } from '../../interface/qapCompiler/configuredTypes.ts';
import { getUserStorageKey } from '../utils/utils.ts';

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
        leaves[index] = poseidon_raw([0n, 0n]);
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

  public async rebuildInitialMerkleTree(): Promise<void> {
    this._initialMerkleTree = await TokamakL2MerkleTree.buildFromTokamakL2StateManager(this);
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
