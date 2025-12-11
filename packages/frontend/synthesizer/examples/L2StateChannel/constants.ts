/**
 * Shared Constants for L2 State Channel Tests
 *
 * This file contains all shared constants used across L2 State Channel test scripts:
 * - Contract addresses (modular architecture)
 * - Token addresses
 * - Channel IDs
 * - RPC URLs
 * - Contract ABIs
 */

// ============================================================================
// NETWORK CONFIGURATION
// ============================================================================

export const ALCHEMY_KEY = process.env.ALCHEMY_KEY || 'PbqCcGx1oHN7yNaFdUJUYqPEN0QSp23S';
export const SEPOLIA_RPC_URL = `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`;

// ============================================================================
// CONTRACT ADDRESSES (Sepolia Testnet)
// ============================================================================

// Modular Contract addresses - Updated for new architecture
export const ROLLUP_BRIDGE_CORE_ADDRESS = '0x68862886384846d53bbba89aa4f64f4789dda089';
export const ROLLUP_BRIDGE_DEPOSIT_MANAGER_ADDRESS = '0xD5E8B17058809B9491F99D35B67A089A2618f5fB';
export const ROLLUP_BRIDGE_PROOF_MANAGER_ADDRESS = '0xF0396B7547C7447FBb14A127D3751425893322fc';
export const ROLLUP_BRIDGE_WITHDRAW_MANAGER_ADDRESS = '0xAf833c7109DB3BfDAc54a98EA7b123CFDE51d777';
export const ROLLUP_BRIDGE_ADMIN_MANAGER_ADDRESS = '0x1c38A6739bDb55f357fcd1aF258E0359ed77c662';

// New modular address (causes "Failed to capture the final state" error - needs investigation)
export const DEPOSIT_MANAGER_PROXY_ADDRESS = '0xe32dab028f5ebd5e82d2f5a7dd5f68dddae6e2a5';

// ============================================================================
// TOKEN ADDRESSES (Sepolia Testnet)
// ============================================================================

export const TON_ADDRESS = '0xa30fe40285B8f5c0457DbC3B7C8A280373c40044'; // TON token address
export const WTON_ADDRESS = '0x79E0d92670106c85E9067b56B8F674340dCa0Bbd'; // WTON token address

// ============================================================================
// CHANNEL CONFIGURATION
// ============================================================================

// ============================================================================
// CONTRACT ABIs
// ============================================================================

export const ROLLUP_BRIDGE_CORE_ABI = [
  // Channel Management - Core Functions
  {
    inputs: [
      {
        components: [
          { name: 'targetContract', type: 'address' },
          { name: 'participants', type: 'address[]' },
          { name: 'timeout', type: 'uint256' },
        ],
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'openChannel',
    outputs: [{ name: 'channelId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'channelId', type: 'uint256' },
      { name: 'pkx', type: 'uint256' },
      { name: 'pky', type: 'uint256' },
    ],
    name: 'setChannelPublicKey',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // View Functions
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'getChannelState',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'channelId', type: 'uint256' },
      { name: 'participant', type: 'address' },
    ],
    name: 'isChannelParticipant',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'targetContract', type: 'address' }],
    name: 'isTargetContractAllowed',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'getChannelLeader',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'getChannelParticipants',
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'getChannelTargetContract',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'getChannelTreeSize',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'channelId', type: 'uint256' },
      { name: 'participant', type: 'address' },
    ],
    name: 'getParticipantDeposit',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'channelId', type: 'uint256' },
      { name: 'participant', type: 'address' },
    ],
    name: 'getL2MptKey',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'getChannelTotalDeposits',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'getChannelPublicKey',
    outputs: [
      { name: 'pkx', type: 'uint256' },
      { name: 'pky', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'isChannelPublicKeySet',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'getChannelTimeout',
    outputs: [
      { name: 'openTimestamp', type: 'uint256' },
      { name: 'timeout', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'getLeaderBond',
    outputs: [
      { name: 'bond', type: 'uint256' },
      { name: 'slashed', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'nextChannelId',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'getChannelInfo',
    outputs: [
      { name: 'targetContract', type: 'address' },
      { name: 'state', type: 'uint8' },
      { name: 'participantCount', type: 'uint256' },
      { name: 'initialRoot', type: 'bytes32' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'channelId', type: 'uint256' },
      { name: 'participant', type: 'address' },
    ],
    name: 'hasUserWithdrawn',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'isSignatureVerified',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'channelId', type: 'uint256' },
      { name: 'participant', type: 'address' },
    ],
    name: 'getWithdrawableAmount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getTreasuryAddress',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getTotalSlashedBonds',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'getChannelInitialStateRoot',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'getChannelFinalStateRoot',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'targetContract', type: 'address' }],
    name: 'getMaxAllowedParticipants',
    outputs: [{ name: 'maxParticipants', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'targetContract', type: 'address' }],
    name: 'getTargetContractData',
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'contractAddress', type: 'address' },
          { name: 'storageSlot', type: 'bytes1' },
        ],
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'targetContract', type: 'address' }],
    name: 'getPreAllocatedKeys',
    outputs: [{ name: 'keys', type: 'bytes32[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'targetContract', type: 'address' },
      { name: 'mptKey', type: 'bytes32' },
    ],
    name: 'getPreAllocatedLeaf',
    outputs: [
      { name: 'value', type: 'uint256' },
      { name: 'exists', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'targetContract', type: 'address' }],
    name: 'getPreAllocatedLeavesCount',
    outputs: [{ name: 'count', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'channelId', type: 'uint256' }],
    name: 'getChannelPreAllocatedLeavesCount',
    outputs: [{ name: 'count', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'channelId', type: 'uint256' },
      { indexed: false, name: 'targetContract', type: 'address' },
    ],
    name: 'ChannelOpened',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'channelId', type: 'uint256' },
      { indexed: false, name: 'pkx', type: 'uint256' },
      { indexed: false, name: 'pky', type: 'uint256' },
      { indexed: false, name: 'signerAddr', type: 'address' },
    ],
    name: 'ChannelPublicKeySet',
    type: 'event',
  },
];

