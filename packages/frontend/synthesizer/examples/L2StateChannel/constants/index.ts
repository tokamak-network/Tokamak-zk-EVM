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

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env from synthesizer root (must be done before reading process.env)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../.env') });

// ============================================================================
// NETWORK CONFIGURATION
// ============================================================================

export const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL as string;

// ============================================================================
// Contract Slot
// ============================================================================

export const TON_SLOT = 0;

// ============================================================================
// TOKEN ADDRESSES (Sepolia Testnet)
// ============================================================================

export const TON_ADDRESS = '0xa30fe40285B8f5c0457DbC3B7C8A280373c40044'; // TON token address
export const WTON_ADDRESS = '0x79E0d92670106c85E9067b56B8F674340dCa0Bbd'; // WTON token address

// ============================================================================
// CONTRACT ABIs
// ============================================================================

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

export const DEPOSIT_MANAGER_ABI = [
  'function depositToken(uint256 channelId, uint256 amount, bytes32 _mptKey) external',
];