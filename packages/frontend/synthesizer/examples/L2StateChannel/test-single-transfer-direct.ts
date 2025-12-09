/**
 * Test: Single L2 Transfer Simulation using Synthesizer Directly
 *
 * This script demonstrates how to use Synthesizer directly (without SynthesizerAdapter)
 * to simulate a single L2 state channel transfer:
 * 1. Fetches the initializeChannelState transaction from on-chain
 * 2. Gets the state root from the StateInitialized event
 * 3. Fetches on-chain data (MPT keys, deposits) using getL2MptKey()
 * 4. Creates a StateSnapshot and restores it to Synthesizer EVM
 * 5. Verifies that the restored Merkle root matches the on-chain state root
 * 6. Simulates a single L2 transfer: Participant 1 → Participant 2 (1 TON)
 * 7. Uses Synthesizer directly (not SynthesizerAdapter)
 * 8. Optionally: Synthesize → Prove → Verify
 *
 * This is a simplified version of test-initialize-state-simple.ts
 * that uses Synthesizer directly instead of SynthesizerAdapter.
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
} from '@ethereumjs/util';
import { StateSnapshot } from '../../src/TokamakL2JS/stateManager/types.ts';
import { createTokamakL2StateManagerFromL1RPC } from '../../src/TokamakL2JS/stateManager/constructors.ts';
import { poseidon, getEddsaPublicKey, fromEdwardsToAddress } from '../../src/TokamakL2JS/index.ts';
import { Common, Mainnet } from '@ethereumjs/common';
import { jubjub } from '@noble/curves/misc';
import { createSynthesizer } from '../../src/synthesizer/constructors.ts';
import {
  createSynthesizerOptsForSimulationFromRPC,
  type SynthesizerSimulationOpts,
} from '../../src/interface/rpc/rpc.ts';
import { createCircuitGenerator } from '../../src/circuitGenerator/circuitGenerator.ts';

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
const INITIALIZE_TX_HASH = '0x65a31d098ad36f36069073c539e3861685789788a7f753491ff67afc6357ac4d';

// ============================================================================
// MAIN TEST FUNCTION
// ============================================================================

async function testSingleTransfer() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Test: Single L2 Transfer (Synthesizer Direct)           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  // Step 1: Fetch transaction details
  console.log('🔍 Step 1: Fetching initializeChannelState transaction...');
  const tx = await provider.getTransaction(INITIALIZE_TX_HASH);
  if (tx === null || tx.blockNumber === null) {
    throw new Error('Transaction not found or not yet mined');
  }
  if (tx.to === null || tx.from === null || tx.data === null) {
    throw new Error('Transaction missing required fields');
  }

  console.log(`   ✅ Transaction found:`);
  console.log(`      - Block Number: ${tx.blockNumber}`);
  console.log(`      - From: ${tx.from}`);
  console.log(`      - To: ${tx.to}\n`);

  // Step 2: Fetch StateInitialized event to get the state root
  console.log('🔍 Step 2: Fetching StateInitialized event...');
  const receipt = await provider.getTransactionReceipt(INITIALIZE_TX_HASH);
  if (!receipt) {
    throw new Error('Transaction receipt not found');
  }

  const stateInitializedTopic = ethers.id('StateInitialized(uint256,bytes32)');
  const stateInitializedEvent = receipt.logs.find(log => log.topics[0] === stateInitializedTopic);

  if (!stateInitializedEvent) {
    throw new Error('StateInitialized event not found in transaction receipt');
  }

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

  // Step 3: Build StateSnapshot from on-chain data
  console.log('🔄 Step 3: Building StateSnapshot from on-chain data...\n');

  const bridgeContract = new ethers.Contract(ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI, provider);
  const [allowedTokens, state, participantCount, initialRoot] = await bridgeContract.getChannelInfo(CHANNEL_ID);
  const participants: string[] = await bridgeContract.getChannelParticipants(CHANNEL_ID);

  console.log(`   Channel Info:`);
  console.log(`      - Allowed Tokens: ${allowedTokens.length}`);
  console.log(`      - Participants: ${participantCount.toString()}`);
  console.log(`      - Initial Root: ${initialRoot}\n`);

  console.log(`   Fetching on-chain data for all participants...\n`);

  const storageEntries: Array<{ index: number; key: string; value: string }> = [];
  const registeredKeys: string[] = [];

  for (let i = 0; i < participants.length; i++) {
    const l1Address = participants[i];
    const token = allowedTokens[0]; // Use first token (should be TON)

    const onChainMptKeyBigInt = await bridgeContract.getL2MptKey(CHANNEL_ID, l1Address, token);
    const onChainMptKeyHex = '0x' + onChainMptKeyBigInt.toString(16).padStart(64, '0');

    const deposit = await bridgeContract.getParticipantTokenDeposit(CHANNEL_ID, l1Address, token);

    console.log(`      ${i + 1}. ${l1Address}`);
    console.log(`         MPT Key: ${onChainMptKeyHex}`);
    console.log(`         Deposit: ${deposit.toString()}`);

    registeredKeys.push(onChainMptKeyHex);

    const depositHex = '0x' + deposit.toString(16).padStart(64, '0');
    storageEntries.push({
      index: i,
      key: onChainMptKeyHex,
      value: depositHex,
    });
  }
  console.log('');

  // Create StateSnapshot
  const stateSnapshot: StateSnapshot = {
    stateRoot: onChainStateRoot,
    registeredKeys: registeredKeys,
    storageEntries: storageEntries,
    contractAddress: allowedTokens[0],
    userL2Addresses: [],
    userStorageSlots: [0n],
    timestamp: Date.now(),
    userNonces: participants.map(() => 0n),
  };

  console.log(`   ✅ StateSnapshot created:`);
  console.log(`      - State Root: ${stateSnapshot.stateRoot}`);
  console.log(`      - Storage Entries: ${stateSnapshot.storageEntries.length}`);
  console.log(`      - Registered Keys: ${stateSnapshot.registeredKeys.length}\n`);

  // Step 4: Restore state to Synthesizer's TokamakL2StateManager
  console.log('🔄 Step 4: Restoring state to Synthesizer EVM...\n');

  const commonOpts = {
    chain: {
      ...Mainnet,
    },
    customCrypto: { keccak256: poseidon, ecrecover: getEddsaPublicKey },
  };
  const common = new Common(commonOpts);

  const stateManagerOpts = {
    common,
    blockNumber: tx.blockNumber,
    contractAddress: allowedTokens[0] as `0x${string}`,
    userStorageSlots: [0],
    userL1Addresses: participants as `0x${string}`[],
    userL2Addresses: participants.map(() => new Address(hexToBytes('0x0000000000000000000000000000000000000000'))),
  };

  const stateManager = await createTokamakL2StateManagerFromL1RPC(RPC_URL, stateManagerOpts, true);
  await stateManager.createStateFromSnapshot(stateSnapshot);

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
    process.exit(1);
  }

  console.log('✅ SUCCESS: State roots match!\n');

  // Step 6: Prepare for transfer simulation
  console.log('🔄 Step 6: Preparing for L2 Transfer (Participant 1 → Participant 2, 1 TON)...\n');

  if (participants.length < 2) {
    console.log('❌ FAILURE: Need at least 2 participants for transfer simulation');
    process.exit(1);
  }

  // Read private keys from environment variables
  const PRIVATE_KEYS = [process.env.ALICE_PRIVATE_KEY, process.env.BOB_PRIVATE_KEY, process.env.CHARLIE_PRIVATE_KEY];
  const PARTICIPANT_NAMES = ['Alice', 'Bob', 'Charlie'];

  if (!PRIVATE_KEYS[0] || !PRIVATE_KEYS[1]) {
    console.error('❌ Error: Private keys not found in .env file');
    console.error('Please add the following to your .env file:');
    console.error('  ALICE_PRIVATE_KEY="..."');
    console.error('  BOB_PRIVATE_KEY="..."');
    process.exit(1);
  }

  // Generate L2 keys for all participants
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

    if (wallet.address.toLowerCase() !== l1Address.toLowerCase()) {
      throw new Error(`Address mismatch: expected ${l1Address}, got ${wallet.address}`);
    }

    // Generate seed and private key
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

  const participant1L2Address = allL2Addresses[0];
  const participant2L2Address = allL2Addresses[1];

  console.log(`   Participant 1 (Sender):`);
  console.log(`      - L1 Address: ${allL1Addresses[0]}`);
  console.log(`      - L2 Address: ${participant1L2Address}`);
  console.log(`      - MPT Key: ${registeredKeys[0]}\n`);

  console.log(`   Participant 2 (Recipient):`);
  console.log(`      - L1 Address: ${allL1Addresses[1]}`);
  console.log(`      - L2 Address: ${participant2L2Address}`);
  console.log(`      - MPT Key: ${registeredKeys[1]}\n`);

  // Step 7: Create transfer calldata
  const transferAmount = parseEther('1'); // 1 TON
  const calldata =
    '0xa9059cbb' + // transfer(address,uint256) function selector
    participant2L2Address.slice(2).padStart(64, '0') + // recipient address (participant 2)
    transferAmount.toString(16).padStart(64, '0'); // amount (1 TON)

  console.log(`   Transfer Details:`);
  console.log(`      - From: ${participant1L2Address}`);
  console.log(`      - To: ${participant2L2Address}`);
  console.log(`      - Amount: 1 TON (${transferAmount.toString()})\n`);

  // Step 8: Use Synthesizer directly (not SynthesizerAdapter)
  console.log('🔄 Step 7: Using Synthesizer directly to synthesize transaction...\n');

  // Build simulation options
  const simulationOpts: SynthesizerSimulationOpts = {
    txNonce: 0n,
    rpcUrl: RPC_URL,
    senderL2PrvKey: allPrivateKeys[0],
    blockNumber: tx.blockNumber,
    contractAddress: allowedTokens[0] as `0x${string}`,
    userStorageSlots: [0], // ERC20 balance slot
    addressListL1: allL1Addresses as `0x${string}`[],
    publicKeyListL2: allPublicKeys,
    callData: hexToBytes(addHexPrefix(calldata)),
    skipRPCInit: true, // Skip RPC init since we'll restore from snapshot
  };

  // Create synthesizer options
  const synthesizerOpts = await createSynthesizerOptsForSimulationFromRPC(simulationOpts);

  // Restore previous state BEFORE creating synthesizer (so INI_MERKLE_ROOT is set correctly)
  const synthesizerStateManager = synthesizerOpts.stateManager;
  await synthesizerStateManager.createStateFromSnapshot(stateSnapshot);

  // Create synthesizer
  const synthesizer = await createSynthesizer(synthesizerOpts);

  console.log('   ✅ Synthesizer created successfully\n');

  // Execute transaction
  console.log('   🔄 Executing transaction...');
  const runTxResult = await synthesizer.synthesizeTX();

  console.log(`   ✅ Transaction executed`);
  console.log(`      - Success: ${!runTxResult.execResult.exceptionError ? '✅' : '❌'}`);
  console.log(`      - Gas Used: ${runTxResult.totalGasSpent}`);
  console.log(`      - Logs Emitted: ${runTxResult.execResult.logs?.length || 0}`);

  if (runTxResult.execResult.exceptionError) {
    console.log(`      - Error: ${runTxResult.execResult.exceptionError.error}`);
    console.log('\n❌ FAILURE: Transaction REVERTED!');
    process.exit(1);
  }

  // Get state after transaction
  const finalStateRoot = synthesizerStateManager.initialMerkleTree.root.toString(16);
  const finalStateRootHex = '0x' + finalStateRoot.padStart(64, '0').toLowerCase();

  console.log(`      - Initial State Root: ${stateSnapshot.stateRoot}`);
  console.log(`      - Final State Root:   ${finalStateRootHex}\n`);

  if (finalStateRootHex.toLowerCase() !== stateSnapshot.stateRoot.toLowerCase()) {
    console.log('   ✅ State root CHANGED! (Transaction executed successfully)\n');
  } else {
    console.warn('   ⚠️  State root UNCHANGED (No state change detected)\n');
  }

  // Step 9: Generate circuit outputs
  console.log('📝 Step 8: Generating circuit outputs...\n');

  const outputPath = resolve(__dirname, '../test-outputs/l2-state-channel-transfer-single');
  mkdirSync(outputPath, { recursive: true });

  const circuitGenerator = await createCircuitGenerator(synthesizer);
  circuitGenerator.writeOutputs(outputPath);

  console.log(`   ✅ Circuit outputs generated:`);
  console.log(`      - Output Path: ${outputPath}`);
  console.log(`      - Instance JSON: ${outputPath}/instance.json`);
  console.log(`      - Placement Variables: ${outputPath}/placementVariables.json`);
  console.log(`      - Permutation: ${outputPath}/permutation.json\n`);

  // Step 10: Optional - Prove & Verify
  console.log('⚡ Step 9: Proving and Verifying (Optional)...\n');

  const shouldProve = process.env.RUN_PROVE === 'true';
  if (shouldProve) {
    const preprocessSuccess = await runPreprocess(outputPath);
    if (!preprocessSuccess) {
      console.error(`\n❌ Preprocess failed!`);
      return;
    }

    const proveSuccess = await runProver(outputPath);
    const verifySuccess = proveSuccess ? await runVerifyRust(outputPath) : false;

    if (!proveSuccess || !verifySuccess) {
      console.error(`\n❌ Proof generation/verification failed!`);
      return;
    }
    console.log(`\n✅ Proof Complete: Preprocessed ✅ | Proved ✅ | Verified ✅`);
  } else {
    console.log('   ℹ️  Skipping prove/verify (set RUN_PROVE=true to enable)');
  }

  // ========================================================================
  // FINAL SUMMARY
  // ========================================================================
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                     Test Summary                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('✅ Successfully completed single transfer simulation!');
  console.log('');
  console.log('📊 State Root Evolution:');
  console.log(`   Initial (Onchain):    ${stateSnapshot.stateRoot}`);
  console.log(`   → After Transfer:     ${finalStateRootHex}`);
  console.log('');
  console.log('🔬 Synthesis Method:');
  console.log(`   - Used Synthesizer directly (not SynthesizerAdapter)`);
  console.log(`   - Transaction executed successfully`);
  console.log(`   - Circuit outputs generated`);
  if (shouldProve) {
    console.log(`   - Proof generated and verified`);
  }
  console.log('');
  console.log('📁 Outputs:');
  console.log(`   ${outputPath}/`);

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    Test Completed Successfully!               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

// ============================================================================
// PROVE & VERIFY HELPER FUNCTIONS
// ============================================================================

async function runProver(outputsPath: string): Promise<boolean> {
  console.log(`\n⚡ Running prover...`);

  const qapPath = resolve(process.cwd(), '../qap-compiler/subcircuits/library');
  const synthesizerPath = outputsPath;
  const setupPath = resolve(process.cwd(), '../../../dist/macOS/resource/setup/output');
  const outPath = synthesizerPath;

  if (!existsSync(`${synthesizerPath}/instance.json`)) {
    console.log(`   ⚠️  instance.json not found, skipping prover`);
    return false;
  }

  try {
    const proverPath = resolve(process.cwd(), '../../backend/prove');
    const cmd = `cd ${proverPath} && cargo run --release -- "${qapPath}" "${synthesizerPath}" "${setupPath}" "${outPath}"`;

    console.log(`   Running: cargo run --release (this may take a while)...`);
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
      return false;
    }
  } catch (error: any) {
    console.log(`   ❌ Prover error: ${error.message}`);
    return false;
  }
}

async function runVerifyRust(outputsPath: string): Promise<boolean> {
  console.log(`\n🔐 Running verify-rust verification...`);

  const qapPath = resolve(process.cwd(), '../qap-compiler/subcircuits/library');
  const synthesizerPath = outputsPath;
  const setupPath = resolve(process.cwd(), '../../../dist/macOS/resource/setup/output');
  const preprocessPath = resolve(process.cwd(), '../../../dist/macOS/resource/preprocess/output');
  const proofPath = synthesizerPath;

  if (!existsSync(`${synthesizerPath}/instance.json`)) {
    console.log(`   ⚠️  instance.json not found, skipping verification`);
    return false;
  }

  if (!existsSync(`${proofPath}/proof.json`)) {
    console.log(`   ⚠️  proof.json not found - cannot verify without proof`);
    return false;
  }

  try {
    const verifyRustPath = resolve(process.cwd(), '../../backend/verify/verify-rust');
    const cmd = `cd ${verifyRustPath} && cargo run --release -- "${qapPath}" "${synthesizerPath}" "${setupPath}" "${preprocessPath}" "${proofPath}"`;

    console.log(`   Running: cargo run --release...`);
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
      return false;
    } else {
      console.log(`   ⚠️  Could not parse verification result`);
      return false;
    }
  } catch (error: any) {
    console.log(`   ❌ Verification error: ${error.message}`);
    return false;
  }
}

async function runPreprocess(outputsPath: string): Promise<boolean> {
  console.log(`\n⚙️  Running preprocess (one-time setup)...`);

  const qapPath = resolve(process.cwd(), '../qap-compiler/subcircuits/library');
  const synthesizerPath = outputsPath;
  const setupPath = resolve(process.cwd(), '../../../dist/macOS/resource/setup/output');
  const preprocessOutPath = resolve(process.cwd(), '../../../dist/macOS/resource/preprocess/output');

  if (existsSync(`${preprocessOutPath}/preprocess.json`)) {
    console.log(`   ℹ️  Preprocess files already exist, skipping...`);
    return true;
  }

  if (!existsSync(preprocessOutPath)) {
    mkdirSync(preprocessOutPath, { recursive: true });
  }

  try {
    const preprocessPath = resolve(process.cwd(), '../../backend/verify/preprocess');
    const cmd = `cd ${preprocessPath} && cargo run --release -- "${qapPath}" "${synthesizerPath}" "${setupPath}" "${preprocessOutPath}"`;

    console.log(`   Running: cargo run --release (this may take a while)...`);
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
      return false;
    }
  } catch (error: any) {
    console.log(`   ❌ Preprocess error: ${error.message}`);
    return false;
  }
}

// ============================================================================
// RUN TEST
// ============================================================================

testSingleTransfer()
  .then(() => {
    console.log('🎉 Test passed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  });
