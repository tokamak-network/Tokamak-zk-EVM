/**
 * Script: Initialize State Channel and Verify State Restoration
 *
 * This script is used to set up and verify a state channel on testnet before running the synthesizer.
 *
 * Flow:
 * 1. Fetches the initializeChannelState transaction from on-chain
 * 2. Gets the state root from the StateInitialized event
 * 3. Fetches on-chain data (MPT keys, deposits) using getL2MptKey()
 * 4. Creates a StateSnapshot and restores it to Synthesizer EVM
 * 5. Verifies that the restored Merkle root matches the on-chain state root
 *
 * Usage:
 * 1. First run deposit-ton.ts to deposit tokens to the channel
 * 2. Then run this script to verify the channel state is correctly initialized
 */

import { ethers } from 'ethers';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync } from 'fs';
import {
  ROLLUP_BRIDGE_CORE_ADDRESS,
  ROLLUP_BRIDGE_CORE_ABI,
} from '../../../src/interface/adapters/constants/index.ts';
import { SEPOLIA_RPC_URL } from '../constants/index.ts';
import {
  Address,
  hexToBytes,
  addHexPrefix,
  bytesToBigInt,
  bigIntToBytes,
  setLengthLeft,
  utf8ToBytes,
  toBytes,
} from '@ethereumjs/util';
import { poseidon, fromEdwardsToAddress } from '../../../src/TokamakL2JS/index.ts';
import { jubjub } from '@noble/curves/misc';
import { createSynthesizerOptsForSimulationFromRPC, SynthesizerSimulationOpts } from '../../../src/interface/index.ts';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root
const envPath = resolve(__dirname, '../../../../../../.env');
config({ path: envPath });

// ============================================================================
// CONFIGURATION
// ============================================================================

const RPC_URL = SEPOLIA_RPC_URL;
const CHANNEL_ID = 3; // Channel ID for testing

// Transaction hash for initializeChannelState
// This should be the transaction that called initializeChannelState for the channel
const INITIALIZE_TX_HASH = '0xcf31e988b30825eb4e8a5f3ceb0a2b5cd2462dc4881dc6e2f58cfdb184acaeea';

// Output directory for state info
const OUTPUT_DIR = resolve(__dirname, '../../test-outputs/channel-state');

// ============================================================================
// MAIN FUNCTION
// ============================================================================