export const DEPOSIT_MANAGER_ABI = [
  'function depositToken(uint256 channelId, uint256 amount, bytes32 _mptKey) external',
];

export const TON_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

export const WTON_ABI = [
  'function swapFromTON(uint256 tonAmount) returns (bool)', // NOT payable!
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
];

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

// Default deposit amounts
export const TON_DEPOSIT_AMOUNT = '100'; // 100 TON
export const WTON_DEPOSIT_AMOUNT = '100'; // 100 WTON

// Helper functions for amount parsing
export const parseRay = (amount: string): bigint => {
  return BigInt(amount) * BigInt(10 ** 27);
};

export const formatRay = (amount: bigint): string => {
  const divisor = BigInt(10 ** 27);
  const integer = amount / divisor;
  const decimal = amount % divisor;
  const decimalStr = decimal.toString().padStart(27, '0').substring(0, 6); // Show 6 decimal places
  return `${integer}.${decimalStr}`;
};

// ============================================================================
// L2 ADDRESS & MPT KEY GENERATION
// ============================================================================

import { bigIntToBytes, setLengthLeft, bytesToHex } from '@ethereumjs/util';
import { fromEdwardsToAddress } from '../../src/TokamakL2JS/index.ts';

/**
 * Convert L2 public key (pkx, pky) to L2 address
 */
export function publicKeyToL2Address(pkx: bigint, pky: bigint): string {
  const pkxBytes = setLengthLeft(bigIntToBytes(pkx), 32);
  const pkyBytes = setLengthLeft(bigIntToBytes(pky), 32);
  const combined = new Uint8Array(64);
  combined.set(pkxBytes, 0);
  combined.set(pkyBytes, 32);
  const address = fromEdwardsToAddress(combined);
  return address.toString();
}

/**
 * Generate L2 storage key (MPT key) from L2 address, slot, and token address
 *
 * Includes token address to ensure different MPT keys for different tokens
 * for the same participant. This prevents MPT key collisions when a participant
 * deposits multiple tokens.
 *
 * @param l2Address - L2 address derived from participant's public key
 * @param slot - Storage slot (typically 0 for ERC20 balance)
 * @param tokenAddress - Optional token address to include in key generation
 * @returns Hex string of the MPT key
 */
export function generateL2StorageKey(l2Address: string, slot: bigint, tokenAddress?: string): string {
  const addressBigInt = BigInt(l2Address);
  let storageKeyBigInt = addressBigInt ^ slot;

  // Include token address in MPT key generation to ensure different keys for different tokens
  // This ensures that TON and WTON (or any other tokens) have different MPT keys
  // for the same participant, preventing storage collisions
  if (tokenAddress) {
    const tokenBigInt = BigInt(tokenAddress);
    storageKeyBigInt = storageKeyBigInt ^ tokenBigInt;
  }

  const storageKeyBytes = setLengthLeft(bigIntToBytes(storageKeyBigInt), 32);
  return bytesToHex(storageKeyBytes);
}

/**
 * Reverse engineer L2 address from on-chain MPT key
 *
 * Since MPT key = l2Address ^ slot ^ tokenAddress (XOR operation),
 * we can reverse it: l2Address = mptKey ^ slot ^ tokenAddress
 *
 * This is the most reliable way to get the actual L2 address used on-chain,
 * especially when getParticipantPublicKey is not available.
 *
 * @param mptKey - MPT key from on-chain contract (getL2MptKey)
 * @param slot - Storage slot (typically 0 for ERC20 balance)
 * @param tokenAddress - Token address used in MPT key generation
 * @returns L2 address as hex string
 */
export function deriveL2AddressFromMptKey(mptKey: string, slot: bigint, tokenAddress: string): string {
  const mptKeyBigInt = BigInt(mptKey);
  const tokenBigInt = BigInt(tokenAddress);

  // Reverse the XOR operation: l2Address = mptKey ^ slot ^ tokenAddress
  const l2AddressBigInt = mptKeyBigInt ^ slot ^ tokenBigInt;

  const l2AddressBytes = setLengthLeft(bigIntToBytes(l2AddressBigInt), 20); // L2 address is 20 bytes
  return bytesToHex(l2AddressBytes);
}
