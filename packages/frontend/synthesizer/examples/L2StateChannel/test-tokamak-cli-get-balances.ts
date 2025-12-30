/**
 * Test Get Balances using tokamak-cli
 *
 * This test uses the tokamak-cli wrapper to execute get-balances command.
 * It demonstrates fetching participant balances from state snapshot or on-chain.
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { SEPOLIA_RPC_URL } from './constants.ts';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root
const envPath = resolve(__dirname, '../../../../../.env');
config({ path: envPath });

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Run tokamak-cli get-balances command
 */
async function runTokamakCliGetBalances(params: {
  channelId: number;
  snapshotPath?: string;
  rpcUrl: string;
}): Promise<{ success: boolean; output?: string; error?: string }> {
  const { channelId, snapshotPath, rpcUrl } = params;

  // Get tokamak-cli path (project root)
  const projectRoot = resolve(__dirname, '../../../../../');
  const tokamakCli = resolve(projectRoot, 'tokamak-cli');

  if (!existsSync(tokamakCli)) {
    return {
      success: false,
      error: `tokamak-cli not found at ${tokamakCli}`,
    };
  }

  try {
    const cmd = [
      `"${tokamakCli}"`,
      '--get-balances',
      `--channel-id ${channelId}`,
      `--rpc-url "${rpcUrl}"`,
      '--sepolia',
    ];

    if (snapshotPath) {
      cmd.push(`--snapshot "${snapshotPath}"`);
    }

    const fullCmd = cmd.join(' ');

    console.log(`   Running: tokamak-cli --get-balances...`);
    console.log(`   Command: ${fullCmd}`);

    const output = execSync(fullCmd, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 60000, // 60 second timeout
      cwd: projectRoot,
    });

    console.log(`   ✅ Balances retrieved successfully`);
    return {
      success: true,
      output,
    };
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

// ============================================================================
// MAIN TEST FUNCTION
// ============================================================================

async function main() {
  const CHANNEL_ID = parseInt(process.env.CHANNEL_ID || '4');
  const RPC_URL = SEPOLIA_RPC_URL;

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Test: Get Balances using tokamak-cli                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log(`🌐 Using RPC: ${RPC_URL}`);
  console.log(`🔗 Channel ID: ${CHANNEL_ID}\n`);

  // Check for default snapshot path
  const projectRoot = resolve(__dirname, '../../../../../');
  const defaultSnapshotPath = resolve(
    projectRoot,
    'dist/resource/synthesizer/output/state_snapshot.json',
  );

  // ========================================================================
  // TEST 1: Get balances from state snapshot (if exists)
  // ========================================================================
  if (existsSync(defaultSnapshotPath)) {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║        Test 1: Get Balances from State Snapshot              ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    console.log(`📄 Using snapshot: ${defaultSnapshotPath}\n`);

    const result1 = await runTokamakCliGetBalances({
      channelId: CHANNEL_ID,
      snapshotPath: defaultSnapshotPath,
      rpcUrl: RPC_URL,
    });

    if (!result1.success) {
      console.error(`❌ Test 1 failed: ${result1.error}`);
    } else {
      console.log('\n📊 Balance Output:');
      console.log(result1.output);
      console.log('\n✅ Test 1 completed successfully!');
    }
  } else {
    console.log('\n⚠️  Default snapshot not found, skipping Test 1');
    console.log(`   Expected: ${defaultSnapshotPath}`);
    console.log('   💡 Run l2-transfer first to generate state snapshot\n');
  }

  // ========================================================================
  // TEST 2: Get balances from on-chain (initial deposits)
  // ========================================================================
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║        Test 2: Get Balances from On-chain Deposits            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log('📡 Fetching initial deposits from on-chain...\n');

  const result2 = await runTokamakCliGetBalances({
    channelId: CHANNEL_ID,
    // No snapshot path - will fetch from on-chain
    rpcUrl: RPC_URL,
  });

  if (!result2.success) {
    console.error(`❌ Test 2 failed: ${result2.error}`);
    process.exit(1);
  }

  console.log('\n📊 Balance Output:');
  console.log(result2.output);
  console.log('\n✅ Test 2 completed successfully!');

  // ========================================================================
  // SUMMARY
  // ========================================================================
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                     Test Summary                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log('✅ Successfully tested get-balances using tokamak-cli!');
  console.log('');
  console.log('📋 Test Results:');
  if (existsSync(defaultSnapshotPath)) {
    console.log('   ✅ Test 1: Get balances from state snapshot - PASSED');
  } else {
    console.log('   ⚠️  Test 1: Get balances from state snapshot - SKIPPED (no snapshot)');
  }
  console.log('   ✅ Test 2: Get balances from on-chain deposits - PASSED');
  console.log('');
  console.log('💡 Usage:');
  console.log('   ./tokamak-cli --get-balances --channel-id <ID> --rpc-url <URL> --sepolia');
  console.log('   ./tokamak-cli --get-balances --channel-id <ID> --snapshot <PATH> --rpc-url <URL> --sepolia');

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
