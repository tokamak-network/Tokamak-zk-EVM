/**
 * MPT Key Generation Utilities
 *
 * This module provides utilities for generating MPT keys that match
 * the on-chain deposit process.
 */

import { utf8ToBytes, setLengthLeft, bytesToBigInt, bigIntToBytes, bytesToHex } from '@ethereumjs/util';
import { jubjub } from '@noble/curves/misc';
import { poseidon } from '../../src/TokamakL2JS/crypto/index.ts';
import { fromEdwardsToAddress } from '../../src/TokamakL2JS/utils/index.ts';
import { generateL2StorageKey } from './constants.ts';
import { ethers } from 'ethers';

/**
 * Generate MPT key for a participant using the same logic as deposit-ton.ts
 *
 * Steps:
 * 1. Extract public key from L1 wallet (EOA public key)
 * 2. Create seed from L1 public key + channel ID + participant name => poseidon hash
 * 3. Generate private key from seed using jubjub
 * 4. Generate public key from private key
 * 5. Derive L2 address from public key
 * 6. Generate MPT key using getUserStorageKey([l2Address, slot], 'TokamakL2')
 *
 * @param wallet - ethers.js Wallet instance (contains L1 private key)
 * @param participantName - Name of the participant (Alice, Bob, Charlie)
 * @param channelId - Channel ID
 * @param tokenAddress - Token address (TON in this case)
 * @param slot - Storage slot number (default: 0 for ERC20 balance)
 * @returns MPT key as hex string (bytes32)
 */
export function generateMptKeyFromWallet(
  wallet: ethers.Wallet,
  participantName: string,
  channelId: number,
  tokenAddress: string,
  slot: number = 0,
): string {
  // Step 1: Extract public key from L1 wallet (EOA public key)
  // ethers.js v6: wallet.signingKey.publicKey (compressed, 33 bytes with 0x prefix)
  // Convert to hex string for seed generation
  const l1PublicKeyHex = wallet.signingKey.publicKey; // e.g., "0x02..." or "0x03..." (compressed)

  // Step 2: Create seed from L1 public key + channel ID + participant name
  // Concat as strings and hash with poseidon
  const seedString = `${l1PublicKeyHex}${channelId}${participantName}`;
  const seedBytes = utf8ToBytes(seedString);
  const seedHashBytes = poseidon(seedBytes);

  // Step 3: Generate private key from seed hash
  // Convert seed hash to bigint and ensure it's within JubJub scalar field range
  const seedHashBigInt = bytesToBigInt(seedHashBytes);
  const privateKeyBigInt = seedHashBigInt % jubjub.Point.Fn.ORDER;

  // Ensure private key is not zero (JubJub requires 1 <= sc < curve.n)
  const privateKeyValue = privateKeyBigInt === 0n ? 1n : privateKeyBigInt;
  const privateKey = setLengthLeft(bigIntToBytes(privateKeyValue), 32);

  // Step 4: Generate public key from private key
  const publicKey = jubjub.Point.BASE.multiply(bytesToBigInt(privateKey)).toBytes();

  // Step 5: Derive L2 address from public key
  const l2Address = fromEdwardsToAddress(jubjub.Point.fromBytes(publicKey));

  // Step 6: Generate MPT key using XOR: l2Address ^ slot ^ tokenAddress
  // This matches the on-chain MPT key generation: generateL2StorageKey(l2Address, slot, tokenAddress)
  // IMPORTANT: Must use XOR (not Poseidon hash) to match on-chain behavior
  const l2AddressHex = '0x' + Array.from(l2Address.toBytes())
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  const mptKey = generateL2StorageKey(l2AddressHex, BigInt(slot), tokenAddress);

  return mptKey;
}

/**
 * Generate MPT key from L1 address by looking up the wallet
 * This requires the private key to be available in the environment
 *
 * @param l1Address - L1 address (EOA)
 * @param participantName - Name of the participant (Alice, Bob, Charlie)
 * @param channelId - Channel ID
 * @param tokenAddress - Token address
 * @param slot - Storage slot number (default: 0 for ERC20 balance)
 * @param privateKeys - Array of private keys corresponding to participants
 * @param participantNames - Array of participant names
 * @returns MPT key as hex string (bytes32)
 */
export function generateMptKeyFromL1Address(
  l1Address: string,
  participantName: string,
  channelId: number,
  tokenAddress: string,
  slot: number = 0,
  privateKeys: string[],
  participantNames: string[],
): string {
  // Find the index of the participant
  const participantIndex = participantNames.indexOf(participantName);
  if (participantIndex === -1 || !privateKeys[participantIndex]) {
    throw new Error(`Private key not found for participant ${participantName} (${l1Address})`);
  }

  // Create wallet from private key
  const wallet = new ethers.Wallet(privateKeys[participantIndex]);

  // Verify the address matches
  if (wallet.address.toLowerCase() !== l1Address.toLowerCase()) {
    throw new Error(`Address mismatch: expected ${l1Address}, got ${wallet.address}`);
  }

  // Generate MPT key using the wallet
  return generateMptKeyFromWallet(wallet, participantName, channelId, tokenAddress, slot);
}
