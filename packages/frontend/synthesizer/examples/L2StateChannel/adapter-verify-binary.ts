/**
 * L2 State Channel Transaction Test using Synthesizer Binary
 *
 * This test uses the built binary (bin/synthesizer) instead of direct SynthesizerAdapter calls.
 * It demonstrates the same sequential transfer flow but via CLI commands.
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
import { jubjub } from '@noble/curves/jubjub';

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
const distBinPath = resolve(projectRoot, 'dist/macOS/bin');
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
}): Promise<{ success: boolean; instancePath?: string; stateSnapshotPath?: string; error?: string }> {
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
      return {
        success: true,
        instancePath,
        stateSnapshotPath,
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
  const CHANNEL_ID = parseInt(process.env.CHANNEL_ID || '4');
  const INITIALIZE_TX_HASH =
    process.env.INITIALIZE_TX_HASH || '0xef83ef333908e2cec7bbfe3eb8719d7dc1464ef917637ca98868a195e75564c6';
  // Always use Sepolia RPC for testing (ignore env var to avoid Mainnet confusion)
  const RPC_URL = SEPOLIA_RPC_URL;

  console.log(`🌐 Using RPC: ${RPC_URL}`);
  console.log(`🔗 Channel ID: ${CHANNEL_ID}`);
  console.log(`📝 Init TX: ${INITIALIZE_TX_HASH}\n`);

  // Output directory - fixed to test-outputs for internal testing
  const outputBaseDir = resolve(__dirname, '../test-outputs');

  // Read L1 private keys from environment (for testing only)
  const PRIVATE_KEYS = [process.env.ALICE_PRIVATE_KEY, process.env.BOB_PRIVATE_KEY, process.env.CHARLIE_PRIVATE_KEY];
  if (!PRIVATE_KEYS[0] || !PRIVATE_KEYS[1] || !PRIVATE_KEYS[2]) {
    console.error('❌ Error: Private keys not found in .env file');
    process.exit(1);
  }

  // Get participants from on-chain
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
  const bridgeContract = new ethers.Contract(ROLLUP_BRIDGE_CORE_ADDRESS, ROLLUP_BRIDGE_CORE_ABI, provider);
  const participants: string[] = await bridgeContract.getChannelParticipants(CHANNEL_ID);

  console.warn('⚠️  WARNING: Generating L2 keys from L1 keys for testing purposes.');
  console.warn('   In production, L2 private keys should be provided directly.\n');

  // Generate L2 private keys (for testing)
  const PARTICIPANT_NAMES = ['Alice', 'Bob', 'Charlie'];
  const participantL2PrivateKeys: Uint8Array[] = [];

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

    // Generate L2 private key
    const l1PublicKeyHex = wallet.signingKey.publicKey;
    const seedString = `${l1PublicKeyHex}${CHANNEL_ID}${PARTICIPANT_NAMES[participantIndex]!}`;
    const seedBytes = utf8ToBytes(seedString);
    const seedHashBytes = poseidon(seedBytes);
    const seedHashBigInt = bytesToBigInt(seedHashBytes);
    const privateKeyBigInt = seedHashBigInt % jubjub.Point.Fn.ORDER;
    const privateKeyValue = privateKeyBigInt === 0n ? 1n : privateKeyBigInt;
    const l2PrivateKey = setLengthLeft(bigIntToBytes(privateKeyValue), 32);

    participantL2PrivateKeys.push(l2PrivateKey);
  }

  // Derive L2 addresses from L2 private keys
  const allL2Addresses: string[] = participantL2PrivateKeys.map(deriveL2AddressFromPrivateKey);

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Test: Sequential L2 Transfers (Using Binary)                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ========================================================================
  // PROOF #1: Participant 1 → 2 (1 TON)
  // ========================================================================
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                  Proof #1: Participant 1 → 2 (1 TON)         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Output path for Proof #1
  const outputPath1 = resolve(outputBaseDir, 'binary-test-1');

  const result1 = await runL2Transfer({
    channelId: CHANNEL_ID,
    initializeTxHash: INITIALIZE_TX_HASH,
    senderL2PrvKey: participantL2PrivateKeys[0],
    recipientL2Address: allL2Addresses[1],
    amount: '1',
    outputPath: outputPath1,
    rpcUrl: RPC_URL,
  });

  if (!result1.success) {
    console.error(`❌ Proof #1 failed: ${result1.error}`);
    process.exit(1);
  }

  console.log(`✅ Proof #1 synthesis completed`);
  console.log(`   Instance Path:      ${result1.instancePath}`);
  console.log(`   State Snapshot:    ${result1.stateSnapshotPath}\n`);

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
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Proving and Verifying Proof #1`);
  console.log('='.repeat(80));

  if (!result1.instancePath) {
    console.error(`\n❌ Instance path not available! Cannot continue.`);
    process.exit(1);
  }

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
  // PROOF #2: Participant 2 → 0 (0.5 TON)
  // ========================================================================
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                  Proof #2: Participant 2 → 0 (0.5 TON)         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  if (!result1.stateSnapshotPath) {
    console.error(`\n❌ State snapshot path not available! Cannot continue.`);
    process.exit(1);
  }

  // Output path for Proof #2
  const outputPath2 = resolve(outputBaseDir, 'binary-test-2');

  const result2 = await runL2Transfer({
    channelId: CHANNEL_ID,
    initializeTxHash: INITIALIZE_TX_HASH,
    senderL2PrvKey: participantL2PrivateKeys[1],
    recipientL2Address: allL2Addresses[0],
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
  console.log(`   Instance Path:      ${result2.instancePath}`);
  console.log(`   State Snapshot:    ${result2.stateSnapshotPath}\n`);

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
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Proving and Verifying Proof #2`);
  console.log('='.repeat(80));

  if (!result2.instancePath) {
    console.error(`\n❌ Instance path not available! Cannot continue.`);
    process.exit(1);
  }

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
  console.log('🔬 Proof Generation & Verification:');
  console.log(`   - Proof #1: Preprocessed ✅ | Proved ✅ | Verified ✅`);
  console.log(`   - Proof #2: Proved ✅ | Verified ✅`);
  console.log('');
  console.log('🔄 Execution Flow:');
  console.log('   Proof #1: Binary l2-transfer → Preprocess → Prove → Verify ✅ Complete');
  console.log('             ↓ (await completion)');
  console.log('   Proof #2: Binary l2-transfer → Prove → Verify ✅ Complete');
  console.log('');
  console.log('🎯 Binary Usage:');
  console.log('   ✅ Uses bin/synthesizer binary for all synthesis operations');
  console.log('   ✅ Uses bin/synthesizer get-balances for balance queries');
  console.log('   ✅ Same prove/verify flow as direct API usage');

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
