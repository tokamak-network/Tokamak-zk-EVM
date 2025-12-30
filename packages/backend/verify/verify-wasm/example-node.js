#!/usr/bin/env node

/**
 * Node.js example for WASM Verifier
 *
 * This demonstrates how to use the verifier in Node.js environment
 */

import { readFileSync } from 'fs';
import { Verifier } from './pkg-node/verify_wasm.js';

async function main() {
  console.log('🔐 Tokamak zkEVM Verifier - Node.js Example\n');

  try {
    // Example 1: Using test data
    console.log('Example 1: Using test data');
    console.log('─'.repeat(50));

    const setupParams = {
      l: 4,
      l_D: 8,
      s_D: 2,
      n: 16,
      s_max: 16,
      l_pub_in: 2,
      l_pub_out: 2,
      l_prv_in: 2,
      l_prv_out: 2,
    };

    const instance = {
      publicInputBuffer: { inPts: [] },
      publicOutputBuffer: { outPts: [] },
      a_pub: [
        '0x0000000000000000000000000000000000000000000000000000000000000001',
        '0x0000000000000000000000000000000000000000000000000000000000000002',
        '0x0000000000000000000000000000000000000000000000000000000000000003',
        '0x0000000000000000000000000000000000000000000000000000000000000004',
      ],
      a_prv: [],
    };

    console.log('Creating verifier...');
    const verifier = new Verifier(
      JSON.stringify(setupParams),
      JSON.stringify(instance),
    );

    console.log('✅ Verifier created');
    console.log('Running Keccak256 verification...');

    const start = Date.now();
    const result = verifier.verify_keccak256();
    const elapsed = Date.now() - start;

    console.log(
      `Verification result: ${result === 2 ? 'NoKeccakData (expected)' : result === 0 ? 'Passed' : 'Failed'}`,
    );
    console.log(`Time taken: ${elapsed}ms`);

    verifier.free();
    console.log('✅ Memory cleaned up\n');

    // Example 2: Loading from files (if they exist)
    console.log('Example 2: Loading from files');
    console.log('─'.repeat(50));

    const setupParamsPath =
      process.argv[2] || '../../../qap-compiler/dist/setupParams.json';
    const instancePath =
      process.argv[3] ||
      '../../../../frontend/synthesizer/examples/outputs/instance.json';

    try {
      console.log(`Loading setup params from: ${setupParamsPath}`);
      const setupParamsData = JSON.parse(readFileSync(setupParamsPath, 'utf8'));

      console.log(`Loading instance from: ${instancePath}`);
      const instanceData = JSON.parse(readFileSync(instancePath, 'utf8'));

      console.log('Creating verifier with real data...');
      const verifier2 = new Verifier(
        JSON.stringify(setupParamsData),
        JSON.stringify(instanceData),
      );

      console.log('✅ Verifier created');
      console.log('Running verification...');

      const start2 = Date.now();
      const result2 = verifier2.verify_keccak256();
      const elapsed2 = Date.now() - start2;

      let resultText = '';
      if (result2 === 0) resultText = '✅ Passed';
      else if (result2 === 1) resultText = '❌ Failed';
      else resultText = '⚠️ No Keccak data';

      console.log(`Verification result: ${resultText}`);
      console.log(`Time taken: ${elapsed2}ms`);

      verifier2.free();
      console.log('✅ Memory cleaned up');
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('⚠️ Files not found (this is OK for testing)');
        console.log(
          'Usage: node example-node.js <setupParams.json> <instance.json>',
        );
      } else {
        throw error;
      }
    }

    console.log('\n✅ All examples completed successfully!');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
