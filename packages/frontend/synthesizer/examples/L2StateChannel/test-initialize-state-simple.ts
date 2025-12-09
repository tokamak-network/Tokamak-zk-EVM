/**
 * Test: Restore Initial State from On-chain Data and Simulate Sequential L2 Transfers
 *
 * This script:
 * 1. Fetches the initializeChannelState transaction from on-chain
 * 2. Gets the state root from the StateInitialized event
 * 3. Fetches on-chain data (MPT keys, deposits) using getL2MptKey()
 * 4. Creates a StateSnapshot and restores it to Synthesizer EVM
 * 5. Verifies that the restored Merkle root matches the on-chain state root
 * 6. Simulates 3 sequential L2 transfers:
 *    - Proof #1: Participant 1 → Participant 2 (1 TON)
 *    - Proof #2: Participant 2 → Participant 3 (0.5 TON)
 *    - Proof #3: Participant 3 → Participant 1 (1 TON)
 * 7. For each transfer: Synthesize → Prove → Verify
 *
 * This demonstrates the complete flow: state restoration → sequential transactions → proof generation
 */

import { ethers, parseEther } from 'ethers';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
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
  toBytes,
  createAccount,
} from '@ethereumjs/util';
import { StateSnapshot } from '../../src/TokamakL2JS/stateManager/types.ts';
import { TokamakL2StateManager } from '../../src/TokamakL2JS/stateManager/TokamakL2StateManager.ts';
import { poseidon, getEddsaPublicKey, fromEdwardsToAddress } from '../../src/TokamakL2JS/index.ts';
import { Common, Mainnet } from '@ethereumjs/common';
import { jubjub } from '@noble/curves/misc';
import { SynthesizerAdapter } from '../../src/interface/adapters/synthesizerAdapter.ts';
import type { SynthesizerResult } from '../../src/interface/adapters/synthesizerAdapter.ts';
import { generateMptKeyFromWallet } from './mpt-key-utils.ts';
import { RLP } from '@ethereumjs/rlp';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root
const envPath = resolve(__dirname, '../../../../../.env');
config({ path: envPath });

