/**
 * Test State Snapshot Restore
 *
 * This script tests the SynthesizerAdapter's ability to restore state from
 * a previously generated state_snapshot.json and continue generating proofs.
 *
 * Usage:
 *   npx tsx examples/L2StateChannel/test-state-snapshot-restore.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import { SynthesizerAdapter } from '../../src/interface/adapters/synthesizerAdapter.ts';
import { Address } from '@ethereumjs/util';
import { fromEdwardsToAddress } from '../../src/TokamakL2JS/utils/index.ts';
import { toBytes } from '@ethereumjs/util';

// Load .env file
config({ path: resolve(process.cwd(), '../../../.env') });

const ALCHEMY_KEY = 'PbqCcGx1oHN7yNaFdUJUYqPEN0QSp23S';
const SEPOLIA_RPC_URL = process.env.RPC_URL_SEPOLIA || `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`;
const ROLLUP_BRIDGE_CORE_ADDRESS = '0x780ad1b236390C42479b62F066F5cEeAa4c77ad6';
const CHANNEL_ID = 8; // Channel ID to test
const SEPOLIA_TON_CONTRACT = '0xa30fe40285b8f5c0457dbc3b7c8a280373c40044';

/**
 * Convert state_snapshot.json format to StateSnapshot type
 * Handles the case where userL2Addresses is stored as bytes objects
 */
function normalizeStateSnapshot(rawSnapshot: any): any {
  // Convert userL2Addresses from bytes objects to hex strings
  const userL2Addresses: string[] = [];
  if (rawSnapshot.userL2Addresses && Array.isArray(rawSnapshot.userL2Addresses)) {
    for (const addr of rawSnapshot.userL2Addresses) {
      if (typeof addr === 'string') {
        // Already a string
        userL2Addresses.push(addr);
      } else if (addr && addr.bytes) {
        // Convert bytes object to Address, then to hex string
        const bytesArray = Object.values(addr.bytes) as number[];
        const bytes = new Uint8Array(bytesArray);
        // bytes is 20 bytes (Address), convert to hex string
        const address = new Address(bytes);
        userL2Addresses.push(address.toString());
      } else {
        throw new Error(`Invalid userL2Address format: ${JSON.stringify(addr)}`);
      }
    }
  }

  // Convert userStorageSlots from string[] to bigint[]
  const userStorageSlots = rawSnapshot.userStorageSlots
    ? rawSnapshot.userStorageSlots.map((s: string | bigint) => BigInt(s))
    : [];

  // Convert userNonces from string[] to bigint[]
  const userNonces = rawSnapshot.userNonces
    ? rawSnapshot.userNonces.map((n: string | bigint) => BigInt(n))
    : [];

  return {
    ...rawSnapshot,
    userL2Addresses,
    userStorageSlots,
    userNonces,
  };
}

