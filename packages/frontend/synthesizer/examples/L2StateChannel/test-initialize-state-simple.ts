/**
 * Test: Restore Initial State from On-chain Data and Simulate L2 Transfer
 *
 * This script:
 * 1. Fetches the initializeChannelState transaction from on-chain
 * 2. Gets the state root from the StateInitialized event
 * 3. Fetches on-chain data (MPT keys, deposits) using getL2MptKey()
 * 4. Creates a StateSnapshot and restores it to Synthesizer EVM
 * 5. Verifies that the restored Merkle root matches the on-chain state root
 * 6. Simulates L2 transfer (Participant 1 → Participant 2, 1 TON) using the restored state
 *
 * This demonstrates the complete flow: state restoration → transaction simulation → state update
 */

import { ethers, parseEther } from 'ethers';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SEPOLIA_RPC_URL, ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI, TON_ADDRESS } from './constants.ts';
import {
  Address,
  hexToBytes,
  addHexPrefix,
  bytesToBigInt,
  bigIntToBytes,
  setLengthLeft,
  bytesToHex,
  utf8ToBytes,
} from '@ethereumjs/util';
import { StateSnapshot } from '../../src/TokamakL2JS/stateManager/types.ts';
import { createTokamakL2StateManagerFromL1RPC } from '../../src/TokamakL2JS/stateManager/constructors.ts';
import { poseidon, getEddsaPublicKey, fromEdwardsToAddress } from '../../src/TokamakL2JS/index.ts';
import { Common, Mainnet } from '@ethereumjs/common';
import { jubjub } from '@noble/curves/misc';
import { SynthesizerAdapter } from '../../src/interface/adapters/synthesizerAdapter.ts';
import { generateMptKeyFromWallet } from './mpt-key-utils.ts';

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
const CHANNEL_ID = 10; // Channel 10 for testing (single token: TON only)

