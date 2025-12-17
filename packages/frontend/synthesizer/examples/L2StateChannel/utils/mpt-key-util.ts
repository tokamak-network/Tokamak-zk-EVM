/**
 * MPT Key Generation Utilities
 *
 * This module provides utilities for generating MPT keys that match
 * the on-chain deposit process.
 */

import { utf8ToBytes, setLengthLeft, bytesToBigInt, bigIntToBytes, bytesToHex } from '@ethereumjs/util';
import { jubjub } from '@noble/curves/jubjub';
import { fromEdwardsToAddress, getUserStorageKey } from '../../../src/TokamakL2JS/utils/index';
import { ethers } from 'ethers';

/**
 * Generate MPT key for a participant using the same logic as deposit-ton.ts
 *
 * Steps:
 * 1. Extract public key from L1 wallet (EOA public key)
 * 2. Create seed from L1 public key + channel ID + participant name => keccak256 hash
 * 3. Generate private key from seed using jubjub
 * 4. Generate public key from private key
 * 5. Derive L2 address from public key
 * 6. Generate MPT key using getUserStorageKey([l2Address, slot], 'TokamakL2') with poseidon hash
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
  console.log(`\n   📝 [generateMptKeyFromWallet] Starting MPT key generation...`);
  console.log(`      Input parameters:`);
  console.log(`         - participantName: ${participantName}`);
  console.log(`         - channelId: ${channelId}`);
  console.log(`         - tokenAddress: ${tokenAddress}`);
  console.log(`         - slot: ${slot}`);

  // Step 1: Extract public key from L1 wallet (EOA public key)
  // ethers.js v6: wallet.signingKey.publicKey (compressed, 33 bytes with 0x prefix)
  // Convert to hex string for seed generation
  const l1PublicKeyHex = wallet.signingKey.publicKey; // e.g., "0x02..." or "0x03..." (compressed)
  console.log(`\n   📝 Step 1: Extract L1 Public Key`);
  console.log(`      - l1PublicKeyHex: ${l1PublicKeyHex}`);

  // Step 2: Create seed from L1 public key + channel ID + participant name
  // Concat as strings and hash with keccak256
  const seedString = `${l1PublicKeyHex}${channelId}${participantName}`;
  const seedBytes = utf8ToBytes(seedString);
  const seedHashHex = ethers.keccak256(seedBytes);
  const seedHashBytes = ethers.getBytes(seedHashHex);
  console.log(`\n   📝 Step 2: Create seed and hash`);
  console.log(`      - seedString: ${seedString}`);
  console.log(`      - seedBytes length: ${seedBytes.length} bytes`);
  console.log(`      - seedBytes (hex): ${bytesToHex(seedBytes)}`);
  console.log(`      - seedHashBytes length: ${seedHashBytes.length} bytes`);
  console.log(`      - seedHashBytes (hex): ${bytesToHex(seedHashBytes)}`);

  // Step 3: Generate private key from seed hash
  // Convert seed hash to bigint and ensure it's within JubJub scalar field range
  const seedHashBigInt = bytesToBigInt(seedHashBytes);
  const privateKeyBigInt = seedHashBigInt % jubjub.Point.Fn.ORDER;
  console.log(`\n   📝 Step 3: Generate private key from seed hash`);
  console.log(`      - seedHashBigInt: ${seedHashBigInt.toString()}`);
  console.log(`      - jubjub.Point.Fn.ORDER: ${jubjub.Point.Fn.ORDER.toString()}`);
  console.log(`      - privateKeyBigInt (before zero check): ${privateKeyBigInt.toString()}`);

  // Ensure private key is not zero (JubJub requires 1 <= sc < curve.n)
  const privateKeyValue = privateKeyBigInt === 0n ? 1n : privateKeyBigInt;
  const privateKey = setLengthLeft(bigIntToBytes(privateKeyValue), 32);
  console.log(`      - privateKeyValue (after zero check): ${privateKeyValue.toString()}`);
  console.log(`      - privateKey length: ${privateKey.length} bytes`);
  console.log(`      - privateKey (hex): ${bytesToHex(privateKey)}`);

  // Step 4: Generate public key from private key
  const publicKey = jubjub.Point.BASE.multiply(bytesToBigInt(privateKey)).toBytes();
  console.log(`\n   📝 Step 4: Generate public key from private key`);
  console.log(`      - publicKey length: ${publicKey.length} bytes`);
  console.log(`      - publicKey (hex): ${bytesToHex(publicKey)}`);

  // Step 5: Derive L2 address from public key
  const l2Address = fromEdwardsToAddress(jubjub.Point.fromBytes(publicKey));
  console.log(`\n   📝 Step 5: Derive L2 address from public key`);
  console.log(`      - l2Address: ${l2Address.toString()}`);

  // Step 6: Generate MPT key using getUserStorageKey
  // This matches the on-chain MPT key generation logic
  // Note: getUserStorageKey uses poseidon hash for 'TokamakL2' layer
  const mptKeyBytes = getUserStorageKey([l2Address, slot], 'TokamakL2');
  const mptKey = bytesToHex(mptKeyBytes);
  console.log(`\n   📝 Step 6: Generate MPT key using getUserStorageKey`);
  console.log(`      - getUserStorageKey inputs:`);
  console.log(`         - l2Address: ${l2Address.toString()}`);
  console.log(`         - slot: ${slot}`);
  console.log(`         - layer: 'TokamakL2'`);
  console.log(`      - mptKeyBytes length: ${mptKeyBytes.length} bytes`);
  console.log(`      - mptKey (hex): ${mptKey}`);
  console.log(`   ✅ [generateMptKeyFromWallet] MPT key generation completed\n`);

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
