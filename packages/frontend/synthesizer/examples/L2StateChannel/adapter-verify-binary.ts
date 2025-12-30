/**
 * L2 State Channel Transaction Test using Synthesizer Binary
 *
 * This test uses the built binary (bin/synthesizer) instead of direct SynthesizerAdapter calls.
 * It demonstrates the same sequential transfer flow but via CLI commands.
 * 
 * Matches the logic of adapter-verify.ts but uses binary execution.
 */

import { ethers } from 'ethers';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { SEPOLIA_RPC_URL, ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI } from './constants.ts';
import { fromEdwardsToAddress } from '../../src/TokamakL2JS/index.ts';
import { jubjub } from '@noble/curves/misc';
import { bytesToBigInt } from '@ethereumjs/util';
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

// Binary paths
const projectRoot = resolve(__dirname, '../../../../../');
// Synthesizer binary path - fixed to internal binary for testing
const synthesizerBinary = resolve(__dirname, '../../bin/synthesizer');
const distBinPath = resolve(projectRoot, 'dist/bin');
const preprocessBinary = `${distBinPath}/preprocess`;
const proverBinary = `${distBinPath}/prove`;
const verifyBinary = `${distBinPath}/verify`;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Derive L2 address from L2 private key
 */
function deriveL2AddressFromPrivateKey(l2PrivateKey: Uint8Array): string {
  const publicKey = jubjub.Point.BASE.multiply(bytesToBigInt(l2PrivateKey)).toBytes();
  const l2Address = fromEdwardsToAddress(jubjub.Point.fromBytes(publicKey)).toString();
  return l2Address;
}

/**
 * Convert L2 private key to hex string for CLI
 */
function l2PrivateKeyToHex(l2PrivateKey: Uint8Array): string {
  return '0x' + Buffer.from(l2PrivateKey).toString('hex');
}

/**
 * Read state root from state_snapshot.json
 */
function readStateRootFromSnapshot(snapshotPath: string): string | null {
  try {
    if (!existsSync(snapshotPath)) {
      return null;
    }
    const content = readFileSync(snapshotPath, 'utf-8');
    const snapshot = JSON.parse(content);
    return snapshot.stateRoot || null;
  } catch (error) {
    console.error(`   ⚠️  Failed to read state root from snapshot: ${error}`);
    return null;
  }
}

/**
 * Read previous state root from instance.json (a_pub_in contains the previous state root)
 */
function readPreviousStateRootFromInstance(instancePath: string): string | null {
  try {
    const instanceFilePath = resolve(instancePath, 'instance.json');
    if (!existsSync(instanceFilePath)) {
      return null;
    }
    const content = readFileSync(instanceFilePath, 'utf-8');
    const instance = JSON.parse(content);
    // a_pub_in[0] contains the previous state root
    if (instance.a_pub_in && instance.a_pub_in.length > 0) {
      return instance.a_pub_in[0];
    }
    return null;
  } catch (error) {
    console.error(`   ⚠️  Failed to read previous state root from instance: ${error}`);
    return null;
  }
}

/**
 * Run synthesizer binary l2-transfer command
 */