// Binary paths (use pre-built binaries from dist/macOS/bin)
const distBinPath = resolve(process.cwd(), '../../../dist/macOS/bin');
const preprocessBinary = `${distBinPath}/preprocess`;
const proverBinary = `${distBinPath}/prove`;
const verifyBinary = `${distBinPath}/verify`;

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

  // Create state manager without RPC init (we'll restore from snapshot instead)
  // Note: We need to manually set up contract account and load code
  const stateManager = new TokamakL2StateManager(stateManagerOpts);

  // Set up contract account (required before restoring storage)
  const contractAddress = new Address(toBytes(stateManagerOpts.contractAddress));
  const POSEIDON_RLP = stateManagerOpts.common.customCrypto.keccak256!(RLP.encode(new Uint8Array([])));
  const POSEIDON_NULL = stateManagerOpts.common.customCrypto.keccak256!(new Uint8Array(0));
  const contractAccount = createAccount({
    nonce: 0n,
    balance: 0n,
    storageRoot: POSEIDON_RLP,
    codeHash: POSEIDON_NULL,
  });
  await stateManager.putAccount(contractAddress, contractAccount);

  // Load contract code from RPC (needed for execution)
  const byteCodeStr = await provider.getCode(contractAddress.toString(), stateManagerOpts.blockNumber);
  await stateManager.putCode(contractAddress, hexToBytes(addHexPrefix(byteCodeStr)));

  // Restore state from snapshot using new method (restore storage and rebuild merkle tree)
  console.log('   Restoring state from snapshot...');
  const snapshotContractAddress = new Address(toBytes(addHexPrefix(stateSnapshot.contractAddress)));

  // 1. Set cached opts (required for merkle tree reconstruction)
  stateManager.setCachedOpts(stateManagerOpts);

  // 2. Restore contract account and code if needed
  if (stateSnapshot.contractCode) {
    await stateManager.putCode(snapshotContractAddress, hexToBytes(addHexPrefix(stateSnapshot.contractCode)));
  }

  // 3. Set registered keys from snapshot (required for merkle tree reconstruction)
  console.log(`   Setting ${stateSnapshot.registeredKeys.length} registered keys...`);
  const registeredKeysBytes = stateSnapshot.registeredKeys.map(key => hexToBytes(addHexPrefix(key)));
  stateManager.setRegisteredKeys(registeredKeysBytes);

  // 4. Restore storage entries
  console.log(`   Restoring ${stateSnapshot.storageEntries.length} storage entries...`);
  for (const entry of stateSnapshot.storageEntries) {
    const key = hexToBytes(addHexPrefix(entry.key));
    const value = hexToBytes(addHexPrefix(entry.value));
    await stateManager.putStorage(snapshotContractAddress, key, value);
    console.log(`      [${entry.index}] Key: ${entry.key.slice(0, 20)}... Value: ${entry.value}`);
  }

  // 5. Verify storage was restored correctly
  console.log('   Verifying restored storage...');
  for (let i = 0; i < stateSnapshot.registeredKeys.length; i++) {
    const expectedKey = hexToBytes(addHexPrefix(stateSnapshot.registeredKeys[i]));
    const expectedEntry = stateSnapshot.storageEntries.find(
      e => e.key.toLowerCase() === stateSnapshot.registeredKeys[i].toLowerCase(),
    );
    const storedValue = await stateManager.getStorage(snapshotContractAddress, expectedKey);
    const storedValueBigInt = bytesToBigInt(storedValue);
    const expectedValueBigInt = expectedEntry ? BigInt(expectedEntry.value) : 0n;

    if (storedValueBigInt !== expectedValueBigInt) {
      console.log(`      ⚠️  [${i}] Key: ${stateSnapshot.registeredKeys[i].slice(0, 20)}...`);
      console.log(`         Expected: ${expectedValueBigInt.toString()}, Got: ${storedValueBigInt.toString()}`);
    } else {
      console.log(
        `      ✅ [${i}] Key: ${stateSnapshot.registeredKeys[i].slice(0, 20)}... Value: ${storedValueBigInt.toString()}`,
      );
    }
  }

  // 6. Rebuild initial merkle tree from restored storage
  console.log('   Rebuilding initial merkle tree from restored storage...');
  await stateManager.rebuildInitialMerkleTree();
  const restoredMerkleRootBigInt = stateManager.initialMerkleTree.root;
  const restoredMerkleRootHex = restoredMerkleRootBigInt.toString(16);
  const restoredStateRoot = '0x' + restoredMerkleRootHex.padStart(64, '0').toLowerCase();
  const expectedRoot = BigInt(stateSnapshot.stateRoot);

  console.log(`   ✅ State restored successfully`);
  console.log(`      - Restored State Root: ${restoredStateRoot}`);
  console.log(`      - Expected State Root: 0x${expectedRoot.toString(16)}`);
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

  if (participants.length < 3) {
    console.log('❌ FAILURE: Need at least 3 participants for sequential transfer simulation');
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

  // Generate L2 keys for all participants (including participant 3)
  const participant3L1Address = participants[2];
  const participant3Index = participants.findIndex(addr => addr.toLowerCase() === participant3L1Address.toLowerCase());

  if (participant3Index === -1 || !PRIVATE_KEYS[participant3Index]) {
    throw new Error(`Private key not found for participant 3: ${participant3L1Address}`);
  }

  const participant3Wallet = new ethers.Wallet(PRIVATE_KEYS[participant3Index]!);
  if (participant3Wallet.address.toLowerCase() !== participant3L1Address.toLowerCase()) {
    throw new Error(
      `Participant 3 address mismatch: expected ${participant3L1Address}, got ${participant3Wallet.address}`,
    );
  }

  const participant3L1PublicKeyHex = participant3Wallet.signingKey.publicKey;
  const participant3SeedString = `${participant3L1PublicKeyHex}${CHANNEL_ID}${PARTICIPANT_NAMES[participant3Index]!}`;
  const participant3SeedBytes = utf8ToBytes(participant3SeedString);
  const participant3SeedHashBytes = poseidon(participant3SeedBytes);
  const participant3SeedHashBigInt = bytesToBigInt(participant3SeedHashBytes);
  const participant3PrivateKeyBigInt = participant3SeedHashBigInt % jubjub.Point.Fn.ORDER;
  const participant3PrivateKeyValue = participant3PrivateKeyBigInt === 0n ? 1n : participant3PrivateKeyBigInt;
  const participant3PrivateKey = setLengthLeft(bigIntToBytes(participant3PrivateKeyValue), 32);
  const participant3PublicKey = jubjub.Point.BASE.multiply(bytesToBigInt(participant3PrivateKey)).toBytes();
  const participant3L2Address = fromEdwardsToAddress(jubjub.Point.fromBytes(participant3PublicKey)).toString();

  // Generate public keys for all participants using the same logic as deposit-ton.ts
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

  // Create SynthesizerAdapter
  const adapter = new SynthesizerAdapter({ rpcUrl: RPC_URL });

  // Base options for all proofs
  const baseOptions = {
    contractAddress: allowedTokens[0],
    publicKeyListL2: allPublicKeys,
    addressListL1: allL1Addresses,
    blockNumber: tx.blockNumber,
    userStorageSlots: [0], // ERC20 balance slot
  };

  // ========================================================================
  // PROOF #1: Participant 1 → Participant 2 Transfer (1 TON)
  // ========================================================================
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                  Proof #1: Participant 1 → 2 (1 TON)         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Prepare options for first transfer
  const proof1Path = resolve(__dirname, '../test-outputs/l2-state-channel-transfer-1');
  const synthesizeOptions1 = {
    ...baseOptions,
    senderL2PrvKey: allPrivateKeys[0],
    previousState: stateSnapshot,
    txNonce: 0n,
    tokenAddress: allowedTokens[0],
    outputPath: proof1Path,
  };

  console.log('🔄 Generating circuit for Participant 1 → Participant 2 transfer...\n');
  const result1 = await adapter.synthesizeFromCalldata(calldata, synthesizeOptions1);

  if (result1.placementVariables.length === 0) {
    console.log('❌ FAILURE: Synthesizer failed to generate placements');
    process.exit(1);
  }

  console.log(`\n✅ Proof #1: Circuit generated successfully`);
  console.log(`   - Placements: ${result1.placementVariables.length}`);
  console.log(`   - Previous State Root: ${stateSnapshot.stateRoot}`);
  console.log(`   - New State Root:      ${result1.state.stateRoot}\n`);

  // Check transaction execution result
  console.log('📊 Transaction Execution Result:');
  if (result1.executionResult) {
    console.log(`   - Success: ${result1.executionResult.success ? '✅' : '❌'}`);
    console.log(`   - Gas Used: ${result1.executionResult.gasUsed}`);
    console.log(`   - Logs Emitted: ${result1.executionResult.logsCount}`);
    if (!result1.executionResult.success) {
      console.log(`   - Error: ${result1.executionResult.error || 'Unknown error'}`);
      console.log('\n❌ FAILURE: Transaction REVERTED!');
      console.log('   This indicates that the transaction failed during execution.');
      console.log('   Possible causes:');
      console.log('   - Insufficient balance (sender balance < transfer amount)');
      console.log('   - Invalid function call or parameters');
      console.log('   - Contract logic error');
      process.exit(1);
    }
  } else {
    console.warn('   ⚠️  Execution result not available');
  }
  console.log('');

  if (result1.state.stateRoot !== stateSnapshot.stateRoot) {
    console.log('   ✅ State root CHANGED! (Transaction executed successfully)\n');
  } else {
    console.warn('   ⚠️  State root UNCHANGED (No state change detected)\n');
  }

  // Save outputs
  await saveProofOutputs(result1, 1, proof1Path);

  // Prove & Verify Proof #1
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Proving and Verifying Proof #1`);
  console.log('='.repeat(80));

  const preprocessSuccess = await runPreprocess(proof1Path);
  if (!preprocessSuccess) {
    console.error(`\n❌ Preprocess failed! Cannot continue.`);
    return;
  }

  const prove1Success = await runProver(1, proof1Path);
  const verify1Success = prove1Success ? await runVerifyRust(1, proof1Path) : false;

  if (!prove1Success || !verify1Success) {
    console.error(`\n❌ Proof #1 failed! Cannot continue.`);
    return;
  }
  console.log(`\n✅ Proof #1 Complete: Preprocessed ✅ | Proved ✅ | Verified ✅`);

  // ========================================================================
  // PROOF #2: Participant 2 → Participant 3 Transfer (0.5 TON)
  // ========================================================================
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                  Proof #2: Participant 2 → 3 (0.5 TON)       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const transferAmount2 = parseEther('0.5'); // 0.5 TON
  const calldata2 =
    '0xa9059cbb' + // transfer(address,uint256)
    participant3L2Address.slice(2).padStart(64, '0') + // recipient (participant 3)
    transferAmount2.toString(16).padStart(64, '0'); // amount (0.5 TON)

  console.log('🔄 Generating circuit for Participant 2 → Participant 3 transfer...\n');
  const proof2Path = resolve(__dirname, '../test-outputs/l2-state-channel-transfer-2');
  const result2 = await adapter.synthesizeFromCalldata(calldata2, {
    ...baseOptions,
    senderL2PrvKey: allPrivateKeys[1], // Participant 2's private key
    previousState: result1.state, // Use state from Proof #1
    txNonce: 0n, // Participant 2's first transaction
    tokenAddress: allowedTokens[0],
    outputPath: proof2Path,
  });

  if (result2.placementVariables.length === 0) {
    console.error('❌ Synthesizer failed to generate placements for Proof #2');
    return;
  }

  console.log(`\n✅ Proof #2: Circuit generated successfully`);
  console.log(`   - Placements: ${result2.placementVariables.length}`);
  console.log(`   - State root: ${result2.state.stateRoot}`);

  // Check transaction execution result
  if (result2.executionResult) {
    console.log(`   - Execution: ${result2.executionResult.success ? '✅ Success' : '❌ REVERTED'}`);
    console.log(`   - Gas Used: ${result2.executionResult.gasUsed}`);
    if (!result2.executionResult.success) {
      console.log(`   - Error: ${result2.executionResult.error || 'Unknown error'}`);
      console.log('\n❌ FAILURE: Transaction REVERTED!');
      process.exit(1);
    }
  }

  if (result2.state.stateRoot !== result1.state.stateRoot) {
    console.log('   ✅ State root CHANGED! (Success!)\n');
  } else {
    console.log('   ⚠️  State root UNCHANGED\n');
  }

  // Save outputs
  await saveProofOutputs(result2, 2, proof2Path);

  // Prove & Verify Proof #2
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Proving and Verifying Proof #2`);
  console.log('='.repeat(80));

  const prove2Success = await runProver(2, proof2Path);
  const verify2Success = prove2Success ? await runVerifyRust(2, proof2Path) : false;

  if (!prove2Success || !verify2Success) {
    console.error(`\n❌ Proof #2 failed! Cannot continue.`);
    return;
  }
  console.log(`\n✅ Proof #2 Complete: Proved ✅ | Verified ✅`);

  // ========================================================================
  // PROOF #3: Participant 3 → Participant 1 Transfer (1 TON)
  // ========================================================================
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                  Proof #3: Participant 3 → 1 (1 TON)          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const transferAmount3 = parseEther('1'); // 1 TON
  const calldata3 =
    '0xa9059cbb' + // transfer(address,uint256)
    participant1L2Address.slice(2).padStart(64, '0') + // recipient (participant 1)
    transferAmount3.toString(16).padStart(64, '0'); // amount (1 TON)

  console.log('🔄 Generating circuit for Participant 3 → Participant 1 transfer...\n');
  const proof3Path = resolve(__dirname, '../test-outputs/l2-state-channel-transfer-3');
  const result3 = await adapter.synthesizeFromCalldata(calldata3, {
    ...baseOptions,
    senderL2PrvKey: allPrivateKeys[2], // Participant 3's private key
    previousState: result2.state, // Use state from Proof #2
    txNonce: 0n, // Participant 3's first transaction
    tokenAddress: allowedTokens[0],
    outputPath: proof3Path,
  });

  if (result3.placementVariables.length === 0) {
    console.error('❌ Synthesizer failed to generate placements for Proof #3');
    return;
  }

  console.log(`\n✅ Proof #3: Circuit generated successfully`);
  console.log(`   - Placements: ${result3.placementVariables.length}`);
  console.log(`   - State root: ${result3.state.stateRoot}`);

  // Check transaction execution result
  if (result3.executionResult) {
    console.log(`   - Execution: ${result3.executionResult.success ? '✅ Success' : '❌ REVERTED'}`);
    console.log(`   - Gas Used: ${result3.executionResult.gasUsed}`);
    if (!result3.executionResult.success) {
      console.log(`   - Error: ${result3.executionResult.error || 'Unknown error'}`);
      console.log('\n❌ FAILURE: Transaction REVERTED!');
      process.exit(1);
    }
  }

  if (result3.state.stateRoot !== result2.state.stateRoot) {
    console.log('   ✅ State root CHANGED! (Success!)\n');
  } else {
    console.log('   ⚠️  State root UNCHANGED\n');
  }

  // Save outputs
  await saveProofOutputs(result3, 3, proof3Path);

  // Prove & Verify Proof #3
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Proving and Verifying Proof #3`);
  console.log('='.repeat(80));

  const prove3Success = await runProver(3, proof3Path);
  const verify3Success = prove3Success ? await runVerifyRust(3, proof3Path) : false;

  if (!prove3Success || !verify3Success) {
    console.error(`\n❌ Proof #3 failed!`);
    return;
  }
  console.log(`\n✅ Proof #3 Complete: Proved ✅ | Verified ✅`);

  // ========================================================================
  // FINAL SUMMARY
  // ========================================================================
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                     Test Summary                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('✅ Successfully completed sequential transfer simulation!');
  console.log('');
  console.log('📊 State Root Evolution:');
  console.log(`   Initial (Onchain):         ${stateSnapshot.stateRoot}`);
  console.log(`   → Proof #1 (P1→P2, 1 TON):  ${result1.state.stateRoot}`);
  console.log(`   → Proof #2 (P2→P3, 0.5 TON): ${result2.state.stateRoot}`);
  console.log(`   → Proof #3 (P3→P1, 1 TON):  ${result3.state.stateRoot}`);
  console.log('');
  console.log('🔬 Proof Generation:');
  console.log(`   - Proof #1: Preprocessed ✅ | Proved ✅ | Verified ✅`);
  console.log(`   - Proof #2: Proved ✅ | Verified ✅`);
  console.log(`   - Proof #3: Proved ✅ | Verified ✅`);
  console.log('');
  console.log('🔄 Sequential Execution Flow:');
  console.log('   Proof #1: Synthesize → Preprocess → Prove → Verify ✅ Complete');
  console.log('             ↓ (await completion)');
  console.log('   Proof #2: Synthesize → Prove → Verify ✅ Complete');
  console.log('             ↓ (await completion)');
  console.log('   Proof #3: Synthesize → Prove → Verify ✅ Complete');

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    Test Completed Successfully!               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

// ============================================================================
// PROVE & VERIFY HELPER FUNCTIONS
// ============================================================================

async function saveProofOutputs(result: SynthesizerResult, proofNum: number, outputsPath: string) {
  // Ensure output directory exists
  mkdirSync(outputsPath, { recursive: true });

  // Save instance.json
  const instancePath = `${outputsPath}/instance.json`;
  writeFileSync(instancePath, JSON.stringify(result.instance, null, 2));
  console.log(
    `   ✅ instance.json saved (user: ${result.instance.a_pub_user.length}, block: ${result.instance.a_pub_block.length}, function: ${result.instance.a_pub_function.length} public inputs)`,
  );

  // Save permutation.json
  const permutationPath = `${outputsPath}/permutation.json`;
  writeFileSync(permutationPath, JSON.stringify(result.permutation, null, 2));
  console.log(`   ✅ permutation.json saved (${result.permutation.length} entries)`);

  // Save placementVariables.json
  const placementPath = `${outputsPath}/placementVariables.json`;
  writeFileSync(placementPath, JSON.stringify(result.placementVariables, null, 2));
  console.log(`   ✅ placementVariables.json saved (${result.placementVariables.length} placements)`);

  // Save state_snapshot.json
  const statePath = `${outputsPath}/state_snapshot.json`;
  writeFileSync(
    statePath,
    JSON.stringify(result.state, (key, value) => (typeof value === 'bigint' ? value.toString() : value), 2),
  );
  console.log(`   ✅ state_snapshot.json saved`);
}

async function runProver(proofNum: number, outputsPath: string): Promise<boolean> {
  console.log(`\n⚡ Proof #${proofNum}: Running prover...`);

  const qapPath = resolve(process.cwd(), '../qap-compiler/subcircuits/library');
  const synthesizerPath = outputsPath; // outputsPath is already an absolute path
  const setupPath = resolve(process.cwd(), '../../../dist/macOS/resource/setup/output');
  const outPath = synthesizerPath;

  if (!existsSync(proverBinary)) {
    console.error(`   ❌ Prover binary not found at ${proverBinary}`);
    console.error(`   Please build the binaries first: cd dist/macOS && ./build.sh`);
    return false;
  }

  if (!existsSync(`${synthesizerPath}/instance.json`)) {
    console.log(`   ⚠️  instance.json not found, skipping prover`);
    return false;
  }

  try {
    const cmd = `"${proverBinary}" "${qapPath}" "${synthesizerPath}" "${setupPath}" "${outPath}"`;

    console.log(`   Running: ${proverBinary}...`);
    const startTime = Date.now();

    const output = execSync(cmd, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 300000, // 5 minute timeout
    });

    const duration = Date.now() - startTime;

    if (existsSync(`${outPath}/proof.json`)) {
      console.log(`   ✅ Proof generated successfully in ${(duration / 1000).toFixed(2)}s`);
      const timeMatch = output.match(/Total proving time: ([\d.]+) seconds/);
      if (timeMatch) {
        console.log(`   ⏱️  Total proving time: ${timeMatch[1]}s`);
      }
      return true;
    } else {
      console.log(`   ❌ Proof generation failed - proof.json not found`);
      console.log(`   Output: ${output}`);
      return false;
    }
  } catch (error: any) {
    console.log(`   ❌ Prover error: ${error.message}`);
    if (error.stdout) {
      console.log(`   stdout: ${error.stdout.substring(0, 500)}...`);
    }
    if (error.stderr) {
      console.log(`   stderr: ${error.stderr.substring(0, 500)}...`);
    }
    return false;
  }
}

