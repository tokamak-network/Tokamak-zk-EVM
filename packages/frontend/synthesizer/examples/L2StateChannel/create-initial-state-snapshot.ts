/**
 * Create Initial State Snapshot from Channel 8
 *
 * This script:
 * 1. Fetches channel 8's initial merkle root from on-chain
 * 2. Fetches all participants and their deposits
 * 3. Generates L2 storage keys for each participant
 * 4. Creates an initial state snapshot matching the on-chain initial root
 * 5. Saves the snapshot to a JSON file for use in first transaction
 */

import { ethers } from 'ethers';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync } from 'fs';
import { bigIntToBytes, setLengthLeft, bytesToHex, bytesToBigInt } from '@ethereumjs/util';
import { StateSnapshot } from '../../src/TokamakL2JS/stateManager/types.ts';
import { fromEdwardsToAddress } from '../../src/TokamakL2JS/index.ts';
import { jubjub } from '@noble/curves/misc';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root
const envPath = resolve(__dirname, '../../../../../.env');
config({ path: envPath });

// ============================================================================
// CONFIGURATION
// ============================================================================

import {
  SEPOLIA_RPC_URL,
  ROLLUP_BRIDGE_CORE_PROXY_ADDRESS as ROLLUP_BRIDGE_CORE_ADDRESS,
  CHANNEL_ID_8 as CHANNEL_ID,
  WTON_ADDRESS,
  ROLLUP_BRIDGE_CORE_ABI,
} from './constants.ts';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert L2 public key (pkx, pky) to L2 address
 * Uses fromEdwardsToAddress utility which expects 64-byte uncompressed affine coordinates
 */
function publicKeyToL2Address(pkx: bigint, pky: bigint): string {
  // Convert pkx and pky to 32-byte arrays each, then combine to 64 bytes
  // fromEdwardsToAddress expects 64-byte uncompressed affine coordinates
  const pkxBytes = setLengthLeft(bigIntToBytes(pkx), 32);
  const pkyBytes = setLengthLeft(bigIntToBytes(pky), 32);
  const combined = new Uint8Array(64);
  combined.set(pkxBytes, 0);
  combined.set(pkyBytes, 32);

  // fromEdwardsToAddress will use poseidon hash on the 64-byte array
  const address = fromEdwardsToAddress(combined);
  return address.toString();
}

/**
 * Generate L2 storage key from L2 address and slot
 */
