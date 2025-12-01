/**
 * Adapter Simulation Test
 *
 * This script tests the new synthesizeL2StateChannel method in SynthesizerAdapter.
 * It simplifies the L2 State Channel simulation by using the high-level interface.
 *
 * Usage:
 *   npx tsx examples/L2StateChannel/adapter-simulation.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { SynthesizerAdapter } from '../../src/interface/adapters/synthesizerAdapter.ts';

// Load .env file
config({ path: resolve(process.cwd(), '../../../.env') });

const ALCHEMY_KEY = 'PbqCcGx1oHN7yNaFdUJUYqPEN0QSp23S';
const SEPOLIA_RPC_URL = process.env.RPC_URL_SEPOLIA || `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`;
const ROLLUP_BRIDGE_CORE_ADDRESS = '0x780ad1b236390C42479b62F066F5cEeAa4c77ad6';
const CHANNEL_ID = 2; // Channel 2 with WTON deposits
const SEPOLIA_TON_CONTRACT = '0xa30fe40285b8f5c0457dbc3b7c8a280373c40044';

async function testAdapterSimulation() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║           Adapter Simulation Test - Sepolia TON             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const adapter = new SynthesizerAdapter({ rpcUrl: SEPOLIA_RPC_URL });

  // 1. Alice -> Bob (50 TON)
  // We need to know who is Alice and Bob.
  // From previous run:
  // Alice: 0x... (Participant 0)
  // Bob: 0x... (Participant 1)
  // We can just use the indices or addresses if we knew them.
  // But the adapter handles indices.

  // Let's assume we want to send from Participant 0 to Participant 1.
  // We need Participant 1's address.
  // Since we don't want to fetch it manually here, let's just hardcode what we saw in the log
  // OR, we can just let the adapter fail if we give a wrong address?
  // No, we need a valid recipient address that is in the channel.

  // Let's fetch the participants first just to get the address for the test script
  // (In a real app, the user would know the recipient address)
  // But wait, the adapter doesn't expose a public method to get participants easily without instantiating contract.
  // I'll just use the address from the previous file content log if possible, or fetch it using ethers here.

  // Actually, let's just use the same addresses as in the reference file if they are constant for Channel 2.
  // Reference file didn't hardcode them, it fetched them.
  // So I should probably fetch them too to be safe.

  const { JsonRpcProvider, Contract } = await import('ethers');
  const provider = new JsonRpcProvider(SEPOLIA_RPC_URL);
  const bridge = new Contract(ROLLUP_BRIDGE_CORE_ADDRESS, [
    'function getChannelParticipants(uint256 channelId) view returns (address[])'
  ], provider);

  const participants = await bridge.getChannelParticipants(CHANNEL_ID);
  const alice = participants[0];
  const bob = participants[1];
  const charlie = participants[2];

  console.log(`Participants:`);
  console.log(`Alice: ${alice}`);
  console.log(`Bob: ${bob}`);
  console.log(`Charlie: ${charlie}`);

  console.log('\n-------------------------------------------------------------');
  console.log('Test 1: Alice -> Bob (50 TON)');
  console.log('-------------------------------------------------------------');

  try {
    const result1 = await adapter.synthesizeL2StateChannel(CHANNEL_ID, {
      to: bob,
      tokenAddress: SEPOLIA_TON_CONTRACT,
      amount: '50000000000000000000', // 50 TON (18 decimals)
      rollupBridgeAddress: ROLLUP_BRIDGE_CORE_ADDRESS,
      senderIdx: 0, // Alice
    }, {
      outputPath: 'test-outputs/adapter-proof-1'
    });

    console.log(`\n✅ Proof #1 Generated`);
    console.log(`   State Root: ${result1.state.stateRoot}`);

    console.log('\n-------------------------------------------------------------');
    console.log('Test 2: Bob -> Charlie (25 TON)');
    console.log('-------------------------------------------------------------');

    // Use previous state from result1
    const result2 = await adapter.synthesizeL2StateChannel(CHANNEL_ID, {
      to: charlie,
      tokenAddress: SEPOLIA_TON_CONTRACT,
      amount: '25000000000000000000', // 25 TON
      rollupBridgeAddress: ROLLUP_BRIDGE_CORE_ADDRESS,
      senderIdx: 1, // Bob
    }, {
      previousState: result1.state,
      outputPath: 'test-outputs/adapter-proof-2'
    });

    console.log(`\n✅ Proof #2 Generated`);
    console.log(`   State Root: ${result2.state.stateRoot}`);

    if (result2.state.stateRoot !== result1.state.stateRoot) {
        console.log(`\n🎉 Success! State root changed.`);
    } else {
        console.log(`\n⚠️ Warning: State root did not change.`);
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.stack) console.error(error.stack);
  }
}

testAdapterSimulation();
