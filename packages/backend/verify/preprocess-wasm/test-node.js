// Node.js test script for preprocess-wasm
// This runs the same WASM code outside of browser

const fs = require('fs');
const path = require('path');

async function main() {
  console.log('🚀 Node.js Preprocess WASM Performance Test\n');
  
  // Import WASM module (Node.js build)
  const wasmModule = await import('./pkg-node/preprocess_wasm.js');
  
  console.log('✅ WASM module loaded\n');
  
  // Load test data
  console.log('📂 Loading test data...');
  const sigmaPath = './data/sigma_preprocess.json';
  const permutationPath = './data/permutation.json';
  const setupParamsPath = './data/setupParams.json';
  
  const sigmaJson = fs.readFileSync(sigmaPath, 'utf-8');
  const permutationJson = fs.readFileSync(permutationPath, 'utf-8');
  const setupParamsJson = fs.readFileSync(setupParamsPath, 'utf-8');
  
  console.log(`  - Sigma: ${(sigmaJson.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  - Permutation: ${(permutationJson.length / 1024).toFixed(2)} KB`);
  console.log(`  - Setup params: ${setupParamsJson.length} bytes`);
  console.log('✅ Data loaded\n');
  
  // Parse JSON in JavaScript (fast)
  console.log('⏱️  Step 1: Parsing JSON in JavaScript...');
  const startParse = Date.now();
  const sigmaObj = JSON.parse(sigmaJson);
  const permutationObj = JSON.parse(permutationJson);
  const setupParamsObj = JSON.parse(setupParamsJson);
  const parseDuration = Date.now() - startParse;
  console.log(`✅ JSON parsed in ${(parseDuration / 1000).toFixed(2)}s\n`);
  
  // Run preprocess in WASM
  console.log('⏱️  Step 2: Running preprocess in WASM...');
  console.log('   (This will take several minutes for large circuits)\n');
  
  const startWasm = Date.now();
  
  try {
    const preprocess = new wasmModule.PreprocessWasm(
      sigmaObj,
      permutationObj,
      setupParamsObj
    );
    
    const wasmDuration = Date.now() - startWasm;
    console.log(`\n✅ Preprocess completed in ${(wasmDuration / 1000).toFixed(2)}s\n`);
    
    // Get results
    const resultJson = preprocess.toJSON();
    const formattedJson = preprocess.toFormattedJSON();
    
    // Clean up
    preprocess.free();
    
    // Save results
    fs.writeFileSync('./test-output.json', formattedJson);
    console.log('📝 Results saved to test-output.json\n');
    
    // Performance summary
    console.log('📊 Performance Summary:');
    console.log('─'.repeat(50));
    console.log(`JSON Parsing:     ${(parseDuration / 1000).toFixed(2)}s`);
    console.log(`WASM Processing:  ${(wasmDuration / 1000).toFixed(2)}s`);
    console.log(`Total:            ${((parseDuration + wasmDuration) / 1000).toFixed(2)}s`);
    console.log('─'.repeat(50));
    
    // Compare with browser
    const browserTime = 659.14; // From your test
    const nodeTime = (parseDuration + wasmDuration) / 1000;
    const speedup = browserTime / nodeTime;
    
    console.log('\n🔍 Comparison:');
    console.log(`Browser:  ${browserTime.toFixed(2)}s`);
    console.log(`Node.js:  ${nodeTime.toFixed(2)}s`);
    if (speedup > 1) {
      console.log(`Speedup:  ${speedup.toFixed(2)}x faster! 🚀`);
    } else if (speedup < 1) {
      console.log(`Speedup:  ${(1/speedup).toFixed(2)}x slower 🐌`);
    } else {
      console.log(`Speedup:  About the same`);
    }
    
  } catch (error) {
    console.error('❌ Error during preprocess:', error);
    process.exit(1);
  }
}

// Run
main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});

