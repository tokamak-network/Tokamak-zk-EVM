/**
 * Test: Generate proof and verify using files from packages/frontend/synthesizer/outputs
 *
 * This script:
 * 1. Uses instance.json, permutation.json from outputs/ directory
 * 2. Runs preprocess (if needed)
 * 3. Generates proof using prover
 * 4. Verifies proof using verify-rust
 */

import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths
const outputsPath = resolve(__dirname, '../../outputs');
const qapPath = resolve(process.cwd(), '../qap-compiler/subcircuits/library');
const setupPath = resolve(process.cwd(), '../../../dist/macOS/resource/setup/output');
const preprocessOutPath = resolve(process.cwd(), '../../../dist/macOS/resource/preprocess/output');
const proofOutPath = outputsPath; // Proof will be saved in outputs/ directory

// Binary paths (use pre-built binaries from dist/macOS/bin)
const distBinPath = resolve(process.cwd(), '../../../dist/macOS/bin');
const preprocessBinary = `${distBinPath}/preprocess`;
const proverBinary = `${distBinPath}/prove`;
const verifyBinary = `${distBinPath}/verify`;

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Test: Generate Proof & Verify from outputs/            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Check if required files exist
  console.log('🔍 Checking required files...');
  if (!existsSync(`${outputsPath}/instance.json`)) {
    console.error(`❌ Error: instance.json not found at ${outputsPath}/instance.json`);
    process.exit(1);
  }
  console.log(`   ✅ instance.json found`);

  if (!existsSync(`${outputsPath}/permutation.json`)) {
    console.error(`❌ Error: permutation.json not found at ${outputsPath}/permutation.json`);
    process.exit(1);
  }
  console.log(`   ✅ permutation.json found\n`);

  // Step 1: Preprocess
  console.log('⚙️  Step 1: Running preprocess...');
  const preprocessSuccess = await runPreprocess();
  if (!preprocessSuccess) {
    console.error(`\n❌ Preprocess failed! Cannot continue.`);
    process.exit(1);
  }

  // Step 2: Generate proof
  console.log('\n⚡ Step 2: Generating proof...');
  const proveSuccess = await runProver();
  if (!proveSuccess) {
    console.error(`\n❌ Proof generation failed! Cannot continue.`);
    process.exit(1);
  }

  // Step 3: Verify proof
  console.log('\n🔐 Step 3: Verifying proof...');
  const verifySuccess = await runVerify();
  if (!verifySuccess) {
    console.error(`\n❌ Verification failed!`);
    process.exit(1);
  }

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    Test Completed Successfully!               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

async function runPreprocess(): Promise<boolean> {
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
    const cmd = `"${preprocessBinary}" "${qapPath}" "${outputsPath}" "${setupPath}" "${preprocessOutPath}"`;

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

async function runProver(): Promise<boolean> {
  if (!existsSync(proverBinary)) {
    console.error(`   ❌ Prover binary not found at ${proverBinary}`);
    console.error(`   Please build the binaries first: cd dist/macOS && ./build.sh`);
    return false;
  }

  try {
    const cmd = `"${proverBinary}" "${qapPath}" "${outputsPath}" "${setupPath}" "${proofOutPath}"`;

    console.log(`   Running: ${proverBinary}...`);
    const startTime = Date.now();

    const output = execSync(cmd, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 300000, // 5 minute timeout
    });

    const duration = Date.now() - startTime;

    if (existsSync(`${proofOutPath}/proof.json`)) {
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

async function runVerify(): Promise<boolean> {
  if (!existsSync(`${proofOutPath}/proof.json`)) {
    console.log(`   ⚠️  proof.json not found - cannot verify without proof`);
    return false;
  }

  if (!existsSync(verifyBinary)) {
    console.error(`   ❌ Verify binary not found at ${verifyBinary}`);
    console.error(`   Please build the binaries first: cd dist/macOS && ./build.sh`);
    return false;
  }

  try {
    const cmd = `"${verifyBinary}" "${qapPath}" "${outputsPath}" "${setupPath}" "${preprocessOutPath}" "${proofOutPath}"`;

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

// Run test
main()
  .then(() => {
    console.log('🎉 Test completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  });
