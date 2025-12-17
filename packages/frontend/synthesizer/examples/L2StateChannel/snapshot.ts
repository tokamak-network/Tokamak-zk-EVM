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

/**
 * @todo
 * 1. targetContractPreAllocatedKeys -> resisteredKey에 입력 -> particpants 통해 key -> resisteredKey에 사용자 key 입력
 */

import { ethers, parseEther } from 'ethers';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
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
import { TokamakL2StateManager } from '../../src/TokamakL2JS/stateManager/TokamakL2StateManager.ts';
import { poseidon, getEddsaPublicKey, fromEdwardsToAddress } from '../../src/TokamakL2JS/index.ts';
import { Common, Mainnet } from '@ethereumjs/common';
import { jubjub } from '@noble/curves/jubjub';
import { createSynthesizer } from '../../src/synthesizer/index.ts';
import { createCircuitGenerator } from '../../src/circuitGenerator/circuitGenerator.ts';
import { createSynthesizerOptsForSimulationFromRPC, SynthesizerSimulationOpts } from '../../src/interface/index.ts';
import { getUserStorageKey } from '../../src/TokamakL2JS/utils/index.ts';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root
const envPath = resolve(__dirname, '../../../../../.env');
config({ path: envPath });

// Binary paths (use pre-built binaries from dist/macOS/bin)
// Use __dirname to find project root, then resolve to dist/macOS/bin
// __dirname is: packages/frontend/synthesizer/examples/L2StateChannel
// Project root is: ../../../../../ (6 levels up)
const projectRoot = resolve(__dirname, '../../../../../');
const distBinPath = resolve(projectRoot, 'dist/macOS/bin');
const preprocessBinary = `${distBinPath}/preprocess`;
const proverBinary = `${distBinPath}/prove`;
const verifyBinary = `${distBinPath}/verify`;

// ============================================================================
// CONFIGURATION
// ============================================================================

const RPC_URL = SEPOLIA_RPC_URL;
const CHANNEL_ID = 3; // Channel 10 for testing (single token: TON only)

