/**
 * Test L2 State Channel with Previous State
 *
 * This test directly calls the synthesizer TypeScript code (not binary)
 * to test previousState handling
 */

import { SynthesizerAdapter } from '../../src/interface/adapters/synthesizerAdapter.ts';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ALCHEMY_KEY = 'PbqCcGx1oHN7yNaFdUJUYqPEN0QSp23S';
const SEPOLIA_RPC_URL = `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`;
const ROLLUP_BRIDGE_CORE_ADDRESS = '0x780ad1b236390C42479b62F066F5cEeAa4c77ad6';
const CHANNEL_ID = 8;
const WTON_ADDRESS = '0x79E0d92670106c85E9067b56B8F674340dCa0Bbd';
const SENDER_ADDRESS = '0x31Fbd690BF62cd8C60A93F3aD8E96A6085Dc5647';
const RECIPIENT_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const TRANSFER_AMOUNT = '1000000000000000000';

async function testWithPreviousState() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Test: L2 State Channel WITH Previous State            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const adapter = new SynthesizerAdapter({ rpcUrl: SEPOLIA_RPC_URL });

  // Step 1: Test without previous state (should work)
  console.log('🧪 Test 1: WITHOUT previous state...\n');

  const outputDir1 = resolve(process.cwd(), 'test-outputs/ts-test-1');
  mkdirSync(outputDir1, { recursive: true });

  try {
    await adapter.synthesizeL2StateChannel(
      CHANNEL_ID,
      {
        to: RECIPIENT_ADDRESS,
        tokenAddress: WTON_ADDRESS,
        amount: TRANSFER_AMOUNT,
        rollupBridgeAddress: ROLLUP_BRIDGE_CORE_ADDRESS,
        senderIdx: 0, // First participant
      },
      {
        outputPath: outputDir1,
      },
    );
    console.log('✅ Test 1 passed!\n');
  } catch (e: any) {
    console.error('❌ Test 1 failed:', e.message);
    throw e;
  }

  // Step 2: Read the generated state snapshot
  const stateSnapshotPath = resolve(outputDir1, 'state_snapshot.json');
  if (!existsSync(stateSnapshotPath)) {
    throw new Error('state_snapshot.json not found from Test 1');
  }

  const previousStateJson = readFileSync(stateSnapshotPath, 'utf-8');
  console.log('📄 Previous state loaded from Test 1\n');

  // Step 3: Test WITH previous state (this is where the error occurs)
  console.log('🧪 Test 2: WITH previous state...\n');

  const outputDir2 = resolve(process.cwd(), 'test-outputs/ts-test-2');
  mkdirSync(outputDir2, { recursive: true });

  // Parse the JSON to pass as object
  const previousState = JSON.parse(previousStateJson);

  try {
    await adapter.synthesizeL2StateChannel(
      CHANNEL_ID,
      {
        to: RECIPIENT_ADDRESS,
        tokenAddress: WTON_ADDRESS,
        amount: TRANSFER_AMOUNT,
        rollupBridgeAddress: ROLLUP_BRIDGE_CORE_ADDRESS,
        senderIdx: 0,
      },
      {
        previousState, // Pass previous state as object
        outputPath: outputDir2,
      },
    );
    console.log('✅ Test 2 passed!\n');
  } catch (e: any) {
    console.error('❌ Test 2 failed:', e.message);
    console.error('Stack:', e.stack);
    throw e;
  }

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    All Tests Passed!                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

testWithPreviousState()
  .then(() => {
    console.log('🎉 Success!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n💥 Test failed:', error.message);
    process.exit(1);
  });