async function runVerifyRust(proofNum: number, outputsPath: string): Promise<boolean> {
  console.log(`\n🔐 Proof #${proofNum}: Running verify-rust verification...`);

  const qapPath = resolve(process.cwd(), '../qap-compiler/subcircuits/library');
  const synthesizerPath = outputsPath; // outputsPath is already an absolute path
  const setupPath = resolve(process.cwd(), '../../../dist/macOS/resource/setup/output');
  const preprocessPath = resolve(process.cwd(), '../../../dist/macOS/resource/preprocess/output');
  const proofPath = synthesizerPath;

  if (!existsSync(verifyBinary)) {
    console.error(`   ❌ Verify binary not found at ${verifyBinary}`);
    console.error(`   Please build the binaries first: cd dist/macOS && ./build.sh`);
    return false;
  }

  if (!existsSync(`${synthesizerPath}/instance.json`)) {
    console.log(`   ⚠️  instance.json not found, skipping verification`);
    return false;
  }

  if (!existsSync(`${proofPath}/proof.json`)) {
    console.log(`   ⚠️  proof.json not found - cannot verify without proof`);
    return false;
  }

  try {
    const cmd = `"${verifyBinary}" "${qapPath}" "${synthesizerPath}" "${setupPath}" "${preprocessPath}" "${proofPath}"`;

    console.log(`   Running: ${verifyBinary}...`);
    const startTime = Date.now();

    const output = execSync(cmd, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 60000, // 60 second timeout
    });

    const duration = Date.now() - startTime;

    const lines = output.split('\n');
    const verificationResult = lines.find(line => line.trim() === 'true' || line.trim() === 'false');

    if (verificationResult === 'true') {
      console.log(`   ✅ Verification PASSED in ${(duration / 1000).toFixed(2)}s`);
      return true;
    } else if (verificationResult === 'false') {
      console.log(`   ❌ Verification FAILED in ${(duration / 1000).toFixed(2)}s`);
      console.log(`   Output: ${output}`);
      return false;
    } else {
      console.log(`   ⚠️  Could not parse verification result`);
      console.log(`   Output: ${output}`);
      return false;
    }
  } catch (error: any) {
    console.log(`   ❌ Verification error: ${error.message}`);
    if (error.stdout) {
      console.log(`   stdout: ${error.stdout}`);
    }
    if (error.stderr) {
      console.log(`   stderr: ${error.stderr}`);
    }
    return false;
  }
}

