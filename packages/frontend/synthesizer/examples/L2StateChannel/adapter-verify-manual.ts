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
import { bytesToBigInt, bigIntToBytes, setLengthLeft, utf8ToBytes, hexToBytes, addHexPrefix, bytesToHex } from '@ethereumjs/util';
import { poseidon, fromEdwardsToAddress } from '../../src/TokamakL2JS/index.ts';
import { jubjub } from '@noble/curves/misc';
import { SynthesizerAdapter } from '../../src/interface/adapters/synthesizerAdapter.ts';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root
const envPath = resolve(__dirname, '../../../../../.env');
config({ path: envPath });

// Binary paths (use pre-built binaries from dist/bin)
const projectRoot = resolve(__dirname, '../../../../../');
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
// COMMAND LINE ARGUMENT PARSING
// ============================================================================

function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  const parsed: {
    senderL2Key?: string;
    recipientL2Address?: string;
    amount?: string;
    previousStatePath?: string;
  } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--sender-key' || arg === '--sender-l2-key') {
      parsed.senderL2Key = args[++i];
    } else if (arg === '--recipient' || arg === '--recipient-l2-address') {
      parsed.recipientL2Address = args[++i];
    } else if (arg === '--amount') {
      parsed.amount = args[++i];
    } else if (arg === '--previous-state' || arg === '--previous-state-path') {
      parsed.previousStatePath = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: tsx adapter-verify-manual.ts [options]

Options:
  --sender-key, --sender-l2-key <hex>    Sender's L2 private key (32 bytes hex, 0x prefix)
  --recipient, --recipient-l2-address <address>  Recipient's L2 address (20 bytes hex, 0x prefix)
  --amount <amount>                      Transfer amount in TON (default: 1)
  --previous-state, --previous-state-path <path> Path to previous state snapshot (for Proof #2+)
  --help, -h                             Show this help message

Examples:
  # Proof #1: Use custom sender key and recipient address
  tsx adapter-verify-manual.ts --sender-key 0x... --recipient 0x... --amount 1

  # Proof #2: Use previous state
  tsx adapter-verify-manual.ts --sender-key 0x... --recipient 0x... --amount 0.5 --previous-state ./test-outputs/adapter-test-1/state_snapshot.json
`);
      process.exit(0);
    }
  }

  return parsed;
}

// ============================================================================
// MAIN TEST FUNCTION
// ============================================================================

async function main() {
  const CHANNEL_ID = parseInt(process.env.CHANNEL_ID || '11');
  const INITIALIZE_TX_HASH =
    process.env.INITIALIZE_TX_HASH || '0x07461b300155a6b9e6a7a5006e6b6bfbc0483c2256428646727e1c6fecf4b3d1';

  // Parse command line arguments
  const cliArgs = parseCommandLineArgs();

  // Require sender key and recipient address as arguments
  if (!cliArgs.senderL2Key || !cliArgs.recipientL2Address) {
    console.error('❌ Error: --sender-key and --recipient are required');
    console.error('   Usage: tsx adapter-verify-manual.ts --sender-key <hex> --recipient <address> [--amount <amount>] [--previous-state <path>]');
    process.exit(1);
  }

  // Parse sender L2 private key (use as-is, no normalization)
  const senderKeyHex = cliArgs.senderL2Key.startsWith('0x') ? cliArgs.senderL2Key : `0x${cliArgs.senderL2Key}`;
  if (senderKeyHex.length !== 66) {
    throw new Error(`Invalid sender L2 private key length: expected 64 hex chars (32 bytes), got ${senderKeyHex.length - 2}`);
  }
  const senderL2PrivateKey = hexToBytes(addHexPrefix(senderKeyHex));

  // Parse recipient L2 address
  const recipientL2Address = cliArgs.recipientL2Address.startsWith('0x')
    ? cliArgs.recipientL2Address
    : `0x${cliArgs.recipientL2Address}`;
  if (recipientL2Address.length !== 42) {
    throw new Error(`Invalid recipient L2 address length: expected 40 hex chars (20 bytes), got ${recipientL2Address.length - 2}`);
  }

  // Use provided amount or default
  const transferAmount = cliArgs.amount || '1';

  console.log('📝 Using provided sender L2 key and recipient L2 address\n');
  console.log(`   Sender L2 Key: ${senderKeyHex}`);
  console.log(`   Recipient L2 Address: ${recipientL2Address}`);
  console.log(`   Amount: ${transferAmount} TON\n`);

  // Create SynthesizerAdapter instance
  const adapter = new SynthesizerAdapter({ rpcUrl: SEPOLIA_RPC_URL });

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Test: Sequential L2 Transfers (Simplified Interface)       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ========================================================================
  // PROOF: Transfer with provided or auto-generated keys
  // ========================================================================
  const proofLabel = cliArgs.previousStatePath ? 'Proof #2' : 'Proof #1';
  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║                  ${proofLabel}: Transfer (${transferAmount} TON)         ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Determine output path based on whether previous state is provided
  const outputPath = cliArgs.previousStatePath
    ? resolve(__dirname, '../test-outputs/adapter-test-2')
    : resolve(__dirname, '../test-outputs/adapter-test-1');

  const result1 = await adapter.synthesizeL2Transfer({
    channelId: CHANNEL_ID,
    initializeTxHash: INITIALIZE_TX_HASH,
    senderL2PrvKey: senderL2PrivateKey,
    recipientL2Address: recipientL2Address,
    amount: transferAmount,
    previousStatePath: cliArgs.previousStatePath,
    outputPath: outputPath,
    rollupBridgeAddress: ROLLUP_BRIDGE_CORE_ADDRESS,
  });

  if (!result1.success) {
    console.error(`❌ Proof #1 failed: ${result1.error}`);
    process.exit(1);
  }

  console.log(`✅ ${proofLabel} synthesis completed`);
  console.log(`   Previous State Root: ${result1.previousStateRoot}`);
  console.log(`   New State Root:      ${result1.newStateRoot}`);
  console.log(`   State Snapshot:      ${result1.stateSnapshotPath}\n`);

  // Display participant balances
  console.log(`📊 Participant Balances after ${proofLabel}:`);
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

  // Prove & Verify
  if (!result1.instancePath) {
    console.error(`\n❌ Instance path not found. Cannot run prove/verify.`);
    process.exit(1);
  }

  const proofNum = cliArgs.previousStatePath ? 2 : 1;
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Proving and Verifying ${proofLabel}`);
  console.log('='.repeat(80));

  if (!cliArgs.previousStatePath) {
    // Only run preprocess for first proof
    const preprocessSuccess = await runPreprocess(result1.instancePath);
    if (!preprocessSuccess) {
      console.error(`\n❌ Preprocess failed! Cannot continue.`);
      process.exit(1);
    }
  }

  const proveSuccess = await runProver(proofNum, result1.instancePath);
  if (!proveSuccess) {
    console.error(`\n❌ ${proofLabel} generation failed! Cannot continue.`);
    process.exit(1);
  }

  const verifySuccess = await runVerifyRust(proofNum, result1.instancePath);
  if (!verifySuccess) {
    console.error(`\n❌ ${proofLabel} verification failed! Cannot continue.`);
    process.exit(1);
  }

  const preprocessStatus = cliArgs.previousStatePath ? '' : 'Preprocessed ✅ | ';
  console.log(`\n✅ ${proofLabel} Complete: ${preprocessStatus}Proved ✅ | Verified ✅`);

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
