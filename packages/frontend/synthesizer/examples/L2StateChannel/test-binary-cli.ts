/**
 * Test Binary CLI: l2-state-channel command
 *
 * This script tests the newly added `l2-state-channel` CLI command by:
 * 1. Finding the synthesizer binary in dist/macOS/bin/synthesizer
 * 2. Executing the binary with Channel 8 parameters
 * 3. Verifying the output files are generated correctly
 *
 * Channel 8 uses WTON (0x79E0d92670106c85E9067b56B8F674340dCa0Bbd) on Sepolia
 *
 * Usage:
 *   npx tsx examples/L2StateChannel/test-binary-cli.ts
 */

import { spawn } from 'child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const ALCHEMY_KEY = 'PbqCcGx1oHN7yNaFdUJUYqPEN0QSp23S';
const SEPOLIA_RPC_URL = `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`;
const ROLLUP_BRIDGE_CORE_ADDRESS = '0x780ad1b236390C42479b62F066F5cEeAa4c77ad6'; // RollupBridge Proxy
const CHANNEL_ID = 8; // Channel 8 uses WTON on Sepolia
const WTON_ADDRESS = '0x79E0d92670106c85E9067b56B8F674340dCa0Bbd';

// Test parameters
const SENDER_ADDRESS = '0x31Fbd690BF62cd8C60A93F3aD8E96A6085Dc5647'; // Participant 0
const RECIPIENT_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // Participant 1
const TRANSFER_AMOUNT = '1000000000000000000'; // 1 WTON (18 decimals)

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Find synthesizer binary path
 */
function findSynthesizerBinary(): string | null {
  // Get the directory of this test file
  // From: packages/frontend/synthesizer/examples/L2StateChannel/test-binary-cli.ts
  // To root: ../../../../.. (5 levels up)
  const testFileDir = __dirname;
  const workspaceRoot = resolve(testFileDir, '../../../../..');

  // Try dist/macOS/bin/synthesizer first (production)
  // Note: tokamak-cli --install does NOT build synthesizer binary in local environment
  // You need to manually run: cd packages/frontend/synthesizer && ./build-binary.sh macos
  const distPaths = [
    resolve(workspaceRoot, 'dist/macOS/bin/synthesizer'),
    resolve(workspaceRoot, 'dist/linux/bin/synthesizer'),
    resolve(workspaceRoot, 'dist/windows/bin/synthesizer.exe'),
  ];

  for (const path of distPaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  // Try synthesizer package bin directory (development)
  // This is where build-binary.sh places the binary when run manually
  const synthesizerPackageDir = resolve(workspaceRoot, 'packages/frontend/synthesizer');
  const synthesizerBinPaths = [
    resolve(synthesizerPackageDir, 'bin/synthesizer-final'), // "current" platform build
    resolve(synthesizerPackageDir, 'bin/synthesizer-macos-arm64'),
    resolve(synthesizerPackageDir, 'bin/synthesizer-macos-x64'),
    resolve(synthesizerPackageDir, 'bin/synthesizer-linux-x64'),
  ];

  console.log(`[Debug] Checking synthesizer package bin paths:`);
  for (const path of synthesizerBinPaths) {
    const exists = existsSync(path);
    console.log(`  - ${path} ${exists ? '✅ EXISTS' : '❌ NOT FOUND'}`);
    if (exists) {
      return path;
    }
  }

  // Also check if we're already in the synthesizer directory (when running from synthesizer package)
  const localBinPaths = [
    resolve(process.cwd(), 'bin/synthesizer-final'),
    resolve(process.cwd(), 'bin/synthesizer-macos-arm64'),
    resolve(process.cwd(), 'bin/synthesizer-macos-x64'),
  ];
  console.log(`[Debug] Checking local bin paths (from cwd: ${process.cwd()}):`);
  for (const path of localBinPaths) {
    const exists = existsSync(path);
    console.log(`  - ${path} ${exists ? '✅ EXISTS' : '❌ NOT FOUND'}`);
    if (exists) {
      return path;
    }
  }

  // Also try alternative: from process.cwd() if we're in synthesizer directory
  const cwdRoot = resolve(process.cwd(), '../../..');
  const altDistPath = resolve(cwdRoot, 'dist/macOS/bin/synthesizer');
  console.log(
    `[Debug] Alternative path from cwd: ${altDistPath} ${existsSync(altDistPath) ? '✅ EXISTS' : '❌ NOT FOUND'}`,
  );
  if (existsSync(altDistPath)) {
    return altDistPath;
  }

  return null;
}

/**
 * Execute binary command and return result
 */
function executeBinary(
  binaryPath: string,
  args: string[],
  cwd?: string,
): Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }> {
  return new Promise(resolve => {
    console.log(`\n🔧 Executing: ${binaryPath} ${args.join(' ')}\n`);

    const proc = spawn(binaryPath, args, {
      cwd: cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
      shell: false,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text);
    });

    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(text);
    });

    proc.on('close', (code: number) => {
      resolve({
        success: code === 0,
        stdout,
        stderr,
        exitCode: code || 0,
      });
    });

    proc.on('error', (error: Error) => {
      resolve({
        success: false,
        stdout,
        stderr: stderr + error.message,
        exitCode: -1,
      });
    });
  });
}