async function runL2Transfer(params: {
  channelId: number;
  initializeTxHash: string;
  senderL2PrvKey: Uint8Array;
  recipientL2Address: string;
  amount: string;
  previousStatePath?: string;
  outputPath: string;
  rpcUrl: string;
}): Promise<{
  success: boolean;
  instancePath?: string;
  stateSnapshotPath?: string;
  previousStateRoot?: string;
  newStateRoot?: string;
  error?: string;
}> {
  const {
    channelId,
    initializeTxHash,
    senderL2PrvKey,
    recipientL2Address,
    amount,
    previousStatePath,
    outputPath,
    rpcUrl,
  } = params;

  if (!existsSync(synthesizerBinary)) {
    return {
      success: false,
      error: `Synthesizer binary not found at ${synthesizerBinary}. Please build it first: cd packages/frontend/synthesizer && ./build-binary.sh`,
    };
  }

  const senderKeyHex = l2PrivateKeyToHex(senderL2PrvKey);

  // Ensure output directory exists
  if (!existsSync(outputPath)) {
    mkdirSync(outputPath, { recursive: true });
  }

  try {
    const cmd = [
      `"${synthesizerBinary}"`,
      'l2-transfer',
      `--channel-id ${channelId}`,
      `--init-tx ${initializeTxHash}`,
      `--sender-key ${senderKeyHex}`,
      `--recipient ${recipientL2Address}`,
      `--amount ${amount}`,
      `--output "${outputPath}"`,
      `--rpc-url "${rpcUrl}"`,
      '--sepolia',
    ];

    if (previousStatePath) {
      cmd.push(`--previous-state "${previousStatePath}"`);
    }

    const fullCmd = cmd.join(' ');

    console.log(`   Running: ${synthesizerBinary} l2-transfer...`);
    console.log(`   Command: ${fullCmd.replace(senderKeyHex, '0x***')}`); // Hide private key in logs
    const startTime = Date.now();

    // Use synthesizer package root as working directory
    const cwd = resolve(__dirname, '../../');

    const output = execSync(fullCmd, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 300000, // 5 minute timeout
      cwd,
    });

    const duration = Date.now() - startTime;

    // Check if output directory was created and contains instance.json
    const instancePath = outputPath;
    const stateSnapshotPath = resolve(outputPath, 'state_snapshot.json');

    if (existsSync(`${instancePath}/instance.json`) && existsSync(stateSnapshotPath)) {
      console.log(`   ✅ Transfer completed successfully in ${(duration / 1000).toFixed(2)}s`);

      // Read state roots from output files
      const previousStateRoot = readPreviousStateRootFromInstance(instancePath);
      const newStateRoot = readStateRootFromSnapshot(stateSnapshotPath);

      return {
        success: true,
        instancePath,
        stateSnapshotPath,
        previousStateRoot: previousStateRoot || undefined,
        newStateRoot: newStateRoot || undefined,
      };
    } else {
      return {
        success: false,
        error: `Output files not found. Output: ${output.substring(0, 500)}`,
      };
    }
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    const stdout = error.stdout || '';
    const stderr = error.stderr || '';
    return {
      success: false,
      error: `${errorMessage}\nstdout: ${stdout.substring(0, 500)}\nstderr: ${stderr.substring(0, 500)}`,
    };
  }
}

/**
 * Run synthesizer binary get-balances command
 */
async function getParticipantBalances(params: {
  stateSnapshotPath?: string;
  channelId: number;
  rpcUrl: string;
}): Promise<{ success: boolean; balances?: any; error?: string }> {
  const { stateSnapshotPath, channelId, rpcUrl } = params;

  if (!existsSync(synthesizerBinary)) {
    return {
      success: false,
      error: `Synthesizer binary not found at ${synthesizerBinary}`,
    };
  }

  try {
    const cmd = [
      `"${synthesizerBinary}"`,
      'get-balances',
      `--channel-id ${channelId}`,
      `--rpc-url "${rpcUrl}"`,
      '--sepolia',
    ];

    if (stateSnapshotPath) {
      cmd.push(`--snapshot "${stateSnapshotPath}"`);
    }

    const fullCmd = cmd.join(' ');

    // Use synthesizer package root as working directory
    const cwd = resolve(__dirname, '../../');

    console.log(`   Running: ${synthesizerBinary} get-balances...`);
    const output = execSync(fullCmd, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 60000, // 60 second timeout
      cwd,
    });

    // Parse output to extract balance information
    // The output format should be consistent with CLI output
    return {
      success: true,
      balances: output, // Return raw output for now
    };
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    const stdout = error.stdout || '';
    const stderr = error.stderr || '';
    return {
      success: false,
      error: `${errorMessage}\nstdout: ${stdout}\nstderr: ${stderr}`,
    };
  }
}

/**
 * Run preprocess binary (only needed for Proof #1)
 */
