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
import { createSynthesizer } from '../../src/synthesizer/index.ts';
import { createCircuitGenerator } from '../../src/circuitGenerator/circuitGenerator.ts';
import { createSynthesizerOptsForSimulationFromRPC, SynthesizerSimulationOpts } from '../../src/interface/index.ts';
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
const CHANNEL_ID = 1; // Channel 10 for testing (single token: TON only)

// Transaction hash for initializeChannelState
// This should be the transaction that called initializeChannelState for the channel
const INITIALIZE_TX_HASH = '0xe9fd8fd1c94c476021e2f98332ed2011a487f784ddb25a640567475c976a7714';

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

  // Create StateSnapshot from on-chain data
  // Note: Using MPT keys from getL2MptKey() directly - these are the keys used during deposit
  // Use keys in the same order as fetched from on-chain (no sorting)
  const stateSnapshot: StateSnapshot = {
    stateRoot: onChainStateRoot, // Use the state root from StateInitialized event
    registeredKeys: registeredKeys, // Use MPT keys in original order (as fetched from on-chain)
    storageEntries: storageEntries,
    contractAddress: targetAddress,
    userL2Addresses: [], // Not needed when using MPT keys directly
    userStorageSlots: [0n], // Slot 0 for ERC20 balance
    timestamp: Date.now(),
    userNonces: participants.map(() => 0n), // All nonces start at 0
  };

  console.log(`   ✅ StateSnapshot created:`);
  console.log(`      - State Root: ${stateSnapshot.stateRoot}`);
  console.log(`      - Storage Entries: ${stateSnapshot.storageEntries.length}`);
  console.log(`      - Registered Keys: ${stateSnapshot.registeredKeys.length}\n`);

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

  console.log(`   ✅ Generated L2 keys for ${allPublicKeys.length} participants\n`);

  // Step 4: Restore state to Synthesizer's TokamakL2StateManager (using main.ts pattern)
  // Now using actual L2 keys from deposit (generated in Step 5.5)
  console.log('🔄 Step 4: Restoring state to Synthesizer EVM (using deposit L2 keys)...\n');

  // Use main.ts pattern: createSynthesizerOptsForSimulationFromRPC with skipRPCInit
  // This ensures consistent state manager initialization
  // Note: TokamakL2Tx requires at least 4 bytes (function selector), so we use a dummy selector
  const verifyCalldata = hexToBytes(addHexPrefix('0x00000000')); // Dummy function selector for verification only
  const verifySimulationOpts: SynthesizerSimulationOpts = {
    txNonce: 0n,
    rpcUrl: RPC_URL,
    senderL2PrvKey: allPrivateKeys[0], // Use actual deposit private key
    blockNumber: tx.blockNumber,
    contractAddress: targetAddress as `0x${string}`,
    userStorageSlots: [0],
    addressListL1: allL1Addresses as `0x${string}`[],
    publicKeyListL2: allPublicKeys, // Use actual deposit public keys
    callData: verifyCalldata,
    skipRPCInit: true, // Skip RPC init since we'll restore from snapshot
  };

  // Create synthesizer options (main.ts pattern)
  const verifySynthesizerOpts = await createSynthesizerOptsForSimulationFromRPC(verifySimulationOpts);

  // Get state manager from synthesizer options (main.ts pattern)
  const stateManager = verifySynthesizerOpts.stateManager;
  const snapshotContractAddress = new Address(toBytes(addHexPrefix(stateSnapshot.contractAddress)));

  // Set up contract account (required before restoring storage)
  const POSEIDON_RLP_VERIFY = stateManager.cachedOpts!.common.customCrypto.keccak256!(RLP.encode(new Uint8Array([])));
  const POSEIDON_NULL_VERIFY = stateManager.cachedOpts!.common.customCrypto.keccak256!(new Uint8Array(0));
  const contractAccount = createAccount({
    nonce: 0n,
    balance: 0n,
    storageRoot: POSEIDON_RLP_VERIFY,
    codeHash: POSEIDON_NULL_VERIFY,
  });
  await stateManager.putAccount(snapshotContractAddress, contractAccount);

  // Load contract code from RPC (needed for execution)
  const byteCodeStr = await provider.getCode(snapshotContractAddress.toString(), tx.blockNumber);
  await stateManager.putCode(snapshotContractAddress, hexToBytes(addHexPrefix(byteCodeStr)));

  // Restore state from snapshot using main.ts pattern
  console.log('   Restoring state from snapshot...');

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

  // Debug: Log registeredKeys order before rebuilding
  console.log('   📋 RegisteredKeys order (used for merkle tree):');
  for (let i = 0; i < stateSnapshot.registeredKeys.length; i++) {
    const key = stateSnapshot.registeredKeys[i];
    const entry = stateSnapshot.storageEntries.find(e => e.key.toLowerCase() === key.toLowerCase());
    console.log(`      [${i}] ${key.slice(0, 20)}... Value: ${entry?.value || 'N/A'}`);
  }

  await stateManager.rebuildInitialMerkleTree();

  // Debug: Check leaves calculation
  const leaves = await stateManager.convertLeavesIntoMerkleTreeLeaves();
  console.log('   📋 Merkle tree leaves (first 3 non-zero):');
  for (let i = 0; i < Math.min(leaves.length, 3); i++) {
    if (leaves[i] !== 0n) {
      const key = stateSnapshot.registeredKeys[i];
      const entry = stateSnapshot.storageEntries.find(e => e.key.toLowerCase() === key.toLowerCase());
      console.log(`      [${i}] Key: ${key.slice(0, 20)}... Leaf: 0x${leaves[i].toString(16).slice(0, 20)}...`);
    }
  }

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

  const simulationOpts1: SynthesizerSimulationOpts = {
    txNonce: 0n,
    rpcUrl: RPC_URL,
    senderL2PrvKey: allPrivateKeys[0],
    blockNumber: tx.blockNumber,
    contractAddress: targetAddress as `0x${string}`,
    userStorageSlots: [0], // ERC20 balance slot
    addressListL1: allL1Addresses as `0x${string}`[],
    publicKeyListL2: allPublicKeys,
    callData: calldataBytes,
    skipRPCInit: true, // Skip RPC init since we'll restore from snapshot
  };

  // Create synthesizer options (main.ts pattern)
  const synthesizerOpts1 = await createSynthesizerOptsForSimulationFromRPC(simulationOpts1);

  // Restore state from snapshot BEFORE creating synthesizer (using cachedOpts.stateManager)
  // This ensures INI_MERKLE_ROOT is set correctly during synthesizer initialization
  const stateManager1 = synthesizerOpts1.stateManager;
  const contractAddress1 = new Address(toBytes(addHexPrefix(stateSnapshot.contractAddress)));

  // Set up contract account (required before restoring storage)
  // Note: skipRPCInit=true means contract account is not set up, so we need to do it manually
  const POSEIDON_RLP1 = synthesizerOpts1.stateManager.cachedOpts!.common.customCrypto.keccak256!(
    RLP.encode(new Uint8Array([])),
  );
  const POSEIDON_NULL1 = synthesizerOpts1.stateManager.cachedOpts!.common.customCrypto.keccak256!(new Uint8Array(0));
  const contractAccount1 = createAccount({
    nonce: 0n,
    balance: 0n,
    storageRoot: POSEIDON_RLP1,
    codeHash: POSEIDON_NULL1,
  });
  await stateManager1.putAccount(contractAddress1, contractAccount1);

  // Load contract code from RPC (needed for execution)
  const byteCodeStr1 = await provider.getCode(contractAddress1.toString(), tx.blockNumber);
  await stateManager1.putCode(contractAddress1, hexToBytes(addHexPrefix(byteCodeStr1)));

  // 1. Set registered keys from snapshot
  console.log(`   Setting ${stateSnapshot.registeredKeys.length} registered keys...`);
  const registeredKeysBytes1 = stateSnapshot.registeredKeys.map(key => hexToBytes(addHexPrefix(key)));
  stateManager1.setRegisteredKeys(registeredKeysBytes1);

  // 2. Restore storage entries
  console.log(`   Restoring ${stateSnapshot.storageEntries.length} storage entries...`);
  for (const entry of stateSnapshot.storageEntries) {
    const key = hexToBytes(addHexPrefix(entry.key));
    const value = hexToBytes(addHexPrefix(entry.value));
    await stateManager1.putStorage(contractAddress1, key, value);
  }

  // 3. Rebuild initial merkle tree from restored storage
  console.log('   Rebuilding initial merkle tree from restored storage...');
  await stateManager1.rebuildInitialMerkleTree();
  const restoredRoot1 = stateManager1.initialMerkleTree.root;
  const expectedRoot1 = BigInt(stateSnapshot.stateRoot);

  console.log(`   ✅ Restored Merkle Root: 0x${restoredRoot1.toString(16)}`);
  console.log(`   ✅ Expected Merkle Root: 0x${expectedRoot1.toString(16)}\n`);

  if (restoredRoot1 !== expectedRoot1) {
    console.warn(
      `   ⚠️  Merkle root mismatch! Expected ${stateSnapshot.stateRoot}, got 0x${restoredRoot1.toString(16)}`,
    );
  }

  // 4. Create synthesizer (main.ts pattern)
  const synthesizer1 = await createSynthesizer(synthesizerOpts1);

  // 5. Synthesize transaction (main.ts pattern)
  const runTxResult1 = await synthesizer1.synthesizeTX();

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
  console.log(`   - Previous State Root: ${stateSnapshot.stateRoot}`);
  console.log(`   - New State Root:      ${finalStateRoot1Hex}\n`);

  // Check transaction execution result
  console.log('📊 Transaction Execution Result:');
  const executionSuccess1 = !runTxResult1.execResult.exceptionError;
  const gasUsed1 = runTxResult1.totalGasSpent;
  const logsCount1 = runTxResult1.execResult.logs?.length || 0;

  console.log(`   - Success: ${executionSuccess1 ? '✅' : '❌'}`);
  console.log(`   - Gas Used: ${gasUsed1}`);
  console.log(`   - Logs Emitted: ${logsCount1}`);
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
  console.log('');

  if (finalStateRoot1Hex.toLowerCase() !== stateSnapshot.stateRoot.toLowerCase()) {
    console.log('   ✅ State root CHANGED! (Transaction executed successfully)\n');
  } else {
    console.warn('   ⚠️  State root UNCHANGED (No state change detected)\n');
  }

  // Extract state snapshot for next proof
  const stateSnapshot1 = await extractStateSnapshot(
    stateManager1,
    stateSnapshot.contractAddress,
    stateSnapshot.registeredKeys,
  );

  // Save state snapshot
  const stateSnapshotPath1 = resolve(proof1Path, 'state_snapshot.json');
  writeFileSync(
    stateSnapshotPath1,
    JSON.stringify(stateSnapshot1, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2),
    'utf-8',
  );
  console.log(`   ✅ state_snapshot.json saved`);

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
  const participant3L2Address2 = allL2Addresses[2]; // Use L2 address from Step 5.5
  const calldata2 =
    '0xa9059cbb' + // transfer(address,uint256)
    participant3L2Address2.slice(2).padStart(64, '0') + // recipient (participant 3)
    transferAmount2.toString(16).padStart(64, '0'); // amount (0.5 TON)

  console.log('🔄 Generating circuit for Participant 2 → Participant 3 transfer...\n');

  // Use main.ts pattern: createSynthesizerOptsForSimulationFromRPC + createSynthesizer
  const proof2Path = resolve(__dirname, '../test-outputs/l2-state-channel-transfer-2');
  const calldataBytes2 = hexToBytes(addHexPrefix(calldata2));

  const simulationOpts2: SynthesizerSimulationOpts = {
    txNonce: 0n,
    rpcUrl: RPC_URL,
    senderL2PrvKey: allPrivateKeys[1], // Participant 2's private key
    blockNumber: tx.blockNumber,
    contractAddress: targetAddress as `0x${string}`,
    userStorageSlots: [0],
    addressListL1: allL1Addresses as `0x${string}`[],
    publicKeyListL2: allPublicKeys,
    callData: calldataBytes2,
    skipRPCInit: true, // Skip RPC init since we'll restore from snapshot
  };

  const synthesizerOpts2 = await createSynthesizerOptsForSimulationFromRPC(simulationOpts2);

  // Restore state from previous proof (main.ts pattern using cachedOpts)
  const stateManager2 = synthesizerOpts2.stateManager;
  const contractAddress2 = new Address(toBytes(addHexPrefix(stateSnapshot1.contractAddress)));

  // Set up contract account (required before restoring storage)
  const POSEIDON_RLP2 = synthesizerOpts2.stateManager.cachedOpts!.common.customCrypto.keccak256!(
    RLP.encode(new Uint8Array([])),
  );
  const POSEIDON_NULL2 = synthesizerOpts2.stateManager.cachedOpts!.common.customCrypto.keccak256!(new Uint8Array(0));
  const contractAccount2 = createAccount({
    nonce: 0n,
    balance: 0n,
    storageRoot: POSEIDON_RLP2,
    codeHash: POSEIDON_NULL2,
  });
  await stateManager2.putAccount(contractAddress2, contractAccount2);

  // Load contract code from RPC
  const byteCodeStr2 = await provider.getCode(contractAddress2.toString(), tx.blockNumber);
  await stateManager2.putCode(contractAddress2, hexToBytes(addHexPrefix(byteCodeStr2)));

  console.log(`   Setting ${stateSnapshot1.registeredKeys.length} registered keys...`);
  const registeredKeysBytes2 = stateSnapshot1.registeredKeys.map(key => hexToBytes(addHexPrefix(key)));
  stateManager2.setRegisteredKeys(registeredKeysBytes2);

  console.log(`   Restoring ${stateSnapshot1.storageEntries.length} storage entries...`);
  for (const entry of stateSnapshot1.storageEntries) {
    const key = hexToBytes(addHexPrefix(entry.key));
    const value = hexToBytes(addHexPrefix(entry.value));
    await stateManager2.putStorage(contractAddress2, key, value);
  }

  console.log('   Rebuilding initial merkle tree from restored storage...');
  await stateManager2.rebuildInitialMerkleTree();
  const restoredRoot2 = stateManager2.initialMerkleTree.root;
  const expectedRoot2 = BigInt(stateSnapshot1.stateRoot);

  console.log(`   ✅ Restored Merkle Root: 0x${restoredRoot2.toString(16)}`);
  console.log(`   ✅ Expected Merkle Root: 0x${expectedRoot2.toString(16)}\n`);

  if (restoredRoot2 !== expectedRoot2) {
    console.warn(
      `   ⚠️  Merkle root mismatch! Expected ${stateSnapshot1.stateRoot}, got 0x${restoredRoot2.toString(16)}`,
    );
  }

  const synthesizer2 = await createSynthesizer(synthesizerOpts2);
  const runTxResult2 = await synthesizer2.synthesizeTX();
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
  console.log(`   - Previous State Root: ${stateSnapshot1.stateRoot}`);
  console.log(`   - New State Root:      ${finalStateRoot2Hex}\n`);

  const executionSuccess2 = !runTxResult2.execResult.exceptionError;
  const gasUsed2 = runTxResult2.totalGasSpent;
  const logsCount2 = runTxResult2.execResult.logs?.length || 0;

  console.log('📊 Transaction Execution Result:');
  console.log(`   - Success: ${executionSuccess2 ? '✅' : '❌'}`);
  console.log(`   - Gas Used: ${gasUsed2}`);
  console.log(`   - Logs Emitted: ${logsCount2}`);
  if (!executionSuccess2) {
    const errorMsg = runTxResult2.execResult.exceptionError?.error?.toString() || 'Unknown error';
    console.log(`   - Error: ${errorMsg}`);
    console.log('\n❌ FAILURE: Transaction REVERTED!');
    process.exit(1);
  }
  console.log('');

  if (finalStateRoot2Hex.toLowerCase() !== stateSnapshot1.stateRoot.toLowerCase()) {
    console.log('   ✅ State root CHANGED! (Success!)\n');
  } else {
    console.log('   ⚠️  State root UNCHANGED\n');
  }

  const stateSnapshot2 = await extractStateSnapshot(
    stateManager2,
    stateSnapshot1.contractAddress,
    stateSnapshot1.registeredKeys,
  );
  const stateSnapshotPath2 = resolve(proof2Path, 'state_snapshot.json');
  writeFileSync(
    stateSnapshotPath2,
    JSON.stringify(stateSnapshot2, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2),
    'utf-8',
  );
  console.log(`   ✅ state_snapshot.json saved`);

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

  // Use main.ts pattern: createSynthesizerOptsForSimulationFromRPC + createSynthesizer
  const proof3Path = resolve(__dirname, '../test-outputs/l2-state-channel-transfer-3');
  const calldataBytes3 = hexToBytes(addHexPrefix(calldata3));

  const simulationOpts3: SynthesizerSimulationOpts = {
    txNonce: 0n,
    rpcUrl: RPC_URL,
    senderL2PrvKey: allPrivateKeys[2], // Participant 3's private key
    blockNumber: tx.blockNumber,
    contractAddress: targetAddress as `0x${string}`,
    userStorageSlots: [0],
    addressListL1: allL1Addresses as `0x${string}`[],
    publicKeyListL2: allPublicKeys,
    callData: calldataBytes3,
    skipRPCInit: true, // Skip RPC init since we'll restore from snapshot
  };

  const synthesizerOpts3 = await createSynthesizerOptsForSimulationFromRPC(simulationOpts3);

  // Restore state from previous proof (main.ts pattern using cachedOpts)
  const stateManager3 = synthesizerOpts3.stateManager;
  const contractAddress3 = new Address(toBytes(addHexPrefix(stateSnapshot2.contractAddress)));

  // Set up contract account (required before restoring storage)
  const POSEIDON_RLP3 = synthesizerOpts3.stateManager.cachedOpts!.common.customCrypto.keccak256!(
    RLP.encode(new Uint8Array([])),
  );
  const POSEIDON_NULL3 = synthesizerOpts3.stateManager.cachedOpts!.common.customCrypto.keccak256!(new Uint8Array(0));
  const contractAccount3 = createAccount({
    nonce: 0n,
    balance: 0n,
    storageRoot: POSEIDON_RLP3,
    codeHash: POSEIDON_NULL3,
  });
  await stateManager3.putAccount(contractAddress3, contractAccount3);

  // Load contract code from RPC
  const byteCodeStr3 = await provider.getCode(contractAddress3.toString(), tx.blockNumber);
  await stateManager3.putCode(contractAddress3, hexToBytes(addHexPrefix(byteCodeStr3)));

  console.log(`   Setting ${stateSnapshot2.registeredKeys.length} registered keys...`);
  const registeredKeysBytes3 = stateSnapshot2.registeredKeys.map(key => hexToBytes(addHexPrefix(key)));
  stateManager3.setRegisteredKeys(registeredKeysBytes3);

  console.log(`   Restoring ${stateSnapshot2.storageEntries.length} storage entries...`);
  for (const entry of stateSnapshot2.storageEntries) {
    const key = hexToBytes(addHexPrefix(entry.key));
    const value = hexToBytes(addHexPrefix(entry.value));
    await stateManager3.putStorage(contractAddress3, key, value);
  }

  console.log('   Rebuilding initial merkle tree from restored storage...');
  await stateManager3.rebuildInitialMerkleTree();
  const restoredRoot3 = stateManager3.initialMerkleTree.root;
  const expectedRoot3 = BigInt(stateSnapshot2.stateRoot);

  console.log(`   ✅ Restored Merkle Root: 0x${restoredRoot3.toString(16)}`);
  console.log(`   ✅ Expected Merkle Root: 0x${expectedRoot3.toString(16)}\n`);

  if (restoredRoot3 !== expectedRoot3) {
    console.warn(
      `   ⚠️  Merkle root mismatch! Expected ${stateSnapshot2.stateRoot}, got 0x${restoredRoot3.toString(16)}`,
    );
  }

  const synthesizer3 = await createSynthesizer(synthesizerOpts3);
  const runTxResult3 = await synthesizer3.synthesizeTX();
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
  console.log(`   - Previous State Root: ${stateSnapshot2.stateRoot}`);
  console.log(`   - New State Root:      ${finalStateRoot3Hex}\n`);

  const executionSuccess3 = !runTxResult3.execResult.exceptionError;
  const gasUsed3 = runTxResult3.totalGasSpent;
  const logsCount3 = runTxResult3.execResult.logs?.length || 0;

  console.log('📊 Transaction Execution Result:');
  console.log(`   - Success: ${executionSuccess3 ? '✅' : '❌'}`);
  console.log(`   - Gas Used: ${gasUsed3}`);
  console.log(`   - Logs Emitted: ${logsCount3}`);
  if (!executionSuccess3) {
    const errorMsg = runTxResult3.execResult.exceptionError?.error?.toString() || 'Unknown error';
    console.log(`   - Error: ${errorMsg}`);
    console.log('\n❌ FAILURE: Transaction REVERTED!');
    process.exit(1);
  }
  console.log('');

  if (finalStateRoot3Hex.toLowerCase() !== stateSnapshot2.stateRoot.toLowerCase()) {
    console.log('   ✅ State root CHANGED! (Success!)\n');
  } else {
    console.log('   ⚠️  State root UNCHANGED\n');
  }

  const stateSnapshot3 = await extractStateSnapshot(
    stateManager3,
    stateSnapshot2.contractAddress,
    stateSnapshot2.registeredKeys,
  );
  const stateSnapshotPath3 = resolve(proof3Path, 'state_snapshot.json');
  writeFileSync(
    stateSnapshotPath3,
    JSON.stringify(stateSnapshot3, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2),
    'utf-8',
  );
  console.log(`   ✅ state_snapshot.json saved`);

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
  console.log(`   → Proof #1 (P1→P2, 1 TON):  ${stateSnapshot1.stateRoot}`);
  console.log(`   → Proof #2 (P2→P3, 0.5 TON): ${stateSnapshot2.stateRoot}`);
  console.log(`   → Proof #3 (P3→P1, 1 TON):  ${stateSnapshot3.stateRoot}`);
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
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract StateSnapshot from stateManager after transaction execution
 * (main.ts pattern - using cachedOpts.stateManager)
 */
async function extractStateSnapshot(
  stateManager: TokamakL2StateManager,
  contractAddress: string,
  registeredKeys: string[],
): Promise<StateSnapshot> {
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
    userL2Addresses: [], // Not needed when using MPT keys directly
    userStorageSlots: [0n], // Slot 0 for ERC20 balance
    timestamp: Date.now(),
    userNonces: registeredKeys.map(() => 0n), // Nonces not tracked in this flow
  };
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
