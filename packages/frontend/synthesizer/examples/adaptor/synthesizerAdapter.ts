/**
 * Run this file with:
 * DEBUG=ethjs,evm:*,evm:*:* tsx test-synthesizer-adapter.ts
 */

import path from 'path';
import fs from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

import { SynthesizerAdapter } from '../../src/adapters/synthesizerAdapter';

// replace __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const main = async () => {
  const adapter = new SynthesizerAdapter();

  /**
   * https://etherscan.io/tx/0xb4407f9b2c94de7c618fc16dbe0b4da04ff74be9d7483f991e22137e8329d72c
   */
  // Setup accounts
  const contractAddr = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  const calldata =
    '0xa9059cbb0000000000000000000000003ce097ea6f6bb8140a46b1442a569948c319d4a4000000000000000000000000000000000000000000000000000000000eb21e91';
  const sender = '0xb8e02001e911c0e05b097e1cf66ccDC46Ac373e7';

  // Process transaction through SynthesizerAdapter
  const { evm, executionResult, permutation } = await adapter.parseTransaction({
    contractAddr,
    calldata,
    sender,
  });

  // Verify that permutation and placement instances were generated correctly
  console.log('Permutation generated:', permutation);
  // console.dir(executionResult.runState?.synthesizer.placements.get(3));
  // save result (optional)
  //   const outputPath = path.join(
  //     __dirname,
  //     '../outputs/adaptor_permutation.json',
  //   );
  //   fs.writeFileSync(
  //     outputPath,
  //     JSON.stringify(executionResult.runState?.synthesizer.placements, null, 2),
  //     'utf8',
  //   );
};

void main();