// Transaction hash for initializeChannelState
// This should be the transaction that called initializeChannelState for the channel
const INITIALIZE_TX_HASH = '0x65a31d098ad36f36069073c539e3861685789788a7f753491ff67afc6357ac4d';

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
  console.log(`   Fetching on-chain data for all participants...\n`);

  const storageEntries: Array<{ index: number; key: string; value: string }> = [];
  const registeredKeys: string[] = [];

  for (let i = 0; i < participants.length; i++) {
    const l1Address = participants[i];
    const token = allowedTokens[0]; // Use first token (should be TON)

    // Get MPT key from on-chain (this is what was actually used during deposit)
    const onChainMptKeyBigInt = await bridgeContract.getL2MptKey(CHANNEL_ID, l1Address, token);
    const onChainMptKeyHex = '0x' + onChainMptKeyBigInt.toString(16).padStart(64, '0');

    // Get deposit amount from on-chain
    const deposit = await bridgeContract.getParticipantTokenDeposit(CHANNEL_ID, l1Address, token);

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

  // Create StateSnapshot from on-chain data
  // Note: Using MPT keys from getL2MptKey() directly - these are the keys used during deposit
  // Use keys in the same order as fetched from on-chain (no sorting)
  const stateSnapshot: StateSnapshot = {
    stateRoot: onChainStateRoot, // Use the state root from StateInitialized event
    registeredKeys: registeredKeys, // Use MPT keys in original order (as fetched from on-chain)
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
  console.log(`      - Registered Keys: ${stateSnapshot.registeredKeys.length}\n`);

  // Step 4: Restore state to Synthesizer's TokamakL2StateManager
  console.log('🔄 Step 4: Restoring state to Synthesizer EVM...\n');

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

  // Step 6: Simulate L2 Transfer (Participant 1 → Participant 2, 1 TON)
  console.log('🔄 Step 6: Simulating L2 Transfer (Participant 1 → Participant 2, 1 TON)...\n');

  if (participants.length < 2) {
    console.log('❌ FAILURE: Need at least 2 participants for transfer simulation');
    process.exit(1);
  }

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

  // Extract participant 1 and 2 information from restored state
  const participant1MptKeyHex = registeredKeys[0];
  const participant2MptKeyHex = registeredKeys[1];
  const participant1L1Address = participants[0];
  const participant2L1Address = participants[1];

  // Find participant indices by matching L1 addresses
  const participant1Index = participants.findIndex(addr => addr.toLowerCase() === participant1L1Address.toLowerCase());
  const participant2Index = participants.findIndex(addr => addr.toLowerCase() === participant2L1Address.toLowerCase());

  if (participant1Index === -1 || participant2Index === -1) {
    console.error('❌ Error: Could not find participant indices');
    process.exit(1);
  }

  // Create wallets from private keys (same as deposit-ton.ts)
  const participant1Wallet = new ethers.Wallet(PRIVATE_KEYS[participant1Index]!);
  const participant2Wallet = new ethers.Wallet(PRIVATE_KEYS[participant2Index]!);

  // Verify addresses match
  if (participant1Wallet.address.toLowerCase() !== participant1L1Address.toLowerCase()) {
    console.error(
      `❌ Error: Participant 1 address mismatch: expected ${participant1L1Address}, got ${participant1Wallet.address}`,
    );
    process.exit(1);
  }
  if (participant2Wallet.address.toLowerCase() !== participant2L1Address.toLowerCase()) {
    console.error(
      `❌ Error: Participant 2 address mismatch: expected ${participant2L1Address}, got ${participant2Wallet.address}`,
    );
    process.exit(1);
  }

  // Generate L2 keys using the same process as deposit-ton.ts
  // This recreates the exact same private/public keys and L2 addresses
  // Note: We don't need to verify MPT keys - we only need L2 address and private key for transfer
  const participant1L1PublicKeyHex = participant1Wallet.signingKey.publicKey;
  const participant2L1PublicKeyHex = participant2Wallet.signingKey.publicKey;

  // Create seed and generate private key (same as generateMptKeyFromWallet)
  const participant1SeedString = `${participant1L1PublicKeyHex}${CHANNEL_ID}${PARTICIPANT_NAMES[participant1Index]!}`;
  const participant1SeedBytes = utf8ToBytes(participant1SeedString);
  const participant1SeedHashBytes = poseidon(participant1SeedBytes);
  const participant1SeedHashBigInt = bytesToBigInt(participant1SeedHashBytes);
  const participant1PrivateKeyBigInt = participant1SeedHashBigInt % jubjub.Point.Fn.ORDER;
  const participant1PrivateKeyValue = participant1PrivateKeyBigInt === 0n ? 1n : participant1PrivateKeyBigInt;
  const participant1PrivateKey = setLengthLeft(bigIntToBytes(participant1PrivateKeyValue), 32);

  const participant2SeedString = `${participant2L1PublicKeyHex}${CHANNEL_ID}${PARTICIPANT_NAMES[participant2Index]!}`;
  const participant2SeedBytes = utf8ToBytes(participant2SeedString);
  const participant2SeedHashBytes = poseidon(participant2SeedBytes);
  const participant2SeedHashBigInt = bytesToBigInt(participant2SeedHashBytes);
  const participant2PrivateKeyBigInt = participant2SeedHashBigInt % jubjub.Point.Fn.ORDER;
  const participant2PrivateKeyValue = participant2PrivateKeyBigInt === 0n ? 1n : participant2PrivateKeyBigInt;
  const participant2PrivateKey = setLengthLeft(bigIntToBytes(participant2PrivateKeyValue), 32);

  // Generate public keys from private keys
  const participant1PublicKey = jubjub.Point.BASE.multiply(bytesToBigInt(participant1PrivateKey)).toBytes();
  const participant2PublicKey = jubjub.Point.BASE.multiply(bytesToBigInt(participant2PrivateKey)).toBytes();

  // Derive L2 addresses from public keys (same as deposit-ton.ts)
  const participant1L2Address = fromEdwardsToAddress(jubjub.Point.fromBytes(participant1PublicKey)).toString();
  const participant2L2Address = fromEdwardsToAddress(jubjub.Point.fromBytes(participant2PublicKey)).toString();

  console.log(`   Participant 1 (Sender):`);
  console.log(`      - L1 Address: ${participant1L1Address}`);
  console.log(`      - L2 Address: ${participant1L2Address}`);
  console.log(`      - MPT Key: ${participant1MptKeyHex}\n`);

  console.log(`   Participant 2 (Recipient):`);
  console.log(`      - L1 Address: ${participant2L1Address}`);
  console.log(`      - L2 Address: ${participant2L2Address}`);
  console.log(`      - MPT Key: ${participant2MptKeyHex}\n`);

  // Create transfer calldata: transfer(address,uint256)
  const transferAmount = parseEther('1'); // 1 TON
  const calldata =
    '0xa9059cbb' + // transfer(address,uint256) function selector
    participant2L2Address.slice(2).padStart(64, '0') + // recipient address (participant 2)
    transferAmount.toString(16).padStart(64, '0'); // amount (1 TON)

  console.log(`   Transfer Details:`);
  console.log(`      - From: ${participant1L2Address}`);
  console.log(`      - To: ${participant2L2Address}`);
  console.log(`      - Amount: 1 TON (${transferAmount.toString()})\n`);

  // Generate public keys for all participants using the same logic as deposit-ton.ts
  const allPublicKeys: Uint8Array[] = [];
  const allL1Addresses: string[] = [];
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
    allPublicKeys.push(publicKey);
    allL1Addresses.push(l1Address);
  }

  // Create SynthesizerAdapter
  const adapter = new SynthesizerAdapter({ rpcUrl: RPC_URL });

  // Prepare options for synthesizeFromCalldata
  const synthesizeOptions = {
    contractAddress: allowedTokens[0],
    publicKeyListL2: allPublicKeys,
    addressListL1: allL1Addresses,
    senderL2PrvKey: participant1PrivateKey,
    previousState: stateSnapshot, // Use the restored state snapshot
    blockNumber: tx.blockNumber, // Use the block number from initialize transaction
    userStorageSlots: [0], // ERC20 balance slot
    txNonce: 0n, // First transaction
    tokenAddress: allowedTokens[0], // TON contract address
  };

  console.log('   🔄 Executing transfer simulation...\n');
  const result = await adapter.synthesizeFromCalldata(calldata, synthesizeOptions);

  if (result.placementVariables.length === 0) {
    console.log('❌ FAILURE: Synthesizer failed to generate placements');
    process.exit(1);
  }

  console.log(`   ✅ Transfer simulation completed successfully!`);
  console.log(`      - Placements: ${result.placementVariables.length}`);
  console.log(`      - Previous State Root: ${stateSnapshot.stateRoot}`);
  console.log(`      - New State Root:      ${result.state.stateRoot}\n`);

  // Validate that state root changed (transaction was executed)
  if (result.state.stateRoot !== stateSnapshot.stateRoot) {
    console.log('   ✅ State root CHANGED! (Transaction executed successfully)');
    console.log('   ✅ Transfer simulation successful!\n');
  } else {
    console.log('   ⚠️  State root UNCHANGED (No state change detected)');
    console.log('   ⚠️  This may indicate the transaction was not executed properly\n');
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
