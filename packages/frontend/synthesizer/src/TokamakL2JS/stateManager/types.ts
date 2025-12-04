import { Common } from '@ethereumjs/common';
import { AddressLike } from '@ethereumjs/util';

export type TokamakL2StateManagerOpts = {
  common: Common;
  blockNumber: number;
  contractAddress: AddressLike;
  userStorageSlots: number[];
  userL1Addresses: AddressLike[];
  userL2Addresses: AddressLike[];
  // Optional: For using on-chain MPT keys instead of getUserStorageKey
  bridgeContractAddress?: AddressLike; // Bridge contract address (e.g., RollupBridgeCore)
  channelId?: bigint; // Channel ID for fetching MPT keys from bridge contract
  rpcUrl?: string; // Optional: RPC URL for fetching contract code when restoring from snapshot
};

/**
 * Storage entry in the state snapshot
 */
export interface StorageEntry {
  index: number;
  key: string; // Hex string of the L2 storage key
  value: string; // Hex string of the L2 storage value
  contractAddress?: string; // Optional: Contract address for this storage entry (for multi-token support)
}

/**
 * Complete snapshot of the L2 state at a specific point in time
 * Used for state persistence and recovery in state channels
 */
export interface StateSnapshot {
  stateRoot: string; // Hex string of the Merkle tree root
  merkleLeaves?: string[]; // Optional: Hex strings for faster reconstruction
  registeredKeys: string[]; // Hex strings of registered L2 storage keys
  storageEntries: StorageEntry[]; // Actual storage key-value pairs

  // Metadata for reconstruction and context
  contractAddress: string; // L1 contract address
  userL2Addresses: string[]; // L2 addresses of participants
  userStorageSlots: bigint[]; // Storage slots used by participants
  timestamp: number; // Timestamp of when the state was exported
  userNonces: bigint[]; // Current nonces for each user (parallel to userL2Addresses)
  contractCode?: string; // Optional: Hex string of contract bytecode (for state restoration without RPC)
}