// Transaction hash for initializeChannelState
// This should be the transaction that called initializeChannelState for the channel
const INITIALIZE_TX_HASH = '0xcf31e988b30825eb4e8a5f3ceb0a2b5cd2462dc4881dc6e2f58cfdb184acaeea';

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

  // Step 5.5: Generate L2 keys for all participants (using deposit MPT key logic)
  // This must be done before Step 4 verification to use actual L2 keys
  // This must be done before Step 4 verification to use actual L2 keys
  console.log('🔑 Step 5.5: Generating L2 keys from deposit MPT keys...\n');

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

  // Step 4: Build initStorageKeys for state restoration (using main.ts pattern)
  console.log('🔄 Step 4: Building initStorageKeys for state restoration...\n');

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
  // L1: participant's L1 address as storage key (to fetch from on-chain)
  // L2: participant's MPT key (actual L2 storage key)
  for (let i = 0; i < participants.length; i++) {
    const l1Address = participants[i];
    // Get MPT key from on-chain using channel ID and L1 address
    const mptKeyBigInt = await bridgeContract.getL2MptKey(CHANNEL_ID, l1Address);
    const mptKeyHex = '0x' + mptKeyBigInt.toString(16).padStart(64, '0');
    const l1StorageKey = getUserStorageKey([l1Address, 0], 'L1'); // L1 storage key from participant address
    const mptKeyBytes = hexToBytes(addHexPrefix(mptKeyHex));
    initStorageKeys.push({
      L1: l1StorageKey,
      L2: mptKeyBytes,
    });
  }

  console.log(`   ✅ Built initStorageKeys:`);
  console.log(`      - Pre-allocated leaves: ${preAllocatedLeaves.length}`);
  console.log(`      - Participants: ${registeredKeys.length}`);
  console.log(`      - Total: ${initStorageKeys.length}\n`);

  // Step 5: Verify state restoration using initStorageKeys
  console.log('🔄 Step 5: Verifying state restoration...\n');

  // Use main.ts pattern: createSynthesizerOptsForSimulationFromRPC
  // Note: TokamakL2Tx requires at least 4 bytes (function selector), so we use a dummy selector
  const verifyCalldata = hexToBytes(addHexPrefix('0x00000000')); // Dummy function selector for verification only
  const verifySimulationOpts: SynthesizerSimulationOpts = {
    txNonce: 0n,
    rpcUrl: RPC_URL,
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
  // Note: initialMerkleTree was built before putStorage, so we need to use getUpdatedMerkleTreeRoot
  // which rebuilds the tree from current storage state

  // Debug: Check leaves calculation - Show ALL leaves
  const leaves = await stateManager.convertLeavesIntoMerkleTreeLeaves();
  console.log('\n   📋 All Merkle tree leaves (16 total):');
  console.log('   ─────────────────────────────────────────────────────────');

  const { poseidon_raw } = await import('../../src/interface/qapCompiler/configuredTypes.ts');

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

  // Step 6: Compare state roots
  console.log('📊 Step 6: Comparing state roots...');
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

  // Step 7: Simulate L2 Transfer (Participant 1 → Participant 2, 1 TON)
  console.log('🔄 Step 7: Simulating L2 Transfer (Participant 1 → Participant 2, 1 TON)...\n');

  if (participants.length < 3) {
    console.log('❌ FAILURE: Need at least 3 participants for sequential transfer simulation');
    process.exit(1);
  }

  // Use L2 keys generated in Step 5.5 (from deposit MPT keys)
  const participant1L1Address = allL1Addresses[0];
  const participant2L1Address = allL1Addresses[1];
  const participant1L2Address = allL2Addresses[0];
  const participant2L2Address = allL2Addresses[1];
  const participant1MptKeyHex = registeredKeys[0];
  const participant2MptKeyHex = registeredKeys[1];

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

  // ========================================================================
  // PROOF #1: Participant 1 → Participant 2 Transfer (1 TON)
  // ========================================================================
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                  Proof #1: Participant 1 → 2 (1 TON)         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('🔄 Generating circuit for Participant 1 → Participant 2 transfer...\n');

  // Use main.ts pattern: createSynthesizerOptsForSimulationFromRPC + createSynthesizer
  const proof1Path = resolve(__dirname, '../test-outputs/l2-state-channel-transfer-1');
  const calldataBytes = hexToBytes(addHexPrefix(calldata));

  // Build initStorageKeys for Proof #1 (same as verification, but with current state)
  const initStorageKeys1: Array<{ L1: Uint8Array; L2: Uint8Array }> = [];

  // Add pre-allocated leaves first
  for (const leaf of preAllocatedLeaves) {
    const keyBytes = hexToBytes(addHexPrefix(leaf.key));
    initStorageKeys1.push({
      L1: keyBytes,
      L2: keyBytes,
    });
  }

  // Add all participants' storage keys
  // L1: participant's L1 address as storage key (to fetch from on-chain)
  // L2: participant's MPT key (actual L2 storage key)
  for (let i = 0; i < participants.length; i++) {
    const l1Address = participants[i];
    // Get MPT key from on-chain using channel ID and L1 address
    const mptKeyBigInt = await bridgeContract.getL2MptKey(CHANNEL_ID, l1Address);
    const mptKeyHex = '0x' + mptKeyBigInt.toString(16).padStart(64, '0');
    const l1StorageKey = getUserStorageKey([l1Address, 0], 'L1'); // L1 storage key from participant address
    const mptKeyBytes = hexToBytes(addHexPrefix(mptKeyHex));
    initStorageKeys1.push({
      L1: l1StorageKey,
      L2: mptKeyBytes,
    });
  }

  const simulationOpts1: SynthesizerSimulationOpts = {
    txNonce: 0n,
    rpcUrl: RPC_URL,
    senderL2PrvKey: allPrivateKeys[0],
    blockNumber: tx.blockNumber,
    contractAddress: targetAddress as `0x${string}`,
    initStorageKeys: initStorageKeys1,
    callData: calldataBytes,
  };

  // Create synthesizer options (main.ts pattern)
  // This will automatically initialize the state manager with initStorageKeys
  const synthesizerOpts1 = await createSynthesizerOptsForSimulationFromRPC(simulationOpts1);

  // Get state manager from synthesizer options
  const stateManager1 = synthesizerOpts1.stateManager;
  const contractAddress1 = new Address(toBytes(addHexPrefix(targetAddress)));

  // After initTokamakExtendsFromRPC, we need to manually set the deposit values
  // because initTokamakExtendsFromRPC tries to fetch from on-chain using L1 key,
  // but deposit values are stored differently on-chain
  for (let i = 0; i < storageEntries.length; i++) {
    const entry = storageEntries[i];
    const mptKeyBytes = hexToBytes(addHexPrefix(entry.key));
    const valueBytes = hexToBytes(addHexPrefix(entry.value));
    await stateManager1.putStorage(contractAddress1, mptKeyBytes, valueBytes);
  }

  // Rebuild initialMerkleTree with updated storage values
  await stateManager1.rebuildInitialMerkleTree();

  const restoredRoot1 = stateManager1.initialMerkleTree.root;
  const expectedRoot1 = BigInt(stateInfo.stateRoot);

  console.log(`   ✅ Restored Merkle Root: 0x${restoredRoot1.toString(16)}`);
  console.log(`   ✅ Expected Merkle Root: 0x${expectedRoot1.toString(16)}\n`);

  if (restoredRoot1 !== expectedRoot1) {
    console.error(`\n❌ FAILURE: Merkle root mismatch in Proof #1!`);
    console.error(`   Expected: ${stateInfo.stateRoot}`);
    console.error(`   Got:      0x${restoredRoot1.toString(16)}`);
    console.error('\n   Test stopped due to Merkle root mismatch.');
    console.error('   This indicates that the state was not properly restored.');
    process.exit(1);
  }

  // 4. Create synthesizer (main.ts pattern)
  const synthesizer1 = await createSynthesizer(synthesizerOpts1);

  // 5. Synthesize transaction (main.ts pattern)
  let runTxResult1;
  try {
    runTxResult1 = await synthesizer1.synthesizeTX();
  } catch (error: any) {
    console.error('\n❌ FAILURE: Synthesizer error detected!');
    console.error(`   Error: ${error.message || error}`);
    if (error.stack) {
      console.error(`   Stack: ${error.stack}`);
    }
    console.error('\n   Test stopped due to synthesizer error.');
    process.exit(1);
  }

  // 6. Create circuit generator and save outputs (main.ts pattern)
  const circuitGenerator1 = await createCircuitGenerator(synthesizer1);
  mkdirSync(proof1Path, { recursive: true });
  circuitGenerator1.writeOutputs(proof1Path);

  // Extract state from synthesizer for next proof (main.ts pattern)
  // Get updated merkle tree root after transaction execution
  const finalStateRoot1 = await stateManager1.getUpdatedMerkleTreeRoot();
  const finalStateRoot1Hex = '0x' + finalStateRoot1.toString(16).padStart(64, '0').toLowerCase();

  // Extract placement variables and permutation from circuit generator
  const placementVariables1 = circuitGenerator1.variableGenerator.placementVariables || [];
  const permutation1 = circuitGenerator1.permutationGenerator?.permutation || [];

  if (placementVariables1.length === 0) {
    console.log('❌ FAILURE: Synthesizer failed to generate placements');
    process.exit(1);
  }

  console.log(`\n✅ Proof #1: Circuit generated successfully`);
  console.log(`   - Placements: ${placementVariables1.length}`);
  console.log(`   - Previous State Root: ${stateInfo.stateRoot}`);
  console.log(`   - New State Root:      ${finalStateRoot1Hex}\n`);

  // Check transaction execution result
  console.log('📊 Transaction Execution Result:');
  const executionSuccess1 = !runTxResult1.execResult.exceptionError;
  const gasUsed1 = runTxResult1.totalGasSpent;
  const logsCount1 = runTxResult1.execResult.logs?.length || 0;
  const hasEVMError = runTxResult1.execResult.exceptionError !== undefined;

  console.log(`   - Success: ${executionSuccess1 ? '✅' : '❌'}`);
  console.log(`   - Gas Used: ${gasUsed1}`);
  console.log(`   - Logs Emitted: ${logsCount1}`);
  console.log(`   - EVM Error: ${hasEVMError ? '❌ Yes' : '✅ No'}`);
  if (!executionSuccess1) {
    const errorMsg = runTxResult1.execResult.exceptionError?.error?.toString() || 'Unknown error';
    console.log(`   - Error: ${errorMsg}`);
    console.log('\n❌ FAILURE: Transaction REVERTED!');
    console.log('   This indicates that the transaction failed during execution.');
    console.log('   Possible causes:');
    console.log('   - Insufficient balance (sender balance < transfer amount)');
    console.log('   - Invalid function call or parameters');
    console.log('   - Contract logic error');
    process.exit(1);
  }
  if (hasEVMError) {
    const errorMsg = runTxResult1.execResult.exceptionError?.error?.toString() || 'Unknown error';
    console.log(`   - EVM Error Details: ${errorMsg}`);
    console.log('\n⚠️  WARNING: EVM error detected even though transaction succeeded');
  }
  console.log('');

  if (finalStateRoot1Hex.toLowerCase() !== stateInfo.stateRoot.toLowerCase()) {
    console.log('   ✅ State root CHANGED! (Transaction executed successfully)\n');
  } else {
    console.warn('   ⚠️  State root UNCHANGED (No state change detected)\n');
  }

  // Show updated Merkle tree leaves and balances after Proof #1
  console.log('   📋 MT Final Public Signals (After Proof #1):');
  console.log('   ─────────────────────────────────────────────────────────');
  const finalLeaves1 = await stateManager1.convertLeavesIntoMerkleTreeLeaves();

  // Store previous balances for comparison
  const previousBalances1: bigint[] = [];
  for (let i = 0; i < registeredKeys.length; i++) {
    const entry = storageEntries[i];
    previousBalances1.push(BigInt(entry.value));
  }

  for (let i = 0; i < finalLeaves1.length; i++) {
    const leaf = finalLeaves1[i];
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
    } else if (i < preAllocatedLeaves.length + registeredKeys.length) {
      // Participants' MPT keys and balances (updated after transfer)
      const participantIndex = i - preAllocatedLeaves.length;
      const key = registeredKeys[participantIndex];
      const keyHex = key.startsWith('0x') ? key : '0x' + key;
      const keyBigInt = BigInt(keyHex);
      // Get updated value from stateManager
      const updatedValue = await stateManager1.getStorage(contractAddress1, hexToBytes(addHexPrefix(key)));
      const valueBigInt = bytesToBigInt(updatedValue);
      const previousBalance = previousBalances1[participantIndex];
      const balanceChange = valueBigInt - previousBalance;
      const expectedLeaf = poseidon_raw([keyBigInt, valueBigInt]);
      const matches = leaf === expectedLeaf;
      const marker = matches ? '✅' : '❌';
      console.log(`   [${i}] ${marker} Participant ${participantIndex}:`);
      console.log(`       Key: ${key}`);
      console.log(`       Previous Balance: ${previousBalance.toString()}`);
      console.log(`       Current Balance: ${valueBigInt.toString()}`);
      console.log(`       Balance Change: ${balanceChange >= 0n ? '+' : ''}${balanceChange.toString()}`);
      console.log(`       Leaf: ${leafHex}`);
    } else {
      // Empty slots
      const expectedLeaf = poseidon_raw([0n, 0n]);
      const matches = leaf === expectedLeaf;
      const marker = matches ? '✅' : '❌';
      console.log(`   [${i}] ${marker} Empty slot:`);
      console.log(`       Leaf: ${leafHex}`);
    }
  }
  console.log('   ─────────────────────────────────────────────────────────\n');

  // Verify balance changes for Proof #1: Participant 1 → Participant 2 (1 TON)
  const participant1Balance1 = bytesToBigInt(await stateManager1.getStorage(contractAddress1, hexToBytes(addHexPrefix(registeredKeys[0]))));
  const participant2Balance1 = bytesToBigInt(await stateManager1.getStorage(contractAddress1, hexToBytes(addHexPrefix(registeredKeys[1]))));
  const participant1PreviousBalance = previousBalances1[0];
  const participant2PreviousBalance = previousBalances1[1];
  const expectedChange1 = -parseEther('1');
  const expectedChange2 = parseEther('1');
  const actualChange1 = participant1Balance1 - participant1PreviousBalance;
  const actualChange2 = participant2Balance1 - participant2PreviousBalance;

  console.log('   💰 Balance Verification (Proof #1: P1 → P2, 1 TON):');
  console.log(`      Participant 1: ${participant1PreviousBalance.toString()} → ${participant1Balance1.toString()} (Expected: ${expectedChange1.toString()}, Actual: ${actualChange1.toString()})`);
  console.log(`      Participant 2: ${participant2PreviousBalance.toString()} → ${participant2Balance1.toString()} (Expected: ${expectedChange2.toString()}, Actual: ${actualChange2.toString()})`);

  if (actualChange1 === expectedChange1 && actualChange2 === expectedChange2) {
    console.log('      ✅ Balance changes match expected values!\n');
  } else {
    console.error('      ❌ Balance changes do NOT match expected values!');
    process.exit(1);
  }

  // Extract state info for next proof
  const stateInfo1 = await extractStateInfo(
    stateManager1,
    stateInfo.contractAddress,
    stateInfo.registeredKeys,
    stateInfo.preAllocatedLeaves,
  );

  // Save state info
  const stateInfoPath1 = resolve(proof1Path, 'state_info.json');
  writeFileSync(
    stateInfoPath1,
    JSON.stringify(stateInfo1, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2),
    'utf-8',
  );
  console.log(`   ✅ state_info.json saved`);

  console.log(`\n✅ Proof #1: Synthesizer execution completed successfully\n`);

  // ========================================================================
  // PROOF #2: Participant 2 → Participant 3 Transfer (0.5 TON)
  // ========================================================================
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                  Proof #2: Participant 2 → 3 (0.5 TON)       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const transferAmount2 = parseEther('0.5'); // 0.5 TON
  const participant3L2Address2 = allL2Addresses[2]; // Use L2 address from Step 5.5
  const calldata2 =
    '0xa9059cbb' + // transfer(address,uint256)
    participant3L2Address2.slice(2).padStart(64, '0') + // recipient (participant 3)
    transferAmount2.toString(16).padStart(64, '0'); // amount (0.5 TON)

  console.log('🔄 Generating circuit for Participant 2 → Participant 3 transfer...\n');

  // Use main.ts pattern: createSynthesizerOptsForSimulationFromRPC + createSynthesizer
  const proof2Path = resolve(__dirname, '../test-outputs/l2-state-channel-transfer-2');
  const calldataBytes2 = hexToBytes(addHexPrefix(calldata2));

  // Load state from state_info.json (Proof #1 output)
  console.log('   📸 Loading state from state_info.json (Proof #1)...');
  if (!existsSync(stateInfoPath1)) {
    console.error(`\n❌ FAILURE: state_info.json not found at ${stateInfoPath1}`);
    process.exit(1);
  }
  // Overwrite stateInfo1 with data from file (Proof #1 output)
  const stateInfo1FromFile = JSON.parse(readFileSync(stateInfoPath1, 'utf-8'));

  // Build initStorageKeys for Proof #2 (same structure as Proof #1)
  const initStorageKeys2: Array<{ L1: Uint8Array; L2: Uint8Array }> = [];

  // Add pre-allocated leaves first
  for (const leaf of stateInfo1FromFile.preAllocatedLeaves) {
    const keyBytes = hexToBytes(addHexPrefix(leaf.key));
    initStorageKeys2.push({
      L1: keyBytes,
      L2: keyBytes,
    });
  }

  // Add all participants' storage keys
  // L1: participant's L1 address as storage key (to fetch from on-chain)
  // L2: participant's MPT key (actual L2 storage key)
  // Get participants from on-chain
  const participants2 = await bridgeContract.getChannelParticipants(CHANNEL_ID);
  for (let i = 0; i < participants2.length; i++) {
    const l1Address = participants2[i];
    // Get MPT key from on-chain using channel ID and L1 address
    const mptKeyBigInt = await bridgeContract.getL2MptKey(CHANNEL_ID, l1Address);
    const mptKeyHex = '0x' + mptKeyBigInt.toString(16).padStart(64, '0');
    const l1StorageKey = getUserStorageKey([l1Address, 0], 'L1'); // L1 storage key from participant address
    const mptKeyBytes = hexToBytes(addHexPrefix(mptKeyHex));
    initStorageKeys2.push({
      L1: l1StorageKey,
      L2: mptKeyBytes,
    });
  }

  const simulationOpts2: SynthesizerSimulationOpts = {
    txNonce: 0n,
    rpcUrl: RPC_URL,
    senderL2PrvKey: allPrivateKeys[1], // Participant 2's private key
    blockNumber: tx.blockNumber,
    contractAddress: targetAddress as `0x${string}`,
    initStorageKeys: initStorageKeys2,
    callData: calldataBytes2,
  };

  const synthesizerOpts2 = await createSynthesizerOptsForSimulationFromRPC(simulationOpts2);

  // Get state manager from synthesizer options
  const stateManager2 = synthesizerOpts2.stateManager;
  const contractAddress2 = new Address(toBytes(addHexPrefix(targetAddress)));

  // Restore storage entries from state_info.json
  console.log('   📸 Restoring state from state_info.json...');
  for (const entry of stateInfo1FromFile.storageEntries) {
    const mptKeyBytes = hexToBytes(addHexPrefix(entry.key));
    const valueBytes = hexToBytes(addHexPrefix(entry.value));
    await stateManager2.putStorage(contractAddress2, mptKeyBytes, valueBytes);
  }

  // Rebuild initialMerkleTree with restored storage values
  await stateManager2.rebuildInitialMerkleTree();

  const restoredRoot2 = stateManager2.initialMerkleTree.root;
  const expectedRoot2 = BigInt(stateInfo1FromFile.stateRoot);

  console.log(`   ✅ Restored Merkle Root: 0x${restoredRoot2.toString(16)}`);
  console.log(`   ✅ Expected Merkle Root: 0x${expectedRoot2.toString(16)}\n`);

  if (restoredRoot2 !== expectedRoot2) {
    console.error(`\n❌ FAILURE: Merkle root mismatch in Proof #2!`);
    console.error(`   Expected: ${stateInfo1FromFile.stateRoot}`);
    console.error(`   Got:      0x${restoredRoot2.toString(16)}`);
    console.error('\n   Test stopped due to Merkle root mismatch.');
    console.error('   This indicates that the state snapshot was not properly restored.');
    process.exit(1);
  }

  const synthesizer2 = await createSynthesizer(synthesizerOpts2);
  let runTxResult2;
  try {
    runTxResult2 = await synthesizer2.synthesizeTX();
  } catch (error: any) {
    console.error('\n❌ FAILURE: Synthesizer error detected in Proof #2!');
    console.error(`   Error: ${error.message || error}`);
    if (error.stack) {
      console.error(`   Stack: ${error.stack}`);
    }
    console.error('\n   Test stopped due to synthesizer error.');
    process.exit(1);
  }
  const circuitGenerator2 = await createCircuitGenerator(synthesizer2);
  mkdirSync(proof2Path, { recursive: true });
  circuitGenerator2.writeOutputs(proof2Path);

  const finalStateRoot2 = await stateManager2.getUpdatedMerkleTreeRoot();
  const finalStateRoot2Hex = '0x' + finalStateRoot2.toString(16).padStart(64, '0').toLowerCase();
  const placementVariables2 = circuitGenerator2.variableGenerator.placementVariables || [];
  const permutation2 = circuitGenerator2.permutationGenerator?.permutation || [];

  if (placementVariables2.length === 0) {
    console.error('❌ Synthesizer failed to generate placements for Proof #2');
    return;
  }

  console.log(`\n✅ Proof #2: Circuit generated successfully`);
  console.log(`   - Placements: ${placementVariables2.length}`);
  console.log(`   - Previous State Root: ${stateInfo1FromFile.stateRoot}`);
  console.log(`   - New State Root:      ${finalStateRoot2Hex}\n`);

  const executionSuccess2 = !runTxResult2.execResult.exceptionError;
  const gasUsed2 = runTxResult2.totalGasSpent;
  const logsCount2 = runTxResult2.execResult.logs?.length || 0;
  const hasEVMError2 = runTxResult2.execResult.exceptionError !== undefined;

  console.log('📊 Transaction Execution Result:');
  console.log(`   - Success: ${executionSuccess2 ? '✅' : '❌'}`);
  console.log(`   - Gas Used: ${gasUsed2}`);
  console.log(`   - Logs Emitted: ${logsCount2}`);
  console.log(`   - EVM Error: ${hasEVMError2 ? '❌ Yes' : '✅ No'}`);
  if (!executionSuccess2) {
    const errorMsg = runTxResult2.execResult.exceptionError?.error?.toString() || 'Unknown error';
    console.log(`   - Error: ${errorMsg}`);
    console.log('\n❌ FAILURE: Transaction REVERTED!');
    process.exit(1);
  }
  if (hasEVMError2) {
    const errorMsg = runTxResult2.execResult.exceptionError?.error?.toString() || 'Unknown error';
    console.log(`   - EVM Error Details: ${errorMsg}`);
    console.log('\n⚠️  WARNING: EVM error detected even though transaction succeeded');
  }
  console.log('');

  if (finalStateRoot2Hex.toLowerCase() !== stateInfo1FromFile.stateRoot.toLowerCase()) {
    console.log('   ✅ State root CHANGED! (Success!)\n');
  } else {
    console.log('   ⚠️  State root UNCHANGED\n');
  }

  // Show updated Merkle tree leaves and balances after Proof #2
  console.log('   📋 MT Final Public Signals (After Proof #2):');
  console.log('   ─────────────────────────────────────────────────────────');
  const finalLeaves2 = await stateManager2.convertLeavesIntoMerkleTreeLeaves();

  // Store previous balances for comparison
  const previousBalances2: bigint[] = [];
  for (const entry of stateInfo1FromFile.storageEntries) {
    previousBalances2.push(BigInt(entry.value));
  }

  for (let i = 0; i < finalLeaves2.length; i++) {
    const leaf = finalLeaves2[i];
    const leafHex = '0x' + leaf.toString(16).padStart(64, '0');

    if (i < stateInfo1FromFile.preAllocatedLeaves.length) {
      // Pre-allocated leaves
      const preAllocatedLeaf = stateInfo1FromFile.preAllocatedLeaves[i];
      const keyBigInt = BigInt(preAllocatedLeaf.key);
      const valueBigInt = BigInt(preAllocatedLeaf.value);
      const expectedLeaf = poseidon_raw([keyBigInt, valueBigInt]);
      const matches = leaf === expectedLeaf;
      const marker = matches ? '✅' : '❌';
      console.log(`   [${i}] ${marker} Pre-allocated leaf:`);
      console.log(`       Key: ${preAllocatedLeaf.key}`);
      console.log(`       Value: ${valueBigInt.toString()}`);
      console.log(`       Leaf: ${leafHex}`);
    } else if (i < stateInfo1FromFile.preAllocatedLeaves.length + stateInfo1FromFile.registeredKeys.length) {
      // Participants' MPT keys and balances (updated after transfer)
      const participantIndex = i - stateInfo1FromFile.preAllocatedLeaves.length;
      const key = stateInfo1FromFile.registeredKeys[participantIndex];
      const keyHex = key.startsWith('0x') ? key : '0x' + key;
      const keyBigInt = BigInt(keyHex);
      // Get updated value from stateManager
      const updatedValue = await stateManager2.getStorage(contractAddress2, hexToBytes(addHexPrefix(key)));
      const valueBigInt = bytesToBigInt(updatedValue);
      const previousBalance = previousBalances2[participantIndex];
      const balanceChange = valueBigInt - previousBalance;
      const expectedLeaf = poseidon_raw([keyBigInt, valueBigInt]);
      const matches = leaf === expectedLeaf;
      const marker = matches ? '✅' : '❌';
      console.log(`   [${i}] ${marker} Participant ${participantIndex}:`);
      console.log(`       Key: ${key}`);
      console.log(`       Previous Balance: ${previousBalance.toString()}`);
      console.log(`       Current Balance: ${valueBigInt.toString()}`);
      console.log(`       Balance Change: ${balanceChange >= 0n ? '+' : ''}${balanceChange.toString()}`);
      console.log(`       Leaf: ${leafHex}`);
    } else {
      // Empty slots
      const expectedLeaf = poseidon_raw([0n, 0n]);
      const matches = leaf === expectedLeaf;
      const marker = matches ? '✅' : '❌';
      console.log(`   [${i}] ${marker} Empty slot:`);
      console.log(`       Leaf: ${leafHex}`);
    }
  }
  console.log('   ─────────────────────────────────────────────────────────\n');

  // Verify balance changes for Proof #2: Participant 2 → Participant 3 (0.5 TON)
  const participant2Balance2 = bytesToBigInt(await stateManager2.getStorage(contractAddress2, hexToBytes(addHexPrefix(stateInfo1FromFile.registeredKeys[1]))));
  const participant3Balance2 = bytesToBigInt(await stateManager2.getStorage(contractAddress2, hexToBytes(addHexPrefix(stateInfo1FromFile.registeredKeys[2]))));
  const participant2PreviousBalance2 = previousBalances2[1];
  const participant3PreviousBalance2 = previousBalances2[2];
  const expectedChange2_1 = -parseEther('0.5');
  const expectedChange3_1 = parseEther('0.5');
  const actualChange2_1 = participant2Balance2 - participant2PreviousBalance2;
  const actualChange3_1 = participant3Balance2 - participant3PreviousBalance2;

  console.log('   💰 Balance Verification (Proof #2: P2 → P3, 0.5 TON):');
  console.log(`      Participant 2: ${participant2PreviousBalance2.toString()} → ${participant2Balance2.toString()} (Expected: ${expectedChange2_1.toString()}, Actual: ${actualChange2_1.toString()})`);
  console.log(`      Participant 3: ${participant3PreviousBalance2.toString()} → ${participant3Balance2.toString()} (Expected: ${expectedChange3_1.toString()}, Actual: ${actualChange3_1.toString()})`);

  if (actualChange2_1 === expectedChange2_1 && actualChange3_1 === expectedChange3_1) {
    console.log('      ✅ Balance changes match expected values!\n');
  } else {
    console.error('      ❌ Balance changes do NOT match expected values!');
    process.exit(1);
  }

  const stateInfo2 = await extractStateInfo(
    stateManager2,
    stateInfo1FromFile.contractAddress,
    stateInfo1FromFile.registeredKeys,
    stateInfo1FromFile.preAllocatedLeaves,
  );
  const stateInfoPath2 = resolve(proof2Path, 'state_info.json');
  writeFileSync(
    stateInfoPath2,
    JSON.stringify(stateInfo2, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2),
    'utf-8',
  );
  console.log(`   ✅ state_info.json saved`);

  console.log(`\n✅ Proof #2: Synthesizer execution completed successfully\n`);

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

  // Use main.ts pattern: createSynthesizerOptsForSimulationFromRPC + createSynthesizer
  const proof3Path = resolve(__dirname, '../test-outputs/l2-state-channel-transfer-3');
  const calldataBytes3 = hexToBytes(addHexPrefix(calldata3));

  // Load state from state_info.json (Proof #2 output)
  console.log('   📸 Loading state from state_info.json (Proof #2)...');
  if (!existsSync(stateInfoPath2)) {
    console.error(`\n❌ FAILURE: state_info.json not found at ${stateInfoPath2}`);
    process.exit(1);
  }
  // Overwrite stateInfo2 with data from file (Proof #2 output)
  const stateInfo2FromFile = JSON.parse(readFileSync(stateInfoPath2, 'utf-8'));

  // Build initStorageKeys for Proof #3 (same structure as previous proofs)
  const initStorageKeys3: Array<{ L1: Uint8Array; L2: Uint8Array }> = [];

  // Add pre-allocated leaves first
  for (const leaf of stateInfo2FromFile.preAllocatedLeaves) {
    const keyBytes = hexToBytes(addHexPrefix(leaf.key));
    initStorageKeys3.push({
      L1: keyBytes,
      L2: keyBytes,
    });
  }

  // Add all participants' storage keys
  // L1: participant's L1 address as storage key (to fetch from on-chain)
  // L2: participant's MPT key (actual L2 storage key)
  // Get participants from on-chain
  const participants3 = await bridgeContract.getChannelParticipants(CHANNEL_ID);
  for (let i = 0; i < participants3.length; i++) {
    const l1Address = participants3[i];
    // Get MPT key from on-chain using channel ID and L1 address
    const mptKeyBigInt = await bridgeContract.getL2MptKey(CHANNEL_ID, l1Address);
    const mptKeyHex = '0x' + mptKeyBigInt.toString(16).padStart(64, '0');
    const l1StorageKey = getUserStorageKey([l1Address, 0], 'L1'); // L1 storage key from participant address
    const mptKeyBytes = hexToBytes(addHexPrefix(mptKeyHex));
    initStorageKeys3.push({
      L1: l1StorageKey,
      L2: mptKeyBytes,
    });
  }

  const simulationOpts3: SynthesizerSimulationOpts = {
    txNonce: 0n,
    rpcUrl: RPC_URL,
    senderL2PrvKey: allPrivateKeys[2], // Participant 3's private key
    blockNumber: tx.blockNumber,
    contractAddress: targetAddress as `0x${string}`,
    initStorageKeys: initStorageKeys3,
    callData: calldataBytes3,
  };

  const synthesizerOpts3 = await createSynthesizerOptsForSimulationFromRPC(simulationOpts3);

  // Get state manager from synthesizer options
  const stateManager3 = synthesizerOpts3.stateManager;
  const contractAddress3 = new Address(toBytes(addHexPrefix(targetAddress)));

  // Restore storage entries from state_info.json
  console.log('   📸 Restoring state from state_info.json...');
  for (const entry of stateInfo2FromFile.storageEntries) {
    const mptKeyBytes = hexToBytes(addHexPrefix(entry.key));
    const valueBytes = hexToBytes(addHexPrefix(entry.value));
    await stateManager3.putStorage(contractAddress3, mptKeyBytes, valueBytes);
  }

  // Rebuild initialMerkleTree with restored storage values
  await stateManager3.rebuildInitialMerkleTree();

  const restoredRoot3 = stateManager3.initialMerkleTree.root;
  const expectedRoot3 = BigInt(stateInfo2FromFile.stateRoot);

  console.log(`   ✅ Restored Merkle Root: 0x${restoredRoot3.toString(16)}`);
  console.log(`   ✅ Expected Merkle Root: 0x${expectedRoot3.toString(16)}\n`);

  if (restoredRoot3 !== expectedRoot3) {
    console.error(`\n❌ FAILURE: Merkle root mismatch in Proof #3!`);
    console.error(`   Expected: ${stateInfo2FromFile.stateRoot}`);
    console.error(`   Got:      0x${restoredRoot3.toString(16)}`);
    console.error('\n   Test stopped due to Merkle root mismatch.');
    console.error('   This indicates that the state snapshot was not properly restored.');
    process.exit(1);
  }

  const synthesizer3 = await createSynthesizer(synthesizerOpts3);
  let runTxResult3;
  try {
    runTxResult3 = await synthesizer3.synthesizeTX();
  } catch (error: any) {
    console.error('\n❌ FAILURE: Synthesizer error detected in Proof #3!');
    console.error(`   Error: ${error.message || error}`);
    if (error.stack) {
      console.error(`   Stack: ${error.stack}`);
    }
    console.error('\n   Test stopped due to synthesizer error.');
    process.exit(1);
  }
  const circuitGenerator3 = await createCircuitGenerator(synthesizer3);
  mkdirSync(proof3Path, { recursive: true });
  circuitGenerator3.writeOutputs(proof3Path);

  const finalStateRoot3 = await stateManager3.getUpdatedMerkleTreeRoot();
  const finalStateRoot3Hex = '0x' + finalStateRoot3.toString(16).padStart(64, '0').toLowerCase();
  const placementVariables3 = circuitGenerator3.variableGenerator.placementVariables || [];
  const permutation3 = circuitGenerator3.permutationGenerator?.permutation || [];

  if (placementVariables3.length === 0) {
    console.error('❌ Synthesizer failed to generate placements for Proof #3');
    return;
  }

  console.log(`\n✅ Proof #3: Circuit generated successfully`);
  console.log(`   - Placements: ${placementVariables3.length}`);
  console.log(`   - Previous State Root: ${stateInfo2FromFile.stateRoot}`);
  console.log(`   - New State Root:      ${finalStateRoot3Hex}\n`);

  const executionSuccess3 = !runTxResult3.execResult.exceptionError;
  const gasUsed3 = runTxResult3.totalGasSpent;
  const logsCount3 = runTxResult3.execResult.logs?.length || 0;
  const hasEVMError3 = runTxResult3.execResult.exceptionError !== undefined;

  console.log('📊 Transaction Execution Result:');
  console.log(`   - Success: ${executionSuccess3 ? '✅' : '❌'}`);
  console.log(`   - Gas Used: ${gasUsed3}`);
  console.log(`   - Logs Emitted: ${logsCount3}`);
  console.log(`   - EVM Error: ${hasEVMError3 ? '❌ Yes' : '✅ No'}`);
  if (!executionSuccess3) {
    const errorMsg = runTxResult3.execResult.exceptionError?.error?.toString() || 'Unknown error';
    console.log(`   - Error: ${errorMsg}`);
    console.log('\n❌ FAILURE: Transaction REVERTED!');
    process.exit(1);
  }
  if (hasEVMError3) {
    const errorMsg = runTxResult3.execResult.exceptionError?.error?.toString() || 'Unknown error';
    console.log(`   - EVM Error Details: ${errorMsg}`);
    console.log('\n⚠️  WARNING: EVM error detected even though transaction succeeded');
  }
  console.log('');

  if (finalStateRoot3Hex.toLowerCase() !== stateInfo2FromFile.stateRoot.toLowerCase()) {
    console.log('   ✅ State root CHANGED! (Success!)\n');
  } else {
    console.log('   ⚠️  State root UNCHANGED\n');
  }

  // Show updated Merkle tree leaves and balances after Proof #3
  console.log('   📋 MT Final Public Signals (After Proof #3):');
  console.log('   ─────────────────────────────────────────────────────────');
  const finalLeaves3 = await stateManager3.convertLeavesIntoMerkleTreeLeaves();

  // Store previous balances for comparison
  const previousBalances3: bigint[] = [];
  for (const entry of stateInfo2FromFile.storageEntries) {
    previousBalances3.push(BigInt(entry.value));
  }

  for (let i = 0; i < finalLeaves3.length; i++) {
    const leaf = finalLeaves3[i];
    const leafHex = '0x' + leaf.toString(16).padStart(64, '0');

    if (i < stateInfo2FromFile.preAllocatedLeaves.length) {
      // Pre-allocated leaves
      const preAllocatedLeaf = stateInfo2FromFile.preAllocatedLeaves[i];
      const keyBigInt = BigInt(preAllocatedLeaf.key);
      const valueBigInt = BigInt(preAllocatedLeaf.value);
      const expectedLeaf = poseidon_raw([keyBigInt, valueBigInt]);
      const matches = leaf === expectedLeaf;
      const marker = matches ? '✅' : '❌';
      console.log(`   [${i}] ${marker} Pre-allocated leaf:`);
      console.log(`       Key: ${preAllocatedLeaf.key}`);
      console.log(`       Value: ${valueBigInt.toString()}`);
      console.log(`       Leaf: ${leafHex}`);
    } else if (i < stateInfo2FromFile.preAllocatedLeaves.length + stateInfo2FromFile.registeredKeys.length) {
      // Participants' MPT keys and balances (updated after transfer)
      const participantIndex = i - stateInfo2FromFile.preAllocatedLeaves.length;
      const key = stateInfo2FromFile.registeredKeys[participantIndex];
      const keyHex = key.startsWith('0x') ? key : '0x' + key;
      const keyBigInt = BigInt(keyHex);
      // Get updated value from stateManager
      const updatedValue = await stateManager3.getStorage(contractAddress3, hexToBytes(addHexPrefix(key)));
      const valueBigInt = bytesToBigInt(updatedValue);
      const previousBalance = previousBalances3[participantIndex];
      const balanceChange = valueBigInt - previousBalance;
      const expectedLeaf = poseidon_raw([keyBigInt, valueBigInt]);
      const matches = leaf === expectedLeaf;
      const marker = matches ? '✅' : '❌';
      console.log(`   [${i}] ${marker} Participant ${participantIndex}:`);
      console.log(`       Key: ${key}`);
      console.log(`       Previous Balance: ${previousBalance.toString()}`);
      console.log(`       Current Balance: ${valueBigInt.toString()}`);
      console.log(`       Balance Change: ${balanceChange >= 0n ? '+' : ''}${balanceChange.toString()}`);
      console.log(`       Leaf: ${leafHex}`);
    } else {
      // Empty slots
      const expectedLeaf = poseidon_raw([0n, 0n]);
      const matches = leaf === expectedLeaf;
      const marker = matches ? '✅' : '❌';
      console.log(`   [${i}] ${marker} Empty slot:`);
      console.log(`       Leaf: ${leafHex}`);
    }
  }
  console.log('   ─────────────────────────────────────────────────────────\n');

  // Verify balance changes for Proof #3: Participant 3 → Participant 1 (1 TON)
  const participant3Balance3 = bytesToBigInt(await stateManager3.getStorage(contractAddress3, hexToBytes(addHexPrefix(stateInfo2FromFile.registeredKeys[2]))));
  const participant1Balance3 = bytesToBigInt(await stateManager3.getStorage(contractAddress3, hexToBytes(addHexPrefix(stateInfo2FromFile.registeredKeys[0]))));
  const participant3PreviousBalance3 = previousBalances3[2];
  const participant1PreviousBalance3 = previousBalances3[0];
  const expectedChange3_2 = -parseEther('1');
  const expectedChange1_2 = parseEther('1');
  const actualChange3_2 = participant3Balance3 - participant3PreviousBalance3;
  const actualChange1_2 = participant1Balance3 - participant1PreviousBalance3;

  console.log('   💰 Balance Verification (Proof #3: P3 → P1, 1 TON):');
  console.log(`      Participant 3: ${participant3PreviousBalance3.toString()} → ${participant3Balance3.toString()} (Expected: ${expectedChange3_2.toString()}, Actual: ${actualChange3_2.toString()})`);
  console.log(`      Participant 1: ${participant1PreviousBalance3.toString()} → ${participant1Balance3.toString()} (Expected: ${expectedChange1_2.toString()}, Actual: ${actualChange1_2.toString()})`);

  if (actualChange3_2 === expectedChange3_2 && actualChange1_2 === expectedChange1_2) {
    console.log('      ✅ Balance changes match expected values!\n');
  } else {
    console.error('      ❌ Balance changes do NOT match expected values!');
    process.exit(1);
  }

  const stateInfo3 = await extractStateInfo(
    stateManager3,
    stateInfo2FromFile.contractAddress,
    stateInfo2FromFile.registeredKeys,
    stateInfo2FromFile.preAllocatedLeaves,
  );
  const stateInfoPath3 = resolve(proof3Path, 'state_info.json');
  writeFileSync(
    stateInfoPath3,
    JSON.stringify(stateInfo3, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2),
    'utf-8',
  );
  console.log(`   ✅ state_info.json saved`);

  console.log(`\n✅ Proof #3: Synthesizer execution completed successfully\n`);

  // ========================================================================
  // FINAL SUMMARY
  // ========================================================================
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                     Test Summary                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('✅ Successfully completed sequential transfer simulation!');
  console.log('');
  console.log('📊 State Root Evolution:');
  console.log(`   Initial (Onchain):         ${stateInfo.stateRoot}`);
  console.log(`   → Proof #1 (P1→P2, 1 TON):  ${stateInfo1.stateRoot}`);
  console.log(`   → Proof #2 (P2→P3, 0.5 TON): ${stateInfo2.stateRoot}`);
  console.log(`   → Proof #3 (P3→P1, 1 TON):  ${stateInfo3.stateRoot}`);
  console.log('');
  console.log('🔬 Synthesizer Execution:');
  console.log(`   - Proof #1: Synthesize ✅ | Balance Verified ✅`);
  console.log(`   - Proof #2: Synthesize ✅ | Balance Verified ✅`);
  console.log(`   - Proof #3: Synthesize ✅ | Balance Verified ✅`);
  console.log('');
  console.log('🔄 Sequential Execution Flow:');
  console.log('   Proof #1: Synthesize → Verify Balance ✅ Complete');
  console.log('             ↓ (balance verified, proceed to next)');
  console.log('   Proof #2: Synthesize → Verify Balance ✅ Complete');
  console.log('             ↓ (balance verified, proceed to next)');
  console.log('   Proof #3: Synthesize → Verify Balance ✅ Complete');

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    Test Completed Successfully!               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract state info from stateManager after transaction execution
 */
