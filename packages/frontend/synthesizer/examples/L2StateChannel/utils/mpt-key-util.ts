/**
 * MPT Key Generation Utilities
 *
 * This module provides utilities for generating MPT keys that match
 * the on-chain deposit process using web.ts utility functions.
 */

import { bytesToHex } from '@ethereumjs/util';
import {
  deriveL2KeysFromSignature,
  deriveL2AddressFromKeys,
  deriveL2MptKeyFromAddress,
  L2_PRV_KEY_MESSAGE,
} from '../../../src/TokamakL2JS/utils/web.ts';
import { ethers } from 'ethers';

/**
 * Generate MPT key for a participant using web.ts utility functions
 *
 * Steps:
 * 1. Sign message "Tokamak-Private-App-Channel-{channelId}" with wallet
 * 2. Derive L2 keys from signature using deriveL2KeysFromSignature
 * 3. Derive L2 address from keys using deriveL2AddressFromKeys
 * 4. Derive MPT key from L2 address using deriveL2MptKeyFromAddress
 *
 * @param wallet - ethers.js Wallet instance (contains L1 private key)
 * @param channelId - Channel ID
 * @param slot - Storage slot number (default: 0 for ERC20 balance)
 * @returns MPT key as hex string (bytes32)
 */
export async function generateMptKeyFromWallet(
  wallet: ethers.Wallet,
  channelId: number,
  slot: number = 0,
): Promise<string> {
  console.log(`\n   📝 [generateMptKeyFromWallet] Starting MPT key generation...`);
  console.log(`      Input parameters:`);
  console.log(`         - walletAddress: ${wallet.address}`);
  console.log(`         - channelId: ${channelId}`);
  console.log(`         - slot: ${slot}`);

  // Step 1: Sign message to get signature
  const message = `${L2_PRV_KEY_MESSAGE}${channelId}`;
  const signature = (await wallet.signMessage(message)) as `0x${string}`;
  console.log(`\n   📝 Step 1: Sign message`);
  console.log(`      - message: ${message}`);
  console.log(`      - signature: ${signature.substring(0, 42)}...`);

  // Step 2: Derive L2 keys from signature
  const l2Keys = deriveL2KeysFromSignature(signature);
  console.log(`\n   📝 Step 2: Derive L2 keys from signature`);
  console.log(`      - privateKey (hex): ${bytesToHex(l2Keys.privateKey)}`);
  console.log(`      - publicKey (hex): ${bytesToHex(l2Keys.publicKey)}`);

  // Step 3: Derive L2 address from keys
  const l2Address = deriveL2AddressFromKeys(l2Keys);
  console.log(`\n   📝 Step 3: Derive L2 address from keys`);
  console.log(`      - l2Address: ${l2Address}`);

  // Step 4: Derive MPT key from L2 address
  const mptKey = deriveL2MptKeyFromAddress(l2Address, slot);
  console.log(`\n   📝 Step 4: Derive MPT key from L2 address`);
  console.log(`      - mptKey (hex): ${mptKey}`);
  console.log(`   ✅ [generateMptKeyFromWallet] MPT key generation completed\n`);

  return mptKey;
}

/**
 * Generate MPT key from L1 address by looking up the wallet
 * This requires the private key to be available in the environment
 *
 * @param l1Address - L1 address (EOA)
 * @param channelId - Channel ID
 * @param slot - Storage slot number (default: 0 for ERC20 balance)
 * @param privateKey - Private key for the L1 address
 * @returns MPT key as hex string (bytes32)
 */
export async function generateMptKeyFromL1Address(
  l1Address: string,
  channelId: number,
  slot: number = 0,
  privateKey: string,
): Promise<string> {
  // Create wallet from private key
  const wallet = new ethers.Wallet(privateKey);

  // Verify the address matches
  if (wallet.address.toLowerCase() !== l1Address.toLowerCase()) {
    throw new Error(`Address mismatch: expected ${l1Address}, got ${wallet.address}`);
  }

  // Generate MPT key using the wallet
  return generateMptKeyFromWallet(wallet, channelId, slot);
}
