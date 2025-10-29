#!/usr/bin/env node
// Node.js script to test WASM verifier quickly without browser
// Usage: node test-node.js

const fs = require('fs');
const path = require('path');

// Load WASM module
const wasmPath = path.join(__dirname, 'pkg-node', 'verify_wasm_bg.wasm');
const wasmBuffer = fs.readFileSync(wasmPath);

// Import WASM bindings
const wasm = require('./pkg-node/verify_wasm.js');

async function testVerifier() {
  console.log('🚀 Starting WASM Verifier Test (Node.js)\n');

  // Debug: Check what's available in wasm module
  console.log(
    'Available WASM functions:',
    Object.keys(wasm).filter((k) => typeof wasm[k] === 'function'),
  );
  console.log('');

  try {
    // Load JSON files
    console.log('📂 Loading JSON files...');

    const basePath = path.join(__dirname, 'data');

    const setupParams = JSON.parse(
      fs.readFileSync(path.join(basePath, 'setupParams.json'), 'utf8'),
    );
    const instance = JSON.parse(
      fs.readFileSync(path.join(basePath, 'instance.json'), 'utf8'),
    );
    const proof = JSON.parse(
      fs.readFileSync(path.join(basePath, 'proof.json'), 'utf8'),
    );
    const preprocessRaw = JSON.parse(
      fs.readFileSync(path.join(basePath, 'preprocess.json'), 'utf8'),
    );
    const sigma = JSON.parse(
      fs.readFileSync(path.join(basePath, 'sigma_verify.json'), 'utf8'),
    );

    console.log('✅ All JSON files loaded\n');

    // Recover preprocess from FormattedPreprocess
    console.log('🔄 Recovering preprocess...');
    console.log(
      'preprocessRaw:',
      JSON.stringify(preprocessRaw).substring(0, 100) + '...',
    );

    let preprocessObj;
    try {
      const preprocessResult = wasm.recoverPreprocess(preprocessRaw);
      console.log(
        'recoverPreprocess returned:',
        typeof preprocessResult,
        preprocessResult,
      );
      preprocessObj = preprocessResult;
    } catch (err) {
      console.error('recoverPreprocess error:', err);
      throw err;
    }
    console.log('✅ Preprocess recovered\n');

    // Initialize verifier
    console.log('🔧 Initializing verifier...');
    const verifier = new wasm.Verifier(
      JSON.stringify(setupParams),
      JSON.stringify(instance),
      JSON.stringify(proof),
      JSON.stringify(preprocessObj),
      JSON.stringify(sigma),
    );
    console.log('✅ Verifier initialized\n');

    // Run Keccak256 verification
    console.log('🔍 Running Keccak256 verification...');
    const keccakResult = verifier.verify_keccak256();
    console.log(`Keccak256 Result: ${keccakResult}\n`);

    // Run SNARK verification
    console.log('🔍 Running SNARK verification...');
    const snarkResult = verifier.verify_snark();
    console.log(
      `\n🎯 SNARK Verification Result: ${snarkResult ? '✅ PASSED' : '❌ FAILED'}\n`,
    );

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Test Summary:');
    console.log(`   Keccak256: ${keccakResult}`);
    console.log(`   SNARK:     ${snarkResult ? 'PASSED ✅' : 'FAILED ❌'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    process.exit(snarkResult ? 0 : 1);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run test
testVerifier().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