async function extractStateInfo(
  stateManager: TokamakL2StateManager,
  contractAddress: string,
  registeredKeys: string[],
  preAllocatedLeaves: Array<{ key: string; value: string }>,
): Promise<{
  stateRoot: string;
  registeredKeys: string[];
  storageEntries: Array<{ index: number; key: string; value: string }>;
  contractAddress: string;
  preAllocatedLeaves: Array<{ key: string; value: string }>;
}> {
  const contractAddr = new Address(toBytes(addHexPrefix(contractAddress)));

  // Get updated merkle tree root
  const updatedRoot = await stateManager.getUpdatedMerkleTreeRoot();
  const stateRoot = '0x' + updatedRoot.toString(16).padStart(64, '0').toLowerCase();

  // Extract storage entries
  const storageEntries: Array<{ index: number; key: string; value: string }> = [];
  for (let i = 0; i < registeredKeys.length; i++) {
    const key = hexToBytes(addHexPrefix(registeredKeys[i]));
    const value = await stateManager.getStorage(contractAddr, key);
    const valueBigInt = bytesToBigInt(value);
    const valueHex = '0x' + valueBigInt.toString(16).padStart(64, '0');

    storageEntries.push({
      index: i,
      key: registeredKeys[i],
      value: valueHex,
    });
  }

  return {
    stateRoot,
    registeredKeys,
    storageEntries,
    contractAddress,
    preAllocatedLeaves,
  };
}

async function runProver(proofNum: number, outputsPath: string): Promise<boolean> {
  console.log(`\n⚡ Proof #${proofNum}: Running prover...`);

  const qapPath = resolve(projectRoot, 'packages/frontend/qap-compiler/subcircuits/library');
  const synthesizerPath = outputsPath; // outputsPath is already an absolute path
  const setupPath = resolve(projectRoot, 'dist/macOS/resource/setup/output');
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

  const qapPath = resolve(projectRoot, 'packages/frontend/qap-compiler/subcircuits/library');
  const synthesizerPath = outputsPath; // outputsPath is already an absolute path
  const setupPath = resolve(projectRoot, 'dist/macOS/resource/setup/output');
  const preprocessPath = resolve(projectRoot, 'dist/macOS/resource/preprocess/output');
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
  console.log(`\n⚙️  Running preprocess (Proof #1 setup)...`);

  const qapPath = resolve(projectRoot, 'packages/frontend/qap-compiler/subcircuits/library');
  const synthesizerPath = outputsPath; // outputsPath is already an absolute path
  const setupPath = resolve(projectRoot, 'dist/macOS/resource/setup/output');
  const preprocessOutPath = resolve(projectRoot, 'dist/macOS/resource/preprocess/output');

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