async function runPreprocess(outputsPath: string): Promise<boolean> {
  console.log(`\n⚙️  Running preprocess (Proof #1 setup)...`);

  const qapPath = resolve(projectRoot, 'packages/frontend/qap-compiler/subcircuits/library');
  const synthesizerPath = outputsPath;
  const setupPath = resolve(projectRoot, 'dist/resource/setup/output');
  const preprocessOutPath = resolve(projectRoot, 'dist/resource/preprocess/output');

  if (!existsSync(preprocessBinary)) {
    console.error(`   ❌ Preprocess binary not found at ${preprocessBinary}`);
    console.error(`   Please build the binaries first: cd dist && ./build.sh`);
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
  const setupPath = resolve(projectRoot, 'dist/resource/setup/output');
  const outPath = synthesizerPath;

  if (!existsSync(proverBinary)) {
    console.error(`   ❌ Prover binary not found at ${proverBinary}`);
    console.error(`   Please build the binaries first: cd dist && ./build.sh`);
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
  const setupPath = resolve(projectRoot, 'dist/resource/setup/output');
  const preprocessPath = resolve(projectRoot, 'dist/resource/preprocess/output');
  const proofPath = synthesizerPath;

  if (!existsSync(verifyBinary)) {
    console.error(`   ❌ Verify binary not found at ${verifyBinary}`);
    console.error(`   Please build the binaries first: cd dist && ./build.sh`);
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
  const CHANNEL_ID = parseInt(process.env.CHANNEL_ID || '32');
  const INITIALIZE_TX_HASH =
    process.env.INITIALIZE_TX_HASH || '0x56a115adb6be12363a71470bc07aba740b64956bf5acdb5dab4052d0bda9dfad';
  // Always use Sepolia RPC for testing (ignore env var to avoid Mainnet confusion)
  const RPC_URL = SEPOLIA_RPC_URL;

  // Read Alice's L1 private key from environment (for testing only)
  const ALICE_PRIVATE_KEY = process.env.ALICE_PRIVATE_KEY;
  if (!ALICE_PRIVATE_KEY) {
    console.error('❌ Error: ALICE_PRIVATE_KEY not found in .env file');
    process.exit(1);
  }

  // Recipient's L2 address (can be set in .env file as RECIPIENT_L2_ADDRESS)
  const RECIPIENT_L2_ADDRESS = process.env.RECIPIENT_L2_ADDRESS || '0xdb9e654c355299142b8145ee72778510d895398c';

  // Get participants from on-chain
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
  const bridgeContract = new ethers.Contract(ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI, provider);
  const participants: string[] = await bridgeContract.getChannelParticipants(CHANNEL_ID);

  console.log(`🌐 Using RPC: ${RPC_URL}`);
  console.log(`🔗 Channel ID: ${CHANNEL_ID}`);
  console.log(`📝 Init TX: ${INITIALIZE_TX_HASH}\n`);

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

  // Fetch on-chain initial state root for verification
  const onchainInitialStateRoot: string = await bridgeContract.getChannelInitialStateRoot(CHANNEL_ID);
  console.log(`📋 On-chain Initial State Root: ${onchainInitialStateRoot}`);

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

  // Output directory - fixed to test-outputs for internal testing
  const outputBaseDir = resolve(__dirname, '../test-outputs');

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Test: Sequential L2 Transfers (Using Binary)                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ========================================================================
  // PROOF #1: Alice → Recipient (1 TON)
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

  // Output path for Proof #1
  const outputPath1 = resolve(outputBaseDir, 'binary-test-1');

  const result1 = await runL2Transfer({
    channelId: CHANNEL_ID,
    initializeTxHash: INITIALIZE_TX_HASH,
    senderL2PrvKey: aliceL2PrivateKey,
    recipientL2Address: RECIPIENT_L2_ADDRESS,
    amount: '1',
    outputPath: outputPath1,
    rpcUrl: RPC_URL,
  });

  if (!result1.success) {
    console.error(`❌ Proof #1 failed: ${result1.error}`);
    process.exit(1);
  }

  console.log(`✅ Proof #1 synthesis completed`);
  console.log(`   Previous State Root: ${result1.previousStateRoot}`);
  console.log(`   New State Root:      ${result1.newStateRoot}`);
  console.log(`   State Snapshot:      ${result1.stateSnapshotPath}\n`);

  // ========================================================================
  // VERIFICATION: Compare restored Merkle root with on-chain initial state root
  // ========================================================================
  console.log('🔍 Verifying restored Merkle root against on-chain initial state root...');
  console.log(`   On-chain Initial State Root: ${onchainInitialStateRoot}`);
  console.log(`   Restored Previous State Root: ${result1.previousStateRoot}`);

  if (!result1.previousStateRoot) {
    console.error('\n❌ VERIFICATION FAILED: Could not read previous state root from binary output!');
    process.exit(1);
  }

  // Normalize both roots to lowercase for comparison
  const normalizedOnchainRoot = onchainInitialStateRoot.toLowerCase();
  const normalizedRestoredRoot = result1.previousStateRoot.toLowerCase();

  if (normalizedOnchainRoot !== normalizedRestoredRoot) {
    console.error('\n❌ VERIFICATION FAILED: Merkle root mismatch!');
    console.error(`   On-chain:  ${onchainInitialStateRoot}`);
    console.error(`   Restored:  ${result1.previousStateRoot}`);
    console.error('\n   The synthesizer restored a different state root than what was initialized on-chain.');
    console.error('   This could indicate:');
    console.error('   - Incorrect channel ID or initialize transaction hash');
    console.error('   - State reconstruction error in the synthesizer');
    console.error('   - Mismatched L2 address or MPT key mappings');
    process.exit(1);
  }

  console.log('   ✅ Merkle root verification PASSED! On-chain and restored roots match.\n');

  // Display participant balances after Proof #1
  console.log('📊 Participant Balances after Proof #1:');
  const balances1 = await getParticipantBalances({
    stateSnapshotPath: result1.stateSnapshotPath,
    channelId: CHANNEL_ID,
    rpcUrl: RPC_URL,
  });
  if (balances1.success) {
    console.log(balances1.balances);
  } else {
    console.warn(`   ⚠️  Failed to get balances: ${balances1.error}`);
  }
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
  // PROOF #2: Participant 2 → Alice (0.5 TON)
  // ========================================================================
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                  Proof #2: Participant 2 → Alice (0.5 TON)   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  if (!result1.stateSnapshotPath) {
    console.error(`\n❌ State snapshot path not available! Cannot continue.`);
    process.exit(1);
  }

  // For Proof #2, we need the second participant's L2 private key
  // Since we only have Alice's key in this test, we'll use a placeholder approach
  // In a real scenario, each participant would sign their own message
  
  // Read Bob's private key from environment (for testing only)
  const BOB_PRIVATE_KEY = process.env.BOB_PRIVATE_KEY;
  if (!BOB_PRIVATE_KEY) {
    console.warn('⚠️  BOB_PRIVATE_KEY not found in .env file. Skipping Proof #2.');
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    Test Completed (Partial)                  ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    console.log('✅ Successfully completed Proof #1 with binary!');
    console.log('⚠️  Proof #2 skipped due to missing BOB_PRIVATE_KEY');
    return;
  }

  // Create wallet from Bob's private key
  const bobWallet = new ethers.Wallet(BOB_PRIVATE_KEY);
  const bobL1Address = bobWallet.address;

  // Check if Bob's L1 address is in the participant list
  const bobParticipantIndex = participants.findIndex(
    addr => addr.toLowerCase() === bobL1Address.toLowerCase()
  );

  if (bobParticipantIndex === -1) {
    console.warn(`⚠️  Bob's L1 address ${bobL1Address} is not in the participant list. Skipping Proof #2.`);
    return;
  }

  // Generate Bob's L2 private key using signature method
  const bobSignature = await bobWallet.signMessage(messageToSign) as `0x${string}`;
  const bobL2Keys = deriveL2KeysFromSignature(bobSignature);
  const bobL2PrivateKey = bobL2Keys.privateKey;

  // Output path for Proof #2
  const outputPath2 = resolve(outputBaseDir, 'binary-test-2');

  const result2 = await runL2Transfer({
    channelId: CHANNEL_ID,
    initializeTxHash: INITIALIZE_TX_HASH,
    senderL2PrvKey: bobL2PrivateKey,
    recipientL2Address: aliceL2Address,
    amount: '0.5',
    previousStatePath: result1.stateSnapshotPath, // Chain from Proof #1
    outputPath: outputPath2,
    rpcUrl: RPC_URL,
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
  const balances2 = await getParticipantBalances({
    stateSnapshotPath: result2.stateSnapshotPath,
    channelId: CHANNEL_ID,
    rpcUrl: RPC_URL,
  });
  if (balances2.success) {
    console.log(balances2.balances);
  } else {
    console.warn(`   ⚠️  Failed to get balances: ${balances2.error}`);
  }
  console.log('');

  // Prove & Verify Proof #2
  if (!result2.instancePath) {
    console.error(`\n❌ Instance path not available! Cannot continue.`);
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

  // ========================================================================
  // SUMMARY
  // ========================================================================
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                     Test Summary                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log('✅ Successfully completed sequential transfer simulation using binary!');
  console.log('');
  console.log('📊 State Root Evolution:');
  console.log(`   Initial (On-chain):         ${onchainInitialStateRoot}`);
  console.log(`   → Proof #1 (Alice→P2, 1 TON):  ${result1.newStateRoot}`);
  console.log(`   → Proof #2 (P2→Alice, 0.5 TON): ${result2.newStateRoot}`);
  console.log('');
  console.log('🔬 Proof Generation & Verification:');
  console.log(`   - Proof #1: Preprocessed ✅ | Proved ✅ | Verified ✅`);
  console.log(`   - Proof #2: Proved ✅ | Verified ✅`);
  console.log('');
  console.log('🔄 Execution Flow:');
  console.log('   Proof #1: Binary l2-transfer → Merkle Root Verify → Preprocess → Prove → Verify ✅ Complete');
  console.log('             ↓ (await completion)');
  console.log('   Proof #2: Binary l2-transfer → Prove → Verify ✅ Complete');
  console.log('');
  console.log('🎯 Binary Usage:');
  console.log('   ✅ Uses bin/synthesizer binary for all synthesis operations');
  console.log('   ✅ Uses bin/synthesizer get-balances for balance queries');
  console.log('   ✅ Same prove/verify flow as direct API usage');
  console.log('   ✅ On-chain Merkle root verification integrated');

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    Test Completed Successfully!               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
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
