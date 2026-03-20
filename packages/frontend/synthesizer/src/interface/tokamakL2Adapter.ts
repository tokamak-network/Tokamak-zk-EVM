import {
  addHexPrefix,
  Address,
  createAddressFromString,
  hexToBigInt,
} from '@ethereumjs/util';
import {
  createTokamakL2StateManagerFromL1RPC,
  createTokamakL2StateManagerFromStateSnapshot,
  NULL_STORAGE_KEY,
  StateSnapshot,
  TokamakL2StateManager,
  TokamakL2StateManagerRPCOpts,
  TokamakL2StateManagerSnapshotOpts,
} from 'tokamak-l2js';

export type LegacyRegisteredKeysEntry = {
  address: Address;
  keys: bigint[];
};

type LegacyProofTreeIndex = [number, number];

type LegacyMerkleProof = {
  leaf: bigint;
  siblings: bigint[][];
};

export interface SynthesizerTokamakL2StateManager extends TokamakL2StateManager {
  registeredKeys: LegacyRegisteredKeysEntry[] | null;
  lastMerkleTrees: {
    getRoots(): bigint[];
    getProof(index: LegacyProofTreeIndex): LegacyMerkleProof;
  };
  getMerkleTreeLeafIndex(address: Address, key: bigint): LegacyProofTreeIndex;
}

const toBigIntNode = (value: bigint | number | string): bigint => {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    return BigInt(value);
  }
  return hexToBigInt(addHexPrefix(value));
};

class LegacyMerkleTreesAdapter {
  public constructor(
    private readonly stateManager: TokamakL2StateManager,
    private readonly registeredKeys: LegacyRegisteredKeysEntry[],
  ) {}

  public getRoots(): bigint[] {
    return this.stateManager.merkleTrees.getRoots(this.registeredKeys.map((entry) => entry.address));
  }

  public getProof(index: LegacyProofTreeIndex): LegacyMerkleProof {
    const registeredKeysForAddress = this.registeredKeys[index[0]];
    if (registeredKeysForAddress === undefined) {
      throw new Error(`No registeredKeys entry for address index ${index[0]}`);
    }

    const proofKey = registeredKeysForAddress.keys[index[1]] ?? NULL_STORAGE_KEY;
    const proof = this.stateManager.merkleTrees.getProof(registeredKeysForAddress.address, proofKey);

    return {
      leaf: toBigIntNode(proof.leaf),
      siblings: proof.siblings.map((siblingsAtLevel) => siblingsAtLevel.map((sibling) => toBigIntNode(sibling))),
    };
  }
}

const buildRegisteredKeysFromRpcOpts = (
  opts: TokamakL2StateManagerRPCOpts,
): LegacyRegisteredKeysEntry[] =>
  opts.storageConfig.map((entry) => ({
    address: entry.address,
    keys: entry.keyPairs.map((keyPair) => toBigIntNode(`0x${Buffer.from(keyPair.L2).toString('hex')}`)),
  }));

const buildRegisteredKeysFromStateSnapshot = (
  snapshot: StateSnapshot,
): LegacyRegisteredKeysEntry[] =>
  snapshot.storageAddresses.map((address, index) => ({
    address: createAddressFromString(address),
    keys: snapshot.storageEntries[index]?.map((entry) => hexToBigInt(addHexPrefix(entry.key))) ?? [],
  }));

const attachCompatibilityLayer = (
  stateManager: TokamakL2StateManager,
  registeredKeys: LegacyRegisteredKeysEntry[],
): SynthesizerTokamakL2StateManager => {
  const compatibleStateManager = stateManager as SynthesizerTokamakL2StateManager;
  const lastMerkleTrees = new LegacyMerkleTreesAdapter(stateManager, registeredKeys);

  compatibleStateManager.registeredKeys = registeredKeys;
  compatibleStateManager.lastMerkleTrees = lastMerkleTrees;
  compatibleStateManager.getMerkleTreeLeafIndex = (address: Address, key: bigint): LegacyProofTreeIndex => {
    const addressIndex = registeredKeys.findIndex((entry) => entry.address.equals(address));
    if (addressIndex < 0) {
      return [-1, -1];
    }

    const keyIndex = registeredKeys[addressIndex]?.keys.findIndex((registeredKey) => registeredKey === key) ?? -1;
    return [addressIndex, keyIndex];
  };

  return compatibleStateManager;
};

export async function createCompatibleTokamakL2StateManagerFromL1RPC(
  rpcUrl: string,
  opts: TokamakL2StateManagerRPCOpts,
): Promise<SynthesizerTokamakL2StateManager> {
  const stateManager = await createTokamakL2StateManagerFromL1RPC(rpcUrl, opts);
  return attachCompatibilityLayer(stateManager, buildRegisteredKeysFromRpcOpts(opts));
}

export async function createCompatibleTokamakL2StateManagerFromStateSnapshot(
  snapshot: StateSnapshot,
  opts: TokamakL2StateManagerSnapshotOpts,
): Promise<SynthesizerTokamakL2StateManager> {
  const stateManager = await createTokamakL2StateManagerFromStateSnapshot(snapshot, opts);
  return attachCompatibilityLayer(stateManager, buildRegisteredKeysFromStateSnapshot(snapshot));
}