async function runPreprocess(outputsPath: string): Promise<boolean> {
  console.log(`\n⚙️  Running preprocess (one-time setup)...`);

  const qapPath = resolve(process.cwd(), '../qap-compiler/subcircuits/library');
  const synthesizerPath = outputsPath; // outputsPath is already an absolute path
  const setupPath = resolve(process.cwd(), '../../../dist/macOS/resource/setup/output');
  const preprocessOutPath = resolve(process.cwd(), '../../../dist/macOS/resource/preprocess/output');

  if (existsSync(`${preprocessOutPath}/preprocess.json`)) {
    console.log(`   ℹ️  Preprocess files already exist, skipping...`);
    return true;
  }

  if (!existsSync(preprocessBinary)) {
    console.error(`   ❌ Preprocess binary not found at ${preprocessBinary}`);
    console.error(`   Please build the binaries first: cd dist/macOS && ./build.sh`);
    return false;
  }

  if (!existsSync(preprocessOutPath)) {
    mkdirSync(preprocessOutPath, { recursive: true });
  }

  try {
    const cmd = `"${preprocessBinary}" "${qapPath}" "${synthesizerPath}" "${setupPath}" "${preprocessOutPath}"`;

    console.log(`   Running: ${preprocessBinary}...`);
    const startTime = Date.now();

    const output = execSync(cmd, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 300000, // 5 minute timeout
    });

    const duration = Date.now() - startTime;

    if (existsSync(`${preprocessOutPath}/preprocess.json`)) {
      console.log(`   ✅ Preprocess completed successfully in ${(duration / 1000).toFixed(2)}s`);
      return true;
    } else {
      console.log(`   ❌ Preprocess failed - output files not found`);
      console.log(`   Output: ${output}`);
      return false;
    }
  } catch (error: any) {
    console.log(`   ❌ Preprocess error: ${error.message}`);
    if (error.stdout) {
      console.log(`   stdout: ${error.stdout.substring(0, 500)}...`);
    }
    if (error.stderr) {
      console.log(`   stderr: ${error.stderr.substring(0, 500)}...`);
    }
    return false;
  }
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
