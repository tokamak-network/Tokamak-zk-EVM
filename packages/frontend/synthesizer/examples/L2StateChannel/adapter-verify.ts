

/**
 * L2 State Channel Transaction Test using Simplified SynthesizerAdapter API
 *
 * This demonstrates the simplified high-level interface where:
 * - No manual calldata generation required
 * - No manual state loading required
 * - No manual blockNumber fetching required
 * - Just provide: channelId, senderKey, recipient, amount, and optional previousStatePath
 */

import { ethers } from 'ethers';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { SEPOLIA_RPC_URL, ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI } from './constants.ts';
import { bytesToBigInt, bigIntToBytes, setLengthLeft, utf8ToBytes } from '@ethereumjs/util';
import { poseidon, fromEdwardsToAddress } from '../../src/TokamakL2JS/index.ts';
import { jubjub } from '@noble/curves/misc';
import { SynthesizerAdapter } from '../../src/interface/adapters/synthesizerAdapter.ts';
import {
  L2_PRV_KEY_MESSAGE,
  deriveL2KeysFromSignature,
  deriveL2AddressFromKeys,
} from '../../src/TokamakL2JS/utils/web.ts';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root
const envPath = resolve(__dirname, '../../../../../.env');
config({ path: envPath });

// Binary paths (use pre-built binaries from dist/macOS/bin)
const projectRoot = resolve(__dirname, '../../../../../');
const distBinPath = resolve(projectRoot, 'dist/macOS/bin');
const preprocessBinary = `${distBinPath}/preprocess`;
const proverBinary = `${distBinPath}/prove`;
const verifyBinary = `${distBinPath}/verify`;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Run preprocess binary (only needed for Proof #1)
 */
async function runPreprocess(outputsPath: string): Promise<boolean> {
  console.log(`\n⚙️  Running preprocess (Proof #1 setup)...`);

  const qapPath = resolve(projectRoot, 'packages/frontend/qap-compiler/subcircuits/library');
  const synthesizerPath = outputsPath;
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

/**
 * Run prover binary
 */
async function runProver(proofNum: number, outputsPath: string): Promise<boolean> {
  console.log(`\n⚡ Proof #${proofNum}: Running prover...`);

  const qapPath = resolve(projectRoot, 'packages/frontend/qap-compiler/subcircuits/library');
  const synthesizerPath = outputsPath;
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

/**
 * Run verify-rust binary
 */
async function runVerifyRust(proofNum: number, outputsPath: string): Promise<boolean> {
  console.log(`\n🔐 Proof #${proofNum}: Running verify-rust verification...`);

  const qapPath = resolve(projectRoot, 'packages/frontend/qap-compiler/subcircuits/library');
  const synthesizerPath = outputsPath;
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

// ============================================================================
// MAIN TEST FUNCTION
// ============================================================================

async function main() {
  const CHANNEL_ID = parseInt(process.env.CHANNEL_ID || '27');
  const INITIALIZE_TX_HASH =
    process.env.INITIALIZE_TX_HASH || '0xfc0baf2bde4e5d5dff6d782b1be153b5952ca272f080350f37e4bf2d090df4bd';

  // Read Alice's L1 private key from environment (for testing only)
  const ALICE_PRIVATE_KEY = process.env.ALICE_PRIVATE_KEY;
  if (!ALICE_PRIVATE_KEY) {
    console.error('❌ Error: ALICE_PRIVATE_KEY not found in .env file');
    process.exit(1);
  }

  // Recipient's L2 address (can be set in .env file as RECIPIENT_L2_ADDRESS)
  const RECIPIENT_L2_ADDRESS = process.env.RECIPIENT_L2_ADDRESS || '0x7254f0bc55d904f9ea0ab14a7f4a834812ea45cc';

  // Get participants from on-chain
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
  const bridgeContract = new ethers.Contract(ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI, provider);
  const participants: string[] = await bridgeContract.getChannelParticipants(CHANNEL_ID);

  console.warn('⚠️  WARNING: Generating L2 keys from L1 keys for testing purposes.');
  console.warn('   In production, L2 private keys should be provided directly.\n');

  // Create wallet from Alice's private key
  const aliceWallet = new ethers.Wallet(ALICE_PRIVATE_KEY);
  const aliceL1Address = aliceWallet.address;

  // Check if Alice's L1 address is in the participant list
  const aliceParticipantIndex = participants.findIndex(
    addr => addr.toLowerCase() === aliceL1Address.toLowerCase()
  );

  if (aliceParticipantIndex === -1) {
    throw new Error(
      `Alice's L1 address ${aliceL1Address} is not in the participant list. ` +
      `Participants: ${participants.join(', ')}`
    );
  }

  console.log(`✅ Alice's L1 address found in participant list at index ${aliceParticipantIndex}`);
  console.log(`   L1 Address: ${aliceL1Address}\n`);

  // Generate Alice's L2 private key from L1 private key using signature method
  const messageToSign = `${L2_PRV_KEY_MESSAGE}${CHANNEL_ID}`;
  const signature = await aliceWallet.signMessage(messageToSign) as `0x${string}`;

  console.log(`   Alice:`);
  console.log(`     L1 Address (on-chain): ${participants[aliceParticipantIndex]}`);
  console.log(`     L1 Address (wallet):   ${aliceL1Address}`);
  console.log(`     Message: ${messageToSign}`);
  console.log(`     Signature: ${signature.substring(0, 20)}...${signature.substring(signature.length - 10)}`);

  // Derive L2 keys from signature using web.ts functions
  const aliceL2Keys = deriveL2KeysFromSignature(signature);
  const aliceL2PrivateKey = aliceL2Keys.privateKey;

  // Derive L2 address from L2 keys
  const aliceL2Address = deriveL2AddressFromKeys(aliceL2Keys);

  console.log(`     L2 Address: ${aliceL2Address}\n`);

  // For other participants, we'll use their on-chain addresses
  // Their L2 addresses will be derived by the adapter if needed
  const participantL2PrivateKeys: Uint8Array[] = [];
  const allL2Addresses: string[] = [];

  // Initialize arrays with null/empty values for all participants
  for (let i = 0; i < participants.length; i++) {
    if (i === aliceParticipantIndex) {
      // Alice's L2 private key and address
      participantL2PrivateKeys.push(aliceL2PrivateKey);
      allL2Addresses.push(aliceL2Address);
    } else {
      // Other participants: we don't have their private keys
      // The adapter will handle their L2 addresses internally
      participantL2PrivateKeys.push(new Uint8Array(0)); // Placeholder
      allL2Addresses.push(''); // Placeholder, will be filled by adapter if needed
    }
  }

  // Create SynthesizerAdapter instance
  const adapter = new SynthesizerAdapter({ rpcUrl: SEPOLIA_RPC_URL });

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Test: Sequential L2 Transfers (Simplified Interface)       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ========================================================================
  // PROOF #1: Alice → Another Participant (1 TON)
  // ========================================================================
  // Find a recipient (different from Alice)
  const recipientParticipantIndex = participants.findIndex(
    (_, idx) => idx !== aliceParticipantIndex
  );
  if (recipientParticipantIndex === -1) {
    throw new Error('No recipient found (need at least 2 participants)');
  }
  const recipientL1Address = participants[recipientParticipantIndex];

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║        Proof #1: Alice (${aliceParticipantIndex}) → Participant ${recipientParticipantIndex + 1} (1 TON)         ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log(`   Sender (Alice): ${aliceL1Address}`);
  console.log(`   Recipient L1:  ${recipientL1Address}`);
  if (RECIPIENT_L2_ADDRESS) {
    console.log(`   Recipient L2:  ${RECIPIENT_L2_ADDRESS}\n`);
  } else {
    console.log(`   Recipient L2:  (not provided, will be derived)\n`);
  }

  if (!RECIPIENT_L2_ADDRESS) {
    throw new Error('RECIPIENT_L2_ADDRESS is required. Please set it in .env file or provide it directly.');
  }

  const result1 = await adapter.synthesizeL2Transfer({
    channelId: CHANNEL_ID,
    initializeTxHash: INITIALIZE_TX_HASH,
    senderL2PrvKey: aliceL2PrivateKey,
    recipientL2Address: RECIPIENT_L2_ADDRESS,
    amount: '1',
    outputPath: resolve(__dirname, '../test-outputs/adapter-test-1'),
    rollupBridgeAddress: ROLLUP_BRIDGE_CORE_ADDRESS,
  });

  if (!result1.success) {
    console.error(`❌ Proof #1 failed: ${result1.error}`);
    process.exit(1);
  }

  console.log(`✅ Proof #1 synthesis completed`);
  console.log(`   Previous State Root: ${result1.previousStateRoot}`);
  console.log(`   New State Root:      ${result1.newStateRoot}`);
  console.log(`   State Snapshot:      ${result1.stateSnapshotPath}\n`);

  // Display participant balances after Proof #1
  console.log('📊 Participant Balances after Proof #1:');
  const balances1 = await adapter.getParticipantBalances({
    stateSnapshotPath: result1.stateSnapshotPath,
    channelId: CHANNEL_ID,
    rollupBridgeAddress: ROLLUP_BRIDGE_CORE_ADDRESS,
  });
  console.log(`   State Root: ${balances1.stateRoot}`);
  balances1.participants.forEach((participant, idx) => {
    console.log(`   Participant ${idx + 1}:`);
    console.log(`     L1 Address: ${participant.l1Address}`);
    console.log(`     L2 MPT Key: ${participant.l2MptKey}`);
    console.log(`     Balance:    ${participant.balanceInEther} TON`);
  });
  console.log('');

  // Prove & Verify Proof #1
  if (!result1.instancePath) {
    console.error(`\n❌ Instance path not found. Cannot run prove/verify.`);
    process.exit(1);
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Proving and Verifying Proof #1`);
  console.log('='.repeat(80));

  const preprocessSuccess = await runPreprocess(result1.instancePath);
  if (!preprocessSuccess) {
    console.error(`\n❌ Preprocess failed! Cannot continue.`);
    process.exit(1);
  }

  const prove1Success = await runProver(1, result1.instancePath);
  if (!prove1Success) {
    console.error(`\n❌ Proof #1 generation failed! Cannot continue.`);
    process.exit(1);
  }

  const verify1Success = await runVerifyRust(1, result1.instancePath);
  if (!verify1Success) {
    console.error(`\n❌ Proof #1 verification failed! Cannot continue.`);
    process.exit(1);
  }

  console.log(`\n✅ Proof #1 Complete: Preprocessed ✅ | Proved ✅ | Verified ✅`);

  // ========================================================================
  // PROOF #2: Participant 2 → 3 (0.5 TON)
  // ========================================================================
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                  Proof #2: Participant 2 → 3 (0.5 TON)       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const result2 = await adapter.synthesizeL2Transfer({
    channelId: CHANNEL_ID,
    initializeTxHash: INITIALIZE_TX_HASH,
    senderL2PrvKey: participantL2PrivateKeys[1],
    recipientL2Address: allL2Addresses[0],
    amount: '0.5',
    previousStatePath: result1.stateSnapshotPath, // Chain from Proof #1
    outputPath: resolve(__dirname, '../test-outputs/adapter-test-2'),
    rollupBridgeAddress: ROLLUP_BRIDGE_CORE_ADDRESS,
  });

  if (!result2.success) {
    console.error(`❌ Proof #2 failed: ${result2.error}`);
    process.exit(1);
  }

  console.log(`✅ Proof #2 synthesis completed`);
  console.log(`   Previous State Root: ${result2.previousStateRoot}`);
  console.log(`   New State Root:      ${result2.newStateRoot}`);
  console.log(`   State Snapshot:      ${result2.stateSnapshotPath}\n`);

  // Display participant balances after Proof #2
  console.log('📊 Participant Balances after Proof #2:');
  const balances2 = await adapter.getParticipantBalances({
    stateSnapshotPath: result2.stateSnapshotPath,
    channelId: CHANNEL_ID,
    rollupBridgeAddress: ROLLUP_BRIDGE_CORE_ADDRESS,
  });
  console.log(`   State Root: ${balances2.stateRoot}`);
  balances2.participants.forEach((participant, idx) => {
    console.log(`   Participant ${idx + 1}:`);
    console.log(`     L1 Address: ${participant.l1Address}`);
    console.log(`     L2 MPT Key: ${participant.l2MptKey}`);
    console.log(`     Balance:    ${participant.balanceInEther} TON`);
  });
  console.log('');

  // Prove & Verify Proof #2
  if (!result2.instancePath) {
    console.error(`\n❌ Instance path not found. Cannot run prove/verify.`);
    process.exit(1);
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Proving and Verifying Proof #2`);
  console.log('='.repeat(80));

  const prove2Success = await runProver(2, result2.instancePath);
  if (!prove2Success) {
    console.error(`\n❌ Proof #2 generation failed! Cannot continue.`);
    process.exit(1);
  }

  const verify2Success = await runVerifyRust(2, result2.instancePath);
  if (!verify2Success) {
    console.error(`\n❌ Proof #2 verification failed! Cannot continue.`);
    process.exit(1);
  }

  console.log(`\n✅ Proof #2 Complete: Proved ✅ | Verified ✅`);

  // // ========================================================================
  // // PROOF #3: Participant 3 → 1 (1 TON)
  // // ========================================================================
  // console.log('\n╔══════════════════════════════════════════════════════════════╗');
  // console.log('║                  Proof #3: Participant 3 → 1 (1 TON)          ║');
  // console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // const result3 = await adapter.synthesizeL2Transfer({
  //   channelId: CHANNEL_ID,
  //   initializeTxHash: INITIALIZE_TX_HASH,
  //   senderL2PrvKey: participantL2PrivateKeys[2],
  //   recipientL2Address: allL2Addresses[0],
  //   amount: '1',
  //   previousStatePath: result2.stateSnapshotPath, // Chain from Proof #2
  //   outputPath: resolve(__dirname, '../test-outputs/adapter-test-3'),
  //   rollupBridgeAddress: ROLLUP_BRIDGE_CORE_ADDRESS,
  // });

  // if (!result3.success) {
  //   console.error(`❌ Proof #3 failed: ${result3.error}`);
  //   process.exit(1);
  // }

  // console.log(`✅ Proof #3 synthesis completed`);
  // console.log(`   Previous State Root: ${result3.previousStateRoot}`);
  // console.log(`   New State Root:      ${result3.newStateRoot}`);
  // console.log(`   State Snapshot:      ${result3.stateSnapshotPath}\n`);

  // // Display participant balances after Proof #3
  // console.log('📊 Participant Balances after Proof #3:');
  // const balances3 = await adapter.getParticipantBalances({
  //   stateSnapshotPath: result3.stateSnapshotPath,
  //   channelId: CHANNEL_ID,
  //   rollupBridgeAddress: ROLLUP_BRIDGE_CORE_ADDRESS,
  // });
  // console.log(`   State Root: ${balances3.stateRoot}`);
  // balances3.participants.forEach((participant, idx) => {
  //   console.log(`   Participant ${idx + 1}:`);
  //   console.log(`     L1 Address: ${participant.l1Address}`);
  //   console.log(`     L2 MPT Key: ${participant.l2MptKey}`);
  //   console.log(`     Balance:    ${participant.balanceInEther} TON`);
  // });
  // console.log('');

  // // Prove & Verify Proof #3
  // console.log(`\n${'='.repeat(80)}`);
  // console.log(`Proving and Verifying Proof #3`);
  // console.log('='.repeat(80));

  // const prove3Success = await runProver(3, result3.instancePath);
  // if (!prove3Success) {
  //   console.error(`\n❌ Proof #3 generation failed! Cannot continue.`);
  //   process.exit(1);
  // }

  // const verify3Success = await runVerifyRust(3, result3.instancePath);
  // if (!verify3Success) {
  //   console.error(`\n❌ Proof #3 verification failed! Cannot continue.`);
  //   process.exit(1);
  // }

  // console.log(`\n✅ Proof #3 Complete: Proved ✅ | Verified ✅`);

  // // ========================================================================
  // // SUMMARY
  // // ========================================================================
  // console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  // console.log('║                     Test Summary                              ║');
  // console.log('╚══════════════════════════════════════════════════════════════╝\n');
  // console.log('✅ Successfully completed sequential transfer simulation!');
  // console.log('');
  // console.log('📊 State Root Evolution:');
  // console.log(`   Initial (On-chain):         ${result1.previousStateRoot}`);
  // console.log(`   → Proof #1 (P1→P2, 1 TON):   ${result1.newStateRoot}`);
  // console.log(`   → Proof #2 (P2→P3, 0.5 TON): ${result2.newStateRoot}`);
  // console.log(`   → Proof #3 (P3→P1, 1 TON):   ${result3.newStateRoot}`);
  // console.log('');
  // console.log('🔬 Proof Generation & Verification:');
  // console.log(`   - Proof #1: Preprocessed ✅ | Proved ✅ | Verified ✅`);
  // console.log(`   - Proof #2: Proved ✅ | Verified ✅`);
  // console.log(`   - Proof #3: Proved ✅ | Verified ✅`);
  // console.log('');
  // console.log('🔄 Sequential Execution Flow:');
  // console.log('   Proof #1: Synthesize → Preprocess → Prove → Verify ✅ Complete');
  // console.log('             ↓ (await completion)');
  // console.log('   Proof #2: Synthesize → Prove → Verify ✅ Complete');
  // console.log('             ↓ (await completion)');
  // console.log('   Proof #3: Synthesize → Prove → Verify ✅ Complete');
  // console.log('');
  // console.log('🎯 API Features:');
  // console.log('   ✅ No manual calldata generation');
  // console.log('   ✅ No manual state loading');
  // console.log('   ✅ No manual blockNumber fetching');
  // console.log('   ✅ State analysis: getParticipantBalances()');
  // console.log('   ✅ Just call adapter.synthesizeL2Transfer() with high-level params');
  // console.log('   ✅ Full proof generation and verification');

  // console.log('\n╔══════════════════════════════════════════════════════════════╗');
  // console.log('║                    Test Completed Successfully!               ║');
  // console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

// Run test
main()
  .then(() => {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  });

