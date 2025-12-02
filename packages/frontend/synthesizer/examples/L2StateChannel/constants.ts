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
export const ROLLUP_BRIDGE_CORE_ADDRESS = '0x3e47aeefffec5e4bce34426ed6c8914937a65435';
export const ROLLUP_BRIDGE_DEPOSIT_MANAGER_ADDRESS = '0xD5E8B17058809B9491F99D35B67A089A2618f5fB';
export const ROLLUP_BRIDGE_PROOF_MANAGER_ADDRESS = '0xF0396B7547C7447FBb14A127D3751425893322fc';
export const ROLLUP_BRIDGE_WITHDRAW_MANAGER_ADDRESS = '0xAf833c7109DB3BfDAc54a98EA7b123CFDE51d777';
export const ROLLUP_BRIDGE_ADMIN_MANAGER_ADDRESS = '0x1c38A6739bDb55f357fcd1aF258E0359ed77c662';

// Legacy/Proxy addresses (for backward compatibility)
export const ROLLUP_BRIDGE_CORE_PROXY_ADDRESS = '0x780ad1b236390C42479b62F066F5cEeAa4c77ad6';
export const DEPOSIT_MANAGER_PROXY_ADDRESS = '0x2873519dea0C8fE39e12f5E93a94B78d270F0401';

// ============================================================================
// TOKEN ADDRESSES (Sepolia Testnet)
// ============================================================================

export const TON_ADDRESS = '0xa30fe40285B8f5c0457DbC3B7C8A280373c40044'; // TON token address
export const WTON_ADDRESS = '0x79E0d92670106c85E9067b56B8F674340dCa0Bbd'; // WTON token address

// ============================================================================
// CHANNEL CONFIGURATION
// ============================================================================

// Active test channel
export const CHANNEL_ID = 5; // Channel 5 for testing

// Legacy channel (for reference)
export const CHANNEL_ID_8 = 8; // Channel 8 (legacy, uses WTON)

// ============================================================================
// CONTRACT ABIs
// ============================================================================

export const ROLLUP_BRIDGE_CORE_ABI = [
  'function getChannelInfo(uint256 channelId) view returns (address[] allowedTokens, uint8 state, uint256 participantCount, bytes32 initialRoot)',
  'function getChannelParticipants(uint256 channelId) view returns (address[])',
  'function getParticipantPublicKey(uint256 channelId, address participant) view returns (uint256 pkx, uint256 pky)',
  'function getParticipantTokenDeposit(uint256 channelId, address participant, address token) view returns (uint256)',
  'function getL2MptKey(uint256 channelId, address participant, address token) view returns (uint256)',
];

export const DEPOSIT_MANAGER_ABI = [
  'function depositToken(uint256 channelId, address token, uint256 amount, bytes32 _mptKey) external',
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