/**
 * Extract ZIP file and find state_snapshot.json
 */
function extractZipAndFindStateSnapshot(zipPath: string): string | null {
  if (!existsSync(zipPath)) {
    return null;
  }

  const extractDir = resolve(tmpdir(), `test-extract-${Date.now()}`);
  mkdirSync(extractDir, { recursive: true });

  console.log(`📦 Extracting ${zipPath}...`);
  try {
    execSync(`unzip -q "${zipPath}" -d "${extractDir}"`);
  } catch (e) {
    console.warn('⚠️  Failed to extract ZIP');
    return null;
  }

  // Search for state_snapshot.json recursively
  function findFile(dir: string, filename: string): string | null {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = resolve(dir, entry);
      try {
        const stats = statSync(fullPath);
        if (stats.isDirectory() && !entry.startsWith('.') && !entry.startsWith('__MACOSX')) {
          const found = findFile(fullPath, filename);
          if (found) return found;
        } else if (stats.isFile() && entry === filename) {
          return fullPath;
        }
      } catch (e) {
        // Ignore
      }
    }
    return null;
  }

  return findFile(extractDir, 'state_snapshot.json');
}

/**
 * Verify output files exist and are valid
 */
function verifyOutputFiles(outputDir: string): boolean {
  const requiredFiles = [
    'instance.json',
    'instance_description.json',
    'placementVariables.json',
    'permutation.json',
    'state_snapshot.json',
  ];

  console.log('\n📋 Verifying output files...');
  let allFilesExist = true;

  for (const file of requiredFiles) {
    const filePath = resolve(outputDir, file);
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content);
        console.log(`   ✅ ${file} (${Object.keys(parsed).length} keys)`);
      } catch (e) {
        console.log(`   ⚠️  ${file} exists but is not valid JSON`);
        allFilesExist = false;
      }
    } else {
      console.log(`   ❌ ${file} not found`);
      allFilesExist = false;
    }
  }

  return allFilesExist;
}

// ============================================================================
// MAIN TEST FUNCTION
// ============================================================================

