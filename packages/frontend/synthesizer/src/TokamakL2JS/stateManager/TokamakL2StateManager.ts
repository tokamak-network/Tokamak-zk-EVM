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
  // Map from registered key (hex string) to contract address for multi-token support
  private _keyToContractAddress: Map<string, Address> = new Map();

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
    const defaultContractAddress = new Address(toBytes(this.cachedOpts!.contractAddress));
    const leaves = new Array<bigint>(MAX_MT_LEAVES);
    for (var index = 0; index < MAX_MT_LEAVES; index++) {
      const key = this.registeredKeys![index];
      if (key === undefined) {
        leaves[index] = 0n;
      } else {
        // For multi-token support, check if this key has a specific contract address
        // Otherwise use the default contract address
        const keyHex = bytesToHex(key).toLowerCase();
        const contractAddress = this._keyToContractAddress.get(keyHex) || defaultContractAddress;
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

  /**
   * Set cached options (used when skipping RPC init)
   * This allows createStateFromSnapshot to work without calling initTokamakExtendsFromRPC
   */
  public setCachedOpts(opts: TokamakL2StateManagerOpts): void {
    if (this._cachedOpts !== null) {
      throw new Error('Cannot rewrite cached opts');
    }
    this._cachedOpts = opts;
  }

  /**
   * Update cached options contract address (used when restoring from snapshot with different contract)
   * This is needed when the snapshot's contractAddress differs from the initial cachedOpts
   */
  public updateCachedOptsContractAddress(contractAddress: AddressLike): void {
    if (!this._cachedOpts) {
      throw new Error('Cached opts not initialized');
    }
    // Create a new opts object with updated contractAddress
    this._cachedOpts = {
      ...this._cachedOpts,
      contractAddress,
    };
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

    // Update cachedOpts.contractAddress to match snapshot's contractAddress
    // This is critical because convertLeavesIntoMerkleTreeLeaves uses cachedOpts.contractAddress
    // and the snapshot's storage entries are stored under snapshot.contractAddress
    if (this.cachedOpts.contractAddress.toString().toLowerCase() !== snapshot.contractAddress.toLowerCase()) {
      console.log(
        `[TokamakL2StateManager] Updating cachedOpts.contractAddress from ${this.cachedOpts.contractAddress} to ${snapshot.contractAddress}`,
      );
      this.updateCachedOptsContractAddress(snapshot.contractAddress);
    }

    const contractAddress = new Address(toBytes(snapshot.contractAddress as `0x${string}`));

    // Clear existing Merkle tree before restoration
    // This ensures we rebuild from scratch with the snapshot's registeredKeys
    if (this._initialMerkleTree !== null) {
      // If Merkle tree already exists (from initTokamakExtendsFromRPC), clear it
      // We'll rebuild it with the snapshot's registeredKeys
      console.warn('[TokamakL2StateManager] Clearing existing Merkle tree to rebuild from snapshot');
    }
    this._initialMerkleTree = null;

    // Restore registered keys from snapshot FIRST
    // This is critical for Merkle tree reconstruction - must be done before storage restoration
    // because convertLeavesIntoMerkleTreeLeaves uses registeredKeys to build the tree
    if (this._registeredKeys !== null) {
      // If registeredKeys already exist (from initTokamakExtendsFromRPC), replace with snapshot's
      // This ensures the Merkle tree is built with the correct keys from the snapshot
      console.warn('[TokamakL2StateManager] Replacing existing registeredKeys with snapshot registeredKeys');
    }
    this._registeredKeys = snapshot.registeredKeys.map(key => hexToBytes(key as `0x${string}`));

    // Ensure contract account exists before putting storage
    // Check if account exists, and create it if it doesn't
    let contractAccount = await this.getAccount(contractAddress);
    if (!contractAccount) {
      // Create contract account if it doesn't exist (same as initTokamakExtendsFromRPC)
      if (!this.cachedOpts.common.customCrypto.keccak256) {
        throw new Error('Custom crypto keccak256 is not set');
      }
      const POSEIDON_RLP = this.cachedOpts.common.customCrypto.keccak256(RLP.encode(new Uint8Array([])));
      const POSEIDON_NULL = this.cachedOpts.common.customCrypto.keccak256(new Uint8Array(0));
      contractAccount = createAccount({
        nonce: 0n,
        balance: 0n,
        storageRoot: POSEIDON_RLP,
        codeHash: POSEIDON_NULL,
      });
      await this.putAccount(contractAddress, contractAccount);

      // Verify account was created
      const verifyAccount = await this.getAccount(contractAddress);
      if (!verifyAccount) {
        throw new Error('Failed to create contract account');
      }
    }

    // Clear key-to-contract mapping before restoring
    this._keyToContractAddress.clear();

    // Restore all storage entries
    // For multi-token snapshots, each entry should be stored under its token's contract address
    // If entry has contractAddress, use it; otherwise use snapshot's contractAddress
    for (const entry of snapshot.storageEntries) {
      const key = hexToBytes(entry.key as `0x${string}`);
      const value = hexToBytes(entry.value as `0x${string}`);
      const keyHex = entry.key.toLowerCase();

      // Use entry's contractAddress if available, otherwise use snapshot's contractAddress
      const entryContractAddress = entry.contractAddress
        ? new Address(toBytes(entry.contractAddress as `0x${string}`))
        : contractAddress;

      // Store mapping from key to contract address for convertLeavesIntoMerkleTreeLeaves
      this._keyToContractAddress.set(keyHex, entryContractAddress);

      // Ensure contract account exists for this token
      let entryContractAccount = await this.getAccount(entryContractAddress);
      if (!entryContractAccount) {
        // Create contract account if it doesn't exist (same as initTokamakExtendsFromRPC)
        if (!this.cachedOpts.common.customCrypto.keccak256) {
          throw new Error('Custom crypto keccak256 is not set');
        }
        const POSEIDON_RLP = this.cachedOpts.common.customCrypto.keccak256(RLP.encode(new Uint8Array([])));
        const POSEIDON_NULL = this.cachedOpts.common.customCrypto.keccak256(new Uint8Array(0));
        entryContractAccount = createAccount({
          nonce: 0n,
          balance: 0n,
          storageRoot: POSEIDON_RLP,
          codeHash: POSEIDON_NULL,
        });
        await this.putAccount(entryContractAddress, entryContractAccount);
      }

      // Ensure account still exists before putting storage
      const accountCheck = await this.getAccount(entryContractAddress);
      if (!accountCheck) {
        throw new Error(
          `Contract account does not exist for ${entry.contractAddress || snapshot.contractAddress} before putting storage`,
        );
      }

      await this.putStorage(entryContractAddress, key, value);
    }

    // Restore user nonces (parallel to userL2Addresses)
    // Note: userNonces should match userL2Addresses length
    // If userNonces is shorter, use 0n as default for missing entries
    for (let i = 0; i < snapshot.userL2Addresses.length; i++) {
      const addr = snapshot.userL2Addresses[i];
      const nonce = snapshot.userNonces[i] ?? 0n; // Default to 0n if nonce is missing
      const address = new Address(toBytes(addr as `0x${string}`));
      let account = await this.getAccount(address);
      if (!account) {
        // Create account if it doesn't exist
        account = createAccount({ nonce, balance: 0n });
      } else {
        account.nonce = nonce;
      }
      await this.putAccount(address, account);
    }

    // Rebuild Merkle tree with restored state
    // This uses the restored registeredKeys to build the tree correctly
    console.log(`[TokamakL2StateManager] Rebuilding Merkle tree with ${this._registeredKeys.length} registered keys`);
    console.log(`[TokamakL2StateManager] Contract address: ${this.cachedOpts.contractAddress}`);

    // Debug: Check storage values before building tree
    // Use _keyToContractAddress to get the correct contract address for each key
    const defaultContractAddr = new Address(toBytes(this.cachedOpts.contractAddress as `0x${string}`));
    console.log(`[TokamakL2StateManager] Verifying storage values for ${this._registeredKeys.length} keys...`);
    for (let i = 0; i < Math.min(this._registeredKeys.length, 6); i++) {
      const key = this._registeredKeys[i];
      const keyHex = bytesToHex(key).toLowerCase();
      // Use the contract address from _keyToContractAddress map, or default if not found
      const contractAddr = this._keyToContractAddress.get(keyHex) || defaultContractAddr;
      const value = await this.getStorage(contractAddr, key);
      const valueHex = bytesToHex(value);
      const contractAddrHex = bytesToHex(contractAddr.bytes);
      console.log(
        `[TokamakL2StateManager]   Key[${i}]: ${keyHex.slice(0, 20)}... Contract: ${contractAddrHex.slice(0, 20)}... Value: ${valueHex}`,
      );
    }

    this._initialMerkleTree = await TokamakL2MerkleTree.buildFromTokamakL2StateManager(this);
    const restoredRoot = '0x' + this._initialMerkleTree.root.toString(16).padStart(64, '0');
    console.log(`[TokamakL2StateManager] ✅ Merkle tree rebuilt. Root: ${restoredRoot}`);
    console.log(`[TokamakL2StateManager] Expected root: ${snapshot.stateRoot}`);
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
