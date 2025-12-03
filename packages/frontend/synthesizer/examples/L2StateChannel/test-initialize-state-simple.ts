/**
 * Test: Restore Initial State from On-chain Data
 *
 * This script:
 * 1. Fetches the initializeChannelState transaction from on-chain
 * 2. Gets the state root from the StateInitialized event
 * 3. Fetches on-chain data (MPT keys, deposits) using getL2MptKey()
 * 4. Creates a StateSnapshot and restores it to Synthesizer EVM
 * 5. Verifies that the restored Merkle root matches the on-chain state root
 *
 * This initial Merkle root can be used as the base state for simulating L2 transactions.
 */

import { ethers } from 'ethers';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SEPOLIA_RPC_URL, ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI } from './constants.ts';
import { Address, hexToBytes, addHexPrefix } from '@ethereumjs/util';
import { StateSnapshot } from '../../src/TokamakL2JS/stateManager/types.ts';
import { createTokamakL2StateManagerFromL1RPC } from '../../src/TokamakL2JS/stateManager/constructors.ts';
import { poseidon, getEddsaPublicKey } from '../../src/TokamakL2JS/index.ts';
import { Common, Mainnet } from '@ethereumjs/common';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root
const envPath = resolve(__dirname, '../../../../../.env');
config({ path: envPath });

// ============================================================================
// CONFIGURATION
// ============================================================================

const RPC_URL = SEPOLIA_RPC_URL;
const CHANNEL_ID = 6; // Channel 6 for testing (single token: TON only)

// Transaction hash for initializeChannelState
// This should be the transaction that called initializeChannelState for the channel
const INITIALIZE_TX_HASH = '0x713c57dc67b9d18945b8140c8eee256f21e999387a884fcb3531eaedd45aa859';

// ============================================================================
// MAIN TEST FUNCTION
// ============================================================================