async function testStateSnapshotRestore() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Test State Snapshot Restore - SynthesizerAdapter        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  try {
    // Step 1: Load existing state_snapshot.json
    const snapshotPath = resolve(
      process.cwd(),
      'test-outputs/onchain-proof-1/state_snapshot.json'
    );

    if (!existsSync(snapshotPath)) {
      throw new Error(`State snapshot not found: ${snapshotPath}`);
    }

    console.log('📄 Step 1: Loading state_snapshot.json...');
    const rawSnapshot = JSON.parse(readFileSync(snapshotPath, 'utf-8'));
    console.log(`✅ Loaded state snapshot`);
    console.log(`   State Root: ${rawSnapshot.stateRoot}`);
    console.log(`   Contract: ${rawSnapshot.contractAddress}`);
    console.log(`   Registered Keys: ${rawSnapshot.registeredKeys?.length || 0}`);
    console.log(`   Storage Entries: ${rawSnapshot.storageEntries?.length || 0}\n`);

    // Step 2: Normalize the snapshot format
    console.log('🔄 Step 2: Normalizing state snapshot format...');
    const normalizedSnapshot = normalizeStateSnapshot(rawSnapshot);
    console.log(`✅ Normalized snapshot`);
    console.log(`   User L2 Addresses: ${normalizedSnapshot.userL2Addresses.length}`);
    console.log(`   User Storage Slots: ${normalizedSnapshot.userStorageSlots.length}`);
    console.log(`   User Nonces: ${normalizedSnapshot.userNonces.length}\n`);

    // Step 3: Fetch channel participants from on-chain
    console.log('📡 Step 3: Fetching channel participants from on-chain...');
    const { JsonRpcProvider, Contract } = await import('ethers');
    const provider = new JsonRpcProvider(SEPOLIA_RPC_URL);
    const bridge = new Contract(
      ROLLUP_BRIDGE_CORE_ADDRESS,
      ['function getChannelParticipants(uint256 channelId) view returns (address[])'],
      provider
    );

    const participants = await bridge.getChannelParticipants(CHANNEL_ID);
    if (!participants || participants.length < 2) {
      throw new Error(
        `Channel ${CHANNEL_ID} does not have enough participants. Found: ${participants?.length || 0}`
      );
    }

    console.log(`✅ Channel participants: ${participants.length}`);
    participants.forEach((addr: string, idx: number) => {
      console.log(`   Participant ${idx + 1}: ${addr}`);
    });
    console.log('');

    // Step 4: Initialize SynthesizerAdapter
    console.log('⚙️  Step 4: Initializing SynthesizerAdapter...');
    const adapter = new SynthesizerAdapter({ rpcUrl: SEPOLIA_RPC_URL });
    console.log('✅ SynthesizerAdapter initialized\n');

    // Step 5: Generate next proof using previous state
    console.log('🔄 Step 5: Generating next proof with previous state...');
    console.log(`   Channel ID: ${CHANNEL_ID}`);
    console.log(`   Sender: ${participants[0]} (index 0)`);
    console.log(`   Recipient: ${participants[1]} (index 1)`);
    console.log(`   Amount: 1000000000000000000 (1 TON)\n`);

    const outputPath = resolve(process.cwd(), 'test-outputs/state-snapshot-restore-test');

    const result = await adapter.synthesizeL2StateChannel(
      CHANNEL_ID,
      {
        to: participants[1], // L1 address of recipient
        tokenAddress: SEPOLIA_TON_CONTRACT,
        amount: '1000000000000000000', // 1 TON (18 decimals)
        rollupBridgeAddress: ROLLUP_BRIDGE_CORE_ADDRESS,
        senderIdx: 0, // First participant
      },
      {
        previousState: normalizedSnapshot,
        outputPath: outputPath,
      }
    );

    // Step 6: Verify results
    console.log('\n✅ Step 6: Verification Results');
    console.log('═'.repeat(60));
    console.log(`📊 Synthesis Results:`);
    console.log(`   Previous State Root: ${normalizedSnapshot.stateRoot}`);
    console.log(`   New State Root: ${result.state.stateRoot}`);
    console.log(`   Placements: ${result.placementVariables.length}`);
    console.log(`   Output Directory: ${outputPath}`);
    console.log('');

    // Verify state root changed (indicates state transition)
    if (result.state.stateRoot !== normalizedSnapshot.stateRoot) {
      console.log('✅ State root changed - State transition successful!');
    } else {
      console.log('⚠️  Warning: State root did not change');
    }

    // Verify output files were created
    const requiredFiles = [
      'instance.json',
      'placementVariables.json',
      'permutation.json',
      'state_snapshot.json',
    ];

    console.log('\n📁 Generated Files:');
    for (const file of requiredFiles) {
      const filePath = resolve(outputPath, file);
      const exists = existsSync(filePath);
      console.log(`   ${exists ? '✅' : '❌'} ${file}`);
    }

    console.log('\n🎉 Test completed successfully!');
    console.log(`\n💡 Next steps:`);
    console.log(`   - Check output files in: ${outputPath}`);
    console.log(`   - Use the new state_snapshot.json for the next transaction`);
  } catch (error: any) {
    console.error('\n❌ Test failed:');
    console.error(`   Error: ${error.message}`);
    if (error.stack) {
      console.error(`\n   Stack trace:`);
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testStateSnapshotRestore();