async function initializeAndVerifyChannel() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Initialize State Channel and Verify State Restoration   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  // Step 1: Fetch transaction details
  console.log('🔍 Step 1: Fetching initializeChannelState transaction...');
  const tx = await provider.getTransaction(INITIALIZE_TX_HASH);
  if (tx === null || tx.blockNumber === null) {
    throw new Error('Transaction not found or not yet mined');
  }
  if (tx.to === null) {
    throw new Error('Transaction to address is null');
  }
  if (tx.from === null) {
    throw new Error('Transaction from address is null');
  }
  if (tx.data === null) {
    throw new Error('Transaction data is null');
  }

  console.log(`   ✅ Transaction found:`);
  console.log(`      - Block Number: ${tx.blockNumber}`);
  console.log(`      - From: ${tx.from}`);
  console.log(`      - To: ${tx.to}`);
  console.log(`      - Data Length: ${tx.data.length} bytes\n`);

  // Step 2: Fetch StateInitialized event to get the state root
  console.log('🔍 Step 2: Fetching StateInitialized event...');
  const receipt = await provider.getTransactionReceipt(INITIALIZE_TX_HASH);
  if (!receipt) {
    throw new Error('Transaction receipt not found');
  }

  // Find StateInitialized event
  const stateInitializedTopic = ethers.id('StateInitialized(uint256,bytes32)');
  const stateInitializedEvent = receipt.logs.find(log => log.topics[0] === stateInitializedTopic);

  if (!stateInitializedEvent) {
    throw new Error('StateInitialized event not found in transaction receipt');
  }

  // Decode event data
  const iface = new ethers.Interface(['event StateInitialized(uint256 indexed channelId, bytes32 currentStateRoot)']);
  const decodedEvent = iface.decodeEventLog(
    'StateInitialized',
    stateInitializedEvent.data,
    stateInitializedEvent.topics,
  );
  const onChainStateRoot = decodedEvent.currentStateRoot;

  console.log(`   ✅ StateInitialized event found:`);
  console.log(`      - Channel ID: ${decodedEvent.channelId.toString()}`);
  console.log(`      - State Root: ${onChainStateRoot}\n`);

  // Step 3: Build StateSnapshot from on-chain data and restore to Synthesizer EVM
  console.log('🔄 Step 3: Building StateSnapshot from on-chain data...');
  console.log(`   This fetches all on-chain data (MPT keys, deposits, L2 addresses) and creates a StateSnapshot\n`);
  console.log(`   Then restores it to Synthesizer's EVM to get the exact same merkle root\n`);

  // Get channel info
  const bridgeContract = new ethers.Contract(ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI, provider);
  const [targetAddress, state, participantCount, initialRoot] = await bridgeContract.getChannelInfo(CHANNEL_ID);
  const participants: string[] = await bridgeContract.getChannelParticipants(CHANNEL_ID);

  console.log(`   Channel Info:`);
  console.log(`      - Allowed Tokens: ${targetAddress}`);
  console.log(`      - Participants: ${participantCount.toString()}`);
  console.log(`      - Initial Root: ${initialRoot}\n`);

  // Fetch all on-chain data
  console.log(`   Fetching on-chain data for all participants...\n`);

  const storageEntries: Array<{ index: number; key: string; value: string }> = [];
  const registeredKeys: string[] = [];

  for (let i = 0; i < participants.length; i++) {
    const l1Address = participants[i];

    // Get MPT key from on-chain (this is what was actually used during deposit)
    const onChainMptKeyBigInt = await bridgeContract.getL2MptKey(CHANNEL_ID, l1Address);
    const onChainMptKeyHex = '0x' + onChainMptKeyBigInt.toString(16).padStart(64, '0');

    // Get deposit amount from on-chain
    const deposit = await bridgeContract.getParticipantDeposit(CHANNEL_ID, l1Address);

    console.log(`      ${i + 1}. ${l1Address}`);
    console.log(`         MPT Key: ${onChainMptKeyHex}`);
    console.log(`         Deposit: ${deposit.toString()}`);

    // Use the on-chain MPT key (this is the source of truth)
    registeredKeys.push(onChainMptKeyHex);

    const depositHex = '0x' + deposit.toString(16).padStart(64, '0');
    storageEntries.push({
      index: i,
      key: onChainMptKeyHex,
      value: depositHex,
    });
  }
  console.log('');

  // Fetch pre-allocated leaves from BridgeCore contract
  console.log('   📋 Fetching pre-allocated leaves from contract...');
  const preAllocatedKeysFromContract = await bridgeContract.getPreAllocatedKeys(targetAddress);
  console.log(`   Found ${preAllocatedKeysFromContract.length} pre-allocated keys from contract`);

  const preAllocatedLeaves: Array<{ key: string; value: string }> = [];
  for (const key of preAllocatedKeysFromContract) {
    let keyHex: string;
    if (typeof key === 'string') {
      keyHex = key.startsWith('0x') ? key : '0x' + key;
      if (keyHex.length < 66) {
        const hexPart = keyHex.slice(2);
        keyHex = '0x' + hexPart.padStart(64, '0');
      }
    } else {
      keyHex = '0x' + key.toString(16).padStart(64, '0');
    }

    const [value, exists] = await bridgeContract.getPreAllocatedLeaf(targetAddress, key);
    let valueHex: string;
    if (typeof value === 'string') {
      valueHex = value.startsWith('0x') ? value : '0x' + value;
      if (valueHex.length < 66) {
        const hexPart = valueHex.slice(2);
        valueHex = '0x' + hexPart.padStart(64, '0');
      }
    } else {
      valueHex = '0x' + value.toString(16).padStart(64, '0');
    }

    if (exists) {
      preAllocatedLeaves.push({ key: keyHex, value: valueHex });
      console.log(`      [${preAllocatedLeaves.length - 1}] Key: ${keyHex}, Value: ${valueHex}`);
    }
  }
  console.log('');

  // Store state information for later use
  const stateInfo = {
    stateRoot: onChainStateRoot,
    registeredKeys: registeredKeys,
    storageEntries: storageEntries,
    contractAddress: targetAddress,
    preAllocatedLeaves: preAllocatedLeaves,
  };

  console.log(`   ✅ State information collected:`);
  console.log(`      - State Root: ${stateInfo.stateRoot}`);
  console.log(`      - Storage Entries: ${stateInfo.storageEntries.length}`);
  console.log(`      - Registered Keys: ${stateInfo.registeredKeys.length}`);
  console.log(`      - Pre-allocated Leaves: ${stateInfo.preAllocatedLeaves.length}\n`);

  // Step 4: Generate L2 keys for all participants (using deposit MPT key logic)
  console.log('🔑 Step 4: Generating L2 keys from deposit MPT keys...\n');

  // Read private keys from environment variables (same as deposit-ton.ts)
  const PRIVATE_KEYS = [process.env.ALICE_PRIVATE_KEY, process.env.BOB_PRIVATE_KEY, process.env.CHARLIE_PRIVATE_KEY];
  const PARTICIPANT_NAMES = ['Alice', 'Bob', 'Charlie'];

  if (!PRIVATE_KEYS[0] || !PRIVATE_KEYS[1] || !PRIVATE_KEYS[2]) {
    console.error('❌ Error: Private keys not found in .env file');
    console.error('Please add the following to your .env file:');
    console.error('  ALICE_PRIVATE_KEY="..."');
    console.error('  BOB_PRIVATE_KEY="..."');
    console.error('  CHARLIE_PRIVATE_KEY="..."');
    process.exit(1);
  }

  // Generate L2 keys for all participants using the same logic as deposit-ton.ts
  // This recreates the exact same private/public keys that were used during deposit
  const allPublicKeys: Uint8Array[] = [];
  const allL1Addresses: string[] = [];
  const allPrivateKeys: Uint8Array[] = [];
  const allL2Addresses: string[] = [];

  for (let i = 0; i < participants.length; i++) {
    const l1Address = participants[i];

    const participantIndex = participants.findIndex(addr => addr.toLowerCase() === l1Address.toLowerCase());
    if (participantIndex === -1 || !PRIVATE_KEYS[participantIndex]) {
      throw new Error(`Private key not found for participant ${l1Address}`);
    }
    const wallet = new ethers.Wallet(PRIVATE_KEYS[participantIndex]!);

    // Verify address matches
    if (wallet.address.toLowerCase() !== l1Address.toLowerCase()) {
      throw new Error(`Address mismatch: expected ${l1Address}, got ${wallet.address}`);
    }

    // Generate seed and private key (same as deposit-ton.ts)
    // This uses the same logic that was used to generate the MPT key during deposit
    const l1PublicKeyHex = wallet.signingKey.publicKey;
    const seedString = `${l1PublicKeyHex}${CHANNEL_ID}${PARTICIPANT_NAMES[participantIndex]!}`;
    const seedBytes = utf8ToBytes(seedString);
    const seedHashBytes = poseidon(seedBytes);
    const seedHashBigInt = bytesToBigInt(seedHashBytes);
    const privateKeyBigInt = seedHashBigInt % jubjub.Point.Fn.ORDER;
    const privateKeyValue = privateKeyBigInt === 0n ? 1n : privateKeyBigInt;
    const privateKey = setLengthLeft(bigIntToBytes(privateKeyValue), 32);

    // Generate public key from private key
    const publicKey = jubjub.Point.BASE.multiply(bytesToBigInt(privateKey)).toBytes();
    const l2Address = fromEdwardsToAddress(jubjub.Point.fromBytes(publicKey)).toString();

    allPublicKeys.push(publicKey);
    allL1Addresses.push(l1Address);
    allPrivateKeys.push(privateKey);
    allL2Addresses.push(l2Address);
  }

  console.log(`   ✅ Generated L2 keys for ${allPublicKeys.length} participants\n`);

  // Step 5: Build initStorageKeys for state restoration
  console.log('🔄 Step 5: Building initStorageKeys for state restoration...\n');

  // Build initStorageKeys: pre-allocated leaves first, then participants
  const initStorageKeys: Array<{ L1: Uint8Array; L2: Uint8Array }> = [];

  // Add pre-allocated leaves first (in the order returned by getPreAllocatedKeys)
  for (const leaf of preAllocatedLeaves) {
    const keyBytes = hexToBytes(addHexPrefix(leaf.key));
    initStorageKeys.push({
      L1: keyBytes, // For pre-allocated leaves, L1 and L2 are the same
      L2: keyBytes,
    });
  }

  // Add participants' storage keys
  // On-chain, deposit values are stored using MPT keys (not L1 storage keys)
  // So we use MPT key for both L1 and L2 to fetch from on-chain
  for (let i = 0; i < registeredKeys.length; i++) {
    const mptKeyHex = registeredKeys[i];
    const mptKeyBytes = hexToBytes(addHexPrefix(mptKeyHex));

    // Use MPT key for both L1 and L2 since on-chain storage uses MPT key
    // L1 key: MPT key (used to fetch value from on-chain)
    // L2 key: MPT key (actual L2 storage key)
    initStorageKeys.push({
      L1: mptKeyBytes,
      L2: mptKeyBytes,
    });
  }

  console.log(`   ✅ Built initStorageKeys:`);
  console.log(`      - Pre-allocated leaves: ${preAllocatedLeaves.length}`);
  console.log(`      - Participants: ${registeredKeys.length}`);
  console.log(`      - Total: ${initStorageKeys.length}\n`);

  // Step 6: Verify state restoration using initStorageKeys
  console.log('🔄 Step 6: Verifying state restoration...\n');

  // Use main.ts pattern: createSynthesizerOptsForSimulationFromRPC
  // Note: TokamakL2Tx requires at least 4 bytes (function selector), so we use a dummy selector
  const verifyCalldata = hexToBytes(addHexPrefix('0x00000000')); // Dummy function selector for verification only
  const verifySimulationOpts: SynthesizerSimulationOpts = {
    txNonce: 0n,
    rpcUrl: SEPOLIA_RPC_URL,
    senderL2PrvKey: allPrivateKeys[0], // Use actual deposit private key
    blockNumber: tx.blockNumber,
    contractAddress: targetAddress as `0x${string}`,
    initStorageKeys: initStorageKeys,
    callData: verifyCalldata,
  };

  // Create synthesizer options (main.ts pattern)
  // This will automatically initialize the state manager with initStorageKeys
  const verifySynthesizerOpts = await createSynthesizerOptsForSimulationFromRPC(verifySimulationOpts);

  // Get state manager from synthesizer options (main.ts pattern)
  const stateManager = verifySynthesizerOpts.stateManager;
  const contractAddress = new Address(toBytes(addHexPrefix(targetAddress)));

  // After initTokamakExtendsFromRPC, we need to manually set the deposit values
  // because initTokamakExtendsFromRPC tries to fetch from on-chain using L1 key,
  // but deposit values are stored differently on-chain
  console.log('   Setting deposit values from on-chain data...');
  for (let i = 0; i < storageEntries.length; i++) {
    const entry = storageEntries[i];
    const mptKeyBytes = hexToBytes(addHexPrefix(entry.key));
    const valueBytes = hexToBytes(addHexPrefix(entry.value));
    await stateManager.putStorage(contractAddress, mptKeyBytes, valueBytes);
    console.log(`      [${i}] Key: ${entry.key.slice(0, 20)}... Value: ${entry.value}`);
  }

  // Rebuild merkle tree with correct deposit values
  console.log('   Rebuilding merkle tree with deposit values...');

  // Debug: Check leaves calculation - Show ALL leaves
  const leaves = await stateManager.convertLeavesIntoMerkleTreeLeaves();
  console.log('\n   📋 All Merkle tree leaves (16 total):');
  console.log('   ─────────────────────────────────────────────────────────');

  const { poseidon_raw } = await import('../../../src/interface/qapCompiler/configuredTypes.ts');

  for (let i = 0; i < leaves.length; i++) {
    const leaf = leaves[i];
    const leafHex = '0x' + leaf.toString(16).padStart(64, '0');

    if (i < preAllocatedLeaves.length) {
      // Pre-allocated leaves
      const preAllocatedLeaf = preAllocatedLeaves[i];
      const keyBigInt = BigInt(preAllocatedLeaf.key);
      const valueBigInt = BigInt(preAllocatedLeaf.value);
      const expectedLeaf = poseidon_raw([keyBigInt, valueBigInt]);
      const matches = leaf === expectedLeaf;
      const marker = matches ? '✅' : '❌';
      console.log(`   [${i}] ${marker} Pre-allocated leaf:`);
      console.log(`       Key: ${preAllocatedLeaf.key}`);
      console.log(`       Value: ${valueBigInt.toString()}`);
      console.log(`       Leaf: ${leafHex}`);
      console.log(`       Expected: 0x${expectedLeaf.toString(16).padStart(64, '0')}`);
    } else if (i < preAllocatedLeaves.length + registeredKeys.length) {
      // Participants' MPT keys and balances
      const participantIndex = i - preAllocatedLeaves.length;
      const key = registeredKeys[participantIndex];
      const entry = storageEntries.find(e => e.key.toLowerCase() === key.toLowerCase());
      const keyHex = key.startsWith('0x') ? key : '0x' + key;
      const keyBigInt = BigInt(keyHex);
      const valueHex = entry ? (entry.value.startsWith('0x') ? entry.value : '0x' + entry.value) : '0x0';
      const valueBigInt = BigInt(valueHex);
      const expectedLeaf = poseidon_raw([keyBigInt, valueBigInt]);
      const matches = leaf === expectedLeaf;
      const marker = matches ? '✅' : '❌';
      console.log(`   [${i}] ${marker} Participant ${participantIndex}:`);
      console.log(`       Key: ${key}`);
      console.log(`       Value: ${valueBigInt.toString()}`);
      console.log(`       Leaf: ${leafHex}`);
      console.log(`       Expected: 0x${expectedLeaf.toString(16).padStart(64, '0')}`);
    } else {
      // Empty slots (should be 0n)
      const expectedLeaf = 0n;
      const matches = leaf === expectedLeaf;
      const marker = matches ? '✅' : '❌';
      console.log(`   [${i}] ${marker} Empty slot (should be 0n):`);
      console.log(`       Leaf: ${leafHex}`);
      console.log(`       Expected: 0x${expectedLeaf.toString(16).padStart(64, '0')}`);
    }
  }
  console.log('   ─────────────────────────────────────────────────────────\n');

  // Use getUpdatedMerkleTreeRoot() instead of initialMerkleTree.root
  // because initialMerkleTree was built before putStorage, and we need the updated root
  const restoredMerkleRootBigInt = await stateManager.getUpdatedMerkleTreeRoot();
  const restoredMerkleRootHex = restoredMerkleRootBigInt.toString(16);
  const restoredStateRoot = '0x' + restoredMerkleRootHex.padStart(64, '0').toLowerCase();
  const expectedRoot = BigInt(stateInfo.stateRoot);

  console.log(`   ✅ State restored successfully`);
  console.log(`      - Restored State Root: ${restoredStateRoot}`);
  console.log(`      - Expected State Root: 0x${expectedRoot.toString(16)}`);
  console.log(`      - On-chain State Root: ${onChainStateRoot}\n`);

  // Step 7: Compare state roots
  console.log('📊 Step 7: Comparing state roots...');
  console.log('─────────────────────────────────────────────────────────');
  console.log(`   On-chain State Root: ${onChainStateRoot}`);
  console.log(`   Restored State Root: ${restoredStateRoot}`);
  console.log('─────────────────────────────────────────────────────────\n');

  if (restoredStateRoot.toLowerCase() !== onChainStateRoot.toLowerCase()) {
    console.log('❌ FAILURE: State roots do not match!');
    console.log('   The restored state does not match the on-chain state.');
    console.log('   This may indicate:');
    console.log('   - MPT key derivation issue');
    console.log('   - Storage entry ordering issue');
    console.log('   - Merkle tree calculation difference\n');
    process.exit(1);
  }

  console.log('✅ SUCCESS: State roots match!');
  console.log('   The restored state matches the on-chain state exactly.\n');

  // Step 8: Save channel state info for synthesizer usage
  console.log('💾 Step 8: Saving channel state info...\n');

  // Prepare state info for export
  const channelStateInfo = {
    channelId: CHANNEL_ID,
    stateRoot: stateInfo.stateRoot,
    contractAddress: stateInfo.contractAddress,
    registeredKeys: stateInfo.registeredKeys,
    storageEntries: stateInfo.storageEntries,
    preAllocatedLeaves: stateInfo.preAllocatedLeaves,
    participants: {
      l1Addresses: allL1Addresses,
      l2Addresses: allL2Addresses,
      publicKeys: allPublicKeys.map(pk => '0x' + Buffer.from(pk).toString('hex')),
    },
    blockNumber: tx.blockNumber,
    initializeTxHash: INITIALIZE_TX_HASH,
  };

  // Save to file
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = resolve(OUTPUT_DIR, 'channel_state_info.json');
  writeFileSync(
    outputPath,
    JSON.stringify(channelStateInfo, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2),
    'utf-8',
  );

  console.log(`   ✅ Channel state info saved to: ${outputPath}\n`);

  // Final summary
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    Channel Initialization Complete           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('📊 Channel Summary:');
  console.log(`   - Channel ID: ${CHANNEL_ID}`);
  console.log(`   - Target Contract: ${stateInfo.contractAddress}`);
  console.log(`   - Participants: ${allL1Addresses.length}`);
  console.log(`   - State Root: ${stateInfo.stateRoot}`);
  console.log(`   - Block Number: ${tx.blockNumber}\n`);

  console.log('👥 Participant Details:');
  for (let i = 0; i < allL1Addresses.length; i++) {
    console.log(`   ${i + 1}. ${PARTICIPANT_NAMES[i] || `Participant ${i + 1}`}:`);
    console.log(`      L1: ${allL1Addresses[i]}`);
    console.log(`      L2: ${allL2Addresses[i]}`);
    console.log(`      MPT Key: ${registeredKeys[i]}`);
    const entry = storageEntries.find(e => e.key.toLowerCase() === registeredKeys[i].toLowerCase());
    console.log(`      Balance: ${entry ? BigInt(entry.value).toString() : '0'} wei\n`);
  }

  console.log('✅ Channel is ready for synthesizer testing!');
  console.log(`   Use the saved state info at: ${outputPath}\n`);
}

// ============================================================================
// RUN SCRIPT
// ============================================================================

initializeAndVerifyChannel()
  .then(() => {
    console.log('🎉 Channel initialization completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Script failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  });