async function testBinaryCLI() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║         Test Binary CLI: l2-state-channel Command          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Step 1: Find binary
  console.log('🔍 Step 1: Finding synthesizer binary...');
  const binaryPath = findSynthesizerBinary();

  if (!binaryPath) {
    throw new Error(
      'Synthesizer binary not found. Please build the binary first:\n' +
        '  cd packages/frontend/synthesizer\n' +
        '  ./build-binary.sh macos\n' +
        'Or ensure it exists in dist/macOS/bin/synthesizer',
    );
  }

  console.log(`✅ Found binary: ${binaryPath}\n`);

  // Step 2: Find and extract ZIP file with previous state
  console.log('🔍 Step 2: Finding onchain-proof-test.zip...');
  const zipPath = resolve(
    __dirname,
    '../../../../tokamak-zkp-channel-apps/packages/zkp-channel-verifier/test/onchain-proof-test.zip',
  );
  let previousStatePath: string | null = null;

  if (existsSync(zipPath)) {
    console.log(`✅ Found ZIP: ${zipPath}`);
    previousStatePath = extractZipAndFindStateSnapshot(zipPath);
    if (previousStatePath) {
      const stateContent = JSON.parse(readFileSync(previousStatePath, 'utf-8'));
      console.log(`✅ Previous state found: ${stateContent.stateRoot}\n`);
    } else {
      console.log('⚠️  state_snapshot.json not found in ZIP, continuing without previous state\n');
    }
  } else {
    console.log(`⚠️  ZIP file not found at ${zipPath}`);
    console.log('   Continuing without previous state (first transaction)\n');
  }

  // Step 3: Prepare output directory
  const outputDir = resolve(process.cwd(), 'test-outputs/binary-cli-test');
  mkdirSync(outputDir, { recursive: true });
  console.log(`📁 Output directory: ${outputDir}\n`);

  // Step 3: Test with --sender-address (L1 address)
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Test 1: Using --sender-address (L1 Address)           ║');
  if (previousStatePath) {
    console.log('║             WITH Previous State                            ║');
  } else {
    console.log('║             WITHOUT Previous State                         ║');
  }
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const args1 = [
    'l2-state-channel',
    '--channel-id',
    CHANNEL_ID.toString(),
    '--token',
    WTON_ADDRESS,
    '--recipient',
    RECIPIENT_ADDRESS,
    '--amount',
    TRANSFER_AMOUNT,
    '--rollup-bridge',
    ROLLUP_BRIDGE_CORE_ADDRESS,
    '--sender-address',
    SENDER_ADDRESS,
    '--rpc-url',
    SEPOLIA_RPC_URL,
    '--output-dir',
    outputDir,
  ];

  // Add previous state if available
  if (previousStatePath) {
    args1.push('--previous-state', previousStatePath);
  }

  const result1 = await executeBinary(binaryPath, args1);

  if (!result1.success) {
    throw new Error(
      `Binary execution failed with exit code ${result1.exitCode}\n` +
        `STDERR: ${result1.stderr}\n` +
        `STDOUT: ${result1.stdout}`,
    );
  }

  console.log('\n✅ Binary execution completed successfully!');

  // Step 4: Verify output files
  const filesValid = verifyOutputFiles(outputDir);

  if (!filesValid) {
    throw new Error('Some required output files are missing or invalid');
  }

  // Step 5: Read and display state snapshot
  const stateSnapshotPath = resolve(outputDir, 'state_snapshot.json');
  if (existsSync(stateSnapshotPath)) {
    const stateSnapshot = JSON.parse(readFileSync(stateSnapshotPath, 'utf-8'));
    console.log('\n📄 State Snapshot:');
    console.log(`   State Root: ${stateSnapshot.stateRoot}`);
    console.log(`   Storage Entries: ${stateSnapshot.storageEntries?.length || 0}`);
    console.log(`   Registered Keys: ${stateSnapshot.registeredKeys?.length || 0}`);
    console.log(`   User L2 Addresses: ${stateSnapshot.userL2Addresses?.length || 0}`);
  }

  // Step 6: Test with --sender-index (alternative method)
  // Use the generated state from Test 1 as previous state for Test 2
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Test 2: Using --sender-index (Index)                  ║');
  console.log('║             WITH Previous State from Test 1                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const outputDir2 = resolve(process.cwd(), 'test-outputs/binary-cli-test-2');
  mkdirSync(outputDir2, { recursive: true });

  // Use state_snapshot.json from Test 1 as previous state
  const test1StatePath = resolve(outputDir, 'state_snapshot.json');
  if (!existsSync(test1StatePath)) {
    throw new Error('Test 1 state_snapshot.json not found. Cannot proceed with Test 2.');
  }
  console.log(`📄 Using previous state from Test 1: ${test1StatePath}\n`);

  const args2 = [
    'l2-state-channel',
    '--channel-id',
    CHANNEL_ID.toString(),
    '--token',
    WTON_ADDRESS,
    '--recipient',
    RECIPIENT_ADDRESS,
    '--amount',
    TRANSFER_AMOUNT,
    '--rollup-bridge',
    ROLLUP_BRIDGE_CORE_ADDRESS,
    '--sender-index',
    '0', // Participant 0
    '--rpc-url',
    SEPOLIA_RPC_URL,
    '--output-dir',
    outputDir2,
    '--previous-state',
    test1StatePath,
  ];

  const result2 = await executeBinary(binaryPath, args2);

  if (!result2.success) {
    throw new Error(
      `Binary execution failed with exit code ${result2.exitCode}\n` +
        `STDERR: ${result2.stderr}\n` +
        `STDOUT: ${result2.stdout}`,
    );
  }

  console.log('\n✅ Binary execution with --sender-index completed successfully!');

  // Verify output files for test 2
  const filesValid2 = verifyOutputFiles(outputDir2);

  if (!filesValid2) {
    throw new Error('Some required output files are missing or invalid (Test 2)');
  }

  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    All Tests Passed!                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log('✅ Binary CLI test completed successfully!');
  console.log(`📁 Test 1 output: ${outputDir}`);
  console.log(`📁 Test 2 output: ${outputDir2}`);
  console.log('\n🎉 Both --sender-address and --sender-index methods work correctly!\n');
}

// Run the test
testBinaryCLI()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:');
    console.error(`   Error: ${error.message}`);
    if (error.stack) {
      console.error(`   Stack: ${error.stack}`);
    }
    process.exit(1);
  });