function generateL2StorageKey(l2Address: string, slot: bigint): string {
  const addressBigInt = BigInt(l2Address);
  const storageKeyBigInt = addressBigInt ^ slot;
  const storageKeyBytes = setLengthLeft(bigIntToBytes(storageKeyBigInt), 32);
  return bytesToHex(storageKeyBytes);
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

async function createInitialStateSnapshot() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Create Initial State Snapshot from Channel 8           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Initialize provider and contract
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
  const bridgeContract = new ethers.Contract(ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI, provider);

  console.log('🌐 Connected to Sepolia RPC\n');

  // Step 1: Fetch channel info (includes initialRoot)
  console.log('📡 Step 1: Fetching channel info...');
  const [allowedTokens, state, participantCount, initialRoot] = await bridgeContract.getChannelInfo(CHANNEL_ID);
  console.log(`   ✅ Channel ID: ${CHANNEL_ID}`);
  console.log(`   ✅ State: ${state}`);
  console.log(`   ✅ Participants: ${participantCount}`);
  console.log(`   ✅ Initial Root: ${initialRoot}`);
  console.log(`   ✅ Allowed Tokens: ${allowedTokens.length}`);
  allowedTokens.forEach((token: string, idx: number) => {
    console.log(`      ${idx + 1}. ${token}`);
  });
  console.log('');

  // Step 2: Fetch participants
  console.log('👥 Step 2: Fetching participants...');
  const participants: string[] = await bridgeContract.getChannelParticipants(CHANNEL_ID);
  console.log(`   ✅ Found ${participants.length} participants:`);
  participants.forEach((addr: string, idx: number) => {
    console.log(`      ${idx + 1}. ${addr}`);
  });
  console.log('');

  // Step 3: Fetch participant public keys and deposits
  console.log('🔑 Step 3: Fetching participant public keys and deposits...');
  const participantsWithKeys: Array<{
    l1Address: string;
    l2Address: string;
    pkx: bigint;
    pky: bigint;
    deposit: bigint;
  }> = [];

  for (let i = 0; i < participants.length; i++) {
    const l1Address = participants[i];

    let pkxBigInt: bigint;
    let pkyBigInt: bigint;
    let l2Address: string;

    // Try to get public key from contract
    try {
      const [pkx, pky] = await bridgeContract.getParticipantPublicKey(CHANNEL_ID, l1Address);
      pkxBigInt = BigInt(pkx.toString());
      pkyBigInt = BigInt(pky.toString());
      l2Address = publicKeyToL2Address(pkxBigInt, pkyBigInt);
      console.log(`   ${i + 1}. ${l1Address}`);
      console.log(`      ✅ Public key fetched from contract`);
      console.log(`      L2 Address: ${l2Address}`);
      console.log(`      Public Key: (${pkxBigInt.toString(16)}, ${pkyBigInt.toString(16)})`);
    } catch (error: any) {
      // Fallback: Generate deterministic L2 key (for testing when public keys not stored)
      console.log(`   ${i + 1}. ${l1Address}`);
      console.log(`      ⚠️  Could not fetch public key from contract: ${error.message}`);
      console.log(`      🔧 Generating deterministic L2 key for testing...`);

      // Generate deterministic private key from index (same as test-channel-8-wton.ts)
      const privateKey = setLengthLeft(bigIntToBytes(BigInt(i + 1) * 123456789n), 32);
      const publicKey = jubjub.Point.BASE.multiply(bytesToBigInt(privateKey)).toBytes();
      l2Address = fromEdwardsToAddress(publicKey).toString();

      // Extract pkx, pky from public key bytes (first 32 bytes = pkx, next 32 bytes = pky)
      pkxBigInt = bytesToBigInt(publicKey.slice(0, 32));
      pkyBigInt = bytesToBigInt(publicKey.slice(32, 64));

      console.log(`      L2 Address: ${l2Address}`);
      console.log(`      Public Key: (${pkxBigInt.toString(16)}, ${pkyBigInt.toString(16)})`);
      console.log(`      ⚠️  Note: Using deterministic key - may not match on-chain state`);
    }

    // Get deposit for WTON
    const deposit = await bridgeContract.getParticipantTokenDeposit(CHANNEL_ID, l1Address, WTON_ADDRESS);
    const depositBigInt = BigInt(deposit.toString());

    participantsWithKeys.push({
      l1Address,
      l2Address,
      pkx: pkxBigInt,
      pky: pkyBigInt,
      deposit: depositBigInt,
    });

    const depositWTON = depositBigInt / BigInt(10 ** 18);
    const depositRAY = depositBigInt / BigInt(10 ** 27);
    console.log(
      `      Deposit: ${depositBigInt.toString()} wei (${depositWTON.toString()} WTON, ${depositRAY.toString()} RAY)`,
    );
    console.log('');
  }
  console.log('');

  // Step 4: Build storage entries and registered keys using MPT keys from contract
  console.log('📦 Step 4: Building storage entries and registered keys from contract MPT keys...');
  const initialStorageEntries: Array<{ index: number; key: string; value: string }> = [];
  const registeredKeys: string[] = [];
  const userL2Addresses: string[] = [];

  for (let i = 0; i < participantsWithKeys.length; i++) {
    const participant = participantsWithKeys[i];

    // Get MPT key from contract (more reliable than calculating)
    const mptKeyBigInt = await bridgeContract.getL2MptKey(CHANNEL_ID, participant.l1Address, WTON_ADDRESS);
    const mptKeyHex = '0x' + mptKeyBigInt.toString(16).padStart(64, '0');

    // Also calculate storage key for comparison
    const calculatedStorageKey = generateL2StorageKey(participant.l2Address, 0n);

    // Use MPT key from contract if it's not zero, otherwise use calculated key
    // MPT key of 0 means no deposit has been made yet
    let storageKeyToUse: string;
    if (mptKeyBigInt === 0n) {
      console.log(`   ${i + 1}. ${participant.l1Address}`);
      console.log(`      L2 Address: ${participant.l2Address}`);
      console.log(`      ⚠️  MPT Key from contract is 0 (no deposit yet)`);
      console.log(`      🔧 Using calculated storage key instead`);
      storageKeyToUse = calculatedStorageKey;
    } else {
      storageKeyToUse = mptKeyHex;
      console.log(`   ${i + 1}. ${participant.l1Address}`);
      console.log(`      L2 Address: ${participant.l2Address}`);
      console.log(`      ✅ MPT Key (from contract): ${mptKeyHex}`);
      if (mptKeyHex.toLowerCase() !== calculatedStorageKey.toLowerCase()) {
        console.log(`      ℹ️  Calculated Storage Key: ${calculatedStorageKey} (different from MPT key)`);
      }
    }

    registeredKeys.push(storageKeyToUse);
    userL2Addresses.push(participant.l2Address);

    // Storage entry for ERC20 balance
    const depositHex = '0x' + participant.deposit.toString(16).padStart(64, '0');
    initialStorageEntries.push({
      index: i,
      key: storageKeyToUse,
      value: depositHex,
    });

    console.log(`      Balance: ${depositHex}`);
  }
  console.log('');

  // Step 5: Construct initial state snapshot
  console.log('🏗️  Step 5: Constructing initial state snapshot...');
  const initialState: StateSnapshot = {
    stateRoot: initialRoot,
    registeredKeys: registeredKeys,
    storageEntries: initialStorageEntries,
    contractAddress: WTON_ADDRESS,
    userL2Addresses: userL2Addresses,
    userStorageSlots: [0n], // ERC20 balance slot
    timestamp: Date.now(),
    userNonces: participantsWithKeys.map(() => 0n), // Initial nonces are all 0
  };

  console.log(`   ✅ State Root: ${initialState.stateRoot}`);
  console.log(`   ✅ Storage Entries: ${initialState.storageEntries.length}`);
  console.log(`   ✅ Registered Keys: ${initialState.registeredKeys.length}`);
  console.log(`   ✅ Contract Address: ${initialState.contractAddress}`);
  console.log(`   ✅ User L2 Addresses: ${initialState.userL2Addresses.length}`);
  console.log(`   ✅ User Nonces: ${initialState.userNonces.length}`);
  console.log('');

  // Step 6: Save to file
  console.log('💾 Step 6: Saving initial state snapshot to file...');
  const outputDir = resolve(__dirname, 'test-outputs');
  mkdirSync(outputDir, { recursive: true });

  const outputPath = resolve(outputDir, 'initial_state_snapshot.json');
  const snapshotJson = JSON.stringify(
    initialState,
    (key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    },
    2,
  );

  writeFileSync(outputPath, snapshotJson, 'utf-8');
  console.log(`   ✅ Saved to: ${outputPath}`);
  console.log('');

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║              Initial State Snapshot Created!                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('📋 Summary:');
  console.log(`   Channel ID: ${CHANNEL_ID}`);
  console.log(`   Initial Root: ${initialRoot}`);
  console.log(`   Participants: ${participantsWithKeys.length}`);
  console.log(`   Total Deposits: ${participantsWithKeys.reduce((sum, p) => sum + p.deposit, 0n).toString()} wei`);
  console.log(`   Output File: ${outputPath}`);
  console.log('');
  console.log('💡 Usage:');
  console.log('   Use this snapshot as `previousState` in the first transaction');
  console.log('   to ensure the state matches the on-chain initial root.');
  console.log('');

  return initialState;
}

// Run the script
createInitialStateSnapshot()
  .then(() => {
    console.log('🎉 Success!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  });