async function testInitializeState() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Test: Restore Initial State from On-chain Data          ║');
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
  const [allowedTokens, state, participantCount, initialRoot] = await bridgeContract.getChannelInfo(CHANNEL_ID);
  const participants: string[] = await bridgeContract.getChannelParticipants(CHANNEL_ID);

  console.log(`   Channel Info:`);
  console.log(`      - Allowed Tokens: ${allowedTokens.length}`);
  console.log(`      - Participants: ${participantCount.toString()}`);
  console.log(`      - Initial Root: ${initialRoot}\n`);

  // Fetch all on-chain data
  console.log(`   Fetching on-chain data for all participants...`);
  console.log(`   Using getL2MptKey() directly - this key is used as-is for leaf generation\n`);

  const storageEntries: Array<{ index: number; key: string; value: string }> = [];
  const registeredKeys: string[] = [];

  for (let i = 0; i < participants.length; i++) {
    const l1Address = participants[i];
    const token = allowedTokens[0]; // Use first token

    // Get MPT key from on-chain - use this key directly for leaf generation
    const mptKeyBigInt = await bridgeContract.getL2MptKey(CHANNEL_ID, l1Address, token);
    const mptKeyHex = '0x' + mptKeyBigInt.toString(16).padStart(64, '0');

    // Get deposit amount
    const deposit = await bridgeContract.getParticipantTokenDeposit(CHANNEL_ID, l1Address, token);

    console.log(`      ${i + 1}. ${l1Address}`);
    console.log(`         MPT Key (from getL2MptKey): ${mptKeyHex}`);
    console.log(`         Deposit: ${deposit.toString()}`);

    registeredKeys.push(mptKeyHex);

    const depositHex = '0x' + deposit.toString(16).padStart(64, '0');
    storageEntries.push({
      index: i,
      key: mptKeyHex,
      value: depositHex,
    });
  }
  console.log('');

  // Debug: Log registeredKeys order
  console.log('🔍 Debug: RegisteredKeys order:');
  registeredKeys.forEach((key, idx) => {
    console.log(`   [${idx}] ${key}`);
  });
  console.log('');

  // Create StateSnapshot from on-chain data
  // Note: getL2MptKey() returns the key that should be used directly for leaf generation
  const stateSnapshot: StateSnapshot = {
    stateRoot: onChainStateRoot, // Use the state root from StateInitialized event
    registeredKeys: registeredKeys, // MPT keys from getL2MptKey() - used directly
    storageEntries: storageEntries,
    contractAddress: allowedTokens[0],
    userL2Addresses: [], // Not needed when using MPT keys directly
    userStorageSlots: [0n], // Slot 0 for ERC20 balance
    timestamp: Date.now(),
    userNonces: participants.map(() => 0n), // All nonces start at 0
  };

  console.log(`   ✅ StateSnapshot created:`);
  console.log(`      - State Root: ${stateSnapshot.stateRoot}`);
  console.log(`      - Storage Entries: ${stateSnapshot.storageEntries.length}`);
  console.log(`      - Registered Keys: ${stateSnapshot.registeredKeys.length}`);
  console.log(`      - Using MPT keys directly from getL2MptKey()\n`);

  // Step 4: Restore state to Synthesizer's TokamakL2StateManager
  console.log('🔄 Step 4: Restoring state to Synthesizer EVM...');
  console.log(`   Using getL2MptKey() keys directly for leaf generation\n`);

  // Create Common with custom crypto
  const commonOpts = {
    chain: {
      ...Mainnet,
    },
    customCrypto: { keccak256: poseidon, ecrecover: getEddsaPublicKey },
  };
  const common = new Common(commonOpts);

  // Create state manager options (we'll skip RPC init and use snapshot instead)
  // userL2Addresses is required but not used when restoring from snapshot
  const stateManagerOpts = {
    common,
    blockNumber: tx.blockNumber, // Use block AFTER transaction
    contractAddress: allowedTokens[0] as `0x${string}`,
    userStorageSlots: [0],
    userL1Addresses: participants as `0x${string}`[],
    userL2Addresses: participants.map(() => new Address(hexToBytes('0x0000000000000000000000000000000000000000'))), // Dummy addresses, not used
  };

  // Create state manager with skipInit=true, then restore from snapshot
  const stateManager = await createTokamakL2StateManagerFromL1RPC(RPC_URL, stateManagerOpts, true);

  // Restore state from snapshot
  await stateManager.createStateFromSnapshot(stateSnapshot);

  // Get merkle root from restored state
  const restoredMerkleRootBigInt = stateManager.initialMerkleTree.root;
  const restoredMerkleRootHex = restoredMerkleRootBigInt.toString(16);
  const restoredStateRoot = '0x' + restoredMerkleRootHex.padStart(64, '0').toLowerCase();

  console.log(`   ✅ State restored successfully`);
  console.log(`      - Restored State Root: ${restoredStateRoot}`);
  console.log(`      - On-chain State Root: ${onChainStateRoot}\n`);

  // Step 5: Compare state roots
  console.log('📊 Step 5: Comparing state roots...');
  console.log('─────────────────────────────────────────────────────────');
  console.log(`   On-chain State Root: ${onChainStateRoot}`);
  console.log(`   Restored State Root: ${restoredStateRoot}`);
  console.log('─────────────────────────────────────────────────────────\n');

  if (restoredStateRoot.toLowerCase() === onChainStateRoot.toLowerCase()) {
    console.log('✅ SUCCESS: State roots match!');
    console.log('   The restored state matches the on-chain state exactly.\n');
    console.log('💡 This proves that using on-chain data (MPT keys, deposits)');
    console.log('   we can accurately restore the Synthesizer EVM state to match on-chain merkle root.\n');
    console.log('🚀 Next Steps:');
    console.log('   - Use this initial Merkle root as the base state');
    console.log('   - Simulate L2 transactions to update the state');
    console.log('   - Generate new Merkle roots after each transaction\n');
  } else {
    console.log('❌ FAILURE: State roots do not match!');
    console.log('   The restored state does not match the on-chain state.');
    console.log('   This may indicate:');
    console.log('   - MPT key derivation issue');
    console.log('   - Storage entry ordering issue');
    console.log('   - Merkle tree calculation difference\n');
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    Test Completed Successfully!               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

// ============================================================================
// RUN TEST
// ============================================================================

testInitializeState()
  .then(() => {
    console.log('🎉 All tests passed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  });
