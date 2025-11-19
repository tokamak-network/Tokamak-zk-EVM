import { MerkleStateManager } from '@ethereumjs/statemanager';
import { TokamakL2StateManagerOpts, StateSnapshot, StorageEntry } from './types.ts';
import { StateManagerInterface } from '@ethereumjs/common';
import { jubjub } from '@noble/curves/misc';
import { IMT, IMTHashFunction, IMTMerkleProof, IMTNode } from '@zk-kit/imt';
import { poseidon_raw } from 'src/synthesizer/params/index.ts';
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
import { MAX_MT_LEAVES, POSEIDON_INPUTS } from '../../interface/qapCompiler/importedConstants.ts';
import { ethers, solidityPacked } from 'ethers';
import { poseidon } from '../crypto/index.ts';
import { keccak256 } from 'ethereum-cryptography/keccak';
import { RLP } from '@ethereumjs/rlp';

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

    // Set _cachedOpts first so getUserStorageKey('L2') can access customCrypto
    if (this._cachedOpts !== null) {
      throw new Error('Cannot rewrite cached opts');
    }
    this._cachedOpts = opts;

    const userL1Addresses = opts.userL1Addresses.map(addr => new Address(toBytes(addr)));
    const userL2Addresses = opts.userL2Addresses.map(addr => new Address(toBytes(addr)));
    const registeredKeys: Uint8Array[] = [];
    console.log('📖 Reading storage from L1...');
    for (const [idx, L1Addr] of userL1Addresses.entries()) {
      for (const slot of opts.userStorageSlots) {
        const L1key = this.getUserStorageKey([L1Addr, slot], 'L1');
        const L1keyHex = bytesToHex(L1key);
        const v = await provider.getStorage(contractAddress.toString(), bytesToBigInt(L1key), opts.blockNumber);

        console.log(`  User ${idx} (${L1Addr.toString()}), Slot ${slot}:`);
        console.log(`    L1 Storage Key: ${L1keyHex}`);
        console.log(`    Value from RPC: ${v} (${BigInt(v)})`);

        const vBytes = hexToBytes(addHexPrefix(v));
        const L2key = this.getUserStorageKey([userL2Addresses[idx], slot], 'L2');
        const L2keyHex = bytesToHex(L2key);
        await this.putStorage(contractAddress, L2key, vBytes);

        console.log(`    L2 Storage Key: ${L2keyHex}`);
        console.log(`    Stored in L2: ${bytesToHex(vBytes)}`);

        registeredKeys.push(L2key);
      }
    }
    this._registeredKeys = registeredKeys;

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
        leaves[index] = poseidon_raw([BigInt(index), bytesToBigInt(key), bytesToBigInt(val), 0n]);
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

        if (usage === 'L1') {
      // L1 uses real keccak256 for storage keys (standard ERC20)
      return keccak256(packed);
        } else {
      // L2 uses poseidon because customCrypto.keccak256 = poseidon
      // EVM's SHA3 opcode will use poseidon to calculate storage keys
      if (this._cachedOpts?.common?.customCrypto?.keccak256 === undefined) {
        throw new Error('L2 requires customCrypto.keccak256 (poseidon) to be set');
      }
      return this._cachedOpts.common.customCrypto.keccak256(packed);
    }
  }

  /**
   * Export current state as a snapshot for persistence
   * Used in state channels to save intermediate states
   *
   * @returns StateSnapshot containing all necessary data to restore this state
   */
  public async exportState(): Promise<StateSnapshot> {
    if (this._cachedOpts === null) {
      throw new Error('State manager not initialized. Call initTokamakExtendsFromRPC first.');
    }
    if (this._registeredKeys === null) {
      throw new Error('Registered keys not initialized.');
    }

    const contractAddress = new Address(toBytes(this._cachedOpts.contractAddress));

    // 1. Collect Merkle leaves (optional, for faster reconstruction)
    const leaves = await this.convertLeavesIntoMerkleTreeLeaves();

    // 2. Calculate current Merkle root
    const merkleRoot = await this.getUpdatedMerkleTreeRoot();

    // 3. Export registered keys
    const registeredKeys = this._registeredKeys.map(k => bytesToHex(k));

    // 4. Collect all storage entries (actual values)
    const storageEntries: StorageEntry[] = [];
    for (let i = 0; i < this._registeredKeys.length; i++) {
      const key = this._registeredKeys[i];
      if (key) {
        const value = await this.getStorage(contractAddress, key);
        storageEntries.push({
          index: i,
          key: bytesToHex(key),
          value: bytesToHex(value),
        });
      }
    }

    // 5. Export user account nonces
    const userNonces: bigint[] = [];
    for (const userAddr of this._cachedOpts.userL2Addresses) {
      const account = await this.getAccount(userAddr);
      userNonces.push(account ? account.nonce : 0n);
    }

    // 6. Build snapshot with metadata
    return {
      stateRoot: bigIntToHex(merkleRoot),
      merkleLeaves: leaves.map(l => l.toString()), // Convert BigInt to string
      registeredKeys: registeredKeys,
      storageEntries: storageEntries,
      // Metadata for reconstruction
      contractAddress: this._cachedOpts.contractAddress.toString(),
      userL2Addresses: this._cachedOpts.userL2Addresses.map(addr => addr.toString()),
      userStorageSlots: this._cachedOpts.userStorageSlots.map(slot => BigInt(slot)),
      timestamp: Date.now(),
      userNonces: userNonces, // Store current nonces for all users
    };
  }

  /**
   * Create and restore state from a snapshot
   * Used in state channels to load a previous state
   *
   * @param snapshot StateSnapshot to restore from
   */
  public async createStateFromSnapshot(snapshot: StateSnapshot): Promise<void> {
    console.log(`\n🔄 [createStateFromSnapshot] Starting state restoration...`);
    console.log(`   Target state root: ${snapshot.stateRoot}`);
    console.log(`   Storage entries: ${snapshot.storageEntries.length}`);
    console.log(`   Registered keys: ${snapshot.registeredKeys.length}`);

    if (this._cachedOpts === null || this._cachedOpts.common === undefined) {
      throw new Error('State manager must have cachedOpts.common initialized before importing state');
    }

    const contractAddress = new Address(toBytes(addHexPrefix(snapshot.contractAddress)));

    // 1. Set up contract account
    const POSEIDON_RLP = this._cachedOpts.common.customCrypto.keccak256!(RLP.encode(new Uint8Array([])));
    const POSEIDON_NULL = this._cachedOpts.common.customCrypto.keccak256!(new Uint8Array(0));

    // 1. Verify contract account exists (should have been loaded via initTokamakExtendsFromRPC)
    const existingContract = await this.getAccount(contractAddress);
    if (!existingContract) {
      throw new Error('Contract account not found. Must call initTokamakExtendsFromRPC first before importing state.');
    }

    // Keep existing contract account as-is (preserve code and codeHash)
    // We will only update storage in the next steps

    // 2. Restore user accounts with their nonces
    for (let i = 0; i < snapshot.userL2Addresses.length; i++) {
      const userAddr = new Address(toBytes(addHexPrefix(snapshot.userL2Addresses[i])));
      const nonce = snapshot.userNonces[i] || 0n;

      const userAccount = createAccount({
        nonce: nonce,
        balance: 0n, // Balance is stored in contract storage, not account balance
        storageRoot: POSEIDON_RLP,
        codeHash: POSEIDON_NULL,
      });

      await this.putAccount(userAddr, userAccount);
    }

    // 3. Restore storage entries
    for (const entry of snapshot.storageEntries) {
      const key = hexToBytes(addHexPrefix(entry.key));
      const value = hexToBytes(addHexPrefix(entry.value));
      await this.putStorage(contractAddress, key, value);
    }

    // 4. Restore registered keys
    this._registeredKeys = snapshot.registeredKeys.map(k => hexToBytes(addHexPrefix(k)));

    // 5. Restore cached options (preserve existing common)
    this._cachedOpts = {
      ...this._cachedOpts,
      contractAddress: addHexPrefix(snapshot.contractAddress),
      userL1Addresses: [], // Not stored in snapshot, keep empty or pass separately
      userL2Addresses: snapshot.userL2Addresses.map(addr => new Address(toBytes(addHexPrefix(addr)))),
      userStorageSlots: snapshot.userStorageSlots.map(Number), // Convert bigint to number
      blockNumber: 0, // Not stored in snapshot
    };

    // 6. Reconstruct Merkle tree
    console.log(`\n   📊 Reconstructing Merkle tree...`);
    if (snapshot.merkleLeaves && snapshot.merkleLeaves.length > 0) {
      // Fast path: use provided leaves
      console.log(`      Using provided leaves (${snapshot.merkleLeaves.length})`);
      const treeDepth = Math.ceil(Math.log10(MAX_MT_LEAVES) / Math.log10(POSEIDON_INPUTS));
      const leaves = snapshot.merkleLeaves.map(l => BigInt(l));
      this._initialMerkleTree = new TokamakL2MerkleTree(
        poseidon_raw as IMTHashFunction,
        treeDepth,
        0n,
        POSEIDON_INPUTS,
        leaves as IMTNode[],
      );
      console.log(`      Reconstructed root: ${this._initialMerkleTree.root}`);
    } else {
      // Slow path: recalculate from storage
      console.log(`      Recalculating from current storage...`);
      this._initialMerkleTree = await TokamakL2MerkleTree.buildFromTokamakL2StateManager(this);
      console.log(`      Calculated root: ${this._initialMerkleTree.root}`);
    }

    // Verify that the reconstructed tree matches the snapshot
    const reconstructedRoot = await this.getUpdatedMerkleTreeRoot();
    console.log(`\n   🔍 Verification:`);
    console.log(`      Expected root:  ${snapshot.stateRoot}`);
    console.log(`      Reconstructed:  ${bigIntToHex(this._initialMerkleTree.root)}`);
    console.log(`      Updated root:   ${bigIntToHex(reconstructedRoot)}`);
    console.log(`      Match: ${bigIntToHex(reconstructedRoot) === snapshot.stateRoot ? '✅' : '❌ MISMATCH!'}`);

    console.log(`\n✅ State restoration completed`);
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
    const treeDepth = Math.ceil(Math.log10(MAX_MT_LEAVES) / Math.log10(POSEIDON_INPUTS));
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
