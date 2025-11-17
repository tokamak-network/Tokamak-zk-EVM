/**
 * Quick test script for SynthesizerAdapter
 * Tests the updated adapter with a real Ethereum transaction
 */

import { SynthesizerAdapter } from './src/interface/adapters/synthesizerAdapter.ts';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env file
config({ path: resolve(process.cwd(), '.env') });

async function testAdapter() {
  console.log('🧪 Testing SynthesizerAdapter...\n');

  // Get RPC URL from .env file
  const rpcUrl = process.env.RPC_URL;

  if (!rpcUrl) {
    console.error('❌ RPC_URL not found in .env file');
    console.error('   Please ensure .env file exists with RPC_URL set');
    process.exit(1);
  }

  console.log('✅ Loaded RPC URL from .env file');

  // Use the TON transfer transaction from the example
  const testTxHash = '0xa0090893a2d5f79b67cebcb65eac3efc92820ec09dc4ad9fe2bc29bbdcad2e41';

  console.log(`📋 Test Transaction: ${testTxHash}`);
  console.log(`🔗 RPC URL: ${rpcUrl.substring(0, 50)}...`);
  console.log('');

  try {
    // Create adapter
    console.log('1️⃣ Creating SynthesizerAdapter...');
    const adapter = new SynthesizerAdapter({ rpcUrl });
    console.log('   ✅ Adapter created\n');

    // Run synthesis
    console.log('2️⃣ Running synthesis (this may take 1-2 minutes)...');
    const startTime = Date.now();

    const result = await adapter.synthesize(testTxHash);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`   ✅ Synthesis complete in ${duration}s\n`);

    // Display results
    console.log('📊 Results:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Instance (a_pub):`);
    console.log(`  - Length: ${result.instance.a_pub.length}`);
    console.log(`  - First value: ${result.instance.a_pub[0]}`);
    console.log(`  - Last value: ${result.instance.a_pub[result.instance.a_pub.length - 1]}`);
    console.log('');

    console.log(`Placement Variables:`);
    console.log(`  - Count: ${result.placementVariables.length}`);
    console.log('');

    console.log(`Permutation:`);
    console.log(`  - Entries: ${result.permutation.length}`);
    if (result.permutation.length > 0) {
      console.log(`  - First entry: row=${result.permutation[0].row}, col=${result.permutation[0].col}`);
    }
    console.log('');

    console.log(`Metadata:`);
    console.log(`  - TX Hash: ${result.metadata.txHash}`);
    console.log(`  - Block: ${result.metadata.blockNumber}`);
    console.log(`  - From: ${result.metadata.from}`);
    console.log(`  - To: ${result.metadata.to}`);
    console.log(`  - Contract: ${result.metadata.contractAddress}`);
    console.log(`  - EOA Addresses: ${result.metadata.eoaAddresses.length}`);
    result.metadata.eoaAddresses.forEach((addr, i) => {
      console.log(`    ${i + 1}. ${addr}`);
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Verify instance.json structure
    console.log('3️⃣ Verifying instance.json structure...');
    if (result.instance.a_pub.length > 0) {
      console.log('   ✅ instance.a_pub is populated');
    } else {
      console.log('   ❌ instance.a_pub is empty');
    }

    if (result.placementVariables.length > 0) {
      console.log('   ✅ placementVariables are populated');
    } else {
      console.log('   ❌ placementVariables are empty');
    }

    if (result.permutation.length > 0) {
      console.log('   ✅ permutation is populated');
    } else {
      console.log('   ❌ permutation is empty');
    }
    console.log('');

    console.log('✅ Test completed successfully!');
    console.log('');
    console.log('💡 Next steps:');
    console.log('   1. Send result.instance to your proving server');
    console.log('   2. Server generates proof using native prover');
    console.log('   3. Verify proof using verify-wasm in browser');

  } catch (error) {
    console.error('\n❌ Test failed:');
    console.error(error);
    process.exit(1);
  }
}

// Run test
testAdapter();

